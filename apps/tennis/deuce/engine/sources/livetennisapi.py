"""Live Tennis API (livetennisapi.com) as a Source: live and upcoming matches for every tier, incl. Challenger and ITF.

Free plan: 100 requests/day, 30/minute, live + upcoming + players/fixtures/tournaments/usage, NO completed-match history
(`status=completed` and `/history/*` need BASIC; a free key gets a 20-call monthly "history taste", off by default here).

Verified against https://docs.livetennisapi.com/reference.html (fetched 2026-11-16):
  base      https://api.livetennisapi.com/api/public/v1
  auth      header `X-API-Key: twjp_...` (also `Authorization: Bearer`, or `?token=` for browsers)
  GET /matches?status=upcoming|live|completed|cancelled &from=&to= &tour=atp|wta|challenger|itf|juniors &draw=singles
            &gender=men|women &limit=1..200(50) &offset=   -> {"data":[Match], "meta":{limit,offset,count,total,has_more}}
  GET /usage (quota-exempt)   -> {tier, limits:{per_minute,per_day}, today:{calls,errors,remaining_day}, ...}
  Match: id, tournament, tournament_id, tour, tier (closed vocabulary, e.g. challenger_100, itf_w35), surface
         (hard|clay|grass), indoor, format (BO3|BO5), round, round_code, qualifying/is_qualifying, status
         (upcoming|live|completed|cancelled), event_status, draw (singles|doubles), gender (men|women),
         scheduled_time, live_at, players {p1,p2: {id,name,tour,country (IOC lowercase),ranking}},
         score {sets:[a,b], games:[[p1 per set],[p2 per set]]}, winner (1|2), outcome
         (completed|retired|walkover|default|abandoned|unresolved), withdrew (1|2).
  429 shapes: per-minute `rate_limited` (+ Retry-After), per-day `rate_limited` with scope "day", `abuse_throttled`.
"""
from __future__ import annotations

import logging
import os
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Iterable, Optional

import httpx

from .base import Budget, MatchRecord, OddsRecord

log = logging.getLogger("deuce.sources.livetennisapi")

BASE_URL = "https://api.livetennisapi.com/api/public/v1"
TIMEOUT_S = 20.0
MAX_ATTEMPTS = 3

# IOC (what this API returns, lowercase) -> ISO 3166-1 alpha-3. Codes identical in both systems are not listed.
IOC_TO_ISO3 = {
    "ger": "DEU", "ned": "NLD", "sui": "CHE", "gre": "GRC", "den": "DNK", "cro": "HRV", "bul": "BGR", "lat": "LVA",
    "slo": "SVN", "rsa": "ZAF", "chi": "CHL", "uru": "URY", "par": "PRY", "pur": "PRI", "iri": "IRN", "uae": "ARE",
    "ksa": "SAU", "mon": "MCO", "ina": "IDN", "phi": "PHL", "tpe": "TWN", "alg": "DZA", "ang": "AGO", "ant": "ATG",
    "aru": "ABW", "bah": "BHS", "ban": "BGD", "bar": "BRB", "ber": "BMU", "bot": "BWA", "bru": "BRN", "bur": "BFA",
    "cam": "KHM", "cay": "CYM", "cgo": "COG", "crc": "CRI", "esa": "SLV", "fij": "FJI", "gam": "GMB", "gbs": "GNB",
    "gua": "GTM", "gui": "GIN", "hai": "HTI", "hon": "HND", "isv": "VIR", "lba": "LBY", "lib": "LBN", "mad": "MDG",
    "mas": "MYS", "mri": "MUS", "mtn": "MRT", "mgl": "MNG", "nca": "NIC", "ngr": "NGA", "nep": "NPL", "oma": "OMN",
    "sam": "WSM", "sey": "SYC", "sin": "SGP", "skn": "KNA", "sri": "LKA", "sud": "SDN", "tan": "TZA", "tog": "TGO",
    "tri": "TTO", "vie": "VNM", "vin": "VCT", "zam": "ZMB", "zim": "ZWE", "bhu": "BTN", "car": "CAF", "cha": "TCD",
    "kos": "XKX", "pal": "PSE", "sol": "SLB", "ncl": "NCL",
}


