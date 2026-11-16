"""OddsPapi source: fixtures + bulk odds + historical closing parsing, budget, retries, pacing. No network."""
import json
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

import httpx
import pytest

from engine.sources import oddspapi as op

FIX = Path(__file__).parent / "fixtures"
NOW = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)


def load(name):
    return json.loads((FIX / name).read_text())


class FakeBudget:
    def __init__(self, n):
        self.n, self.taken = n, 0

    def take(self, n=1):
        if self.n < n:
            return False
        self.n -= n
        self.taken += n
        return True


def make(handler):
    src = op.OddsPapiSource(client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda s: None)
    src._key = "op_test"
    return src


def router(extra=None, odds_fn=None):
    """Handler serving the documented fixtures; records every request."""
    seen = []

    def handler(req):
        seen.append(req)
        ep = req.url.path.rsplit("/", 1)[-1]
        if extra and ep in extra:
            return extra[ep](req)
        if ep == "account":
            return httpx.Response(200, json=load("op_account.json"))
        if ep == "fixtures":
            return httpx.Response(200, json=load("op_fixtures.json"))
        if ep == "odds-by-tournaments":
            return httpx.Response(200, json=odds_fn(req) if odds_fn else load("op_odds_by_tournaments.json"))
        if ep == "historical-odds":
            return httpx.Response(200, json=load("op_historical.json"))
        return httpx.Response(404, json={"error": {"code": "NOT_FOUND", "message": "x"}})

    return handler, seen


@pytest.fixture(autouse=True)
def freeze_now(monkeypatch):
    class _DT(datetime):
        @classmethod
        def now(cls, tz=None):
            return NOW if tz is None else NOW.astimezone(tz)
    monkeypatch.setattr(op, "datetime", _DT)


def test_available_requires_key(monkeypatch):
    monkeypatch.delenv("ODDSPAPI_KEY", raising=False)
    assert op.OddsPapiSource().available({}) is False
    assert op.OddsPapiSource().available({"sources": {"oddspapi": {"key": "k"}}}) is True
    monkeypatch.setenv("ODDSPAPI_KEY", "env")
    assert op.OddsPapiSource().available({}) is True
    assert op.OddsPapiSource.key_env == "ODDSPAPI_KEY" and op.OddsPapiSource.monthly_quota == 250


def test_parse_fixtures_filters_and_names():
    metas = op.parse_fixtures(load("op_fixtures.json"))
    assert "id1200000000000006" not in metas       # Simulated Reality
    assert "id1200000000000007" not in metas       # UTR
    assert "id1200000000000008" not in metas       # doubles
    assert "id1200000000000011" not in metas       # malformed
    m = metas["id1200000000000001"]
    assert (m["p1_name"], m["p2_name"], m["tour"]) == ("Arthur Fils", "Alex De Minaur", "ATP")
    assert metas["pn1200000000000004"]["tour"] == "WTA" and metas["pn1200000000000004"]["p1_name"] == "Haruna Arakawa"
    assert metas["pn1200000000000005"]["tour"] == "ATP"
    assert metas["id1200000000000003"]["priority"] == 1 and metas["id1200000000000001"]["priority"] == 0
    assert op.parse_fixtures({"x": 1}) == {}


def test_clean_name():
    assert op.clean_name("Yamamoto, Natsuki") == "Natsuki Yamamoto"
    assert op.clean_name("Astra Sharma") == "Astra Sharma"
    assert op.clean_name("  ") is None and op.clean_name(None) is None


def test_category_mapping():
    assert op.category_tour("ITF Women") == ("WTA", 2) and op.category_tour("Challenger") == ("ATP", 1)
    assert op.category_tour("WTA 125K")[0] == "WTA"
    assert op.category_tour("UTR Men") is None and op.category_tour("Simulated Reality Women") is None and op.category_tour(None) is None


