"""Live Tennis API source: parsing of the documented payloads, tier mapping, budget, retries. No network."""
import json
from datetime import date, datetime, timezone
from pathlib import Path

import httpx
import pytest

from engine.sources import livetennisapi as lta
from engine.sources.base import MatchRecord

FIX = Path(__file__).parent / "fixtures"


def load(name):
    return json.loads((FIX / name).read_text())


class FakeBudget:
    def __init__(self, n):
        self.n = n
        self.taken = 0

    def take(self, n=1):
        if self.n < n:
            return False
        self.n -= n
        self.taken += n
        return True


def make(handler):
    client = httpx.Client(transport=httpx.MockTransport(handler))
    src = lta.LiveTennisApiSource(client=client, sleep=lambda s: None)
    src._key = "twjp_test"
    return src


def by_id(recs):
    return {r.source_id: r for r in recs}


def test_available_requires_key(monkeypatch):
    monkeypatch.delenv("LIVETENNISAPI_KEY", raising=False)
    s = lta.LiveTennisApiSource()
    assert s.available({}) is False
    assert s.available({"sources": {"livetennisapi": {"key": ""}}}) is False
    assert s.available({"sources": {"livetennisapi": {"key": "twjp_abc"}}}) is True
    monkeypatch.setenv("LIVETENNISAPI_KEY", "twjp_env")
    assert lta.LiveTennisApiSource().available({}) is True
    assert lta.LiveTennisApiSource.key_env == "LIVETENNISAPI_KEY"


def test_parse_upcoming_payload_fields():
    recs = by_id(lta.parse_matches(load("lta_matches_upcoming_p1.json")))
    f = recs["20101"]
    assert (f.source, f.tour, f.level, f.status) == ("livetennisapi", "ATP", "Finals", "scheduled")
    assert (f.p1_name, f.p2_name, f.p1_country, f.p2_country) == ("Arthur Fils", "Alex de Minaur", "FRA", "AUS")
    assert f.surface == "Indoor Hard" and f.date == "2026-11-17T13:00:00Z" and f.round == "Round Robin"
    assert f.p1_source_id == "3301" and f.p1_rank == 18 and f.tournament_id == "1301" and f.sets == []
    assert recs["20102"].p1_country == "ITA"
    wta = recs["20104"]
    assert wta.tour == "WTA" and wta.level == "Grand Slam" and wta.best_of == 3 and wta.p1_country == "BLR"
    assert recs["20107"].tour == "WTA" and recs["20107"].level == "125" and recs["20107"].surface == "Clay"


@pytest.mark.parametrize("tier,tour,level", [
    ("grand_slam", "atp", "Grand Slam"), ("atp_finals", "atp", "Finals"), ("wta_finals", "wta", "Finals"),
    ("next_gen_finals", "atp", "Finals"), ("atp_1000", "atp", "1000"), ("wta_1000", "wta", "1000"),
    ("atp_500", "atp", "500"), ("wta_500", "wta", "500"), ("atp_250", "atp", "250"), ("wta_250", "wta", "250"),
    ("wta_125", "challenger", "125"), ("challenger_175", "challenger", "Challenger"),
    ("challenger_50", "challenger", "Challenger"), ("itf_m15", "itf", "ITF"), ("itf_m25", "itf", "ITF"),
    ("itf_w15", "itf", "ITF"), ("itf_w100", "itf", "ITF"), ("davis_cup", None, "Other"), ("united_cup", None, "Other"),
    ("bjk_cup", None, "Other"), (None, "challenger", "Challenger"), (None, "itf", "ITF"), (None, "atp", "Other"),
    (None, None, "Other"),
])
def test_tier_to_level(tier, tour, level):
    assert lta.tier_to_level(tier, tour) == level


def test_tier_vocabulary_all_land_in_levels():
    from engine.sources.base import LEVELS
    tiers = ("grand_slam atp_finals atp_1000 atp_500 atp_250 next_gen_finals united_cup davis_cup olympics laver_cup "
             "wta_finals wta_elite_trophy wta_1000 wta_500 wta_250 wta_125 bjk_cup challenger_175 challenger_125 "
             "challenger_100 challenger_75 challenger_50 itf_m15 itf_m25 itf_w15 itf_w25 itf_w35 itf_w40 itf_w50 "
             "itf_w60 itf_w75 itf_w80 itf_w100").split()
    assert all(lta.tier_to_level(t) in LEVELS for t in tiers)