def ioc_to_iso3(code: Any) -> Optional[str]:
    """IOC-style 3-letter code ('ned', 'SUI') -> ISO3 ('NLD', 'CHE'). Unknown 3-letter codes are upper-cased as is."""
    if not isinstance(code, str):
        return None
    c = code.strip().lower()
    if len(c) != 3 or not c.isalpha():
        return None
    return IOC_TO_ISO3.get(c, c.upper())


# --- tier vocabulary -> engine level ---------------------------------------------------------------------------
_TIER_LEVEL = {
    "grand_slam": "Grand Slam",
    "atp_finals": "Finals", "wta_finals": "Finals", "next_gen_finals": "Finals", "wta_elite_trophy": "Finals",
    "atp_1000": "1000", "wta_1000": "1000", "atp_500": "500", "wta_500": "500", "atp_250": "250", "wta_250": "250",
    "wta_125": "125",
    "united_cup": "Other", "davis_cup": "Other", "bjk_cup": "Other", "laver_cup": "Other", "olympics": "Other",
}
_SKIP_TIERS = {"juniors", "utr", "exhibition"}  # not part of the pro ladder the engine models


def tier_to_level(tier: Optional[str], tour: Optional[str] = None) -> str:
    """Closed tier vocabulary -> one of base.LEVELS. A null tier falls back to the coarse `tour` group."""
    t = (tier or "").lower()
    if t in _TIER_LEVEL:
        return _TIER_LEVEL[t]
    if t.startswith("challenger_"):
        return "Challenger"
    if t.startswith("itf_"):
        return "ITF"
    if t:
        return "Other"
    tr = (tour or "").lower()
    if tr == "challenger":
        return "Challenger"
    if tr == "itf":
        return "ITF"
    return "Other"


def _gender_tour(m: dict, tier: Optional[str]) -> Optional[str]:
    """ATP for men's events (incl. Challenger/ITF men), WTA for women's. None when it cannot be told."""
    g = (m.get("gender") or "").lower()
    if g in ("men", "m"):
        return "ATP"
    if g in ("women", "w"):
        return "WTA"
    t = (tier or "").lower()
    if t.startswith(("wta_", "itf_w", "bjk")):
        return "WTA"
    if t.startswith(("atp_", "challenger_", "itf_m")):
        return "ATP"
    tour = (m.get("tour") or "").lower()
    if tour == "atp":
        return "ATP"
    if tour == "wta":
        return "WTA"
    players = m.get("players") or {}
    ptours = {str((players.get(k) or {}).get("tour") or "").lower() for k in ("p1", "p2")} - {""}
    if ptours == {"atp"}:
        return "ATP"
    if ptours == {"wta"}:
        return "WTA"
    return None


_ROUND_LABEL = {
    "F": "Final", "SF": "Semifinals", "QF": "Quarterfinals", "R16": "Round of 16", "R32": "Round of 32",
    "R64": "Round of 64", "R128": "Round of 128", "RR": "Round Robin", "BR": "Bronze Medal", "ER": "Early Round",
    "Q": "Qualifying", "Q1": "Qualifying 1", "Q2": "Qualifying 2", "Q3": "Qualifying 3", "Q4": "Qualifying 4",
}


def _round_label(m: dict) -> Optional[str]:
    code = m.get("round_code")
    label = _ROUND_LABEL.get(code) if isinstance(code, str) else None
    if label:
        if m.get("is_qualifying") is True or m.get("qualifying") is True:
            if not label.startswith("Qualifying"):
                label = f"Qualifying {label}"
        return label
    r = m.get("round")
    return r if isinstance(r, str) and r else None


def _is_qualifying(m: dict) -> bool:
    for k in ("is_qualifying", "qualifying"):
        if m.get(k) is True:
            return True
    code = m.get("round_code")
    return isinstance(code, str) and code.startswith("Q")


def _surface(m: dict) -> Optional[str]:
    s = (m.get("surface") or "").lower()
    if s == "hard":
        return "Indoor Hard" if m.get("indoor") is True else "Hard"
    if s == "clay":
        return "Clay"
    if s == "grass":
        return "Grass"
    return None


