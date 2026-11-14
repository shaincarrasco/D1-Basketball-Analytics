//! Web-push alerts for followed teams (Pro): tip-off, close game late, final.
//! Driven by slate changes from the relay; each alert is sent once (app.sent_alerts).

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
    let prefs = body.prefs.unwrap_or_else(|| json!({ "tipoff": true, "close": true, "final": true, "injury": true }));
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

struct Alert { key: String, kind: &'static str, teams: Vec<String>, title: String, body: String }

fn score(e: &EspnEvent, side: &str) -> (String, i64) {
    let c = e.competitions.first().and_then(|c| c.competitors.iter().find(|x| x.home_away == side));
    (c.map(|x| x.team.id.clone()).unwrap_or_default(), c.and_then(|x| x.score.as_deref()).and_then(|s| s.parse().ok()).unwrap_or(0))
}

fn detect(prev: &[EspnEvent], next: &[EspnEvent], name: &dyn Fn(&str) -> String) -> Vec<Alert> {
    let mut out = vec![];
    for e in next {
        let before = prev.iter().find(|p| p.id == e.id);
        let (hid, hs) = score(e, "home");
        let (aid, as_) = score(e, "away");
        let (hn, an) = (name(&hid), name(&aid));
        let teams = vec![hid.clone(), aid.clone()];
        let was = before.map(|b| b.status.kind.state.as_str()).unwrap_or("pre");
        let now = e.status.kind.state.as_str();
        if was == "pre" && now == "in" {
            out.push(Alert { key: format!("{}:tip", e.id), kind: "tipoff", teams: teams.clone(), title: format!("Tip-off: {an} at {hn}"), body: "Follow it live on D1 Hoops.".into() });
        }
        let period = e.status.period.unwrap_or(0);
        let clock = e.status.clock.unwrap_or(9999.0);
        if now == "in" && period >= 2 && clock <= 240.0 && (hs - as_).abs() <= 5 {
            out.push(Alert { key: format!("{}:close:{period}", e.id), kind: "close", teams: teams.clone(), title: format!("Close game: {an} {as_}, {hn} {hs}"), body: format!("{} left — tune in.", e.status.display_clock.clone().unwrap_or_default()) });
        }
        if was != "post" && now == "post" && e.status.kind.completed {
            let (w, l, ws, ls) = if hs > as_ { (&hn, &an, hs, as_) } else { (&an, &hn, as_, hs) };
            out.push(Alert { key: format!("{}:final", e.id), kind: "final", teams, title: format!("Final: {w} {ws}, {l} {ls}"), body: "See the recap, box score and win-probability chart.".into() });
        }
    }
    out
}

pub async fn on_slate(state: Shared, prev: Vec<EspnEvent>, next: Vec<EspnEvent>) {
    if state.db.is_none() || state.cfg.vapid_public.is_none() || state.cfg.vapid_private.is_none() { return }
    if prev.is_empty() { return; } // first poll after a restart: no transitions to report
    let teams = state.teams.read().await.clone();
    let name = |id: &str| teams.get(id).map(|t| t.name.clone()).unwrap_or_else(|| "Opponent".into());
    let alerts: Vec<(Alert, Vec<String>)> = detect(&prev, &next, &name).into_iter().map(|a| {
        let slugs = a.teams.iter().filter_map(|id| teams.get(id).map(|t| t.slug.clone())).collect();
        (a, slugs)
    }).collect();
    dispatch(&state, alerts, "/games/").await;
}

/// Claim each alert once (app.sent_alerts), then push it to Pro followers of its team slugs
/// whose prefs don't turn that kind off. Shared by the live-game and injury paths.
async fn dispatch(state: &Shared, alerts: Vec<(Alert, Vec<String>)>, path: &str) {
    let (Some(pool), Some(_), Some(private)) = (state.db.clone(), state.cfg.vapid_public.clone(), state.cfg.vapid_private.clone()) else { return };
    if alerts.is_empty() { return; }
    let Ok(c) = pool.get().await else { return };
    let Ok(client) = std::panic::catch_unwind(HyperWebPushClient::new) else { return };
    for (a, slugs) in alerts {
        // Claim the alert once across restarts / instances.
        if c.execute("INSERT INTO app.sent_alerts (key) VALUES ($1) ON CONFLICT DO NOTHING", &[&a.key]).await.unwrap_or(0) == 0 { continue; }
        if slugs.is_empty() { continue; }
        let rows = match c.query(
            "SELECT DISTINCT s.endpoint, s.p256dh, s.auth FROM app.push_subscriptions s JOIN app.follows f ON f.user_id = s.user_id AND f.kind = 'team' AND f.ref = ANY($1) JOIN app.profiles p ON p.user_id = s.user_id AND p.plan = 'pro' WHERE COALESCE((s.prefs ->> $2)::boolean, true)",
            &[&slugs, &a.kind]).await { Ok(r) => r, Err(e) => { let _ = db_err(e); continue } };
        let url = format!("{}{}", state.cfg.public_url, path);
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
        out.push(Alert { key: format!("inj:{key}:{stint}:{kind}:{state}"), kind: "injury", teams: vec![slug], title, body });
    }
    out
}

pub const DEFAULT_INJURY_FEED: &str = "https://shaincarrasco.github.io/D1-Basketball-Analytics/data/app/injury-wire.json";

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
        serde_json::from_value(json!({
            "id": "401", "name": "A at B", "date": "2026-11-12T00:00Z",
            "status": { "clock": clock, "displayClock": "3:30", "period": period, "type": { "name": "S", "state": state, "completed": completed, "shortDetail": "" } },
            "competitions": [{ "competitors": [
                { "homeAway": "home", "score": home.to_string(), "team": { "id": "150", "abbreviation": "DUKE", "displayName": "Duke" } },
                { "homeAway": "away", "score": away.to_string(), "team": { "id": "2305", "abbreviation": "KU", "displayName": "Kansas" } } ] }]
        })).expect("event json")
    }
    fn name(id: &str) -> String { if id == "150" { "Duke".into() } else { "Kansas".into() } }
    #[test]
    fn transitions() {
        let a = detect(&[ev("pre", 0, 1200.0, 0, 0, false)], &[ev("in", 1, 1190.0, 2, 0, false)], &name);
        assert_eq!(a.iter().map(|x| x.kind).collect::<Vec<_>>(), ["tipoff"]);
        let a = detect(&[ev("in", 2, 300.0, 60, 58, false)], &[ev("in", 2, 210.0, 62, 60, false)], &name);
        assert_eq!(a[0].kind, "close");
        let a = detect(&[ev("in", 2, 1.0, 70, 65, false)], &[ev("post", 2, 0.0, 70, 65, true)], &name);
        assert_eq!(a[0].title, "Final: Duke 70, Kansas 65");
        assert!(detect(&[ev("in", 2, 100.0, 80, 60, false)], &[ev("in", 2, 90.0, 82, 60, false)], &name).is_empty());
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
