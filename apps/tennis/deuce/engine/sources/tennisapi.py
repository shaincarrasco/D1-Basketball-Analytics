"""Tennis API on RapidAPI ("Tennis API - ATP WTA ITF") as a Source: results by date, incl. Challenger and ITF.

Free plan: 50 requests/day, 4/second. `atp` datasets hold men's events at every level (Grand Slam .. ITF), `wta` the
women's; there is no separate itf value.

Verified against https://docs.tennis-api.com/ (getting-started, results, fixtures, misc), fetched 2026-11-16:
  base      https://tennis-api-atp-wta-itf.p.rapidapi.com
  headers   X-RapidAPI-Key: <key>, X-RapidAPI-Host: tennis-api-atp-wta-itf.p.rapidapi.com
  GET /tennis/v2/{atp|wta}/results/{YYYY-MM-DD}?filter=PlayerGroup:singles&pageSize=500&pageNo=1
       -> {data:[...], pageNo, pageSize, hasNextPage}      (also /results/{start}/{end})
     item: id/matchId (renumbered on archive reload: NOT stable), date (ISO UTC), result ("6-3 6-4" | "w/o"),
           result_type completed|retired|walkover|default, match_winner, best_of, player1 (WINNER) / player2 (loser)
           {id,name,countryAcr}, player1Id, player2Id, tournamentId, roundId, tournament {id,name,courtId,date,rankId,
           countryAcr}, odd1/odd2 (Marathonbet), oddsAvailable, links.
     rankId (GET /tennis/v2/ranking): 0 ITF $10K, 1 Challenger/ITF > $10K, 2 Main tour (250 AND 500), 3 Masters,
            4 Grand Slam, 5 Davis/Fed Cup, 7 Tour finals.   courtId: 1 Hard, 2 Clay, 3 Indoor hard, 5 Grass.
     roundId (GET /tennis/v2/round): 0 Pre-q, 1..3 Q1..Q3, 22 Q4, 25 Q5, 4 First, 5 Second, 6 Third, 7 Fourth, 9 1/4,
            10 1/2, 12 Final, 8 Robin, 11 Bronze, 13..16 Rubber 1..4.
  GET /tennis/v2/{atp|wta}/fixtures/{start}/{end}?include=round,tournament,tournament.court,tournament.rank&...
       -> same envelope; item: id, date/startTime, player1/player2 {id,name,countryAcr}, tournament{...}, round{id,name}, live.
Because player1 is always the winner on results rows, players are swapped by a stable hash of the match so that the
p1/p2 slot never leaks the outcome to the model.
"""
from __future__ import annotations

import logging
import os
import re
import time
import zlib
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Iterable, Optional

import httpx

from .base import Budget, MatchRecord, OddsRecord

try:  # shared IOC -> ISO3 table; this module must keep working if it is ever missing
    from .livetennisapi import ioc_to_iso3
except Exception:  # noqa: BLE001
    def ioc_to_iso3(code: Any) -> Optional[str]:  # type: ignore[misc]
        return code.strip().upper() if isinstance(code, str) and len(code.strip()) == 3 else None

log = logging.getLogger("deuce.sources.tennisapi")

HOST = "tennis-api-atp-wta-itf.p.rapidapi.com"
BASE_URL = f"https://{HOST}"
TIMEOUT_S = 20.0
MAX_ATTEMPTS = 3
PAGE_SIZE = 500

_COURT = {1: "Hard", 2: "Clay", 3: "Indoor Hard", 5: "Grass"}
_ROUND = {0: "Qualifying (pre)", 1: "Qualifying 1", 2: "Qualifying 2", 3: "Qualifying 3", 22: "Qualifying 4",
          25: "Qualifying 5", 4: "1st Round", 5: "2nd Round", 6: "3rd Round", 7: "4th Round", 9: "Quarterfinals",
          10: "Semifinals", 12: "Final", 8: "Round Robin", 11: "Bronze Medal", 13: "Rubber 1", 14: "Rubber 2",
          15: "Rubber 3", 16: "Rubber 4"}