def test_winner_prices_quality_gate():
    ok = load("op_odds_by_tournaments.json")[0]["bookmakerOdds"]["pinnacle"]
    assert op.winner_prices(ok) == (1.769, 2.15)
    assert op.winner_prices(dict(ok, suspended=True)) is None
    assert op.winner_prices(dict(ok, bookmakerIsActive=False)) is None
    assert op.winner_prices(None) is None and op.winner_prices({"markets": {}}) is None
    placeholder = load("op_odds_by_tournaments.json")[3]["bookmakerOdds"]["pinnacle"]
    assert op.winner_prices(placeholder) is None   # price exactly 1.0
    assert op.winner_prices({"markets": {"121": {"outcomes": {"121": {"players": {"0": {"price": "x"}}}}}}}) is None


def test_fetch_odds_end_to_end_with_bulk_calls_and_auth_in_query():
    handler, seen = router()
    src = make(handler)
    b = FakeBudget(250)
    recs = list(src.fetch_odds(b))
    got = {r.source_match_id: r for r in recs}
    assert set(got) == {"id1200000000000001", "id1200000000000002", "id1200000000000003"}
    r = got["id1200000000000001"]
    assert (r.source, r.book, r.tour, r.p1_name, r.p2_name) == ("oddspapi", "pinnacle", "ATP", "Arthur Fils", "Alex De Minaur")
    assert (r.p1_odds, r.p2_odds, r.date) == (1.769, 2.15, "2026-11-17T13:00:00.000Z")
    assert r.fetched_at == "2026-11-16T12:00:00Z"
    # 1 fixtures call + 1 bulk odds call (<=5 tournaments); the account call is unmetered
    calls = [s.url.path.rsplit("/", 1)[-1] for s in seen]
    assert calls.count("fixtures") == 1 and calls.count("odds-by-tournaments") == 1 and calls.count("account") == 1
    assert b.taken == 2
    fx = next(s for s in seen if s.url.path.endswith("/fixtures"))
    assert fx.url.params["sportId"] == "12" and fx.url.params["from"] == "2026-11-16" and fx.url.params["to"] == "2026-11-17"
    assert fx.url.params["apiKey"] == "op_test" and "X-API-Key" not in fx.headers
    ob = next(s for s in seen if s.url.path.endswith("/odds-by-tournaments"))
    assert ob.url.params["bookmaker"] == "pinnacle"
    tids = ob.url.params["tournamentIds"].split(",")
    assert len(tids) <= 5 and tids[0] in ("101", "102")        # tour-level tournaments first
    assert str(ob.url).startswith("https://api.oddspapi.io/v4/odds-by-tournaments")


def test_tournaments_chunked_by_five_and_capped_per_run():
    rows = []
    for i in range(12):
        f = dict(load("op_fixtures.json")[0], fixtureId=f"id99{i:02d}", tournamentId=500 + i)
        rows.append(f)
    handler, seen = router(extra={"fixtures": lambda req: httpx.Response(200, json=rows)},
                           odds_fn=lambda req: [])
    src = make(handler)
    b = FakeBudget(250)
    list(src.fetch_odds(b))
    odds_calls = [s for s in seen if s.url.path.endswith("/odds-by-tournaments")]
    assert [len(c.url.params["tournamentIds"].split(",")) for c in odds_calls] == [5, 5, 2]
    src2 = make(handler)
    src2._opts = {"max_requests_per_run": 2}
    b2 = FakeBudget(250)
    list(src2.fetch_odds(b2))
    assert b2.taken == 2                                       # fixtures + one odds call, then stop


def test_fallback_book_only_queries_uncovered_fixtures():
    def odds_fn(req):
        if req.url.params["bookmaker"] == "pinnacle":
            return [load("op_odds_by_tournaments.json")[0]]    # only the ATP match priced by pinnacle
        rows = load("op_odds_by_tournaments.json")[1:3]
        for r in rows:
            r["bookmakerOdds"] = {"bet365": r["bookmakerOdds"]["pinnacle"]}
        return rows
    handler, seen = router(odds_fn=odds_fn)
    src = make(handler)
    src._opts = {"books": ["pinnacle", "bet365"]}
    recs = list(src.fetch_odds(FakeBudget(250)))
    assert sorted((r.source_match_id, r.book) for r in recs) == [
        ("id1200000000000001", "pinnacle"), ("id1200000000000002", "bet365"), ("id1200000000000003", "bet365")]
    second = [s for s in seen if s.url.path.endswith("/odds-by-tournaments")][1]
    assert "101" not in second.url.params["tournamentIds"].split(",")