def _int_or_none(v: Any) -> Optional[int]:
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float) and v == int(v):
        return int(v)
    if isinstance(v, str) and v.strip().lstrip("-").isdigit():
        return int(v)
    return None


def _sets_from_score(score: Any) -> list:
    """score.games is player-major: [[p1 per set],[p2 per set]] -> [[p1,p2,None,None], ...]. Tiebreak points are not
    published by this API, so the tb slots stay None."""
    if not isinstance(score, dict):
        return []
    games = score.get("games")
    if not (isinstance(games, list) and len(games) == 2 and all(isinstance(x, list) for x in games)):
        return []
    out = []
    for a, b in zip(games[0], games[1]):
        a, b = _int_or_none(a), _int_or_none(b)
        if a is None or b is None:
            continue
        out.append([a, b, None, None])
    return out


def _winner_from_sets(score: Any) -> Optional[int]:
    if not isinstance(score, dict):
        return None
    s = score.get("sets")
    if isinstance(s, list) and len(s) == 2:
        a, b = _int_or_none(s[0]), _int_or_none(s[1])
        if a is not None and b is not None and a != b:
            return 1 if a > b else 2
    return None


def _best_of(m: dict, tour: str, level: str) -> int:
    """5 only for the men's Grand Slam main draw; everything else (incl. qualifying and women) is best of 3."""
    if tour == "ATP" and level == "Grand Slam" and not _is_qualifying(m):
        return 5
    return 3


def _map_status(m: dict) -> tuple[Optional[str], Optional[int]]:
    """-> (engine status or None to skip, winner). Branches on `outcome`, never on event_status spellings."""
    st = (m.get("status") or "").lower()
    outcome = (m.get("outcome") or "").lower()
    ev = (m.get("event_status") or "").lower()
    if st == "upcoming":
        return "scheduled", None
    if st == "live":
        return "live", None
    if st == "completed":
        winner = _int_or_none(m.get("winner"))
        if winner not in (1, 2):
            winner = _winner_from_sets(m.get("score"))
        if outcome == "walkover" or ev == "walk over":
            return "walkover", winner
        if outcome in ("retired", "default") or ev == "retired":
            return "retired", winner
        if outcome in ("abandoned", "unresolved"):
            return None, None  # no result asserted
        return "final", winner
    return None, None  # cancelled / unknown


def match_to_record(m: Any) -> Optional[MatchRecord]:
    """One documented Match object -> MatchRecord, or None for items to skip (doubles, juniors, malformed, ...)."""
    if not isinstance(m, dict):
        return None
    try:
        mid = m.get("id")
        players = m.get("players") or {}
        p1, p2 = players.get("p1") or {}, players.get("p2") or {}
        n1, n2 = p1.get("name"), p2.get("name")
        if mid is None or not (isinstance(n1, str) and n1.strip() and isinstance(n2, str) and n2.strip()):
            log.debug("skip match without id/player names: %r", mid)
            return None
        draw = (m.get("draw") or "").lower()
        if draw == "doubles" or (not draw and (m.get("is_doubles") is True or "/" in n1 or "/" in n2)):
            return None
        tier = m.get("tier")
        if (tier or "").lower() in _SKIP_TIERS or (m.get("tour") or "").lower() == "juniors":
            return None
        tour = _gender_tour(m, tier)
        if tour is None:
            log.debug("skip match %s: cannot tell men from women", mid)
            return None
        status, winner = _map_status(m)
        if status is None:
            return None
        when = m.get("scheduled_time") or m.get("live_at")
        if not isinstance(when, str) or not when:
            log.debug("skip match %s: no start time", mid)
            return None
        level = tier_to_level(tier, m.get("tour"))
        sets = _sets_from_score(m.get("score")) if status != "scheduled" else []
        if status == "walkover":
            sets = []
        return MatchRecord(
            source="livetennisapi", source_id=str(mid), tour=tour, level=level,
            tournament=str(m.get("tournament") or ""), date=when, status=status,
            p1_name=n1.strip(), p2_name=n2.strip(),
            p1_country=ioc_to_iso3(p1.get("country")), p2_country=ioc_to_iso3(p2.get("country")),
            winner=winner, sets=sets, best_of=_best_of(m, tour, level), round=_round_label(m),
            surface=_surface(m),
            tournament_id=str(m["tournament_id"]) if m.get("tournament_id") is not None else None,
            p1_source_id=str(p1["id"]) if p1.get("id") is not None else None,
            p2_source_id=str(p2["id"]) if p2.get("id") is not None else None,
            p1_rank=_int_or_none(p1.get("ranking")), p2_rank=_int_or_none(p2.get("ranking")),
        )
    except Exception as exc:  # noqa: BLE001 - one bad item must never break the batch
        log.warning("skip malformed livetennisapi match %r: %s", (m or {}).get("id") if isinstance(m, dict) else m, exc)
        return None