def test_tour_gender_mapping_challenger_and_itf():
    recs = by_id(lta.parse_matches(load("lta_matches_upcoming_p1.json")) + lta.parse_matches(load("lta_matches_upcoming_p2.json")))
    assert (recs["20105"].tour, recs["20105"].level) == ("ATP", "Challenger")     # gender men
    assert (recs["20106"].tour, recs["20106"].level) == ("WTA", "ITF")            # itf_w35, gender women
    assert (recs["20107"].tour, recs["20107"].level) == ("WTA", "125")            # wta_125 listed under tour=challenger
    # null tier + null gender: tour group "challenger" -> level, players' tour "atp" -> ATP
    assert (recs["20110"].tour, recs["20110"].level) == ("ATP", "Challenger")
    assert recs["20110"].surface is None
    assert recs["20109"].surface == "Indoor Hard" and recs["20108"].surface == "Hard"


def test_best_of_five_only_for_mens_grand_slam_main_draw():
    recs = by_id(lta.parse_matches(load("lta_matches_upcoming_p1.json")))
    assert recs["20102"].best_of == 5            # men's AO main draw
    assert recs["20103"].best_of == 3            # men's AO qualifying (BO3)
    assert recs["20104"].best_of == 3            # women's AO
    assert recs["20101"].best_of == 3
    assert "Qualifying" in recs["20103"].round


def test_skips_doubles_juniors_and_malformed_items():
    recs = by_id(lta.parse_matches(load("lta_matches_upcoming_p1.json")) + lta.parse_matches(load("lta_matches_upcoming_p2.json")))
    for bad in ("20111", "20112", "20113", "20114"):
        assert bad not in recs
    assert lta.parse_matches({"data": "nope"}) == [] and lta.parse_matches(None) == []
    assert lta.match_to_record("garbage-row") is None
    assert len(recs) == 10


def test_completed_retired_walkover_and_abandoned():
    recs = by_id(lta.parse_matches(load("lta_matches_live.json")))
    fin = recs["20201"]
    assert fin.status == "final" and fin.winner == 2
    assert fin.sets == [[4, 6, None, None], [6, 7, None, None]]       # player-major games -> per-set rows
    ret = recs["20202"]
    assert ret.status == "retired" and ret.winner == 1 and ret.sets == [[6, 2, None, None], [3, 1, None, None]]
    wo = recs["20203"]
    assert wo.status == "walkover" and wo.winner == 2 and wo.sets == []
    assert "20204" not in recs                                         # abandoned: no result asserted
    assert recs["20205"].status == "live" and recs["20205"].winner is None
    assert recs["20206"].winner == 1                                   # derived from sets when `winner` is null
    assert len(recs["20206"].sets) == 3


def test_ioc_to_iso3():
    assert lta.ioc_to_iso3("ned") == "NLD" and lta.ioc_to_iso3("SUI") == "CHE" and lta.ioc_to_iso3("ger") == "DEU"
    assert lta.ioc_to_iso3("usa") == "USA" and lta.ioc_to_iso3(None) is None and lta.ioc_to_iso3("xx") is None


def test_auth_header_and_pagination_for_fixtures():
    seen = []

    def handler(req):
        seen.append(req)
        if req.url.path.endswith("/usage"):
            return httpx.Response(200, json=load("lta_usage.json"))
        off = int(req.url.params.get("offset", "0"))
        return httpx.Response(200, json=load("lta_matches_upcoming_p1.json" if off == 0 else "lta_matches_upcoming_p2.json"))

    src = make(handler)
    b = FakeBudget(100)
    recs = list(src.fetch_fixtures(5, b))
    assert len(recs) == 10 and b.taken == 2
    matches = [r for r in seen if r.url.path.endswith("/matches")]
    assert [r.url.params["offset"] for r in matches] == ["0", "200"]
    p = matches[0].url.params
    assert p["status"] == "upcoming" and p["draw"] == "singles" and p["limit"] == "200"
    assert all(r.headers["X-API-Key"] == "twjp_test" for r in seen)
    assert str(matches[0].url).startswith("https://api.livetennisapi.com/api/public/v1/matches")