_QUALIFYING_ROUNDS = {0, 1, 2, 3, 22, 25}


def rank_to_level(rank_id: Any, name: Optional[str], tour: str) -> str:
    """rankId -> engine level. rankId 2 spans ATP/WTA 250 and 500 (and WTA 1000 at some events) and rankId 1 spans
    Challenger, WTA 125 and ITF >$10K, so the tournament name decides inside those buckets."""
    try:
        rid = int(rank_id)
    except (TypeError, ValueError):
        rid = None
    guess = None
    try:
        from .. import surfaces
        guess = surfaces.guess_level(name, tour, rid == 4)
    except Exception:  # noqa: BLE001
        guess = None
    if rid == 0:
        return "ITF"
    if rid == 1:
        if guess in ("Challenger", "ITF"):
            return guess
        if guess == "125" and re.search(r"\b125\b", name or ""):  # guess_level defaults unknown WTA names to 125
            return "125"
        return "Challenger" if tour == "ATP" else "ITF"
    if rid == 2:
        return guess if guess in ("250", "500", "1000", "125") else "250"
    if rid == 3:
        return "1000"
    if rid == 4:
        return "Grand Slam"
    if rid == 5:
        return "Other"
    if rid == 7:
        return "Finals"
    if rid is None:
        return "Other"  # no tier given: guess_level would default to 250/125, which is a guess too far
    return guess if guess in ("Grand Slam", "Finals", "1000", "500", "250", "125", "Challenger", "ITF") else "Other"


_SET_RE = re.compile(r"(\d{1,2})-(\d{1,2})(?:\((\d{1,2})(?:-(\d{1,2}))?\))?")


def parse_result(result: Any) -> list:
    """'6-3 7-6(5) 6-4' -> [[6,3,None,None],[7,6,7,5],[6,4,None,None]] from the WINNER's (player1's) point of view.
    A single number in brackets is the tiebreak score of the set's loser (standard notation), the winner has
    max(7, n+2). 'a-b' in brackets is taken as (set winner, set loser). 'w/o' and unparseable strings give []."""
    if not isinstance(result, str):
        return []
    out = []
    for m in _SET_RE.finditer(result):
        g1, g2 = int(m.group(1)), int(m.group(2))
        tb1 = tb2 = None
        if m.group(3) is not None:
            if m.group(4) is not None:
                w, l = int(m.group(3)), int(m.group(4))
            else:
                l = int(m.group(3))
                w = max(7, l + 2)
            if g1 > g2:
                tb1, tb2 = w, l
            elif g2 > g1:
                tb1, tb2 = l, w
        out.append([g1, g2, tb1, tb2])
    return out


def _swap_sets(sets: list) -> list:
    return [[s[1], s[0], s[3], s[2]] for s in sets]


def _best_of(tour: str, level: str, round_id: Any) -> int:
    qual = isinstance(round_id, int) and round_id in _QUALIFYING_ROUNDS
    return 5 if (tour == "ATP" and level == "Grand Slam" and not qual) else 3


def _iso3(p: Any) -> Optional[str]:
    return ioc_to_iso3(p.get("countryAcr")) if isinstance(p, dict) else None


def _is_doubles(item: dict) -> bool:
    for k in ("player1", "player2"):
        p = item.get(k)
        if isinstance(p, dict) and (p.get("members") or "/" in str(p.get("name") or "")):
            return True
    return False


def _tournament(item: dict) -> dict:
    t = item.get("tournament")
    return t if isinstance(t, dict) else {}


def _surface(t: dict) -> Optional[str]:
    cid = t.get("courtId")
    if cid is None and isinstance(t.get("court"), dict):
        cid = t["court"].get("id")
    try:
        return _COURT.get(int(cid))
    except (TypeError, ValueError):
        return None


