"""OddsPapi as a Source: pre-match match-winner odds (Pinnacle preferred) and historical closing lines, all tiers.

Free plan: 250 billable requests per month (resets on the 1st). `/v4/historical-odds` is free (never counted) and
`/v4/account` is unmetered, but historical calls are refused once the quota is spent. Tennis is sportId 12; market 121
is the Winner (moneyline), outcome 121 = participant 1, outcome 122 = participant 2.

Verified against https://oddspapi.io/en/docs (overview, get-fixtures, get-tournaments, get-odds-by-tournaments,
get-historical-odds, get-account, requests-and-quota, errors) and the blog post https://oddspapi.io/blog/?p=4445
(fetched 2026-11-16):
  base     https://api.oddspapi.io/v4        auth: `apiKey` QUERY parameter (not a header)
  GET /v4/fixtures?sportId=12&from=YYYY-MM-DD&to=YYYY-MM-DD[&statusId=0|1|2|3][&hasOdds=true]   (1 request, <=10 days)
       -> [{fixtureId ("id..." or ITF "pn..."), participant1Id/2Id, participant1Name/2Name, tournamentId,
            tournamentName, categoryName (ATP, WTA, Challenger, WTA 125K, ITF Men, ITF Women, UTR ..., Simulated ...),
            startTime, statusId, statusName (null on ITF), hasOdds}]
  GET /v4/odds-by-tournaments?tournamentIds=a,b,c(max 5)&bookmaker=pinnacle (exactly one)   (1 request per call)
       -> [{fixtureId, startTime, bookmakerOdds:{<slug>:{bookmakerIsActive, suspended, markets:{"121":{outcomes:{
            "121":{players:{"0":{price, active, limit, changedAt, priceAmerican}}}, "122":{...}}}}}}}]
  GET /v4/historical-odds?fixtureId=..&bookmakers=pinnacle[,bet365,..max 3]     (free, 5 s cooldown)
       -> {fixtureId, bookmakers:{<slug>:{markets:{"121":{outcomes:{"121":{players:{"0":[{createdAt, price, limit,
            active}, ...]}}}}}}}}      (data since Jan 2026)
  GET /v4/account (unmetered, 1 s cooldown) -> subscriptions[]: request_limit, request_count
  Cooldowns per endpoint: fixtures 2 s, odds-by-tournaments 1 s, historical-odds 5 s. Errors: {"error":{code,message,
  details,retryMs}} with code RATE_LIMITED (wait retryMs) vs REQUEST_LIMIT_EXCEEDED (monthly quota spent: stop).
"""
from __future__ import annotations

import logging
import os
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Iterable, Optional

import httpx

from .base import Budget, MatchRecord, OddsRecord

log = logging.getLogger("deuce.sources.oddspapi")

BASE_URL = "https://api.oddspapi.io/v4"
SPORT_TENNIS = 12
MARKET_WINNER, OUT_P1, OUT_P2 = "121", "121", "122"
TIMEOUT_S = 20.0
MAX_ATTEMPTS = 3
COOLDOWN_S = {"fixtures": 2.0, "odds-by-tournaments": 1.0, "historical-odds": 5.0, "account": 1.0}
TOURNAMENTS_PER_CALL = 5

# categoryName -> (tour, priority). Lower priority number = fetched first when the per-run request cap bites.
_CATEGORY = {
    "ATP": ("ATP", 0), "WTA": ("WTA", 0), "Challenger": ("ATP", 1), "WTA 125K": ("WTA", 1), "WTA 125": ("WTA", 1),
    "ITF Men": ("ATP", 2), "ITF Women": ("WTA", 2), "Billie Jean King Cup": ("WTA", 3), "Davis Cup": ("ATP", 3),
}


def category_tour(category: Any) -> Optional[tuple[str, int]]:
    """Real, priceable tiers only: UTR, Simulated Reality and Exhibition are not pro matches for the model."""
    return _CATEGORY.get(category) if isinstance(category, str) else None


