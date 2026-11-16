"""Tennis API (RapidAPI) source: results/fixtures parsing, rank -> level, budget, retries. No network."""
import json
import zlib
from datetime import date
from pathlib import Path

import httpx
import pytest

from engine.sources import tennisapi as ta

FIX = Path(__file__).parent / "fixtures"


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
    src = ta.TennisApiSource(client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda s: None)
    src._key = "rk_test"
    return src


def results_handler(req):
    tour = req.url.path.split("/")[3]
    return httpx.Response(200, json=load(f"ta_results_{tour}.json"))


def by_pair(recs):
    return {frozenset((r.p1_name, r.p2_name)): r for r in recs}


def test_available_requires_key(monkeypatch):
    monkeypatch.delenv("RAPIDAPI_KEY", raising=False)
    assert ta.TennisApiSource().available({}) is False
    assert ta.TennisApiSource().available({"sources": {"tennisapi": {"key": "abc"}}}) is True
    monkeypatch.setenv("RAPIDAPI_KEY", "env")
    assert ta.TennisApiSource().available({}) is True
    assert ta.TennisApiSource.key_env == "RAPIDAPI_KEY"


def test_endpoint_headers_and_two_requests_per_day():
    seen = []

    def handler(req):
        seen.append(req)
        return results_handler(req)

    src = make(handler)
    b = FakeBudget(50)
    recs = list(src.fetch_results(date(2026, 11, 15), b))
    assert b.taken == 2 and src.last_complete is True
    assert [r.url.path for r in seen] == ["/tennis/v2/atp/results/2026-11-15", "/tennis/v2/wta/results/2026-11-15"]
    for r in seen:
        assert r.headers["X-RapidAPI-Key"] == "rk_test"
        assert r.headers["X-RapidAPI-Host"] == "tennis-api-atp-wta-itf.p.rapidapi.com"
        assert r.url.host == "tennis-api-atp-wta-itf.p.rapidapi.com"
        assert r.url.params["filter"] == "PlayerGroup:singles" and r.url.params["pageSize"] == "500"
    assert len(recs) == 9    # 6 valid atp rows (doubles + 2 malformed dropped) + 3 wta


def test_parse_final_with_tiebreak_country_surface_level():
    recs = by_pair(list(make(results_handler).fetch_results(date(2026, 11, 15), FakeBudget(5))))
    r = recs[frozenset(("Arthur Fils", "Alex de Minaur"))]
    assert r.status == "final" and r.tour == "ATP" and r.level == "Finals" and r.surface == "Indoor Hard"
    assert r.source == "tennisapi" and r.date == "2026-11-15T13:30:00.000Z" and r.round == "Semifinals"
    assert r.tournament == "Nitto ATP Finals" and r.tournament_id == "7001"
    # player1 in the payload is the winner (Fils); the stored winner slot matches whichever side Fils landed on
    fils_first = r.p1_name == "Arthur Fils"
    assert r.winner == (1 if fils_first else 2)
    assert (r.p1_country, r.p2_country) == (("FRA", "AUS") if fils_first else ("AUS", "FRA"))
    exp = [[6, 3, None, None], [7, 6, 7, 5]]
    assert r.sets == (exp if fils_first else [[s[1], s[0], s[3], s[2]] for s in exp])
    assert r.best_of == 3


def test_players_are_swapped_by_stable_hash_not_always_winner_first():
    recs = list(make(results_handler).fetch_results(date(2026, 11, 15), FakeBudget(5)))
    assert {r.winner for r in recs} == {1, 2}
    for r in recs:                       # deterministic: stable id decides the swap
        assert (zlib.crc32(r.source_id.encode()) & 1 == 1) == (r.winner == 2)


def test_source_id_is_stable_composite_not_renumbered_match_id():
    recs = by_pair(list(make(results_handler).fetch_results(date(2026, 11, 15), FakeBudget(5))))
    assert recs[frozenset(("Arthur Fils", "Alex de Minaur"))].source_id == "3301-3302-7001-10"


