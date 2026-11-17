"""Config loading (config.toml at repo root, every key optional)."""
from __future__ import annotations

import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

DEFAULTS: dict = {
    "paths": {"db": "data/tennis.db"},
    "model": {"edge_threshold": 0.02},
    "llm": {
        "enabled": True,
        "base_url": "http://localhost:1234/v1",
        "model": "",
        "timeout_s": 60,
    },
}


def load_config(path: str | Path | None = None) -> dict:
    cfg = {k: dict(v) for k, v in DEFAULTS.items()}
    p = Path(path) if path else REPO_ROOT / "config.toml"
    if p.exists():
        try:
            with open(p, "rb") as fh:
                user = tomllib.load(fh)
        except Exception:
            user = {}
        for section, values in user.items():
            if isinstance(values, dict):
                cfg.setdefault(section, {}).update(values)
    return cfg


def resolve_db_path(cfg: dict) -> Path:
    p = Path(cfg.get("paths", {}).get("db", "data/tennis.db"))
    return p if p.is_absolute() else REPO_ROOT / p
