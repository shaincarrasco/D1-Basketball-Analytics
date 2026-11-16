"""ESPN public scoreboard as a Source: ATP/WTA tour, qualifying and WTA 125 singles. No key, no quota.

Parsing and HTTP caching live in `engine/espn.py`; this module adapts them to `MatchRecord`.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional

import httpx

from .. import espn as _espn
from .base import Budget, MatchRecord, OddsRecord


def to_records(payload: dict) -> list[MatchRecord]:
    """One ESPN scoreboard payload -> MatchRecords (singles only)."""
    matches, tournaments = _espn.parse_scoreboard(payload)
    out: list[MatchRecord] = []
    for m in matches:
        t = tournaments[m["tournament_id"]]
        p1, p2 = m["players"]
        winner = None
        if m["winner_id"]:
            winner = 1 if m["winner_id"] == m["p1_id"] else 2
        out.append(MatchRecord(
            source="espn", source_id=m["id"], tour=m["tour"], level=t["level"], tournament=t["name"],
            date=m["date"], status=m["status"], p1_name=p1["name"], p2_name=p2["name"],
            p1_country=p1["country"], p2_country=p2["country"], winner=winner,
            sets=json.loads(m["sets_json"]) if m["sets_json"] else [], best_of=m["best_of"], round=m["round"],
            surface=t["surface"], location=t["location"], tournament_id=t["id"],
            p1_source_id=m["p1_id"], p2_source_id=m["p2_id"], court=m["court"],
            p1_rank=m["ranks"][0], p2_rank=m["ranks"][1], surface_inferred=bool(t["surface_inferred"]),
            tournament_start=t["start_date"], tournament_end=t["end_date"]))
    return out


class EspnSource:
    name = "espn"
    key_env: Optional[str] = None
    # Re-read the last three weeks every run: late finals, retirements and corrections land in those days.
    results_lookback_days = 21

    def __init__(self) -> None:
        self._client: httpx.Client | None = None

    def available(self, cfg: dict) -> bool:
        return True

    def _http(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(timeout=30, headers={"User-Agent": "deuce/0.1"})
        return self._client

    def _day(self, d: date) -> list[MatchRecord]:
        recs: dict[str, MatchRecord] = {}
        for tour in _espn.TOURS:  # the atp feed can carry women's draws at combined events: dedupe by competition id
            payload = _espn.fetch_day(self._http(), tour, d, refresh=False)
            if payload:
                for r in to_records(payload):
                    recs.setdefault(r.source_id, r)
        return list(recs.values())

    def fetch_results(self, day: date, budget: Budget) -> Iterable[MatchRecord]:
        return self._day(day)

    def fetch_fixtures(self, days: int, budget: Budget) -> Iterable[MatchRecord]:
        today = datetime.now(timezone.utc).date()
        out: list[MatchRecord] = []
        for k in range(0, days + 1):
            out.extend(r for r in self._day(today + timedelta(days=k)) if r.status in ("scheduled", "live"))
        return out

    def fetch_odds(self, budget: Budget) -> Iterable[OddsRecord]:
        return []

    def fetch_rankings(self) -> dict[str, dict[str, int]]:
        """Optional hook: current top-150 per tour, stored in `meta` for upcoming-match rank display."""
        return {t: {f"espn:{k}": v for k, v in _espn.fetch_rankings(t).items()} for t in _espn.TOURS}


SOURCE = EspnSource()
