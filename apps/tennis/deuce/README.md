# Deuce

The tennis prediction engine behind the Baseline site, and a free local dashboard you can run on your Mac: model win
probabilities, a Match Brief with each player's upsides and downsides, value flags against bookmaker odds, and an honest
walk-forward backtest. No subscriptions.

For information and paper trading only. Predictions are probabilities, not promises.

It lives in the monorepo at `apps/tennis/deuce/`. Run everything from this folder with `python -m ...` (Python 3.11+).

## How it feeds the site

`.github/workflows/deploy.yml` runs these in CI (all non-fatal; the site keeps the last snapshot on failure):

```
python -m engine.update            # cache + sources -> tennis.db -> ratings -> model -> predictions
python -m engine.odds_history --weekly   # tennis-data.co.uk closing odds -> data-cache/odds/
python -m brief.run --no-llm       # Match Briefs for upcoming matches
python -m engine.backtest          # walk-forward backtest -> data/backtest.json
python -m engine.export_site       # -> apps/tennis/public/data/app/{predictions,model}.json, briefs/<id>.json
python -m engine.paper_bets        # -> docs/tennis-paper-bets.md (simulation, never on the site)
```

`export_site` links players to Baseline's `players.json` by normalised name and tour (`baseline_id`), keeps a window of
3 days back to 10 days ahead, removes brief files outside it, and never writes odds, edges or value flags.
The integration contract is `docs/tennis-deuce.md` at the repo root; the module contract is `CONTRACT.md` here.

## Data

| Path | What | In git |
| --- | --- | --- |
| `data-cache/matches/{atp\|wta}/YYYY-MM.jsonl.gz` | Every finished match, one parsed `MatchRecord` per line (`source` says who it came from). About 2 MB for 2023 to now | yes |
| `data-cache/odds/` | tennis-data.co.uk yearly extracts (`tennis-data/`), OddsPapi records (`records/`), fetch manifest | yes |
| `data-cache/sources/<name>/state.json` | Per-source quota counters and backfill cursor | yes |
| `data/` | `tennis.db`, model pickles, raw HTTP caches, weather | no |

`engine.update` rebuilds `tennis.db`'s matches, players and tournaments from the cache on every run and only touches the
network for fixtures and the last few weeks of results. Fixtures and live matches are never cached. Output files are
byte-deterministic, so a run that changes nothing leaves git quiet.

### Sources

ESPN (ATP/WTA tour, qualifying, WTA 125; no key) is always on. Live Tennis API, Tennis API and OddsPapi add Challenger
and ITF coverage when their key is present (`LIVETENNISAPI_KEY`, `RAPIDAPI_KEY`, `ODDSPAPI_KEY`, or `[sources]` in
`config.toml`). The same player or match from two sources becomes one. See `engine/sources/README.md`.

### Odds

Historical closing odds come free from tennis-data.co.uk (`python -m engine.odds_history`). If that host is
unreachable, put the yearly `.xlsx` files in `data/odds_import/` and run it again. Live odds: type them into a match's
Odds tab, or add a free The Odds API key to `config.toml`.

## Run it locally

```
./scripts/setup.sh     # once: Python venv + packages + config.toml
./scripts/daily.sh     # refresh results, fixtures, predictions, briefs, backtest
./scripts/start.sh     # serve the dashboard at http://127.0.0.1:8765
```

`python scripts/make_launcher.py` builds a **Deuce** app for the Desktop. It points at
`$HOME/workspace/Sports-Analytics/apps/tennis/deuce`; pass `--project-dir` or set `DEUCE_DIR` if your checkout is elsewhere.

With LM Studio running its local server (port 1234), `./scripts/daily.sh` writes briefs with a local model, grounded in the
computed numbers; without it a built-in rule-based writer is used (also what CI uses).

## Tests

```
python -m pytest -q
```

## Layout

| Folder | What's in it |
| --- | --- |
| `engine/` | Sources and ingest, cache, merge, Elo ratings, features, model, predictions, backtest, odds, site export, paper bets |
| `engine/sources/` | One module per data source plus the shared interface (`base.py`) |
| `brief/` | Match Brief: facts, verdicts, local-AI narration |
| `app/` | Local dashboard (FastAPI + static frontend) |
| `scripts/` | Setup, daily refresh, start, launcher builder |
| `docs/` | Design spec, project log, a few screenshots of the local dashboard |
| `tests/` | `engine/`, `brief/`, `app/` |
