# Deuce

A free, personal tennis prediction dashboard built from scratch: model win probabilities, value flags against bookmaker
odds, a Match Brief with each player's upsides and downsides, and an honest backtest. Everything runs on your Mac.
No subscriptions.

For information and paper trading only. Predictions are probabilities, not promises.

## Start

Double-click **Deuce** on your Desktop. It opens iTerm, sets itself up on first run, refreshes data if it's more than
6 hours old, and opens the dashboard at http://127.0.0.1:8765.

By hand:

```
./scripts/setup.sh     # once: Python venv + packages + config.toml
./scripts/daily.sh     # refresh results, fixtures, predictions, briefs, backtest
./scripts/start.sh     # serve and open the dashboard
```

## Match Briefs with a local AI (free)

1. Open LM Studio, download a small instruct model (for example Qwen2.5 7B Instruct), and start the local server
   (Developer tab, port 1234).
2. Run `./scripts/daily.sh` again. Briefs are then written by the local model, grounded in the computed numbers.

With no model running, briefs are written by the built-in rule-based writer. Ollama also works: set
`base_url = "http://localhost:11434/v1"` in `config.toml`.

## Odds

- Historical closing odds for the backtest come free from tennis-data.co.uk (`python -m engine.odds_history`).
  If the download fails, put the yearly .xlsx files in `data/odds_import/` and run it again.
- Live odds: add free-tier keys for The Odds API or OddsPapi in `config.toml`, or type odds into a match's Odds tab.

## Data

ATP and WTA tour-level results and fixtures from ESPN's public scoreboard (2023 onward), weather from Open-Meteo.
Challenger and ITF matches aren't covered yet.

## Layout

| Folder | What's in it |
| --- | --- |
| `engine/` | Data ingest, Elo ratings, player features, model, predictions, backtest, odds |
| `brief/` | Match Brief: facts, verdicts, local-AI narration |
| `app/` | Web server and dashboard |
| `scripts/` | Setup, daily refresh, start, launcher builder |
| `docs/` | Contract between parts, design spec, screenshots |
