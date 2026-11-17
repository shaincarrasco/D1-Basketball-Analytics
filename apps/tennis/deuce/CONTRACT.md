# Deuce: shared contract (module contract; the Baseline site contract is docs/tennis-deuce.md at the repo root)

Free tennis prediction engine plus a local dashboard. Python 3.11+, SQLite, FastAPI. No paid services required.
Run from `apps/tennis/deuce/`. Default dashboard port 8765.

Ingest change (monorepo): `engine.update` rebuilds `matches`/`players`/`tournaments` from the committed compact cache
`data-cache/matches/{atp|wta}/YYYY-MM.jsonl.gz` and fetches only fixtures and recent results from the available sources
(see `engine/sources/README.md`). Player ids are `<source>:<id>` (ESPN: `espn:3301`); match ids are ESPN's id as is, others
`<source>-<id>`. `match_sources(match_id, source, source_id)` lists every provider id of a deduped match. New commands:
`python -m engine.export_site`, `python -m engine.paper_bets`, `python -m engine.cache --stats`.

## Folder ownership (do not edit outside your folder)

| Path | Owner | Purpose |
| --- | --- | --- |
| `engine/`, `tests/engine/` | Engine agent | Data ingest, ratings, features, model, predictions, backtest |
| `brief/`, `tests/brief/` | Brief agent | Match Brief generation (facts, buckets, upsides/downsides, LLM narration) |
| `app/`, `tests/app/` | App agent | FastAPI server + static frontend |
| `CONTRACT.md`, `config.example.toml`, `requirements.txt`, `scripts/`, `README.md`, `docs/` | Commander | Shared files |

`data/` is runtime output (gitignored): `data/tennis.db`, `data/cache/`, `data/backtest.json`.

## Config

`config.toml` at the repo root (copy of `config.example.toml`). Read with `tomllib`. Every key optional; code must work with no config file at all.

```toml
[paths]
db = "data/tennis.db"

[model]
edge_threshold = 0.02      # value flag when p_model * decimal_odds - 1 >= this

[llm]                       # any OpenAI-compatible server. LM Studio default, Ollama works too.
enabled = true
base_url = "http://localhost:1234/v1"
model = ""                  # empty = first model from GET /models
timeout_s = 60

[odds]                      # optional; with no keys, odds are absent and users can type odds in the UI
the_odds_api_key = ""
oddspapi_key = ""
```

## Commands

```
python -m engine.update [--since 2023-01-01]   # ingest ESPN -> features -> train -> predict upcoming
python -m engine.backtest                      # walk-forward backtest -> data/backtest.json
python -m brief.run [--match ID] [--force]     # briefs for upcoming matches that have predictions
python -m app.server                           # http://127.0.0.1:8765
```

## Data source facts (verified 2026-11-16)

- ESPN, no key: `https://site.api.espn.com/apis/site/v2/sports/tennis/{atp|wta}/scoreboard?dates=YYYYMMDD`.
  Returns events active on that date, each with `groupings[]` (`grouping.displayName` e.g. "Men's Singles",
  "Women's Singles", "Men's Doubles"...), each with `competitions[]`: `id`, `date`, `status.type.name`
  (STATUS_FINAL, STATUS_SCHEDULED, ...), `status.type.state` (pre/in/post), `venue.fullName` ("Auckland, New Zealand"),
  `venue.court`, `notes[0].text` ("X (SLO) bt Y (NZL) 6-3 6-4", contains ret./w/o info), `competitors[]` with
  `id`, `winner`, `order`, `linescores[] {value, tiebreak?}`, `athlete {displayName, flag.alt (country)}`.
  The atp endpoint can include women's draws at combined events: fetch both, keep only singles, dedupe by competition id.
  History available back to at least 2023, qualifying included. No Challenger/ITF, no serve stats, no surface, no odds.
- Rankings: `https://site.api.espn.com/apis/site/v2/sports/tennis/{atp|wta}/rankings` (200 OK).
- Open-Meteo forecast + geocoding: free, no key, rate-limited (cache responses).