def test_budget_exhaustion_stops_fetching():
    calls = []

    def handler(req):
        calls.append(req.url.path)
        return httpx.Response(200, json=load("lta_matches_upcoming_p1.json"))

    src = make(handler)
    b = FakeBudget(1)                   # only the first page is affordable (has_more is True)
    recs = list(src.fetch_fixtures(3, b))
    assert len([c for c in calls if c.endswith("/matches")]) == 1 and len(recs) == 8
    assert src.last_error == "budget exhausted"
    calls.clear()
    assert list(make(handler).fetch_fixtures(3, FakeBudget(0))) == [] and not [c for c in calls if c.endswith("/matches")]


def test_usage_syncs_persisted_budget():
    def handler(req):
        return httpx.Response(200, json=load("lta_usage.json")) if req.url.path.endswith("/usage") else httpx.Response(200, json={"data": [], "meta": {"has_more": False}})

    from engine.sources.state import QuotaBudget, SourceState
    import tempfile
    st = SourceState("livetennisapi", Path(tempfile.mkdtemp()))
    qb = QuotaBudget(st, daily=100)
    src = make(handler)
    assert src.sync_budget(qb) == 63
    assert qb.used_today == 37                                         # calls 37 - errors 2 = 35, 100-63 = 37 wins
    list(src.fetch_fixtures(1, qb))
    assert qb.used_today == 38


def test_retry_on_429_then_success_and_daily_cap_stops():
    n = {"c": 0}

    def handler(req):
        if req.url.path.endswith("/usage"):
            return httpx.Response(404)
        n["c"] += 1
        if n["c"] == 1:
            return httpx.Response(429, headers={"Retry-After": "1"}, json={"error": "rate_limited", "tier": "free"})
        if n["c"] == 2:
            return httpx.Response(503)
        return httpx.Response(200, json=load("lta_matches_live.json"))

    sleeps = []
    src = make(handler)
    src._sleep = sleeps.append
    b = FakeBudget(10)
    res = list(src.fetch_results(datetime.now(timezone.utc).date(), b))
    assert {r.source_id for r in res} == {"20201", "20202", "20203", "20206"}   # finals only, live row excluded
    assert b.taken == 3 and sleeps                                              # each attempt is budgeted

    def day_cap(req):
        return httpx.Response(404) if req.url.path.endswith("/usage") else httpx.Response(429, json={"error": "rate_limited", "scope": "day", "limit_per_day": 100})
    s2 = make(day_cap)
    b2 = FakeBudget(10)
    assert list(s2.fetch_fixtures(2, b2)) == [] and b2.taken == 1               # no retry loop against a spent day


def test_free_plan_has_no_history_past_days_cost_nothing():
    def handler(req):
        raise AssertionError("no request expected")
    src = make(handler)
    b = FakeBudget(100)
    assert list(src.fetch_results(date(2020, 1, 1), b)) == [] and b.taken == 0


def test_history_taste_opt_in_and_403_stops():
    def handler(req):
        if req.url.path.endswith("/usage"):
            return httpx.Response(404)
        return httpx.Response(403, json={"error": "upgrade_required", "free_history_taste": "used"})
    src = make(handler)
    src._opts = {"history_taste": True}
    assert list(src.fetch_results(date(2020, 1, 1), FakeBudget(5))) == []
    assert src._history_exhausted is True


def test_never_raises_on_garbage_and_network_errors():
    def boom(req):
        raise httpx.ConnectError("down")
    assert list(make(boom).fetch_fixtures(2, FakeBudget(10))) == []

    def junk(req):
        return httpx.Response(200, content=b"<html>nope</html>")
    assert list(make(junk).fetch_results(datetime.now(timezone.utc).date(), FakeBudget(10))) == []


def test_fetch_odds_is_empty_and_registry_shape():
    src = lta.SOURCE
    assert list(src.fetch_odds(FakeBudget(1))) == []
    assert src.name == "livetennisapi" and src.daily_quota == 100 and src.per_minute == 30
