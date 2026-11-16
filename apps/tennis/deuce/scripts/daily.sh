#!/usr/bin/env bash
# Refresh everything: results and fixtures, predictions, historical odds (first run), briefs, backtest.
set -uo pipefail
cd "$(dirname "$0")/.."
PY=.venv/bin/python

step() {
  echo; echo "== $1"; shift
  "$@"
  local rc=$?
  [ "$rc" -eq 0 ] || echo "   (step failed, carrying on: $*)"
  return "$rc"
}

step "Updating results, fixtures and predictions" $PY -m engine.update
# Historical closing odds: full import until it has worked once, then refresh this year weekly.
odds_rows() { $PY -c "import sqlite3;c=sqlite3.connect('data/tennis.db');print(c.execute(\"select count(*) from odds where source='tennis-data'\").fetchone()[0])" 2>/dev/null || echo 0; }
if [ "$(odds_rows)" = "0" ] || [ "${1:-}" = "--odds" ]; then
  step "Importing free historical odds" $PY -m engine.odds_history
elif [ ! -f data/.odds_refreshed ] || [ -n "$(find data/.odds_refreshed -mtime +6 2>/dev/null)" ]; then
  step "Refreshing this year's historical odds" $PY -m engine.odds_history --years "$(date +%Y)" && touch data/.odds_refreshed
fi
step "Writing Match Briefs" $PY -m brief.run
step "Running backtest" $PY -m engine.backtest
date -u +%Y-%m-%dT%H:%M:%SZ > data/.last_update
echo; echo "All done."
