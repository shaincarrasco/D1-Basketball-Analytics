//! D1 Hoops feeds: news, game previews/recaps, polls and injuries in one fast pass.
//!
//! Runs in GitHub Actions (no server). Pulls ESPN's public JSON for every Division I team
//! concurrently and writes `public/data/feeds-2027.json` for the site build:
//!   teamNews   ESPN team news (headline, link, time, source) per ESPN team id
//!   gameNews   previews and recaps keyed by ESPN event id (from links carrying gameId=)
//!   athleteNews ESPN athlete id -> article ids mentioning that player
//!   polls      AP Top 25 and Coaches Poll
//!   injuries   players ESPN lists as injured or not active, per team
//! Only headlines, links and timestamps are stored — never article text or images — and
//! every item keeps its source so the site can credit and link the publisher.
//!
//! Usage: cargo run --release --bin feeds   (from repo root: --manifest-path live/Cargo.toml)

use std::{collections::HashMap, fs, path::PathBuf, time::Duration};

use chrono::{DateTime, Utc};
use futures_util::{stream, StreamExt};
use serde::Serialize;
use serde_json::Value;

const API: &str = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";
const CONCURRENCY: usize = 12;
const KEEP_DAYS: i64 = 21;

#[derive(Serialize, Clone)]
struct Article {
    id: String,
    headline: String,
    url: String,
    published: String,
    kind: String,   // Story, Preview, Recap, HeadlineNews, Media...
    source: String, // credited publisher
    #[serde(skip_serializing_if = "Option::is_none")]
    byline: Option<String>,
    #[serde(rename = "gameId", skip_serializing_if = "Option::is_none")]
    game_id: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    teams: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    athletes: Vec<String>,
}

