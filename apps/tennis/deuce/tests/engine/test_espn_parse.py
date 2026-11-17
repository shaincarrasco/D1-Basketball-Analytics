from engine import espn


def comp(cid, status, state, note, c1, c2, rnd="Round 1", date="2026-01-15T10:00Z"):
    def mk(order, d):
        return {"id": d["id"], "order": order, "winner": d.get("winner", False), "linescores": d.get("ls", []),
                "athlete": {"displayName": d["name"], "flag": {"alt": d.get("c", "USA")}}, **({"curatedRank": {"current": d["rank"]}} if "rank" in d else {})}
    return {"id": cid, "date": date, "status": {"type": {"name": status, "state": state}},
            "notes": [{"text": note}], "round": {"displayName": rnd}, "venue": {"fullName": "Auckland, New Zealand", "court": "Centre Court"},
            "competitors": [mk(2, c2), mk(1, c1)]}  # ESPN lists order 2 first


def payload(groupings):
    return {"events": [{"id": "925-2026", "name": "ASB Classic", "date": "2026-01-02T05:00Z", "endDate": "2026-01-17T04:59Z",
                        "season": {"year": 2026}, "venue": {"displayName": "Auckland, New Zealand"}, "groupings": groupings}]}


def grp(name, comps):
    return {"grouping": {"displayName": name}, "competitions": comps}


def test_tiebreak_score_and_sets():
    c = comp("1", "STATUS_FINAL", "post", "A (USA) bt B (ESP) 7-6 (7-5) 3-6 6-4",
             {"id": "10", "name": "A", "winner": True, "ls": [{"value": 7, "tiebreak": 7}, {"value": 3}, {"value": 6}]},
             {"id": "11", "name": "B", "ls": [{"value": 6, "tiebreak": 5}, {"value": 6}, {"value": 4}]})
    ms, ts = espn.parse_scoreboard(payload([grp("Men's Singles", [c])]))
    m = ms[0]
    assert m["p1_id"] == "10" and m["p2_id"] == "11"  # order 1 first even though ESPN lists order 2 first
    assert m["score"] == "7-6(5) 3-6 6-4"
    assert m["sets_json"] == "[[7, 6, 7, 5], [3, 6, null, null], [6, 4, null, null]]"
    assert m["status"] == "final" and m["winner_id"] == "10" and m["best_of"] == 3
    assert list(ts.values())[0]["surface"] == "Hard" and ts and m["tournament_id"] == "925-2026-atp"


def test_retirement_and_walkover():
    ret = comp("2", "STATUS_RETIRED", "post", "A (USA) bt B (ESP) 6-3 2-1 ret",
               {"id": "10", "name": "A", "winner": True, "ls": [{"value": 6}, {"value": 2}]},
               {"id": "11", "name": "B", "ls": [{"value": 3}, {"value": 1}]})
    wo = comp("3", "STATUS_WALKOVER", "post", "A (USA) bt B (ESP) w/o",
              {"id": "10", "name": "A", "winner": True}, {"id": "11", "name": "B"})
    final_but_noted = comp("4", "STATUS_FINAL", "post", "A (USA) bt B (ESP) 6-0 1-0 ret.",
                           {"id": "10", "name": "A", "winner": True, "ls": [{"value": 6}, {"value": 1}]},
                           {"id": "11", "name": "B", "ls": [{"value": 0}, {"value": 0}]})
    ms, _ = espn.parse_scoreboard(payload([grp("Women's Singles", [ret, wo, final_but_noted])]))
    by = {m["id"]: m for m in ms}
    assert by["2"]["status"] == "retired" and by["2"]["score"] == "6-3 2-1 ret."
    assert by["3"]["status"] == "walkover" and by["3"]["score"] == "w/o" and by["3"]["sets_json"] is None
    assert by["4"]["status"] == "retired"
    assert by["2"]["tour"] == "WTA"


def test_skips_doubles_mixed_tbd_and_scheduled_live():
    dbl = comp("5", "STATUS_FINAL", "post", "x", {"id": "1", "name": "A", "winner": True}, {"id": "2", "name": "B"})
    dbl["competitors"][0].pop("athlete")
    tbd = comp("6", "STATUS_SCHEDULED", "pre", "", {"id": "10", "name": "TBD"}, {"id": "11", "name": "B"})
    sched = comp("7", "STATUS_SCHEDULED", "pre", "", {"id": "10", "name": "A", "rank": 3}, {"id": "11", "name": "B"})
    live = comp("8", "STATUS_IN_PROGRESS", "in", "", {"id": "10", "name": "A", "ls": [{"value": 4}]}, {"id": "11", "name": "B", "ls": [{"value": 2}]})
    cancelled = comp("9", "STATUS_CANCELED", "post", "", {"id": "10", "name": "A"}, {"id": "11", "name": "B"})
    p = payload([grp("Men's Doubles", [dbl]), grp("Mixed Doubles", [dbl]), grp("Men's Singles", [tbd, sched, live, cancelled])])
    ms, _ = espn.parse_scoreboard(p)
    assert sorted(m["id"] for m in ms) == ["7", "8"]
    by = {m["id"]: m for m in ms}
    assert by["7"]["status"] == "scheduled" and by["7"]["score"] is None and by["7"]["ranks"] == (3, None)
    assert by["8"]["status"] == "live" and by["8"]["score"] == "4-2"


def test_best_of_grand_slam_rules():
    assert espn.best_of_for("ATP", "Grand Slam", "Round 2", []) == 5
    assert espn.best_of_for("ATP", "Grand Slam", "Qualifying 1st Round", []) == 3
    assert espn.best_of_for("WTA", "Grand Slam", "Final", []) == 3
    assert espn.best_of_for("ATP", "500", "Final", []) == 3


def test_date_walk_refreshes_recent_only():
    from datetime import date
    walk = dict(espn.date_walk(date(2023, 1, 1), date(2026, 11, 16)))
    assert walk[date(2023, 1, 1)] is False
    assert walk[date(2026, 11, 20)] is True and walk[date(2026, 11, 23)] is True
    assert max(walk) == date(2026, 11, 23)


def test_old_cache_refetched_when_unfinished_or_written_early():
    import time
    from datetime import date, datetime, timezone
    d = date(2025, 3, 3)
    day_end = datetime(2025, 3, 4, tzinfo=timezone.utc).timestamp()

    def pl(state, when="2025-03-05T10:00Z"):
        return {"events": [{"groupings": [{"competitions": [{"status": {"type": {"state": state}}, "date": when}]}]}]}

    # fetched long after the day, everything final -> keep
    assert not espn._needs_refetch(pl("post"), d, day_end + 30 * 86400)
    # fetched before the day ended -> refetch even though all final
    assert espn._needs_refetch(pl("post"), d, day_end - 3600)
    # cached while a later match was still scheduled, fetched before that match's day finished -> refetch
    assert espn._needs_refetch(pl("pre"), d, datetime(2025, 3, 5, 8, tzinfo=timezone.utc).timestamp())
    # a permanently non-final match is not re-fetched forever once the cache is newer than its day + 1
    assert not espn._needs_refetch(pl("pre"), d, datetime(2025, 3, 10, tzinfo=timezone.utc).timestamp())
    assert time.time() > day_end
