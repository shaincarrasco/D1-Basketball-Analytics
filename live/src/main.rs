//! D1 Hoops app server (Railway).
//!
//! One binary serves everything the product needs beyond the static site:
//!   /                 the exported Next.js site (STATIC_DIR, default ./out)
//!   /events           live scores over Server-Sent Events (see relay.rs)
//!   /scoreboard       latest slate as JSON
//!   /auth/*           same-origin proxy to Neon Auth (first-party cookies, works on Safari)
//!   /api/*            accounts, follows, Stripe billing, web-push alerts, pick'em
//! Every integration is optional: missing env vars switch that feature off and
//! /api/health reports what is live.

mod alerts;
mod api;
mod auth;
mod billing;
mod proxy;
mod relay;

use std::{collections::HashMap, env, sync::Arc};

use axum::{routing::{any, get, post, put}, Router};
use tokio::sync::{broadcast, RwLock};
use tower_http::{compression::CompressionLayer, cors::CorsLayer, services::{ServeDir, ServeFile}};

#[derive(Clone, Default)]
pub struct Config {
    pub port: u16,
    pub static_dir: String,
    pub public_url: String,
    pub neon_auth_url: Option<String>,
    pub database_url: Option<String>,
    pub stripe_secret: Option<String>,
    pub stripe_webhook_secret: Option<String>,
    pub stripe_price_monthly: Option<String>,
    pub stripe_price_yearly: Option<String>,
    pub vapid_public: Option<String>,
    pub vapid_private: Option<String>,
    pub vapid_subject: String,
}

fn opt(key: &str) -> Option<String> { env::var(key).ok().filter(|v| !v.trim().is_empty()) }

impl Config {
    fn from_env() -> Self {
        Config {
            port: opt("PORT").and_then(|p| p.parse().ok()).unwrap_or(8080),
            static_dir: opt("STATIC_DIR").unwrap_or_else(|| "out".into()),
            public_url: opt("PUBLIC_URL").or_else(|| opt("RAILWAY_PUBLIC_DOMAIN").map(|d| format!("https://{d}"))).unwrap_or_else(|| "http://localhost:8080".into()),
            neon_auth_url: opt("NEON_AUTH_URL").map(|u| u.trim_end_matches('/').to_string()),
            database_url: opt("DATABASE_URL"),
            stripe_secret: opt("STRIPE_SECRET_KEY"),
            stripe_webhook_secret: opt("STRIPE_WEBHOOK_SECRET"),
            stripe_price_monthly: opt("STRIPE_PRICE_MONTHLY"),
            stripe_price_yearly: opt("STRIPE_PRICE_YEARLY"),
            vapid_public: opt("VAPID_PUBLIC_KEY"),
            vapid_private: opt("VAPID_PRIVATE_KEY"),
            vapid_subject: opt("VAPID_SUBJECT").unwrap_or_else(|| "mailto:admin@d1hoops.app".into()),
        }
    }
}

#[derive(Clone)]
pub struct TeamInfo { pub slug: String, pub name: String }

pub struct AppState {
    pub cfg: Config,
    pub http: reqwest::Client,
    pub db: Option<deadpool_postgres::Pool>,
    pub jwks: auth::Jwks,
    pub slate: RwLock<Arc<str>>,
    pub tx: broadcast::Sender<Arc<str>>,
    /// ESPN team id -> team (from the exported site's teams.json), for alerts.
    pub teams: RwLock<HashMap<String, TeamInfo>>,
}
pub type Shared = Arc<AppState>;

fn db_pool(url: &str) -> Option<deadpool_postgres::Pool> {
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let tls = rustls::ClientConfig::builder().with_root_certificates(roots).with_no_client_auth();
    let mut cfg = deadpool_postgres::Config::new();
    cfg.url = Some(url.to_string());
    match cfg.create_pool(Some(deadpool_postgres::Runtime::Tokio1), tokio_postgres_rustls::MakeRustlsConnect::new(tls)) {
        Ok(p) => Some(p),
        Err(e) => { eprintln!("[db] pool error: {e}"); None }
    }
}

async fn load_teams(state: &Shared) {
    let path = format!("{}/data/app/teams.json", state.cfg.static_dir);
    let Ok(text) = tokio::fs::read_to_string(&path).await else { eprintln!("[teams] {path} not found; alerts need it"); return };
    let Ok(rows) = serde_json::from_str::<Vec<serde_json::Value>>(&text) else { return };
    let mut map = HashMap::new();
    for t in rows {
        if let (Some(e), Some(slug), Some(name)) = (t["espnId"].as_str(), t["slug"].as_str(), t["name"].as_str()) {
            map.insert(e.to_string(), TeamInfo { slug: slug.into(), name: name.into() });
        }
    }
    eprintln!("[teams] {} teams loaded", map.len());
    *state.teams.write().await = map;
}

#[tokio::main]
async fn main() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let cfg = Config::from_env();
    let http = reqwest::Client::builder()
        .user_agent("d1hoops-server/0.2 (+https://github.com/shaincarrasco/D1-Basketball-Analytics)")
        .redirect(reqwest::redirect::Policy::none())
        .gzip(true)
        .build()
        .expect("http client");
    let (tx, _) = broadcast::channel(16);
    let state: Shared = Arc::new(AppState {
        db: cfg.database_url.as_deref().and_then(db_pool),
        jwks: auth::Jwks::new(cfg.neon_auth_url.clone()),
        slate: RwLock::new(serde_json::to_string(&relay::Slate::default()).unwrap().into()),
        teams: RwLock::new(HashMap::new()),
        tx, http, cfg: cfg.clone(),
    });
    load_teams(&state).await;
    tokio::spawn(relay::poll_loop(state.clone()));

    let static_dir = cfg.static_dir.clone();
    let site = ServeDir::new(&static_dir).not_found_service(ServeFile::new(format!("{static_dir}/404.html")));
    let app = Router::new()
        .route("/events", get(relay::events))
        .route("/scoreboard", get(relay::scoreboard))
        .route("/health", get(|| async { "ok" }))
        .route("/auth/{*rest}", any(proxy::auth_proxy))
        .route("/api/health", get(api::health))
        .route("/api/me", get(api::me))
        .route("/api/follows", put(api::put_follows))
        .route("/api/picks", get(api::get_picks).put(api::put_pick))
        .route("/api/checkout", post(billing::checkout))
        .route("/api/portal", post(billing::portal))
        .route("/api/stripe/webhook", post(billing::webhook))
        .route("/api/push/key", get(alerts::public_key))
        .route("/api/push/subscribe", post(alerts::subscribe))
        .route("/api/push/unsubscribe", post(alerts::unsubscribe))
        .fallback_service(site)
        .layer(CompressionLayer::new())
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", cfg.port)).await.expect("bind");
    eprintln!("[server] listening on :{} serving {}", cfg.port, cfg.static_dir);
    axum::serve(listener, app).with_graceful_shutdown(async { let _ = tokio::signal::ctrl_c().await; }).await.expect("server");
}