#[derive(Serialize)]
struct PollEntry { rank: u64, previous: Option<u64>, team: String, points: Option<f64>, #[serde(rename = "firstPlace")] first_place: Option<u64> }

#[derive(Serialize)]
struct Injury { team: String, athlete: String, name: String, status: String, #[serde(skip_serializing_if = "Option::is_none")] detail: Option<String>, #[serde(skip_serializing_if = "Option::is_none")] date: Option<String> }

#[derive(Serialize)]
struct Output {
    #[serde(rename = "fetchedAt")] fetched_at: String,
    #[serde(rename = "teamNews")] team_news: HashMap<String, Vec<String>>,
    #[serde(rename = "gameNews")] game_news: HashMap<String, Vec<String>>,
    #[serde(rename = "athleteNews")] athlete_news: HashMap<String, Vec<String>>,
    league: Vec<String>,
    articles: HashMap<String, Article>,
    polls: HashMap<String, Vec<PollEntry>>,
    #[serde(rename = "pollDate")] poll_date: Option<String>,
    injuries: Vec<Injury>,
}

fn s(v: &Value) -> Option<String> { v.as_str().map(str::to_owned).or_else(|| v.as_u64().map(|n| n.to_string())) }

fn parse_article(a: &Value) -> Option<Article> {
    let headline = s(&a["headline"])?;
    let url = s(&a["links"]["web"]["href"]).or_else(|| s(&a["links"]["mobile"]["href"]))?;
    let published = s(&a["published"]).or_else(|| s(&a["lastModified"]))?;
    let game_id = url.split("gameId=").nth(1).map(|g| g.chars().take_while(|c| c.is_ascii_digit()).collect::<String>()).filter(|g| !g.is_empty())
        .or_else(|| url.split("/gameId/").nth(1).map(|g| g.chars().take_while(|c| c.is_ascii_digit()).collect::<String>()).filter(|g| !g.is_empty()));
    let mut teams = vec![];
    let mut athletes = vec![];
    for c in a["categories"].as_array().into_iter().flatten() {
        match c["type"].as_str() {
            Some("team") => if let Some(t) = s(&c["teamId"]) { teams.push(t) },
            Some("athlete") => if let Some(t) = s(&c["athleteId"]) { athletes.push(t) },
            _ => {}
        }
    }
    Some(Article {
        id: s(&a["id"]).unwrap_or_else(|| url.clone()),
        headline, url, published,
        kind: s(&a["type"]).unwrap_or_else(|| "Story".into()),
        source: "ESPN".into(),
        byline: s(&a["byline"]).filter(|b| !b.is_empty()),
        game_id, teams, athletes,
    })
}

async fn get(client: &reqwest::Client, url: String) -> Option<Value> {
    for attempt in 0..3u64 {
        match client.get(&url).send().await {
            Ok(r) if r.status().is_success() => return r.json::<Value>().await.ok(),
            Ok(r) if r.status().as_u16() == 404 => return None,
            _ => tokio::time::sleep(Duration::from_millis(600 * (attempt + 1))).await,
        }
    }
    eprintln!("[feeds] giving up on {url}");
    None
}

#[tokio::main]
async fn main() {
    let root = PathBuf::from(std::env::var("REPO_ROOT").unwrap_or_else(|_| ".".into()));
    let dir: Value = serde_json::from_str(&fs::read_to_string(root.join("public/data/team-directory.json")).expect("team-directory.json")).expect("json");
    let team_ids: Vec<String> = dir["teams"].as_array().into_iter().flatten().filter_map(|t| s(&t["id"])).collect();
    let client = reqwest::Client::builder()
        .user_agent("d1hoops-feeds/0.1 (+https://github.com/shaincarrasco/D1-Basketball-Analytics)")
        .timeout(Duration::from_secs(15)).gzip(true).build().expect("client");

    let mut articles: HashMap<String, Article> = HashMap::new();
    let mut team_news: HashMap<String, Vec<String>> = HashMap::new();
    let mut injuries = vec![];

    // League news (previews and recaps for most games come through here).
    let mut league = vec![];
    if let Some(v) = get(&client, format!("{API}/news?limit=250")).await {
        for a in v["articles"].as_array().into_iter().flatten().filter_map(parse_article) {
            league.push(a.id.clone());
            articles.insert(a.id.clone(), a);
        }
    }

    // Per team: news + roster (injuries), all concurrently.
    let results: Vec<(String, Option<Value>, Option<Value>)> = stream::iter(team_ids.clone())
        .map(|id| { let c = client.clone(); async move {
            let news = get(&c, format!("{API}/news?team={id}&limit=15")).await;
            let roster = get(&c, format!("{API}/teams/{id}/roster")).await;
            (id, news, roster)
        }})
        .buffer_unordered(CONCURRENCY).collect().await;
    for (id, news, roster) in results {
        let mut ids = vec![];
        for a in news.as_ref().and_then(|v| v["articles"].as_array()).into_iter().flatten().filter_map(parse_article) {
            ids.push(a.id.clone());
            articles.entry(a.id.clone()).or_insert(a);
        }
        if !ids.is_empty() { team_news.insert(id.clone(), ids); }
        for ath in roster.as_ref().and_then(|v| v["athletes"].as_array()).into_iter().flatten() {
            let status = s(&ath["status"]["type"]).unwrap_or_default();
            let inj = ath["injuries"].as_array().cloned().unwrap_or_default();
            if inj.is_empty() && (status.is_empty() || status == "active") { continue; }
            let first = inj.first();
            injuries.push(Injury {
                team: id.clone(),
                athlete: s(&ath["id"]).unwrap_or_default(),
                name: s(&ath["displayName"]).unwrap_or_default(),
                status: first.and_then(|i| s(&i["status"])).or_else(|| s(&ath["status"]["name"])).unwrap_or_else(|| "Unavailable".into()),
                detail: first.and_then(|i| s(&i["details"]["type"]).or_else(|| s(&i["type"]["description"])).or_else(|| s(&i["shortComment"]))),
                date: first.and_then(|i| s(&i["date"])),
            });
        }
    }

    // Drop anything older than KEEP_DAYS, then index games and athletes.
    let cutoff = Utc::now() - chrono::Duration::days(KEEP_DAYS);
    articles.retain(|_, a| DateTime::parse_from_rfc3339(&a.published).map(|t| t.with_timezone(&Utc) >= cutoff).unwrap_or(true));
    let newest_first = |ids: &mut Vec<String>, arts: &HashMap<String, Article>| {
        ids.retain(|i| arts.contains_key(i));
        ids.sort_by(|a, b| arts[b].published.cmp(&arts[a].published));
        ids.dedup();
    };
    for ids in team_news.values_mut() { newest_first(ids, &articles); }
    newest_first(&mut league, &articles);
    let mut game_news: HashMap<String, Vec<String>> = HashMap::new();
    let mut athlete_news: HashMap<String, Vec<String>> = HashMap::new();
    for a in articles.values() {
        if let Some(g) = &a.game_id { game_news.entry(g.clone()).or_default().push(a.id.clone()); }
        for ath in &a.athletes { athlete_news.entry(ath.clone()).or_default().push(a.id.clone()); }
    }
    for ids in game_news.values_mut() { newest_first(ids, &articles); }
    for ids in athlete_news.values_mut() { newest_first(ids, &articles); }

    // Polls.
    let mut polls: HashMap<String, Vec<PollEntry>> = HashMap::new();
    let mut poll_date = None;
    if let Some(v) = get(&client, format!("{API}/rankings")).await {
        for r in v["rankings"].as_array().into_iter().flatten() {
            let key = match r["name"].as_str() { Some(n) if n.contains("AP") => "ap", Some(n) if n.contains("Coaches") => "coaches", _ => continue };
            poll_date = poll_date.or_else(|| s(&r["date"]));
            let entries = r["ranks"].as_array().into_iter().flatten().filter_map(|e| Some(PollEntry {
                rank: e["current"].as_u64()?, previous: e["previous"].as_u64().filter(|p| *p > 0),
                team: s(&e["team"]["id"])?, points: e["points"].as_f64(), first_place: e["firstPlaceVotes"].as_u64(),
            })).collect();
            polls.insert(key.into(), entries);
        }
    }

    let out = Output { fetched_at: Utc::now().to_rfc3339(), team_news, game_news, athlete_news, league, articles, polls, poll_date, injuries };
    let path = root.join("public/data/feeds-2027.json");
    fs::write(&path, serde_json::to_string(&out).expect("serialize")).expect("write feeds");
    eprintln!("[feeds] {} articles, {} teams with news, {} games with previews/recaps, {} injuries, polls: {:?}",
        out.articles.len(), out.team_news.len(), out.game_news.len(), out.injuries.len(), out.polls.keys().collect::<Vec<_>>());
}
