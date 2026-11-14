//! Web-push alerts for followed teams (Pro): tip-off, halftime (opt-in), close game late,
//! overtime, upset brewing, final, and injury news.
//! Driven by slate changes from the relay; each alert is sent once (app.sent_alerts).

use std::collections::HashMap;

use axum::{extract::State, http::{HeaderMap, StatusCode}, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use web_push::{ContentEncoding, HyperWebPushClient, SubscriptionInfo, VapidSignatureBuilder, WebPushClient, WebPushMessageBuilder};

use crate::{api::{db, db_err, err, profile_plan, require_user, ApiResult}, relay::EspnEvent, Shared};

pub async fn public_key(State(state): State<Shared>) -> ApiResult {
    let key = state.cfg.vapid_public.clone().ok_or_else(|| err(StatusCode::SERVICE_UNAVAILABLE, "Alerts are not configured yet."))?;
    Ok(Json(json!({ "key": key })))
}

#[derive(Deserialize)]
pub struct Keys { p256dh: String, auth: String }
#[derive(Deserialize)]
pub struct SubscribeReq { endpoint: String, keys: Keys, prefs: Option<Value> }
pub async fn subscribe(State(state): State<Shared>, headers: HeaderMap, Json(body): Json<SubscribeReq>) -> ApiResult {
    let user = require_user(&headers, &state).await?;
    let c = db(&state).await?;
    if profile_plan(&c, &user).await? != "pro" { return Err(err(StatusCode::PAYMENT_REQUIRED, "Alerts are part of D1 Hoops Pro.")); }
    let prefs = clean_prefs(body.prefs);
    c.execute("INSERT INTO app.push_subscriptions (endpoint, user_id, p256dh, auth, prefs) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, prefs = EXCLUDED.prefs",
        &[&body.endpoint, &user.sub, &body.keys.p256dh, &body.keys.auth, &prefs]).await.map_err(db_err)?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct UnsubscribeReq { endpoint: String }
pub async fn unsubscribe(State(state): State<Shared>, headers: HeaderMap, Json(body): Json<UnsubscribeReq>) -> ApiResult {
    let user = require_user(&headers, &state).await?;
    let c = db(&state).await?;
    c.execute("DELETE FROM app.push_subscriptions WHERE endpoint = $1 AND user_id = $2", &[&body.endpoint, &user.sub]).await.map_err(db_err)?;
    Ok(Json(json!({ "ok": true })))
}

struct Alert { key: String, kind: &'static str, teams: Vec<String>, title: String, body: String, path: Option<String> }

/// Alert kinds a subscription can switch off, with the value used when its prefs don't mention one.
/// Halftime is opt-in; every other kind is on unless turned off (so older subscriptions pick up
/// upsets and overtime, but not halftime, without a migration).
pub const PREF_KINDS: [(&str, bool); 7] = [
    ("tipoff", true), ("close", true), ("final", true), ("injury", true), ("upsets", true), ("overtime", true), ("halftime", false),
];
pub fn pref_default(kind: &str) -> bool { PREF_KINDS.iter().find(|(k, _)| *k == kind).map(|(_, d)| *d).unwrap_or(true) }
fn default_prefs() -> Value { Value::Object(PREF_KINDS.iter().map(|(k, d)| (k.to_string(), Value::Bool(*d))).collect()) }
/// Keep only known kinds with boolean values: a stray string would make `(prefs ->> kind)::boolean`
/// fail the whole dispatch query for that kind, for every subscriber.
fn clean_prefs(v: Option<Value>) -> Value {
    let Some(Value::Object(m)) = v else { return default_prefs() };
    Value::Object(PREF_KINDS.iter().filter_map(|(k, _)| m.get(*k).and_then(Value::as_bool).map(|b| (k.to_string(), Value::Bool(b)))).collect())
}

#[derive(Deserialize)]
pub struct PrefsReq { endpoint: String }
/// The alert prefs stored for one of the caller's devices (null when that device isn't subscribed).
pub async fn get_prefs(State(state): State<Shared>, headers: HeaderMap, Json(body): Json<PrefsReq>) -> ApiResult {
    let user = require_user(&headers, &state).await?;
    let c = db(&state).await?;
    let row = c.query_opt("SELECT prefs FROM app.push_subscriptions WHERE endpoint = $1 AND user_id = $2", &[&body.endpoint, &user.sub]).await.map_err(db_err)?;
    Ok(Json(json!({ "prefs": row.map(|r| r.get::<_, Value>(0)) })))
}

// ---------- the exported site's games, for pregame win probability and deep links ----------

/// One game from the exported site (`data/app/games/<day>.json`), trimmed to what alerts use.
#[derive(Debug, Clone, Deserialize)]
pub struct SiteGame {
    pub id: String,
    #[serde(rename = "espnId", default)]
    pub espn_id: Option<String>,
    pub home: SiteSide,
    pub away: SiteSide,
    #[serde(default)]
    pub pred: Option<SitePred>,
}
#[derive(Debug, Clone, Deserialize)]
pub struct SiteSide { #[serde(default)] pub slug: Option<String> }
#[derive(Debug, Clone, Deserialize)]
pub struct SitePred { #[serde(default)] pub wp: Option<f64> }
/// Eastern day -> (file mtime, games): the cache in `AppState::site_games`.
pub type SiteGamesCache = HashMap<String, (Option<std::time::SystemTime>, std::sync::Arc<Vec<SiteGame>>)>;
#[derive(Deserialize)]
struct SiteDay { #[serde(default)] games: Vec<SiteGame> }

/// What the site knows about a live ESPN game.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct GameLink {
    /// `/games/?d=<day>&g=<our id>` when the game is in the site's data.
    pub path: Option<String>,
    /// D1 Hoops' pregame win probability for ESPN's *home* team (already flipped when the site lists
    /// the game the other way round, e.g. at a neutral site).
    pub home_wp: Option<f64>,
}

/// Eastern-time calendar day (YYYY-MM-DD) of an ESPN start time ("2026-11-15T00:30Z" or RFC 3339).
pub fn et_day(date: &str) -> Option<String> {
    use chrono::TimeZone;
    let utc = chrono::DateTime::parse_from_rfc3339(date).map(|d| d.with_timezone(&chrono::Utc)).ok()
        .or_else(|| chrono::NaiveDateTime::parse_from_str(date, "%Y-%m-%dT%H:%MZ").ok().map(|n| chrono::Utc.from_utc_datetime(&n)))?;
    Some(utc.with_timezone(&chrono_tz::America::New_York).format("%Y-%m-%d").to_string())
}

/// Match an ESPN event to the site's game that day, the same way the site does (src/lib/live.ts):
/// ESPN event id first, then both teams (either orientation), then one known team with one game.
/// `slug` maps an ESPN team id to our team slug.
fn link_game(e: &EspnEvent, day: &str, games: &[SiteGame], slug: &dyn Fn(&str) -> Option<String>) -> GameLink {
    let (hid, _) = score(e, "home");
    let (aid, _) = score(e, "away");
    let (hs, as_) = (slug(&hid), slug(&aid));
    let plays = |g: &SiteGame, s: &Option<String>| s.is_some() && (g.home.slug == *s || g.away.slug == *s);
    let game = games.iter().find(|g| g.espn_id.as_deref() == Some(e.id.as_str()))
        .or_else(|| games.iter().find(|g| plays(g, &hs) && plays(g, &as_)))
        .or_else(|| {
            let known = if hs.is_some() { &hs } else { &as_ };
            let mut hits = games.iter().filter(|g| plays(g, known));
            match (hits.next(), hits.next()) { (Some(g), None) => Some(g), _ => None }
        });
    let Some(g) = game else { return GameLink::default() };
    // Orientation: flip when ESPN's home team is our away team (or ESPN's away team is our home team).
    let flip = (hs.is_some() && hs == g.away.slug) || (as_.is_some() && as_ == g.home.slug);
    GameLink {
        path: Some(format!("/games/?d={day}&g={}", g.id)),
        home_wp: g.pred.as_ref().and_then(|p| p.wp).filter(|w| (0.0..=1.0).contains(w)).map(|w| if flip { 1.0 - w } else { w }),
    }
}

/// The site's games for one Eastern day, cached until the file changes (it only changes on deploy).
async fn site_games(state: &Shared, day: &str) -> std::sync::Arc<Vec<SiteGame>> {
    let path = format!("{}/data/app/games/{day}.json", state.cfg.static_dir);
    let mtime = tokio::fs::metadata(&path).await.and_then(|m| m.modified()).ok();
    if let Some((t, games)) = state.site_games.read().await.get(day) {
        if *t == mtime { return games.clone(); }
    }
    let games: Vec<SiteGame> = match tokio::fs::read_to_string(&path).await {
        Ok(text) => serde_json::from_str::<SiteDay>(&text).map(|d| d.games).unwrap_or_else(|e| { eprintln!("[alerts] {path}: {e}"); vec![] }),
        Err(_) => vec![], // no site data for that day: alerts fall back to /games/ and skip upsets
    };
    let games = std::sync::Arc::new(games);
    let mut cache = state.site_games.write().await;
    if cache.len() > 8 { cache.clear(); }
    cache.insert(day.to_string(), (mtime, games.clone()));
    games
}

fn score(e: &EspnEvent, side: &str) -> (String, i64) {
    let c = e.competitions.first().and_then(|c| c.competitors.iter().find(|x| x.home_away == side));
    (c.map(|x| x.team.id.clone()).unwrap_or_default(), c.and_then(|x| x.score.as_deref()).and_then(|s| s.parse().ok()).unwrap_or(0))
}

/// Pregame underdog threshold for upset alerts.
const UPSET_WP: f64 = 0.25;
/// Lead the underdog needs in the second half or overtime.
const UPSET_LEAD: i64 = 5;

fn ot_name(ot: u32) -> String {
    match ot { 1 => "overtime".into(), 2 => "double overtime".into(), 3 => "triple overtime".into(), n => format!("{n}OT") }
}
/// "3:12 left in the second half" / "1:40 left in overtime".
fn time_left(e: &EspnEvent) -> String {
    let period = e.status.period.unwrap_or(0);
    let part = if period >= 3 { ot_name(period - 2) } else { "the second half".into() };
    match e.status.display_clock.as_deref().filter(|c| !c.trim().is_empty()) {
        Some(c) => format!("{c} left in {part}."),
        None => format!("Into {part}."),
    }
}
fn pct(wp: f64) -> String { let p = (wp * 100.0).round(); if p < 1.0 { "under 1%".into() } else { format!("{p}%") } }

/// Pure: slate before/after + team names + site lookup -> alerts. Conditions are checked on the new
/// slate; each alert's key is stable for its game (and period, where it can recur), so the
/// app.sent_alerts claim sends it once however many polls see the condition.
fn detect(prev: &[EspnEvent], next: &[EspnEvent], name: &dyn Fn(&str) -> String, link: &dyn Fn(&EspnEvent) -> GameLink) -> Vec<Alert> {
    let mut out = vec![];
    for e in next {
        let before = prev.iter().find(|p| p.id == e.id);
        let (hid, hs) = score(e, "home");
        let (aid, as_) = score(e, "away");
        let (hn, an) = (name(&hid), name(&aid));
        let teams = vec![hid.clone(), aid.clone()];
        let was = before.map(|b| b.status.kind.state.as_str()).unwrap_or("pre");
        let now = e.status.kind.state.as_str();
        let info = link(e);
        let mut push = |key: String, kind: &'static str, title: String, body: String| {
            out.push(Alert { key, kind, teams: teams.clone(), title, body, path: info.path.clone() });
        };
        if was == "pre" && now == "in" {
            push(format!("{}:tip", e.id), "tipoff", format!("Tip-off: {an} at {hn}"), "Follow it live on D1 Hoops.".into());
        }
        let period = e.status.period.unwrap_or(0);
        let clock = e.status.clock.unwrap_or(9999.0);
        if now == "in" && period == 1 && (e.status.kind.name == "STATUS_HALFTIME" || clock <= 0.0) {
            let body = match hs.cmp(&as_) {
                std::cmp::Ordering::Greater => format!("{hn} leads by {}.", hs - as_),
                std::cmp::Ordering::Less => format!("{an} leads by {}.", as_ - hs),
                std::cmp::Ordering::Equal => "All square at the break.".into(),
            };
            push(format!("{}:half", e.id), "halftime", format!("Halftime: {an} {as_}, {hn} {hs}"), body);
        }
        if now == "in" && period >= 2 && clock <= 240.0 && (hs - as_).abs() <= 5 {
            push(format!("{}:close:{period}", e.id), "close", format!("Close game: {an} {as_}, {hn} {hs}"), format!("{} left — tune in.", e.status.display_clock.clone().unwrap_or_default()));
        }
        // Overtime: regulation (or an overtime) just ended level, or a new overtime period has begun.
        // Both name the same period, so whichever poll sees it first sends the one alert.
        let ended_level = now == "in" && period >= 2 && e.status.clock.is_some_and(|c| c <= 0.0) && hs == as_ && hs > 0;
        let new_ot = now == "in" && period >= 3 && before.is_some_and(|b| b.status.period.unwrap_or(0) < period);
        if ended_level || new_ot {
            let ot_period = if ended_level { period + 1 } else { period };
            let label = ot_name(ot_period - 2);
            let title = if hs == as_ { format!("Headed to {label}: {an} {as_}, {hn} {hs}") } else {
                let mut l = label.clone(); if let Some(f) = l.get_mut(0..1) { f.make_ascii_uppercase(); }
                format!("{l}: {an} {as_}, {hn} {hs}")
            };
            push(format!("{}:ot:{ot_period}", e.id), "overtime", title, "Five more minutes. Follow it live on D1 Hoops.".into());
        }
        // Upset brewing: the pregame underdog (under 25% in the D1 Hoops model) leads by 5+ in the
        // second half or overtime. Once per game.
        if let (true, Some(hwp)) = (now == "in" && period >= 2, info.home_wp) {
            let dog = if hwp < UPSET_WP { Some((&hn, hs, &an, as_, hwp)) } else if 1.0 - hwp < UPSET_WP { Some((&an, as_, &hn, hs, 1.0 - hwp)) } else { None };
            if let Some((dn, ds, fname, fs, dwp)) = dog.filter(|d| d.1 - d.3 >= UPSET_LEAD) {
                push(format!("{}:upset", e.id), "upsets", format!("Upset brewing: {dn} leads {fname} {ds}-{fs}"),
                    format!("D1 Hoops gave {dn} a {} chance before tip-off. {}", pct(dwp), time_left(e)));
            }
        }
        if was != "post" && now == "post" && e.status.kind.completed {
            let (w, l, ws, ls) = if hs > as_ { (&hn, &an, hs, as_) } else { (&an, &hn, as_, hs) };
            push(format!("{}:final", e.id), "final", format!("Final: {w} {ws}, {l} {ls}"), "See the recap, box score and win-probability chart.".into());
        }
    }
    out
}

pub async fn on_slate(state: Shared, prev: Vec<EspnEvent>, next: Vec<EspnEvent>) {
    if state.db.is_none() || state.cfg.vapid_public.is_none() || state.cfg.vapid_private.is_none() { return }
    if prev.is_empty() { return; } // first poll after a restart: no transitions to report
    let teams = state.teams.read().await.clone();
    let name = |id: &str| teams.get(id).map(|t| t.name.clone()).unwrap_or_else(|| "Opponent".into());
    let slug = |id: &str| teams.get(id).map(|t| t.slug.clone());
    // Only games that are live or just finished can alert; load the site's games for their days.
    let mut days: HashMap<String, std::sync::Arc<Vec<SiteGame>>> = HashMap::new();
    for e in next.iter().filter(|e| e.status.kind.state != "pre") {
        let Some(d) = et_day(&e.date) else { continue };
        if let std::collections::hash_map::Entry::Vacant(slot) = days.entry(d) { let g = site_games(&state, slot.key()).await; slot.insert(g); }
    }
    let link = |e: &EspnEvent| match et_day(&e.date) {
        Some(d) => days.get(&d).map(|g| link_game(e, &d, g, &slug)).unwrap_or_default(),
        None => GameLink::default(),
    };
    let alerts: Vec<(Alert, Vec<String>)> = detect(&prev, &next, &name, &link).into_iter().map(|a| {
        let slugs = a.teams.iter().filter_map(|id| teams.get(id).map(|t| t.slug.clone())).collect();
        (a, slugs)
    }).collect();
    dispatch(&state, alerts, "/games/").await;
}

/// Claim each alert once (app.sent_alerts), then push it to Pro followers of its team slugs
/// whose prefs don't turn that kind off (a kind missing from prefs uses `pref_default`). The
/// click-through is the alert's own path (a specific game) or `fallback`. Shared by the
/// live-game and injury paths.
async fn dispatch(state: &Shared, alerts: Vec<(Alert, Vec<String>)>, fallback: &str) {
    let (Some(pool), Some(_), Some(private)) = (state.db.clone(), state.cfg.vapid_public.clone(), state.cfg.vapid_private.clone()) else { return };
    if alerts.is_empty() { return; }
    let Ok(c) = pool.get().await else { return };
    let Ok(client) = std::panic::catch_unwind(HyperWebPushClient::new) else { return };
    for (a, slugs) in alerts {
        // Claim the alert once across restarts / instances.
        if c.execute("INSERT INTO app.sent_alerts (key) VALUES ($1) ON CONFLICT DO NOTHING", &[&a.key]).await.unwrap_or(0) == 0 { continue; }
        if slugs.is_empty() { continue; }
        let rows = match c.query(
            "SELECT DISTINCT s.endpoint, s.p256dh, s.auth FROM app.push_subscriptions s JOIN app.follows f ON f.user_id = s.user_id AND f.kind = 'team' AND f.ref = ANY($1) JOIN app.profiles p ON p.user_id = s.user_id AND p.plan = 'pro' WHERE COALESCE((s.prefs ->> $2)::boolean, $3)",
            &[&slugs, &a.kind, &pref_default(a.kind)]).await { Ok(r) => r, Err(e) => { let _ = db_err(e); continue } };
        let url = format!("{}{}", state.cfg.public_url, a.path.as_deref().unwrap_or(fallback));
        let payload = json!({ "title": a.title, "body": a.body, "url": url, "tag": a.key }).to_string();
        for r in rows {
            let (endpoint, p256dh, auth): (String, String, String) = (r.get(0), r.get(1), r.get(2));
            let info = SubscriptionInfo::new(&endpoint, &p256dh, &auth);
            let Ok(sig) = VapidSignatureBuilder::from_base64(&private, &info).and_then(|mut b| { b.add_claim("sub", state.cfg.vapid_subject.as_str()); b.build() }) else { continue };
            let mut msg = WebPushMessageBuilder::new(&info);
            msg.set_payload(ContentEncoding::Aes128Gcm, payload.as_bytes());
            msg.set_vapid_signature(sig);
            let Ok(message) = msg.build() else { continue };
            if let Err(e) = client.send(message).await {
                let gone = matches!(e, web_push::WebPushError::EndpointNotValid(_) | web_push::WebPushError::EndpointNotFound(_));
                if gone { let _ = c.execute("DELETE FROM app.push_subscriptions WHERE endpoint = $1", &[&endpoint]).await; }
            }
        }
    }
}

/// Injury news only alerts for fresh events: a restart or first deploy must not replay the feed.
const INJURY_WINDOW_SECS: i64 = 6 * 3600;

/// Pure: injury wire JSON + now -> alerts (new / worse / returned within the last 6 hours).
/// `teams` holds the follower slug, not an ESPN id.
fn injury_alerts(wire: &Value, now: chrono::DateTime<chrono::Utc>) -> Vec<Alert> {
    let Some(events) = wire.get("wire").and_then(Value::as_array) else { return vec![] };
    let s = |e: &Value, k: &str| e.get(k).and_then(Value::as_str).filter(|v| !v.trim().is_empty()).map(str::to_string);
    let mut out = vec![];
    for e in events {
        let (Some(t), Some(kind), Some(key), Some(name), Some(slug)) = (s(e, "t"), s(e, "kind"), s(e, "key"), s(e, "name"), s(e, "slug")) else { continue };
        if !matches!(kind.as_str(), "new" | "worse" | "returned") { continue; }
        // Box-score inferences ("missed last game", reason unknown) stay on the site, not in pushes.
        if s(e, "source").as_deref() == Some("box") { continue; }
        // First-run backfill (dated when each absence began) never pushes.
        if e.get("seed").and_then(Value::as_bool).unwrap_or(false) { continue; }
        let Ok(at) = chrono::DateTime::parse_from_rfc3339(&t) else { continue };
        let age = (now - at.with_timezone(&chrono::Utc)).num_seconds();
        if !(0..=INJURY_WINDOW_SECS).contains(&age) { continue; }
        let team = s(e, "team").unwrap_or_else(|| slug.clone());
        let status = s(e, "status").unwrap_or_else(|| "Unavailable".into());
        let part = s(e, "body");
        let (title, body) = if kind == "returned" {
            (format!("Back: {name} returns for {team}"), part.map(|p| format!("{p}.")).unwrap_or_else(|| "Listed as available again.".into()))
        } else {
            let detail = match (part, s(e, "from")) {
                (Some(p), Some(f)) => format!("{p}: {f} \u{2192} {status}"),
                (Some(p), None) => p,
                (None, Some(f)) => format!("{f} \u{2192} {status}"),
                (None, None) => "Reason not reported.".into(),
            };
            (format!("Injury: {name} ({team}) \u{2014} {status}"), detail)
        };
        // Key on the logical change (player, absence, kind, state), not the run time, so a rebuilt
        // ledger that re-emits the same change at a later time doesn't push twice.
        let stint = s(e, "stint").unwrap_or_else(|| t.clone());
        let state = s(e, "state").unwrap_or_default();
        out.push(Alert { key: format!("inj:{key}:{stint}:{kind}:{state}"), kind: "injury", teams: vec![slug], title, body, path: None });
    }
    out
}

pub const DEFAULT_INJURY_FEED: &str = "https://shaincarrasco.github.io/Sports-Analytics/d1-hoops/data/app/injury-wire.json";

/// Background task: every 10 minutes, fetch the injury wire and push fresh events to followers.
pub async fn injury_loop(state: Shared) {
    if state.db.is_none() || state.cfg.vapid_private.is_none() { return } // nothing to send with
    let url = state.cfg.injury_feed_url.clone();
    loop {
        match state.http.get(&url).timeout(std::time::Duration::from_secs(20)).send().await.and_then(|r| r.error_for_status()) {
            Ok(r) => match r.json::<Value>().await {
                Ok(wire) => {
                    let alerts = injury_alerts(&wire, chrono::Utc::now()).into_iter().map(|a| { let s = a.teams.clone(); (a, s) }).collect();
                    dispatch(&state, alerts, "/injuries/").await;
                }
                Err(e) => eprintln!("[injury] bad feed json: {e}"),
            },
            Err(e) => eprintln!("[injury] fetch failed: {e}"),
        }
        tokio::time::sleep(std::time::Duration::from_secs(600)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ev(state: &str, period: u32, clock: f64, home: u32, away: u32, completed: bool) -> EspnEvent {
        evx(state, if state == "in" { "STATUS_IN_PROGRESS" } else { "S" }, period, clock, "3:30", home, away, completed)
    }
    #[allow(clippy::too_many_arguments)]
    fn evx(state: &str, status: &str, period: u32, clock: f64, display: &str, home: u32, away: u32, completed: bool) -> EspnEvent {
        serde_json::from_value(json!({
            "id": "401", "name": "A at B", "date": "2026-11-12T00:00Z",
            "status": { "clock": clock, "displayClock": display, "period": period, "type": { "name": status, "state": state, "completed": completed, "shortDetail": "" } },
            "competitions": [{ "competitors": [
                { "homeAway": "home", "score": home.to_string(), "team": { "id": "150", "abbreviation": "DUKE", "displayName": "Duke" } },
                { "homeAway": "away", "score": away.to_string(), "team": { "id": "2305", "abbreviation": "KU", "displayName": "Kansas" } } ] }]
        })).expect("event json")
    }
    fn name(id: &str) -> String { if id == "150" { "Duke".into() } else { "Kansas".into() } }
    fn nolink(_: &EspnEvent) -> GameLink { GameLink::default() }
    /// Site lookup with Duke (ESPN home) given `wp` before tip-off.
    fn wp(home_wp: f64) -> impl Fn(&EspnEvent) -> GameLink { move |_| GameLink { path: Some("/games/?d=2026-11-11&g=378019".into()), home_wp: Some(home_wp) } }
    fn kinds(a: &[Alert]) -> Vec<&'static str> { a.iter().map(|x| x.kind).collect() }

    #[test]
    fn transitions() {
        let a = detect(&[ev("pre", 0, 1200.0, 0, 0, false)], &[ev("in", 1, 1190.0, 2, 0, false)], &name, &nolink);
        assert_eq!(kinds(&a), ["tipoff"]);
        assert_eq!(a[0].path, None);
        let a = detect(&[ev("in", 2, 300.0, 60, 58, false)], &[ev("in", 2, 210.0, 62, 60, false)], &name, &nolink);
        assert_eq!(a[0].kind, "close");
        let a = detect(&[ev("in", 2, 1.0, 70, 65, false)], &[ev("post", 2, 0.0, 70, 65, true)], &name, &nolink);
        assert_eq!(a[0].title, "Final: Duke 70, Kansas 65");
        assert!(detect(&[ev("in", 2, 100.0, 80, 60, false)], &[ev("in", 2, 90.0, 82, 60, false)], &name, &nolink).is_empty());
    }

    #[test]
    fn alerts_carry_the_game_link() {
        let a = detect(&[ev("pre", 0, 1200.0, 0, 0, false)], &[ev("in", 1, 1190.0, 2, 0, false)], &name, &wp(0.5));
        assert_eq!(a[0].path.as_deref(), Some("/games/?d=2026-11-11&g=378019"));
    }

    #[test]
    fn halftime() {
        let a = detect(&[ev("in", 1, 12.0, 33, 30, false)], &[evx("in", "STATUS_HALFTIME", 1, 0.0, "0:00", 35, 30, false)], &name, &nolink);
        assert_eq!(kinds(&a), ["halftime"]);
        assert_eq!(a[0].key, "401:half");
        assert_eq!(a[0].title, "Halftime: Kansas 30, Duke 35");
        assert_eq!(a[0].body, "Duke leads by 5.");
        let a = detect(&[ev("in", 1, 2.0, 30, 30, false)], &[ev("in", 1, 0.0, 30, 30, false)], &name, &nolink);
        assert_eq!(a[0].body, "All square at the break.");
        // First half still running, and the second half under way: no halftime alert.
        assert!(detect(&[ev("in", 1, 300.0, 20, 18, false)], &[ev("in", 1, 280.0, 22, 18, false)], &name, &nolink).is_empty());
        assert!(detect(&[ev("in", 2, 1200.0, 35, 30, false)], &[ev("in", 2, 1180.0, 37, 30, false)], &name, &nolink).is_empty());
        assert!(!pref_default("halftime"));
    }

    #[test]
    fn overtime() {
        // Regulation ends level.
        let a = detect(&[ev("in", 2, 3.0, 70, 68, false)], &[evx("in", "STATUS_END_PERIOD", 2, 0.0, "0:00", 70, 70, false)], &name, &nolink);
        let ot: Vec<_> = a.iter().filter(|x| x.kind == "overtime").collect();
        assert_eq!(ot.len(), 1);
        assert_eq!(ot[0].key, "401:ot:3");
        assert_eq!(ot[0].title, "Headed to overtime: Kansas 70, Duke 70");
        // The overtime period starting is the same alert (same key), so it isn't sent twice.
        let b = detect(&[evx("in", "STATUS_END_PERIOD", 2, 0.0, "0:00", 70, 70, false)], &[ev("in", 3, 300.0, 70, 70, false)], &name, &nolink);
        assert_eq!(b.iter().find(|x| x.kind == "overtime").map(|x| x.key.as_str()), Some("401:ot:3"));
        // Second overtime gets its own alert.
        let c = detect(&[ev("in", 3, 0.0, 80, 80, false)], &[ev("in", 4, 300.0, 80, 80, false)], &name, &nolink);
        let ot2 = c.iter().find(|x| x.kind == "overtime").expect("2OT");
        assert_eq!(ot2.key, "401:ot:4");
        assert_eq!(ot2.title, "Headed to double overtime: Kansas 80, Duke 80");
        // Seen first a few seconds into OT with a basket already scored.
        let d = detect(&[ev("in", 2, 0.5, 70, 70, false)], &[ev("in", 3, 290.0, 72, 70, false)], &name, &nolink);
        assert_eq!(d.iter().find(|x| x.kind == "overtime").map(|x| x.title.as_str()), Some("Overtime: Kansas 70, Duke 72"));
        // Regulation ending with a winner, a 0-0 placeholder, and mid-overtime polls don't fire.
        assert!(detect(&[ev("in", 2, 2.0, 70, 68, false)], &[ev("in", 2, 0.0, 72, 68, false)], &name, &nolink).iter().all(|x| x.kind != "overtime"));
        assert!(detect(&[ev("pre", 0, 0.0, 0, 0, false)], &[ev("in", 2, 0.0, 0, 0, false)], &name, &nolink).iter().all(|x| x.kind != "overtime"));
        assert!(detect(&[ev("in", 3, 200.0, 74, 72, false)], &[ev("in", 3, 180.0, 76, 72, false)], &name, &nolink).iter().all(|x| x.kind != "overtime"));
    }

    #[test]
    fn upset_underdog_home_or_away() {
        // Duke (ESPN home) was a 10% underdog and leads by 6 in the second half.
        let a = detect(&[ev("in", 2, 700.0, 50, 46, false)], &[evx("in", "STATUS_IN_PROGRESS", 2, 690.0, "11:30", 52, 46, false)], &name, &wp(0.10));
        assert_eq!(kinds(&a), ["upsets"]);
        assert_eq!(a[0].key, "401:upset");
        assert_eq!(a[0].title, "Upset brewing: Duke leads Kansas 52-46");
        assert_eq!(a[0].body, "D1 Hoops gave Duke a 10% chance before tip-off. 11:30 left in the second half.");
        assert_eq!(a[0].path.as_deref(), Some("/games/?d=2026-11-11&g=378019"));
        // Kansas (ESPN away) was the underdog (Duke 82%) and leads by 5 in overtime.
        let b = detect(&[ev("in", 3, 200.0, 70, 74, false)], &[evx("in", "STATUS_IN_PROGRESS", 3, 150.0, "2:30", 70, 75, false)], &name, &wp(0.82));
        assert_eq!(kinds(&b), ["close", "upsets"]); // also within 5 inside the last 4 minutes
        assert_eq!(b[1].title, "Upset brewing: Kansas leads Duke 75-70");
        assert_eq!(b[1].body, "D1 Hoops gave Kansas a 18% chance before tip-off. 2:30 left in overtime.");
    }

    #[test]
    fn upset_needs_all_conditions() {
        let up = |prev: EspnEvent, next: EspnEvent, w: f64| detect(&[prev], &[next], &name, &wp(w)).into_iter().filter(|x| x.kind == "upsets").count();
        // First half: no, even with a big underdog lead.
        assert_eq!(up(ev("in", 1, 300.0, 30, 20, false), ev("in", 1, 280.0, 32, 20, false), 0.1), 0);
        // Lead of 4: no.
        assert_eq!(up(ev("in", 2, 900.0, 50, 46, false), ev("in", 2, 880.0, 50, 46, false), 0.1), 0);
        // 25% isn't under 25%: no.
        assert_eq!(up(ev("in", 2, 900.0, 50, 40, false), ev("in", 2, 880.0, 52, 40, false), 0.25), 0);
        // The favourite leading by plenty: no.
        assert_eq!(up(ev("in", 2, 900.0, 50, 40, false), ev("in", 2, 880.0, 52, 40, false), 0.9), 0);
        // No pregame probability (game not in the site's data): no.
        assert!(detect(&[ev("in", 2, 900.0, 50, 40, false)], &[ev("in", 2, 880.0, 52, 40, false)], &name, &nolink).iter().all(|x| x.kind != "upsets"));
        // Finished games: the final alert, not an upset alert.
        assert_eq!(up(ev("in", 2, 1.0, 60, 50, false), ev("post", 2, 0.0, 60, 50, true), 0.1), 0);
        assert_eq!(pct(0.004), "under 1%");
    }

    #[test]
    fn each_alert_sends_once_across_polls() {
        // A full game where the 15% underdog (Kansas, away) leads late, it goes to overtime and
        // Kansas wins. Replays every poll through the same claim the server uses (sent_alerts).
        let polls = vec![
            ev("pre", 0, 1200.0, 0, 0, false),
            ev("in", 1, 1190.0, 0, 2, false),
            ev("in", 1, 1.0, 30, 34, false),
            evx("in", "STATUS_HALFTIME", 1, 0.0, "0:00", 30, 34, false),
            evx("in", "STATUS_HALFTIME", 1, 0.0, "0:00", 30, 34, false),
            ev("in", 2, 1100.0, 34, 40, false),
            ev("in", 2, 1000.0, 36, 42, false),
            ev("in", 2, 900.0, 40, 42, false),
            ev("in", 2, 600.0, 44, 50, false),
            ev("in", 2, 200.0, 60, 62, false),
            ev("in", 2, 100.0, 62, 62, false),
            evx("in", "STATUS_END_PERIOD", 2, 0.0, "0:00", 64, 64, false),
            ev("in", 3, 300.0, 64, 64, false),
            ev("in", 3, 120.0, 66, 71, false),
            ev("in", 3, 60.0, 66, 72, false),
            ev("post", 3, 0.0, 68, 74, true),
            ev("post", 3, 0.0, 68, 74, true),
        ];
        let mut sent = std::collections::HashSet::new();
        let mut got = vec![];
        for w in polls.windows(2) {
            for a in detect(&w[..1], &w[1..], &name, &wp(0.85)) { if sent.insert(a.key.clone()) { got.push(a.kind); } }
        }
        assert_eq!(got, ["tipoff", "halftime", "upsets", "close", "overtime", "close", "final"]);
    }

    #[test]
    fn prefs_defaults_and_cleaning() {
        let d = default_prefs();
        assert_eq!(d["halftime"], false);
        assert_eq!(d["upsets"], true);
        assert_eq!(d["overtime"], true);
        assert_eq!(clean_prefs(None), d);
        assert_eq!(clean_prefs(Some(json!({ "final": false, "halftime": "yes", "bogus": true }))), json!({ "final": false }));
        assert!(pref_default("upsets") && pref_default("overtime") && pref_default("tipoff"));
    }

    fn site(json: Value) -> Vec<SiteGame> { serde_json::from_value::<SiteDay>(json).expect("site day").games }
    fn slug(id: &str) -> Option<String> { match id { "150" => Some("duke".into()), "2305" => Some("kansas".into()), _ => None } }

    #[test]
    fn link_matches_like_the_site() {
        let e = ev("in", 2, 600.0, 50, 40, false);
        // By ESPN event id.
        let g = site(json!({ "day": "2026-11-11", "games": [
            { "id": "1", "espnId": "999", "home": { "slug": "duke" }, "away": { "slug": "x" }, "pred": { "wp": 0.5 } },
            { "id": "2", "espnId": "401", "home": { "slug": "duke" }, "away": { "slug": "kansas" }, "pred": { "wp": 0.7 } } ] }));
        assert_eq!(link_game(&e, "2026-11-11", &g, &slug), GameLink { path: Some("/games/?d=2026-11-11&g=2".into()), home_wp: Some(0.7) });
        // By both teams, listed the other way round (neutral site): probability flips to ESPN's home team.
        let g = site(json!({ "games": [{ "id": "3", "espnId": null, "home": { "slug": "kansas" }, "away": { "slug": "duke" }, "pred": { "wp": 0.8 } }] }));
        let l = link_game(&e, "2026-11-11", &g, &slug);
        assert_eq!(l.path.as_deref(), Some("/games/?d=2026-11-11&g=3"));
        assert!((l.home_wp.unwrap() - 0.2).abs() < 1e-9);
        // One known team with one game that day; no prediction -> link but no probability.
        let g = site(json!({ "games": [{ "id": "4", "home": { "slug": "duke" }, "away": { "slug": null } }] }));
        assert_eq!(link_game(&e, "2026-11-11", &g, &slug), GameLink { path: Some("/games/?d=2026-11-11&g=4".into()), home_wp: None });
        // Ambiguous or missing: no link (alerts fall back to /games/).
        let g = site(json!({ "games": [
            { "id": "5", "home": { "slug": "duke" }, "away": { "slug": "a" } },
            { "id": "6", "home": { "slug": "b" }, "away": { "slug": "duke" } } ] }));
        let only_duke = |id: &str| if id == "150" { Some("duke".to_string()) } else { None };
        assert_eq!(link_game(&e, "2026-11-11", &g, &only_duke), GameLink::default());
        assert_eq!(link_game(&e, "2026-11-11", &[], &slug), GameLink::default());
    }

    #[test]
    fn eastern_day() {
        assert_eq!(et_day("2026-11-15T00:30Z").as_deref(), Some("2026-11-14"));
        assert_eq!(et_day("2026-11-14T05:00:00.000Z").as_deref(), Some("2026-11-14"));
        assert_eq!(et_day("2026-11-14T17:00Z").as_deref(), Some("2026-11-14"));
        assert_eq!(et_day("nope"), None);
    }

    #[test]
    fn injury_selection() {
        let now = chrono::DateTime::parse_from_rfc3339("2026-11-14T14:00:00Z").unwrap().with_timezone(&chrono::Utc);
        let wire = json!({ "checked": "x", "wire": [
            { "t": "2026-11-14T12:00:00Z", "kind": "new", "key": "duke:1", "name": "A B", "slug": "duke", "team": "Duke", "status": "Out", "from": null, "body": "Ankle" },
            { "t": "2026-11-14T13:00:00Z", "kind": "worse", "key": "duke:2", "name": "C D", "slug": "duke", "team": "Duke", "status": "Out", "from": "Questionable", "body": null },
            { "t": "2026-11-14T13:30:00Z", "kind": "returned", "key": "duke:3", "name": "E F", "slug": "duke", "team": "Duke", "status": "Available", "from": "Out", "body": null },
            { "t": "2026-11-14T13:30:00Z", "kind": "better", "key": "duke:4", "name": "G H", "slug": "duke", "team": "Duke", "status": "Probable", "from": null, "body": null },
            { "t": "2026-11-14T13:30:00Z", "kind": "cleared", "key": "duke:5", "name": "I J", "slug": "duke", "team": "Duke", "status": "x", "from": null, "body": null },
            { "t": "2026-11-14T06:00:00Z", "kind": "new", "key": "duke:6", "name": "K L", "slug": "duke", "team": "Duke", "status": "Out", "from": null, "body": null },
            { "t": "2026-11-14T15:00:00Z", "kind": "new", "key": "duke:7", "name": "M N", "slug": "duke", "team": "Duke", "status": "Out", "from": null, "body": null },
            { "t": "2026-11-14T13:00:00Z", "kind": "new", "key": "duke:9", "name": "Q R", "slug": "duke", "team": "Duke", "status": "Missed last game", "from": null, "body": null, "source": "box" },
            { "t": "garbage", "kind": "new", "key": "duke:8", "name": "O P", "slug": "duke", "team": "Duke", "status": "Out", "from": null, "body": null }
        ] });
        let a = injury_alerts(&wire, now);
        assert_eq!(a.len(), 3);
        assert!(a.iter().all(|x| x.kind == "injury" && x.teams == ["duke"]));
        assert_eq!(a[0].key, "inj:duke:1:2026-11-14T12:00:00Z:new:");
        assert_eq!(a[0].title, "Injury: A B (Duke) \u{2014} Out");
        assert_eq!(a[0].body, "Ankle");
        assert_eq!(a[1].body, "Questionable \u{2192} Out");
        assert_eq!(a[2].title, "Back: E F returns for Duke");
        assert!(injury_alerts(&json!({}), now).is_empty());
    }
}
