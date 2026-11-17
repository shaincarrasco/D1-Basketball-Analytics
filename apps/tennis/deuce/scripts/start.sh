#!/usr/bin/env bash
# Start Deuce: set up if needed, refresh data if older than 6 hours, then serve and open the browser.
set -uo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8765}"

[ -x .venv/bin/python ] || bash scripts/setup.sh || exit 1

stale=1
if [ -f data/.last_update ]; then
  age=$(( $(date +%s) - $(stat -f %m data/.last_update 2>/dev/null || stat -c %Y data/.last_update) ))
  [ "$age" -lt 21600 ] && stale=0
fi
[ "$stale" -eq 1 ] && bash scripts/daily.sh

if curl -s "http://127.0.0.1:$PORT/api/status" | grep -q '"' 2>/dev/null; then
  echo "Deuce is already running."
elif lsof -ti tcp:"$PORT" >/dev/null 2>&1; then
  echo "Port $PORT is busy with another program. Start Deuce on another port with: PORT=8766 bash scripts/start.sh"; exit 1
else
  .venv/bin/python -m app.server &
  SERVER=$!
  trap 'kill $SERVER 2>/dev/null' EXIT
  for _ in $(seq 1 40); do curl -s "http://127.0.0.1:$PORT/api/matches" >/dev/null && break; sleep 0.25; done
fi

open "http://127.0.0.1:$PORT" 2>/dev/null || xdg-open "http://127.0.0.1:$PORT" 2>/dev/null
echo "Deuce is running at http://127.0.0.1:$PORT  (close this window to stop it)"
wait