def test_grand_slam_best_of_five_men_only_and_tiebreak_variants():
    recs = by_pair(list(make(results_handler).fetch_results(date(2026, 11, 15), FakeBudget(5))))
    sinner = recs[frozenset(("Jannik Sinner", "Marcos Giron"))]
    assert sinner.level == "Grand Slam" and sinner.best_of == 5 and sinner.surface == "Hard"
    assert sinner.round == "1st Round"
    third = [s for s in sinner.sets][2]
    assert sorted(third[:2]) == [6, 7] and sorted(x for x in third[2:]) == [9, 11]    # "(11-9)" form
    sab = recs[frozenset(("Aryna Sabalenka", "Elena Rybakina"))]
    assert sab.tour == "WTA" and sab.level == "Grand Slam" and sab.best_of == 3 and sab.round == "Final"


def test_parse_result_strings():
    assert ta.parse_result("6-3 6-4") == [[6, 3, None, None], [6, 4, None, None]]
    assert ta.parse_result("6-7(5) 6-3 6-2") == [[6, 7, 5, 7], [6, 3, None, None], [6, 2, None, None]]
    assert ta.parse_result("7-6(10)") == [[7, 6, 12, 10]]
    assert ta.parse_result("w/o") == [] and ta.parse_result(None) == [] and ta.parse_result("") == []
    assert ta.parse_result("6-4 3-2 ret.") == [[6, 4, None, None], [3, 2, None, None]]


@pytest.mark.parametrize("rank,name,tour,level", [
    (0, "M15 Monastir", "ATP", "ITF"), (1, "Hangzhou Challenger", "ATP", "Challenger"),
    (1, "Bergamo 125", "WTA", "125"), (1, "W35 Nanao", "WTA", "ITF"), (1, "Bergamo", "ATP", "Challenger"),
    (1, "Somewhere", "WTA", "ITF"), (2, "Winston-Salem Open", "ATP", "250"),
    (3, "Paris Masters", "ATP", "1000"), (4, "Australian Open", "ATP", "Grand Slam"), (5, "Davis Cup", "ATP", "Other"),
    (7, "Nitto ATP Finals", "ATP", "Finals"), (None, "Unknown Event", "ATP", "Other"), ("3", "X", "WTA", "1000"),
])
def test_rank_to_level(rank, name, tour, level):
    assert ta.rank_to_level(rank, name, tour) == level


def test_level_always_valid():
    from engine.sources.base import LEVELS
    for rid in (0, 1, 2, 3, 4, 5, 7, 9, 12, None, "x"):
        assert ta.rank_to_level(rid, "Some Open", "ATP") in LEVELS


def test_retired_walkover_handling():
    recs = by_pair(list(make(results_handler).fetch_results(date(2026, 11, 15), FakeBudget(5))))
    ret = recs[frozenset(("Yuta Shimizu", "Kaichi Uchida"))]
    assert ret.status == "retired" and ret.level == "Challenger" and len(ret.sets) == 2 and ret.best_of == 3
    wo = recs[frozenset(("Pol Martin Tiffon", "Daniel Rincon"))]
    assert wo.status == "walkover" and wo.sets == [] and wo.winner in (1, 2)
    winner_name = wo.p1_name if wo.winner == 1 else wo.p2_name
    assert winner_name == "Pol Martin Tiffon"


def test_itf_and_wta_levels_in_results():
    recs = by_pair(list(make(results_handler).fetch_results(date(2026, 11, 15), FakeBudget(5))))
    assert recs[frozenset(("Luca Preti", "Mark Hubert"))].level == "ITF"
    assert recs[frozenset(("Haruna Arakawa", "Hiromi Abe"))].level == "ITF"
    assert recs[frozenset(("Haruna Arakawa", "Hiromi Abe"))].tour == "WTA"
    assert recs[frozenset(("Lucia Bronzetti", "Elina Avanesyan"))].level == "125"
    assert recs[frozenset(("Jan-Lennard Struff", "Stan Wawrinka"))].level in ("250", "500")


