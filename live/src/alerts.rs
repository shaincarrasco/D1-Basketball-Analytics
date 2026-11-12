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
    let prefs = body.prefs.unwrap_or_else(|| json!({ "tipoff": true, "close": true, "final": true }));
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
    let (Some(pool), Some(public), Some(private)) = (state.db.clone(), state.cfg.vapid_public.clone(), state.cfg.vapid_private.clone()) else { return };
    if prev.is_empty() { return; } // first poll after a restart: no transitions to report
    let teams = state.teams.read().await.clone();
    let name = |id: &str| teams.get(id).map(|t| t.name.clone()).unwrap_or_else(|| "Opponent".into());
    let alerts = detect(&prev, &next, &name);
    if alerts.is_empty() { return; }
    let Ok(c) = pool.get().await else { return };
    let Ok(client) = std::panic::catch_unwind(HyperWebPushClient::new) else { return };
    let _ = public;
    for a in alerts {
        // Claim the alert once across restarts / instances.
        if c.execute("INSERT INTO app.sent_alerts (key) VALUES ($1) ON CONFLICT DO NOTHING", &[&a.key]).await.unwrap_or(0) == 0 { continue; }
        let slugs: Vec<String> = a.teams.iter().filter_map(|id| teams.get(id).map(|t| t.slug.clone())).collect();
        if slugs.is_empty() { continue; }
        let rows = match c.query(
            "SELECT DISTINCT s.endpoint, s.p256dh, s.auth FROM app.push_subscriptions s JOIN app.follows f ON f.user_id = s.user_id AND f.kind = 'team' AND f.ref = ANY($1) JOIN app.profiles p ON p.user_id = s.user_id AND p.plan = 'pro' WHERE COALESCE((s.prefs ->> $2)::boolean, true)",
            &[&slugs, &a.kind]).await { Ok(r) => r, Err(e) => { let _ = db_err(e); continue } };
        let url = format!("{}/games/", state.cfg.public_url);
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
}
