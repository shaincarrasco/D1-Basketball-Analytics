# Deuce on Baseline: integration contract

Deuce is the tennis prediction engine (Elo + surface Elo + player features, calibrated model, Match Briefs with each
player's upsides and downsides, walk-forward backtest). It was built standalone at `/home/claude/tennis-brain-free`
(read its `CONTRACT.md`, `docs/DESIGN.md`, `docs/PROJECT_LOG.md`) and now moves into this repo as the model behind
Baseline's prediction pages.

## Layout in this repo

| Path | What | Committed |
| --- | --- | --- |
| `apps/tennis/deuce/` | Python package root: `engine/`, `brief/`, `app/` (local dashboard), `tests/`, `scripts/`, `requirements.txt`, `config.example.toml`, `CONTRACT.md`, `README.md` | yes |
| `apps/tennis/deuce/data-cache/` | Compact match cache (see below) and historical odds files | yes |
| `apps/tennis/deuce/data/` | Runtime: `tennis.db`, model pickles, raw HTTP caches | no (gitignored) |
| `apps/tennis/public/data/app/predictions.json`, `model.json`, `briefs/<match_id>.json` | Site data written by `python -m engine.export_site` | yes (like the rest of `public/data/app/`) |
| `apps/tennis/src/app/predictions/`, `apps/tennis/src/app/model/` | Baseline pages | yes |
| `docs/tennis-paper-bets.md` | Betting simulation report (value bets vs closing odds, P&L). Not part of the site, same convention as `docs/paper-bets.md` | yes |

Run everything from `apps/tennis/deuce/` with `python -m ...`. Python 3.11+.

## Compact cache (must stay small enough to commit)

Raw ESPN scoreboard JSON is ~425 MB for 2023→now: never commit it. Instead the engine writes one gzip'd JSON Lines file
per tour per month, `data-cache/matches/{atp|wta}/YYYY-MM.jsonl.gz`, one parsed match per line (the fields the
`matches`/`players`/`tournaments` tables need, plus `source`). `engine.update` rebuilds `tennis.db` from the compact cache
and only hits the network for days that aren't final yet (last ~21 days + fixtures). Target: whole cache < 20 MB.
Historical odds: `data-cache/odds/` (tennis-data.co.uk yearly files, or a compact extract of them).
The same layout takes extra sources later (`source` field: `espn`, `livetennisapi`, `tennisapi`, ...).

## Data sources (decided 2026-11-16)

The user chose free keys with a slow backfill for Challenger and ITF:
- `espn`: ATP/WTA tour, qualifying and WTA 125, no key (exists).
- `livetennisapi`: Live Tennis API free key (100 requests/day, 30/min): live and upcoming fixtures for every tier, incl.
  Challenger/ITF; also captures results of matches it sees finish. No history on the free plan.
- `tennisapi`: Tennis API (RapidAPI "Tennis API - ATP WTA ITF") free key, 50 requests/day: results by date
  (`GET /tennis/v2/{atp|wta}/results/{YYYY-MM-DD}`; Challenger/ITF sit inside atp/wta). Resumable backfill from 2023-01-01,
  newest-first so recent form fills first, then keeps up with yesterday.
- `oddspapi`: OddsPapi free key, 250 requests/month: pre-match and historical closing odds for all tiers incl. ITF.
Keys: env `LIVETENNISAPI_KEY`, `RAPIDAPI_KEY`, `ODDSPAPI_KEY` (GitHub secrets in CI), or `[sources]` in `config.toml`
locally. A source without a key is skipped silently. Quotas and backfill cursors persist in
`data-cache/sources/<name>/state.json` (committed) so CI resumes where it stopped and never exceeds a quota.

`engine/sources/base.py` (use verbatim; extend only by adding optional fields at the end):
```python
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date
from typing import Iterable, Optional, Protocol

LEVELS = ("Grand Slam", "Finals", "1000", "500", "250", "125", "Challenger", "ITF", "Other")

@dataclass
class MatchRecord:
    source: str                    # "espn", "livetennisapi", "tennisapi"
    source_id: str                 # the provider's match id
    tour: str                      # "ATP" (men, incl. Challenger/ITF men) | "WTA" (women, incl. ITF women)
    level: str                     # one of LEVELS
    tournament: str
    date: str                      # ISO 8601 UTC start time (date-only allowed: "2026-11-17")
    status: str                    # scheduled | live | final | retired | walkover
    p1_name: str
    p2_name: str
    p1_country: Optional[str] = None   # ISO3 where known
    p2_country: Optional[str] = None
    winner: Optional[int] = None       # 1 | 2 | None
    sets: list = field(default_factory=list)   # [[p1_games, p2_games, p1_tb|None, p2_tb|None], ...]
    best_of: int = 3
    round: Optional[str] = None
    surface: Optional[str] = None      # Hard | Clay | Grass | Indoor Hard | None (engine infers if None)
    location: Optional[str] = None     # "City, Country"
    tournament_id: Optional[str] = None
    p1_source_id: Optional[str] = None
    p2_source_id: Optional[str] = None
    stats: Optional[dict] = None       # optional per-player serve stats

@dataclass
class OddsRecord:
    source: str
    date: str                      # match start, ISO UTC
    tour: str
    p1_name: str
    p2_name: str
    book: str                      # "pinnacle", "bet365", "avg", ...
    p1_odds: float                 # decimal
    p2_odds: float
    fetched_at: str                # ISO UTC; closing price = last pre-start fetch
    source_match_id: Optional[str] = None

class Budget(Protocol):
    def take(self, n: int = 1) -> bool: ...   # False when the source's quota is spent (stop fetching)

class Source(Protocol):
    name: str
    key_env: Optional[str]                     # env var holding the key, None if keyless
    def available(self, cfg: dict) -> bool: ...
    def fetch_fixtures(self, days: int, budget: Budget) -> Iterable[MatchRecord]: ...
    def fetch_results(self, day: date, budget: Budget) -> Iterable[MatchRecord]: ...
    def fetch_odds(self, budget: Budget) -> Iterable[OddsRecord]: ...   # sources without odds return []
```
Player identity across sources: canonical player key = tour + normalised name (lowercase, accents stripped, punctuation
and hyphens to spaces, tokens sorted so "Fils Arthur" == "Arthur Fils"), plus country to split true duplicates.
Dedupe matches across sources: same tour, same unordered player-key pair, dates within ±1 day → one match; keep the most
complete record (final over scheduled, more set detail, stats present), remember every source id.

## Site data shapes

`predictions.json`:
```json
{
  "generated_at": "2026-11-16T22:00:00Z",
  "model_version": "lgbm-2026-11-16",
  "matches": [{
    "id": "187508", "date": "2026-11-17T13:00:00Z", "tour": "ATP", "level": "Finals",
    "tournament": "Nitto ATP Finals", "surface": "Indoor Hard", "round": "Group", "status": "scheduled",
    "score": null, "winner": null,
    "p1": {"id": "espn:3301", "name": "Arthur Fils", "country": "FRA", "baseline_id": "9599", "elo": 1912, "rank": 18},
    "p2": {"...": "same"},
    "p1_prob": 0.575, "p2_prob": 0.425,
    "set_probs": {"2-0": 0.31, "2-1": 0.27, "1-2": 0.21, "0-2": 0.21},
    "low_data": false,
    "brief": true
  }]
}
```
- Window: matches from 3 days ago to 10 days ahead (scheduled, live, finished). Finished ones show the out-of-sample
  pre-match probability and the result, so readers can see hits and misses.
- `baseline_id`: the matching player id in `apps/tennis/public/data/app/players.json` (theScore id), matched by
  normalised name + tour; null when unmatched. Pages link `/player/?id=<baseline_id>` when present.
- `low_data`: either player has < 15 recorded matches; the page shows the probability quieter and says why.
- No odds, edges or value flags in site data. Betting stays in `docs/tennis-paper-bets.md`.

`briefs/<id>.json`: the Brief JSON exactly as in Deuce `CONTRACT.md` (agreement, four buckets with favours/strength/text/
facts, `players.p1/p2.upsides/downsides`, bottom_line, weather, engine), minus `value`, with market text that doesn't
mention prices when no odds are public.

`model.json`: the non-betting part of Deuce's `backtest.json`: `generated_at`, `overall` (accuracy, brier, log_loss, n,
baseline_elo_*), `splits[]`, `calibration[]`, `rolling[]`, `by_tour`, `by_level`, `set_score_check`, `notes[]`.

## CI (`.github/workflows/deploy.yml`)

After "Refresh tennis data", non-fatal steps (`continue-on-error: true`, a `::warning::` on failure, the site keeps the last
snapshot): set up Python 3.12 with pip cache, `pip install -r apps/tennis/deuce/requirements.txt`, then in
`apps/tennis/deuce/`: `python -m engine.update`, weekly `python -m engine.odds_history`, `python -m brief.run --no-llm`,
`python -m engine.backtest`, `python -m engine.export_site`, `python -m engine.paper_bets` (writes
`docs/tennis-paper-bets.md`). Add `apps/tennis/deuce/data-cache/` and `docs/tennis-paper-bets.md` to the snapshot commit.
Budget: under 5 minutes.

## Rules
- Null is missing, never zero. Show "—".
- Pages follow `docs/DESIGN.md` conventions and Baseline's existing look (`@sports/ui`), not Deuce's local neon theme.
- Static export: links end in `/`, query-param pages wrap `useSearchParams` in `<Suspense>`.
- Read `node_modules/next/dist/docs/` before writing Next code (see `AGENTS.md`).
