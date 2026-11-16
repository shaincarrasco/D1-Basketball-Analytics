"""The data-source interface: what a provider returns and what the engine expects of it.

Copied from docs/tennis-deuce.md ("Data sources"). Extend only by adding optional fields at the END of a
dataclass; never rename or reorder existing fields.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date
from typing import Iterable, Optional, Protocol

LEVELS = ("Grand Slam", "Finals", "1000", "500", "250", "125", "Challenger", "ITF", "Other")

@dataclass
class MatchRecord:
    source: str                    # "espn", "livetennisapi", "tennisapi"
    source_id: str                 # the provider's match id
    tour: str                      # "ATP" (men, incl. Challenger/ITF men) | "WTA" (women, incl. ITF women)
    level: str                     # one of LEVELS
    tournament: str
    date: str                      # ISO 8601 UTC start time (date-only allowed: "2026-11-17")
    status: str                    # scheduled | live | final | retired | walkover
    p1_name: str
    p2_name: str
    p1_country: Optional[str] = None   # ISO3 where known
    p2_country: Optional[str] = None
    winner: Optional[int] = None       # 1 | 2 | None
    sets: list = field(default_factory=list)   # [[p1_games, p2_games, p1_tb|None, p2_tb|None], ...]
    best_of: int = 3
    round: Optional[str] = None
    surface: Optional[str] = None      # Hard | Clay | Grass | Indoor Hard | None (engine infers if None)
    location: Optional[str] = None     # "City, Country"
    tournament_id: Optional[str] = None
    p1_source_id: Optional[str] = None
    p2_source_id: Optional[str] = None
    stats: Optional[dict] = None       # optional per-player serve stats
    # --- optional extras added by the engine (all may stay None) ---
    court: Optional[str] = None
    p1_rank: Optional[int] = None
    p2_rank: Optional[int] = None
    surface_inferred: Optional[bool] = None   # True when `surface` is a guess
    tournament_start: Optional[str] = None    # YYYY-MM-DD
    tournament_end: Optional[str] = None

@dataclass
class OddsRecord:
    source: str
    date: str                      # match start, ISO UTC
    tour: str
    p1_name: str
    p2_name: str
    book: str                      # "pinnacle", "bet365", "avg", ...
    p1_odds: float                 # decimal
    p2_odds: float
    fetched_at: str                # ISO UTC; closing price = last pre-start fetch
    source_match_id: Optional[str] = None

class Budget(Protocol):
    def take(self, n: int = 1) -> bool: ...   # False when the source's quota is spent (stop fetching)

class Source(Protocol):
    name: str
    key_env: Optional[str]                     # env var holding the key, None if keyless
    def available(self, cfg: dict) -> bool: ...
    def fetch_fixtures(self, days: int, budget: Budget) -> Iterable[MatchRecord]: ...
    def fetch_results(self, day: date, budget: Budget) -> Iterable[MatchRecord]: ...
    def fetch_odds(self, budget: Budget) -> Iterable[OddsRecord]: ...   # sources without odds return []
