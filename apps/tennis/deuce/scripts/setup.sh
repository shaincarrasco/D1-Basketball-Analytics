#!/usr/bin/env bash
# One-time setup: find Python 3.11+, create .venv, install requirements, create config.toml.
set -euo pipefail
cd "$(dirname "$0")/.."

find_python() {
  for c in python3.13 python3.12 python3.11 \
           /opt/homebrew/bin/python3 /usr/local/bin/python3 \
           "$HOME/anaconda3/bin/python3" "$HOME/opt/anaconda3/bin/python3" "$HOME/miniconda3/bin/python3" \
           python3; do
    if command -v "$c" >/dev/null 2>&1; then
      if "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
        echo "$c"; return 0
      fi
    fi
  done
  return 1
}

if [ ! -x .venv/bin/python ]; then
  PY="$(find_python)" || { echo "Deuce needs Python 3.11 or newer. Install it with: brew install python@3.12"; exit 1; }
  echo "Creating virtual environment with $PY"
  "$PY" -m venv .venv
fi

# LightGBM on macOS needs the OpenMP runtime; without it the model falls back to logistic regression.
if [ "$(uname)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
  brew list libomp >/dev/null 2>&1 || brew install libomp || echo "Couldn't install libomp; using the simpler model."
fi

.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/python -m pip install --quiet -r requirements.txt

[ -f config.toml ] || cp config.example.toml config.toml
mkdir -p data/cache data/odds_import
echo "Setup complete."
