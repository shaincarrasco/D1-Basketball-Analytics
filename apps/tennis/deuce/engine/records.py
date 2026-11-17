"""MatchRecord helpers: JSON round trip, orientation flip, completeness, final-status test."""
from __future__ import annotations

from dataclasses import asdict, fields, replace
from datetime import date, datetime, timezone
from typing import Any

from .sources.base import MatchRecord

FINAL = ("final", "retired", "walkover")
_FIELDS = {f.name for f in fields(MatchRecord)}
_STATUS_RANK = {"scheduled": 0, "live": 1, "final": 3, "retired": 3, "walkover": 2}


def is_final(r: MatchRecord) -> bool:
    return r.status in FINAL


def to_json(r: MatchRecord) -> dict[str, Any]:
    """Compact dict: None / empty values are dropped (a missing key reads back as the dataclass default)."""
    d = asdict(r)
    return {k: v for k, v in d.items() if v is not None and v != [] and not (k == "best_of" and v == 3)}


def from_json(d: dict[str, Any]) -> MatchRecord:
    return MatchRecord(**{k: v for k, v in d.items() if k in _FIELDS})


def parse_date(s: str) -> datetime:
    """ISO date or datetime (Z or offset) -> aware UTC datetime. Date-only means midnight UTC."""
    s = (s or "").strip()
    if len(s) == 10:
        return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def day_of(r: MatchRecord) -> date:
    return parse_date(r.date).date()


def iso_z(s: str) -> str:
    """Normalised start time as 'YYYY-MM-DDTHH:MM:SSZ' (date-only becomes midnight)."""
    return parse_date(s).strftime("%Y-%m-%dT%H:%M:%SZ")


def flip_stats(stats):
    """Swap per-player stats with the players: keys `p1`/`p2` and any `p1_*`/`p2_*` change sides, others stay."""
    if not isinstance(stats, dict):
        return stats
    swap = {"p1": "p2", "p2": "p1"}
    out = {}
    for k, v in stats.items():
        head, sep, rest = str(k).partition("_")
        out[swap[head] + sep + rest if head in swap else k] = v
    return out


def flip(r: MatchRecord) -> MatchRecord:
    """The same match with p1 and p2 swapped (winner and set columns follow)."""
    w = {1: 2, 2: 1}.get(r.winner)
    sets = [[s[1], s[0], s[3] if len(s) > 3 else None, s[2] if len(s) > 2 else None] for s in (r.sets or [])]
    return replace(r, p1_name=r.p2_name, p2_name=r.p1_name, p1_country=r.p2_country, p2_country=r.p1_country,
                   p1_source_id=r.p2_source_id, p2_source_id=r.p1_source_id, p1_rank=r.p2_rank, p2_rank=r.p1_rank,
                   winner=w, sets=sets, stats=flip_stats(r.stats))


def completeness(r: MatchRecord) -> tuple:
    """Higher is better: final over live over scheduled, more set detail, stats present, more filled fields."""
    filled = sum(1 for k, v in asdict(r).items() if v not in (None, [], "") and k not in ("sets", "stats"))
    return (_STATUS_RANK.get(r.status, 0), len(r.sets or []), 1 if r.stats else 0, filled)