def clean_name(name: Any) -> Optional[str]:
    """'Yamamoto, Natsuki' (id-scheme fixtures) -> 'Natsuki Yamamoto'. ITF fixtures already read 'Astra Sharma'."""
    if not isinstance(name, str) or not name.strip():
        return None
    s = name.strip()
    if s.count(",") == 1:
        last, first = (x.strip() for x in s.split(","))
        if last and first:
            return f"{first} {last}"
    return s


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_ts(s: Any) -> Optional[datetime]:
    if not isinstance(s, str) or not s:
        return None
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _num(v: Any) -> Optional[float]:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v)
        except ValueError:
            return None
    return None


def _is_singles(fx: dict) -> bool:
    n1, n2 = str(fx.get("participant1Name") or ""), str(fx.get("participant2Name") or "")
    return "Doubles" not in str(fx.get("tournamentName") or "") and "/" not in n1 and "/" not in n2


def parse_fixtures(payload: Any) -> dict[str, dict]:
    """Fixtures list -> {fixtureId: meta} for real singles matches that have odds. Malformed rows are skipped."""
    rows = payload.get("data") if isinstance(payload, dict) else payload
    out: dict[str, dict] = {}
    if not isinstance(rows, list):
        return out
    for fx in rows:
        try:
            if not isinstance(fx, dict) or not fx.get("fixtureId"):
                continue
            ct = category_tour(fx.get("categoryName"))
            if ct is None or not _is_singles(fx):
                continue
            n1, n2 = clean_name(fx.get("participant1Name")), clean_name(fx.get("participant2Name"))
            start = _parse_ts(fx.get("startTime"))
            if not (n1 and n2 and start):
                continue
            out[str(fx["fixtureId"])] = {
                "fixtureId": str(fx["fixtureId"]), "tour": ct[0], "priority": ct[1], "p1_name": n1, "p2_name": n2,
                "startTime": fx["startTime"], "start": start, "tournamentId": fx.get("tournamentId"),
                "tournamentName": fx.get("tournamentName"), "hasOdds": bool(fx.get("hasOdds")),
                "statusId": fx.get("statusId"),
            }
        except Exception as exc:  # noqa: BLE001
            log.warning("skip malformed oddspapi fixture: %s", exc)
    return out


def winner_prices(book: Any) -> Optional[tuple[float, float]]:
    """Live match-winner pair from one bookmaker block, or None. Quality gate per OddsPapi's own guide: the book is
    active and not suspended, both legs active, both prices > 1."""
    if not isinstance(book, dict):
        return None
    if book.get("suspended") is True or book.get("bookmakerIsActive") is False:
        return None
    try:
        outs = book["markets"][MARKET_WINNER]["outcomes"]
        a, b = outs[OUT_P1]["players"]["0"], outs[OUT_P2]["players"]["0"]
    except (KeyError, TypeError):
        return None
    if not (isinstance(a, dict) and isinstance(b, dict)):
        return None
    if a.get("active") is False or b.get("active") is False:
        return None
    p1, p2 = _num(a.get("price")), _num(b.get("price"))
    if p1 is None or p2 is None or p1 <= 1.0 or p2 <= 1.0:
        return None
    if 1 / p1 + 1 / p2 <= 1.0:  # an arbitrage-looking pair is a stale or broken quote, not a price
        return None
    return p1, p2


def parse_odds(payload: Any, fixtures: dict[str, dict], book: str, now: Optional[datetime] = None,
               fetched_at: Optional[str] = None) -> list[OddsRecord]:
    """odds-by-tournaments body -> OddsRecords for pregame fixtures we hold metadata for (names come from /fixtures)."""
    now = now or datetime.now(timezone.utc)
    rows = payload.get("data") if isinstance(payload, dict) else payload
    if isinstance(rows, dict):
        rows = [rows]
    out: list[OddsRecord] = []
    if not isinstance(rows, list):
        return out
    for fx in rows:
        try:
            if not isinstance(fx, dict):
                continue
            meta = fixtures.get(str(fx.get("fixtureId")))
            if meta is None or meta["start"] <= now:
                continue
            pair = winner_prices((fx.get("bookmakerOdds") or {}).get(book))
            if pair is None:
                continue
            out.append(OddsRecord(
                source="oddspapi", date=meta["startTime"], tour=meta["tour"], p1_name=meta["p1_name"],
                p2_name=meta["p2_name"], book=book, p1_odds=pair[0], p2_odds=pair[1],
                fetched_at=fetched_at or _iso_now(), source_match_id=meta["fixtureId"]))
        except Exception as exc:  # noqa: BLE001
            log.warning("skip malformed oddspapi odds row: %s", exc)
    return out


