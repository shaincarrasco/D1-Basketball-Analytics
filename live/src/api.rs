//! Account API: who am I + plan, follows sync, pick'em.

use axum::{extract::State, http::{HeaderMap, StatusCode}, Json};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{auth::{user_from, Claims}, Shared};

pub type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;
pub fn err(code: StatusCode, msg: &str) -> (StatusCode, Json<Value>) { (code, Json(json!({ "error": msg }))) }

pub async fn require_user(headers: &HeaderMap, state: &Shared) -> Result<Claims, (StatusCode, Json<Value>)> {
    if !state.jwks.enabled() { return Err(err(StatusCode::SERVICE_UNAVAILABLE, "Accounts are not configured on this server.")); }
    user_from(headers, state).await.ok_or_else(|| err(StatusCode::UNAUTHORIZED, "Sign in again: your session has expired."))
}
pub async fn db(state: &Shared) -> Result<deadpool_postgres::Object, (StatusCode, Json<Value>)> {
    let pool = state.db.as_ref().ok_or_else(|| err(StatusCode::SERVICE_UNAVAILABLE, "The database is not configured on this server."))?;
    pool.get().await.map_err(|e| { eprintln!("[db] {e}"); err(StatusCode::SERVICE_UNAVAILABLE, "The database is unavailable; try again shortly.") })
}
pub fn db_err(e: tokio_postgres::Error) -> (StatusCode, Json<Value>) { eprintln!("[db] {e}"); err(StatusCode::INTERNAL_SERVER_ERROR, "Database error.") }

/// Ensures a profile row exists and returns its plan.
pub async fn profile_plan(c: &deadpool_postgres::Object, user: &Claims) -> Result<String, (StatusCode, Json<Value>)> {
    let row = c.query_one(
        "INSERT INTO app.profiles (user_id, email) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET email = COALESCE(EXCLUDED.email, app.profiles.email), updated_at = now() RETURNING plan",
        &[&user.sub, &user.email]).await.map_err(db_err)?;
    Ok(row.get(0))
}

pub async fn health(State(state): State<Shared>) -> Json<Value> {
    let c = &state.cfg;
    Json(json!({
        "ok": true,
        "accounts": state.jwks.enabled() && state.db.is_some(),
        "billing": c.stripe_secret.is_some() && c.stripe_price_monthly.is_some(),
        "alerts": c.vapid_public.is_some() && c.vapid_private.is_some() && state.db.is_some(),
        "prices": { "monthly": c.stripe_price_monthly.is_some(), "yearly": c.stripe_price_yearly.is_some() },
    }))
}

pub async fn me(State(state): State<Shared>, headers: HeaderMap) -> ApiResult {
    let user = require_user(&headers, &state).await?;
    let c = db(&state).await?;
    let plan = profile_plan(&c, &user).await?;
    let follows = c.query("SELECT kind, ref FROM app.follows WHERE user_id = $1 ORDER BY created_at", &[&user.sub]).await.map_err(db_err)?;
    let (mut teams, mut players) = (vec![], vec![]);
    for r in follows { let (k, v): (String, String) = (r.get(0), r.get(1)); if k == "team" { teams.push(v) } else { players.push(v) } }
    let sub = c.query_opt("SELECT plan_status, current_period_end, stripe_customer_id IS NOT NULL FROM app.profiles WHERE user_id = $1", &[&user.sub]).await.map_err(db_err)?;
    let (status, period_end, has_customer) = sub.map(|r| (r.get::<_, Option<String>>(0), r.get::<_, Option<chrono::DateTime<chrono::Utc>>>(1), r.get::<_, bool>(2))).unwrap_or((None, None, false));
    Ok(Json(json!({ "user": { "id": user.sub, "email": user.email }, "plan": plan, "status": status, "periodEnd": period_end, "billingPortal": has_customer, "follows": { "teams": teams, "players": players } })))
}

