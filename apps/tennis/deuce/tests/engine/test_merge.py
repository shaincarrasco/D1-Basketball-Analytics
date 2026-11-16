"""Cross-source dedupe, player identity and database rows."""
from engine import merge
from engine.names import name_key, norm_name, pair_key
from engine.records import flip, from_json, to_json
from engine.sources.base import MatchRecord


def rec(source="espn", sid="1", p1="Arthur Fils", p2="Jannik Sinner", date="2026-11-10T13:00:00Z", status="final",
        winner=1, sets=None, tour="ATP", level="500", **kw):
    sets = [[6, 3, None, None], [6, 4, None, None]] if sets is None else sets
    return MatchRecord(source=source, source_id=sid, tour=tour, level=level, tournament="Paris Masters", date=date,
                       status=status, p1_name=p1, p2_name=p2, winner=winner, sets=sets, **kw)


def test_name_keys():
    assert norm_name("Félix Auger-Aliassime") == "felix auger aliassime"
    assert name_key("Fils Arthur") == name_key("Arthur Fils") == name_key("ARTHUR  FILS")
    assert name_key("Carreño-Busta Pablo") == name_key("Pablo Carreno Busta")
    assert name_key("Łukasz Kubot") == name_key("Lukasz Kubot")
    assert pair_key("ATP", "A B", "C D") == pair_key("ATP", "D C", "B A")


def test_json_roundtrip_and_flip():
    r = rec(sets=[[7, 6, 7, 4], [3, 6, None, None]], winner=2, p1_country="FRA")
    assert from_json(to_json(r)) == r
    f = flip(r)
    assert (f.p1_name, f.winner, f.p1_country, f.sets) == ("Jannik Sinner", 1, None, [[6, 7, 4, 7], [6, 3, None, None]])
    assert flip(f) == r


def test_dedupe_merges_across_sources_and_keeps_every_id():
    a = rec("espn", "10", status="final", court="Court 1", p2_rank=1)
    b = rec("tennisapi", "T9", p1="Jannik Sinner", p2="Arthur Fils", winner=2, date="2026-11-11",
            sets=[[3, 6, None, None], [4, 6, None, None]], round="Round of 16", surface="Indoor Hard", p1_country="ITA")
    res = merge.resolve([b, a])
    assert res.stats["matches"] == 1 and res.stats["merged_across_sources"] == 1
    m = res.matches[0]
    # tennisapi's record has more fields filled, so it wins; espn's court is carried over
    assert m["id"] == "tennisapi-T9" and m["round"] == "Round of 16" and m["court"] == "Court 1"
    assert res.ranks == [("tennisapi-T9", 1, None)]                  # espn had Sinner (its p2) at rank 1: flipped over
    assert {(s, i) for _, s, i in res.sources} == {("espn", "10"), ("tennisapi", "T9")}
    assert len(res.players) == 2 and {p["id"] for p in res.players} == {m["p1_id"], m["p2_id"]}
    assert res.tournaments[0]["surface"] == "Indoor Hard" and res.tournaments[0]["surface_inferred"] == 0
    sinner = next(p for p in res.players if p["name"] == "Jannik Sinner")
    assert sinner["country"] == "ITA"
    assert m["winner_id"] == next(p["id"] for p in res.players if p["name"] == "Arthur Fils")


def test_most_complete_record_wins_and_same_source_never_merges():
    live = rec("livetennisapi", "L1", status="scheduled", winner=None, sets=[])
    done = rec("tennisapi", "T1")
    res = merge.resolve([live, done])
    assert res.matches[0]["status"] == "final" and res.matches[0]["id"] == "tennisapi-T1"
    twice = merge.resolve([rec("espn", "1"), rec("espn", "2", date="2026-11-10T20:00:00Z")])
    assert twice.stats["matches"] == 2                               # same source: two matches, not one
    far = merge.resolve([rec("espn", "1"), rec("tennisapi", "2", date="2026-11-13")])
    assert far.stats["matches"] == 2                                 # more than a day apart


def test_player_identity_by_key_and_country():
    x = rec("espn", "1", p1="Wang Yu", p2="Li Na", p1_country="China", p1_source_id="101", p2_source_id="102")
    y = rec("tennisapi", "7", p1="Yu Wang", p2="Mary Smith", date="2026-11-20", winner=2, p1_country="CHN")
    z = rec("tennisapi", "8", p1="Yu Wang", p2="Mary Smith", date="2026-11-22", winner=1, p1_country="TPE")
    res = merge.resolve([x, y, z])
    names = [p for p in res.players if name_key(p["name"]) == "wang yu"]
    assert len(names) == 2                                           # CHN merged with espn's China; TPE is another Wang Yu
    assert any(p["id"] == "espn:101" for p in names)


def test_rows_for_schema():
    r = rec("espn", "5", status="retired", winner=1, sets=[[6, 3, None, None], [2, 1, None, None]], court="Court 1",
            p1_rank=18, p2_rank=1, tournament_id="77-atp", surface="Hard", surface_inferred=False, location="Paris, France")
    res = merge.resolve([r])
    m = res.matches[0]
    assert m["score"] == "6-3 2-1 ret." and m["tournament_id"] == "77-atp" and m["court"] == "Court 1"
    assert res.ranks == [("5", 18, 1)] and res.tournaments[0]["country"] == "France"
    # unfinished match without a winner is fine; finished without one is dropped
    sched = rec("espn", "6", status="scheduled", winner=None, sets=[], date="2026-11-20T10:00:00Z", p1="A B", p2="C D")
    bad = rec("espn", "7", winner=None, p1="E F", p2="G H")
    out = merge.resolve([sched, bad])
    assert [m["id"] for m in out.matches] == ["6"] and out.matches[0]["score"] is None


def test_level_guess_for_challenger_and_itf():
    from engine.surfaces import guess_level
    assert guess_level("Brisbane Challenger", "ATP") == "Challenger" and guess_level("Challenger 125 Lyon", "ATP") == "Challenger"
    assert guess_level("ITF M25 Antalya", "ATP") == "ITF" and guess_level("W100 Foo Open", "WTA") == "ITF"
    assert guess_level("Madrid Open", "ATP") == "250" and guess_level("Cleveland 125", "WTA") == "125"