def test_budget_exhaustion_stops_fetching():
    handler, seen = router()
    b = FakeBudget(1)                                  # affords the fixtures call only
    recs = list(make(handler).fetch_odds(b))
    assert recs == [] and not [s for s in seen if s.url.path.endswith("/odds-by-tournaments")]
    handler, seen = router()
    assert list(make(handler).fetch_odds(FakeBudget(0))) == [] and not [s for s in seen if s.url.path.endswith(("fixtures", "odds-by-tournaments"))]


def test_account_syncs_persisted_budget():
    from engine.sources.state import QuotaBudget, SourceState
    st = SourceState("oddspapi", Path(tempfile.mkdtemp()))
    qb = QuotaBudget(st, monthly=250)
    handler, _ = router()
    src = make(handler)
    assert src.sync_budget(qb) == 230 and qb.used_month == 20
    list(src.fetch_odds(qb))
    assert qb.used_month == 22 and qb.remaining() == 228

    def spent(req):
        a = load("op_account.json")
        a["subscriptions"][0]["request_count"] = 250
        return httpx.Response(200, json=a)
    handler, seen = router(extra={"account": spent})
    st2 = SourceState("oddspapi", Path(tempfile.mkdtemp()))
    qb2 = QuotaBudget(st2, monthly=250)
    assert list(make(handler).fetch_odds(qb2)) == [] and not [s for s in seen if s.url.path.endswith("fixtures")]


def test_429_rate_limited_retry_vs_request_limit_exceeded():
    n = {"c": 0}

    def flaky(req):
        n["c"] += 1
        if n["c"] == 1:
            return httpx.Response(429, json={"error": {"code": "RATE_LIMITED", "retryMs": 420, "message": "slow"}})
        return httpx.Response(200, json=load("op_fixtures.json"))
    handler, seen = router(extra={"fixtures": flaky})
    sleeps = []
    src = make(handler)
    src._sleep = sleeps.append
    recs = list(src.fetch_odds(FakeBudget(250)))
    assert len(recs) == 3 and any(abs(s - 0.67) < 0.01 for s in sleeps)

    def over(req):
        return httpx.Response(429, json={"error": {"code": "REQUEST_LIMIT_EXCEEDED", "message": "Request limit exceeded"}})
    handler, seen = router(extra={"fixtures": over})
    b = FakeBudget(250)
    assert list(make(handler).fetch_odds(b)) == [] and len([s for s in seen if s.url.path.endswith("fixtures")]) == 1


def test_5xx_retry_then_gives_up_never_raises():
    handler, seen = router(extra={"fixtures": lambda r: httpx.Response(503, json={"error": {"code": "MAINTENANCE"}})})
    b = FakeBudget(250)
    assert list(make(handler).fetch_odds(b)) == [] and len([s for s in seen if s.url.path.endswith("fixtures")]) == 3
    assert list(make(lambda r: (_ for _ in ()).throw(httpx.ConnectError("x"))).fetch_odds(FakeBudget(9))) == []
    assert list(make(lambda r: httpx.Response(200, content=b"<html>")).fetch_odds(FakeBudget(9))) == []
    assert list(make(lambda r: httpx.Response(401, json={"error": {"code": "INVALID_API_KEY", "message": "bad"}})).fetch_odds(FakeBudget(9))) == []


def test_cooldowns_are_respected_between_same_endpoint_calls():
    rows = [dict(load("op_fixtures.json")[0], fixtureId=f"id77{i:02d}", tournamentId=700 + i) for i in range(11)]
    handler, _ = router(extra={"fixtures": lambda req: httpx.Response(200, json=rows)}, odds_fn=lambda req: [])
    ticks = {"t": 0.0}
    sleeps = []
    src = op.OddsPapiSource(client=httpx.Client(transport=httpx.MockTransport(handler)),
                            sleep=lambda s: (sleeps.append(s), ticks.__setitem__("t", ticks["t"] + s)),
                            clock=lambda: ticks["t"])
    src._key = "k"
    list(src.fetch_odds(FakeBudget(250)))
    assert len([s for s in sleeps if abs(s - 1.0) < 1e-9]) == 2    # 3 odds calls -> two 1 s gaps