## SQLite schema (engine creates; brief + app read; brief also writes `briefs`)

```sql
players(id TEXT PRIMARY KEY, name TEXT, country TEXT, tour TEXT)
tournaments(id TEXT PRIMARY KEY, name TEXT, tour TEXT, start_date TEXT, end_date TEXT,
            location TEXT, country TEXT, surface TEXT, surface_inferred INTEGER, level TEXT)
matches(id TEXT PRIMARY KEY, tournament_id TEXT, tour TEXT, round TEXT, date TEXT,   -- ISO UTC
        status TEXT,            -- scheduled | live | final | retired | walkover
        p1_id TEXT, p2_id TEXT, winner_id TEXT, score TEXT,
        sets_json TEXT,         -- [[p1_games, p2_games, p1_tb_or_null, p2_tb_or_null], ...]
        best_of INTEGER, court TEXT)
predictions(match_id TEXT PRIMARY KEY, p1_prob REAL, p2_prob REAL, set_probs_json TEXT,
            features_json TEXT, model_version TEXT, created_at TEXT)
odds(match_id TEXT, source TEXT, book TEXT, p1_odds REAL, p2_odds REAL, fetched_at TEXT)  -- decimal odds; many rows = price history
briefs(match_id TEXT PRIMARY KEY, brief_json TEXT, engine TEXT, created_at TEXT)
```

`surface` is one of `Hard`, `Clay`, `Grass`, `Indoor Hard`.

### The display price (one rule, used by app, brief and backtest)

For a match, the single price used for value is chosen from its `odds` rows like this:
1. The latest `source = "manual"` row, if any.
2. Otherwise only "fresh" rows count: for scheduled/live matches, rows with `fetched_at` within 12 hours of now;
   for finished matches, any row (historical closing prices).
3. Among those, prefer `book = "pinnacle"`, then books in this order: betfair, bet365, williamhill, unibet, betway,
   draftkings, fanduel, then any other book, then `avg`; never `max` (optimistic). Ties: latest `fetched_at`, then rowid.
Value = `p * odds - 1` on that one price, flagged when >= edge threshold, and never when either player has fewer than
15 matches on record (`experience`). Price movement may use older rows of the same book. Implement this as a function
in each package (`app/server.py: pick_display_odds`, `brief/facts.py: pick_display_odds`) with the same tests.

## `predictions.features_json` (the match context, computed as of match start, prior matches only)

```json
{
  "as_of": "2026-11-17T16:00:00Z",
  "p1": {
    "elo": 1850.2, "surface_elo": 1790.4, "elo_trend_90d": 35.1, "rank": 23,
    "win_rate_1y": 0.62, "form_10": 0.70, "momentum": 0.08,
    "surface_win_rate_1y": 0.55, "surface_matches_1y": 20,
    "games_won_pct_1y": 0.53, "tiebreak_win_pct_1y": 0.58, "deciding_set_win_pct_1y": 0.50,
    "experience": 412, "common_opp_win_rate": 0.60, "quality_form_30d": 0.44, "comeback_rate": 0.21,
    "matches_7d": 3, "matches_14d": 6, "sets_14d": 15, "games_14d": 140, "days_since_last": 1,
    "last_match_retired": false, "matches_on_surface_90d": 4, "home": false,
    "last5": [{"date": "2026-11-15", "opponent": "Name", "result": "W", "score": "6-3 6-4", "tournament": "Name"}]
  },
  "p2": { "...same keys..." },
  "h2h": {"p1_wins": 1, "p2_wins": 2, "last": [{"date": "...", "winner": "p1", "score": "...", "tournament": "...", "surface": "Clay"}]},
  "common_opponents": 7,
  "radar": {"p1": {"Win Rate": 72, "Form": 80, "Momentum": 60, "Surface": 55, "Games Won": 61, "Tiebreaks": 58,
                   "Experience": 90, "Common Opponents": 64, "Quality Form": 47, "Comeback": 33},
            "p2": {"...": 0}}
}
```
Any value may be `null` when unknown. Radar values are 0-100 percentiles within the tour.
Serve/Return from TennisBrain are replaced by Games Won and Tiebreaks (ESPN has no serve stats).