#[derive(Deserialize)]
pub struct Follows { teams: Vec<String>, players: Vec<String> }
pub async fn put_follows(State(state): State<Shared>, headers: HeaderMap, Json(body): Json<Follows>) -> ApiResult {
    let user = require_user(&headers, &state).await?;
    if body.teams.len() + body.players.len() > 500 { return Err(err(StatusCode::BAD_REQUEST, "Too many follows.")); }
    let mut c = db(&state).await?;
    profile_plan(&c, &user).await?;
    let tx = c.transaction().await.map_err(db_err)?;
    tx.execute("DELETE FROM app.follows WHERE user_id = $1", &[&user.sub]).await.map_err(db_err)?;
    for t in &body.teams { tx.execute("INSERT INTO app.follows (user_id, kind, ref) VALUES ($1, 'team', $2) ON CONFLICT DO NOTHING", &[&user.sub, t]).await.map_err(db_err)?; }
    for p in &body.players { tx.execute("INSERT INTO app.follows (user_id, kind, ref) VALUES ($1, 'player', $2) ON CONFLICT DO NOTHING", &[&user.sub, p]).await.map_err(db_err)?; }
    tx.commit().await.map_err(db_err)?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn get_picks(State(state): State<Shared>, headers: HeaderMap) -> ApiResult {
    let user = require_user(&headers, &state).await?;
    let c = db(&state).await?;
    let rows = c.query("SELECT game_id, pick FROM app.picks WHERE user_id = $1", &[&user.sub]).await.map_err(db_err)?;
    let picks: serde_json::Map<String, Value> = rows.iter().map(|r| (r.get::<_, String>(0), Value::String(r.get(1)))).collect();
    Ok(Json(json!({ "picks": picks })))
}

#[derive(Deserialize)]
pub struct Pick { #[serde(rename = "gameId")] game_id: String, pick: String }

/// ESPN game state ("pre" | "in" | "post") from the live slate, else ESPN's summary endpoint.
async fn game_state(state: &Shared, espn_id: &str) -> Option<String> {
    let slate: Value = serde_json::from_str(&state.slate.read().await).ok()?;
    if let Some(e) = slate["events"].as_array().and_then(|a| a.iter().find(|e| e["id"] == espn_id)) {
        return e["status"]["type"]["state"].as_str().map(String::from);
    }
    let url = format!("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event={espn_id}");
    let v: Value = state.http.get(url).timeout(std::time::Duration::from_secs(4)).send().await.ok()?.json().await.ok()?;
    v["header"]["competitions"][0]["status"]["type"]["state"].as_str().map(String::from)
}
pub async fn put_pick(State(state): State<Shared>, headers: HeaderMap, Json(body): Json<Pick>) -> ApiResult {
    let user = require_user(&headers, &state).await?;
    if body.pick != "home" && body.pick != "away" { return Err(err(StatusCode::BAD_REQUEST, "Pick must be home or away.")); }
    if !body.game_id.chars().all(|c| c.is_ascii_digit()) || body.game_id.len() > 12 { return Err(err(StatusCode::BAD_REQUEST, "Unknown game.")); }
    match game_state(&state, &body.game_id).await.as_deref() {
        Some("pre") => {}
        Some(_) => return Err(err(StatusCode::CONFLICT, "Picks lock at tip-off.")),
        None => return Err(err(StatusCode::BAD_GATEWAY, "Couldn't confirm the tip-off time; try again.")),
    }
    let c = db(&state).await?;
    profile_plan(&c, &user).await?;
    c.execute("INSERT INTO app.picks (user_id, game_id, pick) VALUES ($1, $2, $3) ON CONFLICT (user_id, game_id) DO UPDATE SET pick = EXCLUDED.pick, created_at = now()",
        &[&user.sub, &body.game_id, &body.pick]).await.map_err(db_err)?;
    Ok(Json(json!({ "ok": true })))
}