def test_closing_lines_from_historical_odds():
    handler, seen = router()
    src = make(handler)
    metas = op.parse_fixtures(load("op_fixtures.json"))
    b = FakeBudget(0)                                   # historical is free: even a spent local budget with take(0) works
    recs = src.fetch_closing([metas["pn1200000000000004"]], b)
    assert len(recs) == 1
    r = recs[0]
    assert (r.book, r.tour, r.p1_name, r.p2_name, r.source_match_id) == ("pinnacle", "WTA", "Haruna Arakawa", "Hiromi Abe", "pn1200000000000004")
    assert (r.p1_odds, r.p2_odds) == (6.39, 1.125)       # last ACTIVE snapshot before the 01:00 start
    assert r.fetched_at == "2026-11-17T00:40:00Z" and r.date == "2026-11-17T01:00:00.000Z"
    h = seen[-1]
    assert h.url.path.endswith("/historical-odds") and h.url.params["fixtureId"] == "pn1200000000000004"
    assert h.url.params["bookmakers"] == "pinnacle" and h.url.params["apiKey"] == "op_test"


def test_closing_by_id_uses_remembered_metadata_and_stops_when_quota_spent():
    handler, seen = router()
    src = make(handler)
    list(src.fetch_odds(FakeBudget(250)))                # remembers fixtures
    assert len(src.fetch_closing(["pn1200000000000004"], FakeBudget(5))) == 1
    assert src.fetch_closing(["unknown-id"], FakeBudget(5)) == []

    class Spent:
        exhausted = True
        def take(self, n=1):
            return False
    n_before = len(seen)
    assert src.fetch_closing(["pn1200000000000004", "id1200000000000001"], Spent()) == []
    assert len(seen) == n_before

    def over(req):
        return httpx.Response(429, json={"error": {"code": "REQUEST_LIMIT_EXCEEDED", "message": "x"}})
    handler, seen = router(extra={"historical-odds": over})
    s2 = make(handler)
    s2._meta = dict(src._meta)
    assert s2.fetch_closing(["pn1200000000000004", "id1200000000000001"], FakeBudget(5)) == []
    assert len([s for s in seen if s.url.path.endswith("historical-odds")]) == 1      # stopped, did not hammer


def test_closing_malformed_payload_skipped():
    meta = op.parse_fixtures(load("op_fixtures.json"))["pn1200000000000004"]
    assert op.parse_closing({"bookmakers": {"pinnacle": {"markets": {}}}}, meta, ["pinnacle"]) == []
    assert op.parse_closing("junk", meta, ["pinnacle"]) == []
    assert op.closing_price([{"price": "x"}, None, {"createdAt": "bad", "price": 2}], meta["start"]) is None


def test_discover_finished_and_noops():
    rows = [dict(load("op_fixtures.json")[0], fixtureId="id55", statusId=2, startTime="2026-11-15T10:00:00.000Z"),
            dict(load("op_fixtures.json")[0], fixtureId="id56", statusId=2, startTime="2026-11-16T10:00:00.000Z")]
    handler, seen = router(extra={"fixtures": lambda req: httpx.Response(200, json=rows)})
    src = make(handler)
    metas = src.discover_finished(date(2026, 11, 15), FakeBudget(5))
    assert [m["fixtureId"] for m in metas] == ["id55"]
    p = seen[-1].url.params
    assert p["statusId"] == "2" and p["sportId"] == "12"
    assert list(src.fetch_fixtures(3, FakeBudget(1))) == [] and list(src.fetch_results(date(2026, 11, 15), FakeBudget(1))) == []
    assert src.discover_finished(date(2026, 11, 15), FakeBudget(0)) == []