def test_doubles_and_malformed_rows_skipped():
    recs = list(make(results_handler).fetch_results(date(2026, 11, 15), FakeBudget(5)))
    assert not any("/" in r.p1_name or "/" in r.p2_name for r in recs)
    assert ta.result_to_record("garbage", "ATP") is None and ta.result_to_record({"player1": None}, "ATP") is None
    assert ta.result_to_record({"player1": {"name": "A"}, "player2": {"name": "B"}}, "ATP") is None   # no date


def test_budget_exhaustion_stops_after_first_tour():
    seen = []

    def handler(req):
        seen.append(req.url.path)
        return results_handler(req)

    src = make(handler)
    b = FakeBudget(1)
    recs = list(src.fetch_results(date(2026, 11, 15), b))
    assert seen == ["/tennis/v2/atp/results/2026-11-15"] and len(recs) == 6 and all(r.tour == "ATP" for r in recs)
    assert src.last_complete is False and src.last_error == "budget exhausted"
    seen.clear()
    assert list(make(handler).fetch_results(date(2026, 11, 15), FakeBudget(0))) == [] and not seen


def test_pagination_follows_hasNextPage():
    def handler(req):
        page = int(req.url.params["pageNo"])
        body = load("ta_results_atp.json") if "atp" in req.url.path else {"data": [], "hasNextPage": False}
        body["hasNextPage"] = page == 1 and "atp" in req.url.path
        return httpx.Response(200, json=body)

    b = FakeBudget(50)
    list(make(handler).fetch_results(date(2026, 11, 15), b))
    assert b.taken == 3                        # atp page 1 + atp page 2 + wta page 1


def test_retry_429_5xx_and_plan_restricted():
    n = {"c": 0}

    def handler(req):
        n["c"] += 1
        if n["c"] == 1:
            return httpx.Response(429, json={"message": "Too many requests"})
        if n["c"] == 2:
            return httpx.Response(502)
        return results_handler(req)

    sleeps = []
    src = make(handler)
    src._sleep = sleeps.append
    b = FakeBudget(50)
    recs = list(src.fetch_results(date(2026, 11, 15), b))
    assert len(recs) == 9 and b.taken == 4 and len(sleeps) == 2

    def restricted(req):
        return httpx.Response(403, json=load("ta_plan_restricted.json"))
    b2 = FakeBudget(50)
    s2 = make(restricted)
    assert list(s2.fetch_results(date(2026, 11, 15), b2)) == [] and b2.taken == 1 and s2.last_complete is False

    b3 = FakeBudget(50)
    assert list(make(lambda r: httpx.Response(429)).fetch_results(date(2026, 11, 15), b3)) == [] and b3.taken == 3


def test_network_error_and_bad_json_never_raise():
    def boom(req):
        raise httpx.ReadTimeout("slow")
    assert list(make(boom).fetch_results(date(2026, 11, 15), FakeBudget(50))) == []
    assert list(make(lambda r: httpx.Response(200, content=b"nope")).fetch_results(date(2026, 11, 15), FakeBudget(50))) == []


def test_fixtures_off_by_default_and_parse_when_enabled():
    src = make(lambda r: (_ for _ in ()).throw(AssertionError("no call expected")))
    assert list(src.fetch_fixtures(3, FakeBudget(5))) == []

    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json=load("ta_fixtures_atp.json") if "/atp/" in req.url.path else {"data": [], "hasNextPage": False})

    src = make(handler)
    src._opts = {"fixtures": True}
    recs = list(src.fetch_fixtures(5, FakeBudget(10)))
    assert len(recs) == 2 and recs[0].status == "scheduled" and recs[1].status == "live"
    r = recs[0]
    assert (r.p1_name, r.p2_name, r.p1_country, r.level, r.surface, r.round) == ("Ugo Humbert", "Lorenzo Musetti", "FRA", "1000", "Indoor Hard", "Quarterfinals")
    assert "/fixtures/" in seen[0].url.path and seen[0].url.params["include"].startswith("round,tournament")