def parse_matches(payload: Any) -> list[MatchRecord]:
    items = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        return []
    out = []
    for it in items:
        rec = match_to_record(it)
        if rec is not None:
            out.append(rec)
    return out


class _Stop(Exception):
    """Internal: stop fetching cleanly (quota spent, bad key, plan limit)."""


class LiveTennisApiSource:
    name = "livetennisapi"
    key_env: Optional[str] = "LIVETENNISAPI_KEY"
    daily_quota = 100
    per_minute = 30
    supports_backfill = False
    results_lookback_days = 1   # today only: the live listing also carries what just finished (older days are empty)
    hourly_max_fixture_pages = 4  # hourly runs read today + tomorrow, 4 pages at most; full runs the whole window

    max_fixture_pages = 30       # 200 matches per page; leaves most of the 100/day for live polls
    max_result_pages = 10

    def __init__(self, client: Optional[httpx.Client] = None, sleep: Callable[[float], None] = time.sleep) -> None:
        self._client = client
        self._sleep = sleep
        self._key: Optional[str] = None
        self._opts: dict = {}
        self._history_exhausted = False
        self.last_error: Optional[str] = None

    # --- config ---------------------------------------------------------------------------------------------
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

    def _api_key(self) -> Optional[str]:
        return self._key or self._find_key(None)

    # --- http -----------------------------------------------------------------------------------------------
    def _http(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(timeout=TIMEOUT_S, headers={"User-Agent": "deuce/0.1"})
        return self._client

    def _get(self, path: str, params: Optional[dict], budget: Optional[Budget], *, charge: bool = True) -> Any:
        """GET with budget gating, retry/backoff on 429/5xx/network errors. Raises _Stop when fetching must end."""
        key = self._api_key()
        if not key:
            raise _Stop("no key")
        url = BASE_URL + path
        last: Optional[str] = None
        for attempt in range(MAX_ATTEMPTS):
            if charge and budget is not None and not budget.take(1):
                raise _Stop("budget exhausted")
            try:
                r = self._http().get(url, params=params, headers={"X-API-Key": key, "Accept": "application/json"},
                                     timeout=TIMEOUT_S)
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
            body = _safe_json(r)
            if code == 429:
                err = body.get("error") if isinstance(body, dict) else None
                if err == "abuse_throttled" or (isinstance(body, dict) and body.get("scope") == "day"):
                    raise _Stop(f"daily quota/abuse throttle: {body}")
                wait = _retry_after(r, default=2 ** attempt * 2)
                last = f"429 rate limited, waiting {wait:.0f}s"
                self._sleep(min(wait, 65))
                continue
            if code in (401, 403):
                if isinstance(body, dict) and body.get("free_history_taste") == "used":
                    self._history_exhausted = True
                raise _Stop(f"HTTP {code}: {body}")
            if code >= 500:
                last = f"HTTP {code}"
                self._sleep(min(2 ** attempt * 2, 15))
                continue
            raise _Stop(f"HTTP {code}: {body}")  # 400/404/410 etc: retrying unchanged is pointless
        raise _Stop(last or "retries exhausted")

    # --- usage ----------------------------------------------------------------------------------------------
    def fetch_usage(self) -> Optional[dict]:
        """GET /usage: quota-exempt. Returns the parsed body or None."""
        try:
            data = self._get("/usage", None, None, charge=False)
        except _Stop as exc:
            log.info("livetennisapi /usage unavailable: %s", exc)
            return None
        return data if isinstance(data, dict) else None

    def sync_budget(self, budget: Budget) -> Optional[int]:
        """Align a persisted QuotaBudget with the provider's own count; returns today's remaining or None."""
        usage = self.fetch_usage()
        if not usage:
            return None
        today = usage.get("today") if isinstance(usage.get("today"), dict) else {}
        calls = _int_or_none(today.get("calls"))
        remaining = _int_or_none(today.get("remaining_day"))
        state = getattr(budget, "state", None)
        data = getattr(state, "data", None)
        if isinstance(data, dict) and isinstance(data.get("daily"), dict):
            served = None
            err = _int_or_none(today.get("errors")) or 0
            if calls is not None:
                served = max(0, calls - err)
            cap = getattr(budget, "daily", None)
            if remaining is not None and cap:
                served = max(served or 0, cap - remaining)
            if served is not None:
                data["daily"]["used"] = max(int(data["daily"].get("used", 0)), served)
                if remaining == 0:
                    budget.exhausted = True
        return remaining

    # --- fetch ----------------------------------------------------------------------------------------------
    def _paged(self, params: dict, budget: Budget, max_pages: int, out: list[MatchRecord]) -> None:
        """Append parsed matches page by page; pages already read survive a later stop (quota, error)."""
        offset = 0
        for _ in range(max_pages):
            p = dict(params, limit=200, offset=offset)
            payload = self._get("/matches", p, budget)
            out.extend(parse_matches(payload))
            meta = payload.get("meta") if isinstance(payload, dict) else None
            if not (isinstance(meta, dict) and meta.get("has_more") is True):
                break
            offset += 200

    def fetch_fixtures(self, days: int, budget: Budget) -> Iterable[MatchRecord]:
        """Upcoming singles for today..today+days (all tours, incl. qualifying). Never raises."""
        out: list[MatchRecord] = []
        try:
            self.sync_budget(budget)
            today = datetime.now(timezone.utc).date()
            params = {"status": "upcoming", "draw": "singles", "from": today.isoformat(),
                      "to": (today + timedelta(days=max(0, int(days)))).isoformat()}
            hourly = getattr(self, "run_mode", "full") == "hourly"
            self._paged(params, budget, self.hourly_max_fixture_pages if hourly else self.max_fixture_pages, out)
        except _Stop as exc:
            self.last_error = str(exc)
            log.info("livetennisapi fixtures stopped: %s", exc)
        except Exception as exc:  # noqa: BLE001
            self.last_error = str(exc)
            log.warning("livetennisapi fixtures failed: %s", exc)
        return out

    def fetch_results(self, day: date, budget: Budget) -> Iterable[MatchRecord]:
        """Completed matches the free plan exposes: only today's, taken from the live listing (`status=live` also
        carries matches that just finished). Past days return [] without spending quota because the free plan has no
        history. Opt in to the 20-calls/month history taste with `[sources.livetennisapi] history_taste = true`."""
        today = datetime.now(timezone.utc).date()
        raw: list[MatchRecord] = []
        try:
            self.sync_budget(budget)
            if day >= today:
                self._paged({"status": "live", "draw": "singles"}, budget, self.max_result_pages, raw)
            elif self._opts.get("history_taste") and not self._history_exhausted:
                self._paged({"status": "completed", "draw": "singles", "from": day.isoformat(),
                             "to": day.isoformat()}, budget, 1, raw)
        except _Stop as exc:
            self.last_error = str(exc)
            log.info("livetennisapi results stopped: %s", exc)
        except Exception as exc:  # noqa: BLE001
            self.last_error = str(exc)
            log.warning("livetennisapi results failed: %s", exc)
        # Finished matches go to the cache; in-progress ones come back too so the site can show them live.
        return [r for r in raw if r.status in ("final", "retired", "walkover", "live")]

    def fetch_odds(self, budget: Budget) -> Iterable[OddsRecord]:
        return []  # market prices are PRO+ only


def _safe_json(r: httpx.Response) -> Any:
    try:
        return r.json()
    except ValueError:
        return {}


def _retry_after(r: httpx.Response, default: float) -> float:
    try:
        return max(0.0, float(r.headers.get("Retry-After", default)))
    except (TypeError, ValueError):
        return float(default)


SOURCE = LiveTennisApiSource()
