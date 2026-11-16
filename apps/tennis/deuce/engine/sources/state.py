"""Persistent per-source state: quota counters and the backfill cursor.

Stored in `data-cache/sources/<name>/state.json` (committed), so CI resumes where the last run stopped and a source
never exceeds its quota across runs.

    {"daily":   {"date": "2026-11-16", "used": 12},
     "monthly": {"month": "2026-11",   "used": 40},
     "backfill": {"cursor": "2026-09-03", "done": false}}
"""
from __future__ import annotations

import json
import os
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Callable, Optional

from ..db import ROOT

STATE_ROOT = ROOT / "data-cache" / "sources"


def _today() -> date:
    return datetime.now(timezone.utc).date()


class SourceState:
    def __init__(self, name: str, root: Path | None = None):
        self.name = name
        self.path = (root or STATE_ROOT) / name / "state.json"
        self.data: dict = {}
        try:
            self.data = json.loads(self.path.read_text())
        except (OSError, ValueError):
            self.data = {}

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, indent=1, sort_keys=True) + "\n")
        os.replace(tmp, self.path)

    # --- backfill cursor (newest-first: the cursor is the next day still to fetch)
    @property
    def backfill_cursor(self) -> Optional[date]:
        c = (self.data.get("backfill") or {}).get("cursor")
        return date.fromisoformat(c) if c else None

    @property
    def backfill_done(self) -> bool:
        return bool((self.data.get("backfill") or {}).get("done"))

    def set_backfill(self, cursor: Optional[date], done: bool = False) -> None:
        self.data["backfill"] = {"cursor": cursor.isoformat() if cursor else None, "done": done}


class QuotaBudget:
    """Counts requests against a daily and/or monthly quota (UTC), persisted in the source's state.

    `take(n)` returns True and counts the request, or False (and sets `exhausted`) once a quota is spent.
    `per_minute` spaces requests out (sleeping) to respect a rate limit.
    """

    def __init__(self, state: SourceState, daily: Optional[int] = None, monthly: Optional[int] = None,
                 per_minute: Optional[int] = None, today: Optional[date] = None,
                 sleep: Callable[[float], None] = time.sleep, clock: Callable[[], float] = time.monotonic):
        self.state, self.daily, self.monthly, self.per_minute = state, daily, monthly, per_minute
        self.today = today or _today()
        self._sleep, self._clock, self._last = sleep, clock, None
        self.exhausted = False
        d = state.data.setdefault("daily", {})
        if d.get("date") != self.today.isoformat():
            d["date"], d["used"] = self.today.isoformat(), 0
        m = state.data.setdefault("monthly", {})
        if m.get("month") != self.today.strftime("%Y-%m"):
            m["month"], m["used"] = self.today.strftime("%Y-%m"), 0

    @property
    def used_today(self) -> int:
        return int(self.state.data["daily"]["used"])

    @property
    def used_month(self) -> int:
        return int(self.state.data["monthly"]["used"])

    def remaining(self) -> Optional[int]:
        caps = []
        if self.daily is not None:
            caps.append(self.daily - self.used_today)
        if self.monthly is not None:
            caps.append(self.monthly - self.used_month)
        return max(0, min(caps)) if caps else None

    def take(self, n: int = 1) -> bool:
        rem = self.remaining()
        if rem is not None and rem < n:
            self.exhausted = True
            return False
        if self.per_minute:
            gap = 60.0 / self.per_minute
            now = self._clock()
            if self._last is not None and now - self._last < gap:
                self._sleep(gap - (now - self._last))
            self._last = self._clock()
        self.state.data["daily"]["used"] += n
        self.state.data["monthly"]["used"] += n
        return True


class Unlimited:
    """Budget for keyless sources with no quota."""
    exhausted = False

    def take(self, n: int = 1) -> bool:
        return True