def closing_price(snapshots: Any, start: datetime) -> Optional[dict]:
    """Last active snapshot with price > 1 created before `start`."""
    best, best_t = None, None
    if not isinstance(snapshots, list):
        return None
    for s in snapshots:
        if not isinstance(s, dict) or s.get("active") is False:
            continue
        price, t = _num(s.get("price")), _parse_ts(s.get("createdAt"))
        if price is None or price <= 1.0 or t is None or t >= start:
            continue
        if best_t is None or t > best_t:
            best, best_t = s, t
    return best


def parse_closing(payload: Any, meta: dict, books: Iterable[str]) -> list[OddsRecord]:
    out: list[OddsRecord] = []
    bms = payload.get("bookmakers") if isinstance(payload, dict) else None
    if not isinstance(bms, dict):
        return out
    for book in books:
        try:
            outs = bms[book]["markets"][MARKET_WINNER]["outcomes"]
            c1 = closing_price(outs[OUT_P1]["players"]["0"], meta["start"])
            c2 = closing_price(outs[OUT_P2]["players"]["0"], meta["start"])
        except (KeyError, TypeError):
            continue
        if not (c1 and c2):
            continue
        t1, t2 = _parse_ts(c1["createdAt"]), _parse_ts(c2["createdAt"])
        stamp = max(t1, t2).strftime("%Y-%m-%dT%H:%M:%SZ")
        out.append(OddsRecord(
            source="oddspapi", date=meta["startTime"], tour=meta["tour"], p1_name=meta["p1_name"],
            p2_name=meta["p2_name"], book=book, p1_odds=float(c1["price"]), p2_odds=float(c2["price"]),
            fetched_at=stamp, source_match_id=meta["fixtureId"]))
    return out


class _Stop(Exception):
    """Internal: stop cleanly (monthly quota, bad key, restricted plan)."""


