"""SQLite connection, schema creation (idempotent) and config loading."""
from __future__ import annotations

import sqlite3
import tomllib
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent

DEFAULT_CONFIG: dict[str, Any] = {
    "paths": {"db": "data/tennis.db"},
    "model": {"edge_threshold": 0.02},
    "llm": {"enabled": True, "base_url": "http://localhost:1234/v1", "model": "", "timeout_s": 60},
    "odds": {"the_odds_api_key": "", "oddspapi_key": ""},
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY, name TEXT, country TEXT, tour TEXT);
CREATE TABLE IF NOT EXISTS tournaments(id TEXT PRIMARY KEY, name TEXT, tour TEXT, start_date TEXT, end_date TEXT,
    location TEXT, country TEXT, surface TEXT, surface_inferred INTEGER, level TEXT);
CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY, tournament_id TEXT, tour TEXT, round TEXT, date TEXT,
    status TEXT, p1_id TEXT, p2_id TEXT, winner_id TEXT, score TEXT, sets_json TEXT, best_of INTEGER, court TEXT);
CREATE TABLE IF NOT EXISTS predictions(match_id TEXT PRIMARY KEY, p1_prob REAL, p2_prob REAL, set_probs_json TEXT,
    features_json TEXT, model_version TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS odds(match_id TEXT, source TEXT, book TEXT, p1_odds REAL, p2_odds REAL, fetched_at TEXT);
CREATE TABLE IF NOT EXISTS briefs(match_id TEXT PRIMARY KEY, brief_json TEXT, engine TEXT, created_at TEXT);

-- Engine-owned extras (not part of the shared contract; readers may ignore them).
CREATE TABLE IF NOT EXISTS match_ranks(match_id TEXT PRIMARY KEY, p1_rank INTEGER, p2_rank INTEGER);
CREATE TABLE IF NOT EXISTS player_ratings(player_id TEXT PRIMARY KEY, name TEXT, country TEXT, tour TEXT,
    elo REAL, hard_elo REAL, clay_elo REAL, grass_elo REAL, matches INTEGER, matches_1y INTEGER,
    win_rate_1y REAL, form_10 REAL, rank INTEGER, last_match_date TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);

CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(date);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_odds_match ON odds(match_id);
"""


def _merge(base: dict, extra: dict) -> dict:
    out = {k: (dict(v) if isinstance(v, dict) else v) for k, v in base.items()}
    for k, v in extra.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def load_config(path: str | Path | None = None) -> dict[str, Any]:
    """Load config.toml (repo root) merged over defaults. Missing file/keys are fine."""
    cfg_path = Path(path) if path else ROOT / "config.toml"
    cfg = _merge(DEFAULT_CONFIG, {})
    if cfg_path.exists():
        try:
            with open(cfg_path, "rb") as fh:
                cfg = _merge(cfg, tomllib.load(fh))
        except (tomllib.TOMLDecodeError, OSError):
            pass
    return cfg


def db_path(cfg: dict | None = None) -> Path:
    cfg = cfg or load_config()
    p = Path(cfg["paths"]["db"])
    return p if p.is_absolute() else ROOT / p


def connect(path: str | Path | None = None, cfg: dict | None = None) -> sqlite3.Connection:
    """Open the database (creating folders and schema if needed)."""
    p = Path(path) if path else db_path(cfg)
    if str(p) != ":memory:":
        p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(p))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=OFF")
    init_schema(conn)
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def data_dir() -> Path:
    d = ROOT / "data"
    d.mkdir(parents=True, exist_ok=True)
    return d
