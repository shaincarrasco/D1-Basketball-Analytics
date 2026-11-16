# Data sources

A source turns one provider's API into `MatchRecord`s (and, optionally, `OddsRecord`s). The interface is in
`base.py` (copied from `docs/tennis-deuce.md`; extend only by adding optional fields at the end).

```python
class Source(Protocol):
    name: str                      # "espn", "tennisapi", ...; also MatchRecord.source
    key_env: Optional[str]         # env var with the key, None if keyless
    def available(self, cfg) -> bool
    def fetch_fixtures(self, days, budget) -> Iterable[MatchRecord]     # scheduled/live, today .. today+days
    def fetch_results(self, day, budget) -> Iterable[MatchRecord]       # everything the source has for that day
    def fetch_odds(self, budget) -> Iterable[OddsRecord]                # [] if none
```

Call `budget.take()` before every HTTP request; when it returns `False` stop fetching and return what you have.

## What exists

| Module | Key | Notes |
| --- | --- | --- |
| `espn.py` | none | ATP/WTA tour, qualifying, WTA 125. Re-reads the last 21 days every run. Also has `fetch_rankings()` |
| `tennisapi.py` | `RAPIDAPI_KEY` | Results by date, Challenger/ITF; resumable newest-first backfill |
| `livetennisapi.py` | `LIVETENNISAPI_KEY` | Fixtures for every tier |
| `oddspapi.py` | `ODDSPAPI_KEY` | Odds |

## How the engine uses them (`engine/ingest.py`)

1. **Registry** (`__init__.py`): imports every module in `MODULES`; a module that doesn't exist yet is skipped; a source with a
   `key_env` but no key (environment, or `[sources] <name>_key` / `[sources.<name>] key` in `config.toml`) is skipped
   silently. A module is picked up if it defines `SOURCE` (an instance), `source()`/`get_source()` (a factory), or a class with
   `name` and `fetch_results` that can be built with no arguments. To add a source: write the module, add its name to
   `MODULES` (order = tie-break preference), add its quota to `QUOTAS`.
2. **Budget and state**: each source gets a persistent `QuotaBudget` from `data-cache/sources/<name>/state.json`
   (daily and/or monthly quota in UTC, optional `per_minute` spacing, backfill cursor). Defaults are in `QUOTAS`; a source
   can set the class attributes `daily_quota`, `monthly_quota`, `per_minute`, `supports_backfill`, `results_lookback_days`,
   or the user can override in `config.toml`.
3. **Each run, per source**: `fetch_fixtures(10)`, then `fetch_results(day)` for the last `results_lookback_days` days
   (default 2: yesterday and today), then, if the source supports backfill, `fetch_results(day)` newest-first from where
   the cursor stopped down to 2023-01-01 until the budget or a time box (`ingest.max_seconds`) runs out. The cursor only
   advances after a day completes, so a day cut short by the quota is retried next run. Finished matches go to
   `data-cache/matches/`; fixtures stay in memory. Then `fetch_odds`: records are appended to
   `data-cache/odds/records/<source>.jsonl.gz` and matched to our matches.
4. **A failing source never stops the others**: exceptions are logged and listed in the summary under `errors`.

## Identity and dedupe (`engine/merge.py`)

- Player key: tour + normalised name (lowercase, accents stripped, punctuation and hyphens to spaces, tokens sorted, so
  "Fils Arthur" == "Arthur Fils"). Same key with two known, different countries means two players. A source's own player
  id (`p1_source_id`) always wins over the name when it has been seen before. Player ids in the database are
  `<source>:<source id>` of the first source (priority order) that knew the player, e.g. `espn:3301`.
- Match dedupe: same tour, same unordered player-key pair, dates within one calendar day, different sources: one match.
  The most complete record wins (final over live over scheduled, more sets, stats present, more fields filled); missing
  fields are filled from the others; p1/p2 orientation follows the winner and the others are flipped to match. Every
  `(source, source_id)` is kept in the `match_sources` table. Two records from the same source are never merged.
- Match ids: ESPN's id as is (`187508`), others `<source>-<source id>`.
- Fill in `p1_source_id`/`p2_source_id`, `country` (ISO3 or the full name; both normalise), `surface` (leave `None` to let
  the engine infer it from the tournament name and venue) and `level` (one of `LEVELS`: Challenger and ITF are
  recognised from the name by `surfaces.guess_level` if you don't know).
- Odds: `OddsRecord` is matched to a match by tour, player-key pair and a start date within one day, then flipped into
  the match's own orientation. Closing price = the last pre-start `fetched_at`.