class OddsPapiSource:
    name = "oddspapi"
    key_env: Optional[str] = "ODDSPAPI_KEY"
    monthly_quota = 250
    daily_quota = 8              # ~250/month spread evenly; odds are fetched in the daily full run only
    supports_backfill = False

    max_requests_per_run = 6     # 1 fixtures + up to 5 odds calls (25 tournaments); ~8/day is the monthly pace
    default_books = ("pinnacle",)

    def __init__(self, client: Optional[httpx.Client] = None, sleep: Callable[[float], None] = time.sleep,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self._client = client
        self._sleep, self._clock = sleep, clock
        self._key: Optional[str] = None
        self._opts: dict = {}
        self._last_call: dict[str, float] = {}
        self._meta: dict[str, dict] = {}       # fixtureId -> metadata, filled by fetch_odds / discover_finished
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

    def _books(self) -> list[str]:
        b = self._opts.get("books")
        if isinstance(b, str):
            b = [x.strip() for x in b.split(",") if x.strip()]
        return [str(x) for x in b] if isinstance(b, (list, tuple)) and b else list(self.default_books)

    # --- http -----------------------------------------------------------------------------------------------
    def _http(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(timeout=TIMEOUT_S, headers={"User-Agent": "deuce/0.1"})
        return self._client

    def _pace(self, endpoint: str) -> None:
        gap = COOLDOWN_S.get(endpoint, 1.0)
        last = self._last_call.get(endpoint)
        if last is not None:
            wait = gap - (self._clock() - last)
            if wait > 0:
                self._sleep(wait)
        self._last_call[endpoint] = self._clock()

    @staticmethod
    def _can_call(budget: Budget, cost: int) -> bool:
        if cost > 0:
            return bool(budget.take(cost))
        # free endpoint: refused by the provider once the quota is spent, so honour an exhausted local budget too
        rem = getattr(budget, "remaining", None)
        if callable(rem):
            try:
                if rem() == 0:
                    return False
            except Exception:  # noqa: BLE001
                pass
        if getattr(budget, "exhausted", False):
            return False
        return bool(budget.take(0))

    def _get(self, endpoint: str, params: dict, budget: Optional[Budget], cost: int = 1) -> Any:
        key = self._key or self._find_key(None)
        if not key:
            raise _Stop("no key")
        q = dict(params, apiKey=key)
        last: Optional[str] = None
        for attempt in range(MAX_ATTEMPTS):
            if budget is not None and not self._can_call(budget, cost):
                raise _Stop("budget exhausted")
            self._pace(endpoint)
            try:
                r = self._http().get(f"{BASE_URL}/{endpoint}", params=q, timeout=TIMEOUT_S)
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
            err = body.get("error") if isinstance(body, dict) and isinstance(body.get("error"), dict) else {}
            ecode = err.get("code") or (body.get("code") if isinstance(body, dict) else None)
            if code == 429:
                if ecode == "REQUEST_LIMIT_EXCEEDED":
                    if budget is not None and hasattr(budget, "exhausted"):
                        budget.exhausted = True
                    raise _Stop("monthly request limit exceeded")
                ms = _num(err.get("retryMs"))
                wait = (ms / 1000.0 + 0.25) if ms is not None else 2.0 * (attempt + 1)
                last = "429 rate limited"
                self._sleep(min(wait, 30))
                continue
            if code in (500, 502, 503, 504):
                last = f"HTTP {code} {ecode or ''}".strip()
                self._sleep(min(2 ** attempt * 2, 15))
                continue
            raise _Stop(f"HTTP {code} {ecode or ''}: {err.get('details') or err.get('message') or ''}")
        raise _Stop(last or "retries exhausted")

    # --- account / budget -----------------------------------------------------------------------------------
    def sync_budget(self, budget: Budget) -> Optional[int]:
        """GET /v4/account (unmetered): align the persisted monthly counter with the provider's own. Returns the
        remaining requests or None."""
        try:
            acct = self._get("account", {}, None, cost=0)
        except _Stop as exc:
            log.info("oddspapi /account unavailable: %s", exc)
            return None
        subs = acct.get("subscriptions") if isinstance(acct, dict) else None
        if not isinstance(subs, list) or not subs:
            return None
        cur = next((s for s in subs if isinstance(s, dict) and s.get("subscription_id") == acct.get("current_subscription_id")),
                   None) or next((s for s in subs if isinstance(s, dict) and s.get("is_active")), None) or subs[0]
        limit, count = _num(cur.get("request_limit")), _num(cur.get("request_count"))
        if limit is None or count is None:
            return None
        data = getattr(getattr(budget, "state", None), "data", None)
        if isinstance(data, dict) and isinstance(data.get("monthly"), dict):
            data["monthly"]["used"] = max(int(data["monthly"].get("used", 0)), int(count))
            if hasattr(budget, "monthly") and getattr(budget, "monthly", None):
                budget.monthly = int(limit)
            if count >= limit:
                budget.exhausted = True
        return max(0, int(limit - count))

    # --- fetch ----------------------------------------------------------------------------------------------
    def fetch_fixtures(self, days: int, budget: Budget) -> Iterable[MatchRecord]:
        return []

    def fetch_results(self, day: date, budget: Budget) -> Iterable[MatchRecord]:
        return []

    def _fixtures(self, params: dict, budget: Budget) -> dict[str, dict]:
        payload = self._get("fixtures", dict(params, sportId=SPORT_TENNIS), budget)
        metas = parse_fixtures(payload)
        self._meta.update(metas)
        return metas

    def fetch_odds(self, budget: Budget) -> Iterable[OddsRecord]:
        """Today's and tomorrow's pre-match match-winner odds: 1 fixtures call, then bulk odds-by-tournaments calls
        (5 tournaments per request), highest tiers first, at most `max_requests_per_run` requests in total.
        Books are tried in order (default pinnacle only; `[sources.oddspapi] books = ["pinnacle", "bet365"]` adds
        fallbacks, each costing one more pass over the tournaments still uncovered). Never raises."""
        out: list[OddsRecord] = []
        try:
            self.sync_budget(budget)
            cap = int(self._opts.get("max_requests_per_run", self.max_requests_per_run))
            now = datetime.now(timezone.utc)
            today = now.date()
            fx = self._fixtures({"from": today.isoformat(), "to": (today + timedelta(days=1)).isoformat(),
                                 "hasOdds": "true"}, budget)
            spent = 1
            pending = {k: v for k, v in fx.items() if v["hasOdds"] and v["start"] > now and v["tournamentId"] is not None}
            covered: set[str] = set()
            for book in self._books():
                todo = [v for k, v in pending.items() if k not in covered]
                tids: list[Any] = []
                for v in sorted(todo, key=lambda m: (m["priority"], m["start"])):
                    if v["tournamentId"] not in tids:
                        tids.append(v["tournamentId"])
                for i in range(0, len(tids), TOURNAMENTS_PER_CALL):
                    if spent >= cap:
                        return out
                    chunk = tids[i:i + TOURNAMENTS_PER_CALL]
                    payload = self._get("odds-by-tournaments",
                                        {"tournamentIds": ",".join(str(t) for t in chunk), "bookmaker": book}, budget)
                    spent += 1
                    recs = parse_odds(payload, pending, book, now=now, fetched_at=_iso_now())
                    out.extend(recs)
                    covered.update(r.source_match_id for r in recs if r.source_match_id)
        except _Stop as exc:
            self.last_error = str(exc)
            log.info("oddspapi odds stopped: %s", exc)
        except Exception as exc:  # noqa: BLE001
            self.last_error = str(exc)
            log.warning("oddspapi odds failed: %s", exc)
        return out

    def discover_finished(self, day: date, budget: Budget) -> list[dict]:
        """1 billable request: finished tennis fixtures that started on `day` (UTC), as metadata for fetch_closing.
        Never raises."""
        try:
            fx = self._fixtures({"from": day.isoformat(), "to": (day + timedelta(days=1)).isoformat(),
                                 "statusId": 2, "hasOdds": "true"}, budget)
        except _Stop as exc:
            self.last_error = str(exc)
            log.info("oddspapi discover_finished stopped: %s", exc)
            return []
        except Exception as exc:  # noqa: BLE001
            self.last_error = str(exc)
            log.warning("oddspapi discover_finished failed: %s", exc)
            return []
        return [m for m in fx.values() if m["start"].date() == day]

    def fetch_closing(self, fixture_ids: Iterable[Any], budget: Budget) -> list[OddsRecord]:
        """Closing match-winner lines for finished matches from /v4/historical-odds (free, not counted, 5 s apart).
        Items are fixture ids already seen by fetch_odds/discover_finished, or metadata dicts from discover_finished.
        Closing = the last active snapshot created before the start time. Never raises; stops when the budget is
        spent (the provider refuses historical calls then)."""
        out: list[OddsRecord] = []
        books = self._books()[:3]
        for item in fixture_ids:
            meta = item if isinstance(item, dict) and "start" in item else self._meta.get(str(
                item.get("fixtureId") if isinstance(item, dict) else item))
            if not meta:
                log.debug("fetch_closing: no metadata for %r (run discover_finished first)", item)
                continue
            try:
                payload = self._get("historical-odds", {"fixtureId": meta["fixtureId"], "bookmakers": ",".join(books)},
                                    budget, cost=0)
            except _Stop as exc:
                self.last_error = str(exc)
                log.info("oddspapi closing lines stopped: %s", exc)
                break
            except Exception as exc:  # noqa: BLE001
                self.last_error = str(exc)
                log.warning("oddspapi closing lookup failed for %s: %s", meta.get("fixtureId"), exc)
                continue
            out.extend(parse_closing(payload, meta, books))
        return out


def _safe_json(r: httpx.Response) -> Any:
    try:
        return r.json()
    except ValueError:
        return {}


SOURCE = OddsPapiSource()
