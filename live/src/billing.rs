//! Stripe subscriptions: Checkout to subscribe, Billing Portal to manage, and a signed
//! webhook that keeps app.profiles.plan in sync ('pro' while the subscription is active).

use axum::{body::Bytes, extract::State, http::{HeaderMap, StatusCode}, Json};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::Sha256;

use crate::{api::{db, db_err, err, profile_plan, require_user, ApiResult}, Shared};

async fn stripe_post(state: &Shared, path: &str, form: &[(&str, String)]) -> Result<Value, (StatusCode, Json<Value>)> {
    let key = state.cfg.stripe_secret.as_ref().ok_or_else(|| err(StatusCode::SERVICE_UNAVAILABLE, "Payments are not configured yet."))?;
    let resp = state.http.post(format!("https://api.stripe.com/v1/{path}")).basic_auth(key, Some("")).form(form).send().await
        .map_err(|_| err(StatusCode::BAD_GATEWAY, "Couldn't reach Stripe; try again."))?;
    let ok = resp.status().is_success();
    let body: Value = resp.json().await.unwrap_or_default();
    if !ok { eprintln!("[stripe] {path}: {body}"); return Err(err(StatusCode::BAD_GATEWAY, body["error"]["message"].as_str().unwrap_or("Stripe rejected the request."))); }
    Ok(body)
}

#[derive(Deserialize)]
pub struct CheckoutReq { interval: Option<String> }
pub async fn checkout(State(state): State<Shared>, headers: HeaderMap, Json(body): Json<CheckoutReq>) -> ApiResult {
    let user = require_user(&headers, &state).await?;
    let c = db(&state).await?;
    let plan = profile_plan(&c, &user).await?;
    if plan == "pro" { return Err(err(StatusCode::CONFLICT, "You're already on Pro.")); }
    let price = if body.interval.as_deref() == Some("year") { state.cfg.stripe_price_yearly.clone() } else { state.cfg.stripe_price_monthly.clone() }
        .ok_or_else(|| err(StatusCode::SERVICE_UNAVAILABLE, "That plan isn't available yet."))?;
    let customer: Option<String> = c.query_one("SELECT stripe_customer_id FROM app.profiles WHERE user_id = $1", &[&user.sub]).await.map_err(db_err)?.get(0);
    let base = &state.cfg.public_url;
    let mut form = vec![
        ("mode", "subscription".to_string()), ("line_items[0][price]", price), ("line_items[0][quantity]", "1".into()),
        ("success_url", format!("{base}/account/?upgraded=1")), ("cancel_url", format!("{base}/pro/")),
        ("client_reference_id", user.sub.clone()), ("subscription_data[metadata][user_id]", user.sub.clone()), ("allow_promotion_codes", "true".into()),
    ];
    match customer { Some(cu) => form.push(("customer", cu)), None => if let Some(e) = &user.email { form.push(("customer_email", e.clone())) } }
    let session = stripe_post(&state, "checkout/sessions", &form).await?;
    Ok(Json(json!({ "url": session["url"] })))
}

pub async fn portal(State(state): State<Shared>, headers: HeaderMap) -> ApiResult {
    let user = require_user(&headers, &state).await?;
    let c = db(&state).await?;
    let customer: Option<String> = c.query_opt("SELECT stripe_customer_id FROM app.profiles WHERE user_id = $1", &[&user.sub]).await.map_err(db_err)?.and_then(|r| r.get(0));
    let customer = customer.ok_or_else(|| err(StatusCode::NOT_FOUND, "No billing account yet."))?;
    let session = stripe_post(&state, "billing_portal/sessions", &[("customer", customer), ("return_url", format!("{}/account/", state.cfg.public_url))]).await?;
    Ok(Json(json!({ "url": session["url"] })))
}

/// Stripe-Signature: t=<unix>,v1=<hex hmac of "t.payload">; reject if older than 5 minutes.
fn verify_signature(secret: &str, header: &str, payload: &[u8]) -> bool {
    let mut t = None; let mut sigs = vec![];
    for part in header.split(',') {
        match part.split_once('=') { Some(("t", v)) => t = Some(v.to_string()), Some(("v1", v)) => sigs.push(v.to_string()), _ => {} }
    }
    let Some(t) = t else { return false };
    if t.parse::<i64>().map(|ts| (chrono::Utc::now().timestamp() - ts).abs() > 300).unwrap_or(true) { return false; }
    sigs.iter().any(|sig| {
        let Ok(expected) = hex::decode(sig) else { return false };
        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("hmac key");
        mac.update(t.as_bytes()); mac.update(b"."); mac.update(payload);
        mac.verify_slice(&expected).is_ok()
    })
}

pub async fn webhook(State(state): State<Shared>, headers: HeaderMap, body: Bytes) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let secret = state.cfg.stripe_webhook_secret.as_ref().ok_or_else(|| err(StatusCode::SERVICE_UNAVAILABLE, "Webhook secret not configured."))?;
    let sig = headers.get("stripe-signature").and_then(|v| v.to_str().ok()).unwrap_or_default();
    if !verify_signature(secret, sig, &body) { return Err(err(StatusCode::BAD_REQUEST, "Bad signature.")); }
    let event: Value = serde_json::from_slice(&body).map_err(|_| err(StatusCode::BAD_REQUEST, "Bad payload."))?;
    let c = db(&state).await?;
    let id = event["id"].as_str().unwrap_or_default();
    if c.execute("INSERT INTO app.stripe_events (id) VALUES ($1) ON CONFLICT DO NOTHING", &[&id]).await.map_err(db_err)? == 0 { return Ok(StatusCode::OK); }
    let obj = &event["data"]["object"];
    match event["type"].as_str().unwrap_or_default() {
        "checkout.session.completed" => {
            if let Some(user) = obj["client_reference_id"].as_str() {
                c.execute("UPDATE app.profiles SET plan = 'pro', plan_status = 'active', stripe_customer_id = $2, stripe_subscription_id = $3, updated_at = now() WHERE user_id = $1",
                    &[&user, &obj["customer"].as_str(), &obj["subscription"].as_str()]).await.map_err(db_err)?;
            }
        }
        "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted" => {
            let status = obj["status"].as_str().unwrap_or("canceled");
            let plan = if matches!(status, "active" | "trialing" | "past_due") { "pro" } else { "free" };
            let end = obj["current_period_end"].as_i64().or_else(|| obj["items"]["data"][0]["current_period_end"].as_i64()).and_then(|t| chrono::DateTime::from_timestamp(t, 0));
            let customer = obj["customer"].as_str().unwrap_or_default();
            let user = obj["metadata"]["user_id"].as_str();
            c.execute("UPDATE app.profiles SET plan = $2, plan_status = $3, current_period_end = $4, stripe_subscription_id = $5, stripe_customer_id = COALESCE(stripe_customer_id, $1), updated_at = now() WHERE stripe_customer_id = $1 OR user_id = $6",
                &[&customer, &plan, &status, &end, &obj["id"].as_str(), &user.unwrap_or("")]).await.map_err(db_err)?;
        }
        _ => {}
    }
    Ok(StatusCode::OK)
}