## Brief JSON (`briefs.brief_json`, also returned by `brief.generate_brief(context)`)

```json
{
  "match_id": "171004",
  "tournament": "Australian Open", "surface": "Hard",
  "model_pick": "p1", "model_prob": 0.61,
  "agreement": {"score": 52, "label": "Mixed signals"},
  "buckets": [
    {"key": "fitness", "title": "Fitness & Fatigue", "favours": "p2", "strength": "slight",
     "text": "2-4 plain sentences.", "facts": [{"label": "Matches, last 14 days", "p1": 6, "p2": 1}]},
    {"key": "motivation", "title": "Motivation & Pressure", "favours": "level", "strength": null, "text": "...", "facts": []},
    {"key": "conditions", "title": "Conditions", "favours": "p1", "strength": "slight", "text": "...", "facts": []},
    {"key": "market", "title": "Market", "favours": "p2", "strength": "moderate", "text": "...", "facts": []}
  ],
  "players": {
    "p1": {"name": "...", "upsides": ["short evidence-based bullet", "..."], "downsides": ["..."]},
    "p2": {"name": "...", "upsides": ["..."], "downsides": ["..."]}
  },
  "value": {"side": "p1", "edge": 0.21, "fair_odds": 1.64, "market_odds": 1.98},
  "weather": {"temp_c": 18.0, "humidity": 82, "wind_kph": 24, "precip_mm": 0.4, "summary": "Damp and windy"},
  "bottom_line": "1-2 sentences.",
  "engine": "llm:qwen2.5-7b-instruct",
  "generated_at": "2026-11-16T21:00:00Z"
}
```
- `favours`: `p1` | `p2` | `level`. `strength`: `slight` | `moderate` | `strong` | null (null only when level).
- Agreement: each bucket scores +w if it favours the model pick, -w if against, 0 if level (slight 1, moderate 2, strong 3).
  `score = round(50 + 50 * sum / 12)`, clamped 0-100. Labels: < 40 "Conflicting signals", 40-65 "Mixed signals", > 65 "Strong agreement".
- `value`, `weather` may be null. With no odds the market bucket is `level` with text saying no market price is available.
- Upsides/downsides: 2-4 each, every one tied to a number from the context. Never invent injuries, quotes or news.

## App API (app agent implements; reads SQLite)

- `GET /api/matches?status=upcoming|live|finished&tour=ATP|WTA&value_only=0|1&tournament=...` -> list of
  `{match_id, date, tour, round, status, score, tournament: {name, surface, level}, p1: {id, name, country},
    p2: {...}, p1_prob, p2_prob, set_probs: {"2-0":..}, odds: {p1, p2, book, fetched_at} | null,
    value: {side, edge} | null, has_brief}`
- `GET /api/matches/{id}` -> the list item plus `features` (features_json), `odds_history` [...], `brief` | null
- `POST /api/matches/{id}/odds` body `{p1, p2}` -> stores a manual odds row (source "manual"), returns updated value
- `GET /api/backtest` -> contents of `data/backtest.json`. Shape: `{generated_at, splits[], calibration[], rolling[], notes[],
  betting: null | {edge_threshold, odds_source, traded, won, return_per_match, profit, avg_model_prob,
  cumulative[{date,pnl}], by_level[{key,n,roi}], by_surface[...], by_round[...], by_split[...], baseline{...}},
  bets[{date,tournament,level,surface,round,p1,p2,pick,prob,odds,won,profit}]}` (bets = every out-of-sample bet with edge >= 0,
  so the UI re-filters by edge/probability thresholds client-side). Historical odds come from `python -m engine.odds_history`
  (tennis-data.co.uk, free).
- `GET /api/players/top?tour=ATP` -> top 20 by Elo with key stats
- `GET /` -> the dashboard
