"""Source registry: every provider module in this package whose key is present is loaded; the rest are skipped silently.

`engine/sources/espn.py` is always on. The key-based providers (`livetennisapi`, `tennisapi`, `oddspapi`) are imported
if their module exists. See README.md for how to add one.
"""
from __future__ import annotations

import importlib
import inspect
import logging
import os
from typing import Any, Optional

from .base import LEVELS, Budget, MatchRecord, OddsRecord, Source  # noqa: F401  (re-exported)
from .state import QuotaBudget, SourceState, Unlimited

log = logging.getLogger("deuce.sources")

# Import order = dedupe preference when two sources hold an equally complete record.
MODULES = ("espn", "tennisapi", "livetennisapi", "oddspapi")

# Default quotas. Override per source in config.toml:  [sources.tennisapi]  daily_quota = 50
QUOTAS: dict[str, dict[str, Any]] = {
    "espn": {},
    "livetennisapi": {"daily": 100, "per_minute": 30},
    "tennisapi": {"daily": 50, "backfill": True},
    "oddspapi": {"monthly": 250},
}
BACKFILL_FLOOR = "2023-01-01"
# How many past days of results the ingest asks a source for each run (default 2: yesterday and today).
DEFAULT_LOOKBACK_DAYS = 2


def get_key(cfg: dict, name: str, key_env: Optional[str]) -> Optional[str]:
    """Key from the environment, else `[sources] <name>_key` / `[sources.<name>] key` in config.toml."""
    if key_env and os.environ.get(key_env):
        return os.environ[key_env]
    sec = (cfg or {}).get("sources") or {}
    sub = sec.get(name)
    val = (sub.get("key") if isinstance(sub, dict) else None) or sec.get(f"{name}_key")
    return str(val) if val else None


def _instantiate(mod) -> Optional[Source]:
    for attr in ("SOURCE", "source", "get_source"):
        obj = getattr(mod, attr, None)
        if obj is None:
            continue
        if callable(obj) and not hasattr(obj, "fetch_results"):
            obj = obj()
        if hasattr(obj, "fetch_results"):
            return obj
    for _, cls in inspect.getmembers(mod, inspect.isclass):
        if cls.__module__ == mod.__name__ and hasattr(cls, "fetch_results") and hasattr(cls, "name"):
            try:
                return cls()
            except TypeError:
                continue
    return None


def discover(cfg: dict) -> list[Source]:
    """All sources that are importable and available (key present). Missing modules and keys are skipped silently."""
    out: list[Source] = []
    for modname in MODULES:
        try:
            mod = importlib.import_module(f"{__name__}.{modname}")
        except ModuleNotFoundError as exc:
            if exc.name == f"{__name__}.{modname}":
                continue  # provider not written yet
            log.warning("source %s failed to import: %s", modname, exc)
            continue
        except Exception as exc:  # noqa: BLE001 - a broken provider must not stop the others
            log.warning("source %s failed to import: %s", modname, exc)
            continue
        src = _instantiate(mod)
        if src is None:
            log.warning("source module %s defines no source", modname)
            continue
        env = getattr(src, "key_env", None)
        key = get_key(cfg, src.name, env)
        if env and not key:
            continue
        if env and key and not os.environ.get(env):
            os.environ[env] = key  # let providers that only read the environment see a config.toml key
        try:
            if src.available(cfg):
                out.append(src)
        except Exception as exc:  # noqa: BLE001
            log.warning("source %s.available failed: %s", src.name, exc)
    return out


def quota_for(src: Source, cfg: dict) -> dict[str, Any]:
    q = dict(QUOTAS.get(src.name, {}))
    for attr, key in (("daily_quota", "daily"), ("monthly_quota", "monthly"), ("per_minute", "per_minute"),
                      ("supports_backfill", "backfill"), ("results_lookback_days", "lookback")):
        if getattr(src, attr, None) is not None:
            q[key] = getattr(src, attr)
    sub = ((cfg or {}).get("sources") or {}).get(src.name)
    if isinstance(sub, dict):
        for key, ck in (("daily", "daily_quota"), ("monthly", "monthly_quota"), ("per_minute", "per_minute"),
                        ("backfill", "backfill"), ("lookback", "lookback_days")):
            if ck in sub:
                q[key] = sub[ck]
    return q


def make_budget(src: Source, cfg: dict, state: SourceState, today=None) -> Budget:
    q = quota_for(src, cfg)
    if not any(q.get(k) for k in ("daily", "monthly", "per_minute")):
        return Unlimited()
    return QuotaBudget(state, daily=q.get("daily"), monthly=q.get("monthly"), per_minute=q.get("per_minute"), today=today)
