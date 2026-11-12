//! D1 Hoops live relay.
//!
//! One process polls ESPN's public men's college basketball scoreboard for today's
//! slate (Eastern time) every couple of seconds while games are live, trims each event
//! to what the site needs, and pushes the slate to every connected browser over
//! Server-Sent Events the moment anything changes. Browsers no longer poll ESPN every
//! 30 s each; they get one push within ~one poll interval of ESPN updating.
//!
//! Endpoints
//!   GET /events      SSE stream: an `slate` event with the current slate, then one per change
//!   GET /scoreboard  latest slate as JSON (same shape as ESPN: { day, updated, events: [...] })
//!   GET /health      "ok"
//!
//! Env: PORT (8080), POLL_LIVE_MS (2000), POLL_IDLE_MS (20000), ESPN_GROUPS (50 = Division I)

use std::{convert::Infallible, env, sync::Arc, time::Duration};

use axum::{
    extract::State,
    http::{header, HeaderValue},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
    routing::get,
    Router,
};
use chrono::{Timelike, Utc};
use chrono_tz::America::New_York;
use futures_util::{stream, Stream, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};
use tokio_stream::wrappers::BroadcastStream;
use tower_http::{compression::CompressionLayer, cors::CorsLayer};

const ESPN: &str = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";

// ---------- trimmed ESPN shapes (field names match ESPN so the site parses both) ----------
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct StatusType {
    name: String,
    state: String,
    completed: bool,
    #[serde(rename = "shortDetail", default, skip_serializing_if = "Option::is_none")]
    short_detail: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct Status {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    clock: Option<f64>,
    #[serde(rename = "displayClock", default, skip_serializing_if = "Option::is_none")]
    display_clock: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    period: Option<u32>,
    #[serde(rename = "type")]
    kind: StatusType,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct TeamRef {
    id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct LineScore {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    value: Option<f64>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct Competitor {
    #[serde(rename = "homeAway")]
    home_away: String,
    team: TeamRef,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    score: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    linescores: Vec<LineScore>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct Competition {
    competitors: Vec<Competitor>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct EspnEvent {
    id: String,
    date: String,
    status: Status,
    competitions: Vec<Competition>,
}
#[derive(Debug, Deserialize)]
struct Scoreboard {
    #[serde(default)]
    events: Vec<EspnEvent>,
}

#[derive(Debug, Clone, Serialize, Default)]
struct Slate {
    day: String,
    updated: i64,
    events: Vec<EspnEvent>,
}

struct AppState {
    slate: RwLock<Arc<str>>,
    tx: broadcast::Sender<Arc<str>>,
}

fn env_ms(key: &str, default: u64) -> Duration {
    Duration::from_millis(env::var(key).ok().and_then(|v| v.parse().ok()).unwrap_or(default))
}

/// Today's slate date in Eastern time; until 4 a.m. ET keep showing the previous night.
fn slate_day() -> String {
    let now = Utc::now().with_timezone(&New_York);
    let day = if now.hour() < 4 { now - chrono::Duration::hours(5) } else { now };
    day.format("%Y%m%d").to_string()
}

async fn poll_loop(state: Arc<AppState>) {
    let client = reqwest::Client::builder()
        .user_agent("d1hoops-live/0.1 (+https://github.com/shaincarrasco/D1-Basketball-Analytics)")
        .timeout(Duration::from_secs(8))
        .gzip(true)
        .build()
        .expect("http client");
    let (live_every, idle_every) = (env_ms("POLL_LIVE_MS", 2000), env_ms("POLL_IDLE_MS", 20000));
    let groups = env::var("ESPN_GROUPS").unwrap_or_else(|_| "50".into());
    let mut last: Option<(String, Vec<EspnEvent>)> = None;
    loop {
        let day = slate_day();
        let url = format!("{ESPN}?dates={day}&groups={groups}&limit=500");
        let mut any_live = false;
        match client.get(&url).send().await.and_then(|r| r.error_for_status()) {
            Ok(resp) => match resp.json::<Scoreboard>().await {
                Ok(board) => {
                    any_live = board.events.iter().any(|e| e.status.kind.state == "in");
                    let changed = match &last {
                        Some((d, evs)) => d != &day || evs != &board.events,
                        None => true,
                    };
                    if changed {
                        let slate = Slate { day: day.clone(), updated: Utc::now().timestamp_millis(), events: board.events.clone() };
                        let json: Arc<str> = serde_json::to_string(&slate).unwrap_or_default().into();
                        *state.slate.write().await = json.clone();
                        let _ = state.tx.send(json); // no receivers is fine
                        last = Some((day, board.events));
                    }
                }
                Err(e) => eprintln!("[live] bad scoreboard payload: {e}"),
            },
            Err(e) => eprintln!("[live] scoreboard request failed: {e}"),
        }
        tokio::time::sleep(if any_live { live_every } else { idle_every }).await;
    }
}

async fn scoreboard(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let body = state.slate.read().await.clone();
    (
        [
            (header::CONTENT_TYPE, HeaderValue::from_static("application/json")),
            (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
        ],
        body.to_string(),
    )
}

async fn events(State(state): State<Arc<AppState>>) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let first = state.slate.read().await.clone();
    let updates = BroadcastStream::new(state.tx.subscribe())
        .filter_map(|msg| async move { msg.ok() }) // a lagging client just skips to the newest slate
        .map(|json| Ok(Event::default().event("slate").data(json.to_string())));
    let initial = stream::once(async move { Ok(Event::default().event("slate").data(first.to_string())) });
    Sse::new(initial.chain(updates)).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

#[tokio::main]
async fn main() {
    let (tx, _) = broadcast::channel(16);
    let empty: Arc<str> = serde_json::to_string(&Slate::default()).unwrap().into();
    let state = Arc::new(AppState { slate: RwLock::new(empty), tx });
    tokio::spawn(poll_loop(state.clone()));

    let app = Router::new()
        .route("/events", get(events))
        .route("/scoreboard", get(scoreboard))
        .route("/health", get(|| async { "ok" }))
        .layer(CompressionLayer::new())
        .layer(CorsLayer::permissive())
        .with_state(state);

    let port = env::var("PORT").ok().and_then(|p| p.parse::<u16>().ok()).unwrap_or(8080);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await.expect("bind");
    eprintln!("[live] listening on :{port}");
    axum::serve(listener, app)
        .with_graceful_shutdown(async { let _ = tokio::signal::ctrl_c().await; })
        .await
        .expect("server");
}
