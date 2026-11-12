//! Live score relay: polls ESPN's public scoreboard for today's slate (Eastern time)
//! every 2 s while games are live (20 s otherwise), trims each event, and pushes the
//! slate to every connected browser over SSE when anything changes. Each change is
//! also handed to the alert engine (alerts.rs).

use std::{convert::Infallible, env, sync::Arc, time::Duration};

use axum::{
    extract::State,
    http::{header, HeaderValue},
    response::{sse::{Event, KeepAlive, Sse}, IntoResponse},
};
use chrono::{Timelike, Utc};
use chrono_tz::America::New_York;
use futures_util::{stream, Stream, StreamExt};
use serde::{Deserialize, Serialize};
use tokio_stream::wrappers::BroadcastStream;

use crate::Shared;

const ESPN: &str = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";

// ---------- trimmed ESPN shapes (field names match ESPN so the site parses both) ----------
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StatusType {
    pub name: String,
    pub state: String,
    pub completed: bool,
    #[serde(rename = "shortDetail", default, skip_serializing_if = "Option::is_none")]
    pub short_detail: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Status {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clock: Option<f64>,
    #[serde(rename = "displayClock", default, skip_serializing_if = "Option::is_none")]
    pub display_clock: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub period: Option<u32>,
    #[serde(rename = "type")]
    pub kind: StatusType,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TeamRef {
    pub id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LineScore {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Competitor {
    #[serde(rename = "homeAway")]
    pub home_away: String,
    pub team: TeamRef,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub score: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub linescores: Vec<LineScore>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Competition {
    pub competitors: Vec<Competitor>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EspnEvent {
    pub id: String,
    pub date: String,
    pub status: Status,
    pub competitions: Vec<Competition>,
}
#[derive(Debug, Deserialize)]
pub struct Scoreboard {
    #[serde(default)]
    pub events: Vec<EspnEvent>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct Slate {
    pub day: String,
    pub updated: i64,
    pub events: Vec<EspnEvent>,
}



pub fn env_ms(key: &str, default: u64) -> Duration {
    Duration::from_millis(env::var(key).ok().and_then(|v| v.parse().ok()).unwrap_or(default))
}

/// Today's slate date in Eastern time; until 4 a.m. ET keep showing the previous night.
pub fn slate_day() -> String {
    let now = Utc::now().with_timezone(&New_York);
    let day = if now.hour() < 4 { now - chrono::Duration::hours(5) } else { now };
    day.format("%Y%m%d").to_string()
}

pub async fn poll_loop(state: Shared) {
    let client = state.http.clone();
    let (live_every, idle_every) = (env_ms("POLL_LIVE_MS", 2000), env_ms("POLL_IDLE_MS", 20000));
    let groups = env::var("ESPN_GROUPS").unwrap_or_else(|_| "50".into());
    let mut last: Option<(String, Vec<EspnEvent>)> = None;
    loop {
        let day = slate_day();
        let url = format!("{ESPN}?dates={day}&groups={groups}&limit=500");
        let mut any_live = false;
        match client.get(&url).timeout(Duration::from_secs(8)).send().await.and_then(|r| r.error_for_status()) {
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
                        let prev = last.as_ref().filter(|(d, _)| d == &day).map(|(_, e)| e.clone()).unwrap_or_default();
                        let st = state.clone();
                        let next = board.events.clone();
                        tokio::spawn(async move { crate::alerts::on_slate(st, prev, next).await });
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

pub async fn scoreboard(State(state): State<Shared>) -> impl IntoResponse {
    let body = state.slate.read().await.clone();
    (
        [
            (header::CONTENT_TYPE, HeaderValue::from_static("application/json")),
            (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
        ],
        body.to_string(),
    )
}

pub async fn events(State(state): State<Shared>) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let first = state.slate.read().await.clone();
    let updates = BroadcastStream::new(state.tx.subscribe())
        .filter_map(|msg| async move { msg.ok() }) // a lagging client just skips to the newest slate
        .map(|json| Ok(Event::default().event("slate").data(json.to_string())));
    let initial = stream::once(async move { Ok(Event::default().event("slate").data(first.to_string())) });
    Sse::new(initial.chain(updates)).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