def _rank_id(t: dict) -> Any:
    rid = t.get("rankId")
    if rid is None and isinstance(t.get("rank"), dict):
        rid = t["rank"].get("id")
    return rid


def _round_id(item: dict) -> Optional[int]:
    rid = item.get("roundId")
    if rid is None and isinstance(item.get("round"), dict):
        rid = item["round"].get("id")
    try:
        return int(rid)
    except (TypeError, ValueError):
        return None


def result_to_record(item: Any, tour: str) -> Optional[MatchRecord]:
    """One results row (player1 = winner) -> MatchRecord, or None to skip (doubles, malformed)."""
    if not isinstance(item, dict):
        return None
    try:
        p1, p2 = item.get("player1"), item.get("player2")
        if not (isinstance(p1, dict) and isinstance(p2, dict)):
            return None
        n1, n2 = p1.get("name"), p2.get("name")
        if not (isinstance(n1, str) and n1.strip() and isinstance(n2, str) and n2.strip()):
            return None
        if _is_doubles(item):
            return None
        when = item.get("date")
        if not isinstance(when, str) or not when:
            return None
        id1 = p1.get("id", item.get("player1Id"))
        id2 = p2.get("id", item.get("player2Id"))
        t = _tournament(item)
        tid = t.get("id", item.get("tournamentId"))
        rid = _round_id(item)
        rtype = str(item.get("result_type") or "completed").lower()
        raw = item.get("result")
        if rtype == "walkover" or (isinstance(raw, str) and raw.strip().lower() in ("w/o", "wo", "walkover")):
            status, sets = "walkover", []
        elif rtype in ("retired", "default"):
            status, sets = "retired", parse_result(raw)
        else:
            status, sets = "final", parse_result(raw)
        tname = str(t.get("name") or "")
        level = rank_to_level(_rank_id(t), tname, tour)
        # stable identity: the numeric id is renumbered when the archive reloads (see docs), the composite is not
        stable = (f"{id1}-{id2}-{tid}-{rid}" if None not in (id1, id2, tid, rid)
                  else str(item.get("liveMatchId") or item.get("id") or item.get("matchId")))
        if stable in ("None", ""):
            return None
        swap = zlib.crc32(stable.encode()) & 1 == 1
        a, b = (p2, p1) if swap else (p1, p2)
        ida, idb = (id2, id1) if swap else (id1, id2)
        if swap:
            sets = _swap_sets(sets)
        return MatchRecord(
            source="tennisapi", source_id=stable, tour=tour, level=level, tournament=tname, date=when,
            status=status, p1_name=a["name"].strip(), p2_name=b["name"].strip(),
            p1_country=_iso3(a), p2_country=_iso3(b), winner=(2 if swap else 1), sets=sets,
            best_of=_best_of(tour, level, rid), round=_ROUND.get(rid) if rid is not None else None,
            surface=_surface(t), tournament_id=str(tid) if tid is not None else None,
            p1_source_id=str(ida) if ida is not None else None, p2_source_id=str(idb) if idb is not None else None,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("skip malformed tennisapi result %r: %s", item.get("id") if isinstance(item, dict) else item, exc)
        return None


def fixture_to_record(item: Any, tour: str) -> Optional[MatchRecord]:
    """One fixtures row -> scheduled/live MatchRecord (player order as published)."""
    if not isinstance(item, dict):
        return None
    try:
        p1, p2 = item.get("player1"), item.get("player2")
        if not (isinstance(p1, dict) and isinstance(p2, dict)) or _is_doubles(item):
            return None
        n1, n2 = p1.get("name"), p2.get("name")
        when = item.get("startTime") or item.get("date")
        if not (isinstance(n1, str) and n1.strip() and isinstance(n2, str) and n2.strip() and isinstance(when, str)):
            return None
        t = _tournament(item)
        tid = t.get("id", item.get("tournamentId"))
        rid = _round_id(item)
        mid = item.get("id", item.get("matchId"))
        id1, id2 = p1.get("id", item.get("player1Id")), p2.get("id", item.get("player2Id"))
        stable = f"{id1}-{id2}-{tid}-{rid}" if None not in (id1, id2, tid, rid) else (str(mid) if mid is not None else "")
        if not stable:
            return None
        tname = str(t.get("name") or "")
        level = rank_to_level(_rank_id(t), tname, tour)
        rname = _ROUND.get(rid) if rid is not None else None
        if rname is None and isinstance(item.get("round"), dict):
            rname = item["round"].get("name")
        return MatchRecord(
            source="tennisapi", source_id=stable, tour=tour, level=level, tournament=tname, date=when,
            status="live" if item.get("live") is True else "scheduled", p1_name=n1.strip(), p2_name=n2.strip(),
            p1_country=_iso3(p1), p2_country=_iso3(p2), best_of=_best_of(tour, level, rid), round=rname,
            surface=_surface(t), tournament_id=str(tid) if tid is not None else None,
            p1_source_id=str(id1) if id1 is not None else None, p2_source_id=str(id2) if id2 is not None else None,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("skip malformed tennisapi fixture %r: %s", item.get("id") if isinstance(item, dict) else item, exc)
        return None


class _Stop(Exception):
    """Internal: stop cleanly (quota, plan restriction, bad key)."""


class TennisApiSource:
    name = "tennisapi"
    key_env: Optional[str] = "RAPIDAPI_KEY"
    daily_quota = 50
    supports_backfill = True
    results_lookback_days = 2   # yesterday + today; deeper history is the registry's resumable backfill

    max_pages_per_tour = 4      # 500 rows/page; a normal Challenger+ITF day fits in 1-2 pages per tour

    def __init__(self, client: Optional[httpx.Client] = None, sleep: Callable[[float], None] = time.sleep) -> None:
        self._client = client
        self._sleep = sleep
        self._key: Optional[str] = None
        self._opts: dict = {}
        self.last_complete = True   # False when the previous fetch_* stopped early (quota/error): day not fully read
        self.last_error: Optional[str] = None

    def _find_key(self, cfg: Optional[dict]) -> Optional[str]:
        if self.key_env and os.environ.get(self.key_env):
            return os.environ[self.key_env]
        sec = (cfg or {}).get("sources") or {}
        sub = sec.get(self.name)
        val = (sub.get("key") if isinstance(sub, dict) else None) or sec.get(f"{self.name}_key")
        return str(val) if val else None

    def available(self, cfg: dict) -> bool:
        key = self._find_key(cfg)
        sub = ((cfg or {}).get("sources") or {}).get(self.name)
        self._opts = sub if isinstance(sub, dict) else {}
        if key:
            self._key = key
        return bool(key)

    def _http(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(timeout=TIMEOUT_S, headers={"User-Agent": "deuce/0.1"})
        return self._client

    def _get(self, path: str, params: Optional[dict], budget: Budget) -> Any:
        key = self._key or self._find_key(None)
        if not key:
            raise _Stop("no key")
        headers = {"X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST, "Accept": "application/json"}
        last: Optional[str] = None
        for attempt in range(MAX_ATTEMPTS):
            if not budget.take(1):
                raise _Stop("budget exhausted")
            try:
                r = self._http().get(BASE_URL + path, params=params, headers=headers, timeout=TIMEOUT_S)
            except httpx.HTTPError as exc:
                last = f"network error: {exc}"
                self._sleep(min(2 ** attempt, 8))
                continue
            code = r.status_code
            if code == 200:
                try:
                    return r.json()
                except ValueError:
                    raise _Stop("invalid JSON from API")
            if code == 429:
                # 4/s burst limit -> short wait and retry; a spent daily quota repeats on every retry, so give up after
                # the attempts are used (each attempt is budgeted).
                try:
                    wait = float(r.headers.get("Retry-After", 1.5 * (attempt + 1)))
                except (TypeError, ValueError):
                    wait = 1.5 * (attempt + 1)
                last = "429 rate limited"
                self._sleep(min(wait, 30))
                continue
            if code >= 500:
                last = f"HTTP {code}"
                self._sleep(min(2 ** attempt * 2, 15))
                continue
            raise _Stop(f"HTTP {code}: {r.text[:200]}")  # 400/401/403(plan_restricted)/404: not retryable
        raise _Stop(last or "retries exhausted")

    def _pages(self, path: str, params: dict, budget: Budget, tour: str,
               conv: Callable[[Any, str], Optional[MatchRecord]]) -> list[MatchRecord]:
        out: list[MatchRecord] = []
        for page in range(1, self.max_pages_per_tour + 1):
            payload = self._get(path, dict(params, pageSize=PAGE_SIZE, pageNo=page), budget)
            rows = payload.get("data") if isinstance(payload, dict) else None
            if not isinstance(rows, list):
                break
            for row in rows:
                rec = conv(row, tour)
                if rec is not None:
                    out.append(rec)
            if not (isinstance(payload, dict) and payload.get("hasNextPage") is True and rows):
                break
        else:
            self.last_complete = False  # more pages existed than we are willing to spend
        return out

    def fetch_results(self, day: date, budget: Budget) -> Iterable[MatchRecord]:
        """Completed singles for one UTC calendar day, both tours (2 requests unless a tour needs a second page).
        `self.last_complete` is False if a quota/error stopped the day short, so a backfill cursor should not move."""
        out: list[MatchRecord] = []
        self.last_complete = True
        for tour in ("atp", "wta"):
            try:
                out.extend(self._pages(f"/tennis/v2/{tour}/results/{day.isoformat()}",
                                       {"filter": "PlayerGroup:singles"}, budget, tour.upper(), result_to_record))
            except _Stop as exc:
                self.last_complete = False
                self.last_error = str(exc)
                log.info("tennisapi results %s %s stopped: %s", tour, day, exc)
                break
            except Exception as exc:  # noqa: BLE001
                self.last_complete = False
                self.last_error = str(exc)
                log.warning("tennisapi results %s %s failed: %s", tour, day, exc)
                break
        return out

    def fetch_fixtures(self, days: int, budget: Budget) -> Iterable[MatchRecord]:
        """Upcoming singles. Off by default (a week of Challenger+ITF fixtures costs several 500-row pages and the
        quota is needed for results; Live Tennis API covers fixtures). Enable with
        `[sources.tennisapi] fixtures = true`; the window is capped at `fixture_days` (default 1) days."""
        if not self._opts.get("fixtures"):
            return []
        out: list[MatchRecord] = []
        self.last_complete = True
        today = datetime.now(timezone.utc).date()
        span = max(0, min(int(days), int(self._opts.get("fixture_days", 1))))
        inc = "round,tournament,tournament.court,tournament.rank"
        for tour in ("atp", "wta"):
            try:
                path = f"/tennis/v2/{tour}/fixtures/{today.isoformat()}/{(today + timedelta(days=max(1, span))).isoformat()}"
                out.extend(self._pages(path, {"include": inc, "filter": "PlayerGroup:singles"}, budget,
                                       tour.upper(), fixture_to_record))
            except _Stop as exc:
                self.last_complete = False
                self.last_error = str(exc)
                log.info("tennisapi fixtures %s stopped: %s", tour, exc)
                break
            except Exception as exc:  # noqa: BLE001
                self.last_complete = False
                log.warning("tennisapi fixtures %s failed: %s", tour, exc)
                break
        return out

    def fetch_odds(self, budget: Budget) -> Iterable[OddsRecord]:
        return []  # results rows carry Marathonbet prices, but the odds feed is OddsPapi's job


SOURCE = TennisApiSource()
