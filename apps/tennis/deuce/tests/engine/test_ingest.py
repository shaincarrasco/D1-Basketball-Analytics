"""Generic ingest loop with fake sources: fixtures, recent results, quota-bound resumable backfill, odds."""
from datetime import date, datetime, timedelta, timezone

from engine import cache as cache_mod
from engine import ingest
from engine.db import connect
from engine.sources.base import MatchRecord, OddsRecord

TODAY = date(2026, 11, 16)


def mk(source, sid, day, status="final", p1="Alpha One", p2="Beta Two", tour="ATP", level="Challenger"):
    return MatchRecord(source=source, source_id=sid, tour=tour, level=level, tournament="Challenger Foo",
                       date=f"{day}T10:00:00Z", status=status, p1_name=p1, p2_name=p2,
                       winner=1 if status == "final" else None, sets=[[6, 1, None, None]] if status == "final" else [])


class Fake:
    key_env = None

    def __init__(self, name, per_day=None, odds=None):
        self.name, self.calls, self.per_day, self._odds = name, [], per_day or {}, odds or []

    def available(self, cfg):
        return True

    def fetch_fixtures(self, days, budget):
        budget.take()
        t = (datetime.now(timezone.utc) + timedelta(hours=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
        return [mk(self.name, "fx", t[:10], status="scheduled", p1="Gamma Three", p2="Delta Four")]

    def fetch_results(self, day, budget):
        self.calls.append(day)
        if not budget.take():
            return []
        return [mk(self.name, f"r{day}", day.isoformat(), p1=f"Pl{day.day} X", p2=f"Pl{day.day} Y")] if day in self.per_day or True else []

    def fetch_odds(self, budget):
        return self._odds


def cfg_for(name, **q):
    return {"sources": {name: q}, "ingest": {"fixture_days": 3, "max_seconds": 60, "floor": "2026-11-01"}}


def test_fixtures_recent_results_and_backfill_resume(tmp_path):
    conn = connect(":memory:")
    cache = cache_mod.MatchCache(tmp_path / "m")
    src = Fake("fake")
    cfg = cfg_for("fake", daily_quota=7, backfill=True)
    s = ingest.run(conn, cfg, sources=[src], cache=cache, today=TODAY, verbose=False, state_root=tmp_path / "st", fixtures_root=tmp_path / "fx")
    # quota 7 = 1 fixtures call + 2 recent days + 4 backfill days (newest first, from yesterday-1)
    assert src.calls[:2] == [TODAY - timedelta(days=1), TODAY]
    assert src.calls[2:6] == [TODAY - timedelta(days=k) for k in (2, 3, 4, 5)]
    assert s["sources"]["fake"]["backfill_days"] == 4 and s["sources"]["fake"]["fixtures"] == 1
    assert conn.execute("SELECT COUNT(*) FROM matches WHERE status='final'").fetchone()[0] == 6
    assert conn.execute("SELECT COUNT(*) FROM matches WHERE status='scheduled'").fetchone()[0] == 1
    assert conn.execute("SELECT level FROM tournaments LIMIT 1").fetchone()[0] == "Challenger"
    assert len(cache) == 6                                       # fixtures are not cached
    # next run (new day, fresh daily quota) resumes at the cursor, not from the top
    src2 = Fake("fake")
    ingest.run(conn, cfg, sources=[src2], cache=cache, today=TODAY + timedelta(days=1), verbose=False,
               state_root=tmp_path / "st", fixtures_root=tmp_path / "fx")
    assert (TODAY - timedelta(days=6)) in src2.calls and (TODAY - timedelta(days=3)) not in src2.calls[3:]


def test_backfill_stops_at_floor_and_marks_done(tmp_path):
    conn = connect(":memory:")
    src = Fake("fake")
    cfg = cfg_for("fake", backfill=True)
    cfg["ingest"]["floor"] = "2026-11-12"
    ingest.run(conn, cfg, sources=[src], cache=cache_mod.MatchCache(tmp_path / "m"), today=TODAY, verbose=False,
               state_root=tmp_path / "st", fixtures_root=tmp_path / "fx")
    from engine.sources.state import SourceState
    st = SourceState("fake", tmp_path / "st")
    assert st.backfill_done and min(src.calls) == date(2026, 11, 12)


def test_broken_source_does_not_stop_others(tmp_path):
    class Boom(Fake):
        def fetch_fixtures(self, days, budget):
            raise RuntimeError("boom")

        def fetch_results(self, day, budget):
            raise RuntimeError("boom")

    conn = connect(":memory:")
    s = ingest.run(conn, cfg_for("ok"), sources=[Boom("boom"), Fake("ok")], cache=cache_mod.MatchCache(tmp_path / "m"),
                   today=TODAY, verbose=False, state_root=tmp_path / "st", fixtures_root=tmp_path / "fx")
    assert s["errors"] and conn.execute("SELECT COUNT(*) FROM matches").fetchone()[0] >= 2


def test_two_sources_same_match_become_one_with_both_ids(tmp_path):
    conn = connect(":memory:")

    class Same(Fake):
        def fetch_results(self, day, budget):
            return [mk(self.name, f"x{self.name}", "2026-11-16", p1="Alpha One", p2="Beta Two")] if day == TODAY else []

    ingest.run(conn, cfg_for("a"), sources=[Same("a"), Same("b")], cache=cache_mod.MatchCache(tmp_path / "m"),
               today=TODAY, verbose=False, state_root=tmp_path / "st", fixtures_root=tmp_path / "fx")
    n = conn.execute("SELECT COUNT(*) FROM matches WHERE status='final'").fetchone()[0]
    assert n == 1 and conn.execute("SELECT COUNT(*) FROM match_sources").fetchone()[0] >= 2


def test_odds_records_stored_and_applied(tmp_path, monkeypatch):
    from engine import odds_history as oh
    monkeypatch.setattr(oh, "RECORDS_DIR", tmp_path / "rec")
    conn = connect(":memory:")
    cache = cache_mod.MatchCache(tmp_path / "m")
    odds = [OddsRecord(source="fake", date="2026-11-16T10:00:00Z", tour="ATP", p1_name="Two Beta", p2_name="One Alpha",
                       book="pinnacle", p1_odds=2.5, p2_odds=1.55, fetched_at="2026-11-16T09:00:00Z")]
    src = Fake("fake", odds=odds)
    src.fetch_results = lambda day, budget: [mk("fake", "m1", "2026-11-16")] if day == TODAY else []
    s = ingest.run(conn, cfg_for("fake"), sources=[src], cache=cache, today=TODAY, verbose=False,
                   state_root=tmp_path / "st", fixtures_root=tmp_path / "fx")
    assert s["sources"]["fake"]["odds_records"] == 1
    res = oh.apply_odds_records(conn, tmp_path / "rec")
    assert res == {"fake": 1}
    row = conn.execute("SELECT p1_odds, p2_odds FROM odds").fetchone()
    assert tuple(row) == (1.55, 2.5)                              # flipped into the match's own orientation


# ----------------------------------------------------------------------------- review fixes
from engine import fixtures as fx_mod  # noqa: E402
from engine.sources.state import SourceState  # noqa: E402


def run_ing(tmp_path, src, cfg, today=TODAY, **kw):
    conn = kw.pop("conn", None) or connect(":memory:")
    cache = kw.pop("cache", None) or cache_mod.MatchCache(tmp_path / "m")
    s = ingest.run(conn, cfg, sources=[src], cache=cache, today=today, verbose=False, state_root=tmp_path / "st",
                   fixtures_root=tmp_path / "fx", **kw)
    return s, conn, cache


class Flaky(Fake):
    """Reads some days only partially (like a quota or network failure mid-day)."""

    def __init__(self, name, partial=(), auth=()):
        super().__init__(name)
        self.partial, self.auth, self.last_complete, self.last_error = set(partial), set(auth), True, None

    def fetch_results(self, day, budget):
        self.calls.append(day)
        self.last_complete, self.last_error = True, None
        if day in self.auth:
            self.last_error = "HTTP 403: plan_restricted"
            return []
        if day in self.partial:
            self.last_complete = False
            self.last_error = "network error"
        budget.take()
        return [mk(self.name, f"r{day}", day.isoformat(), p1=f"Pl{day.day} X", p2=f"Pl{day.day} Y")]


def test_partial_day_keeps_records_but_not_the_cursor(tmp_path):
    src = Flaky("fl", partial=[TODAY - timedelta(days=3)])
    cfg = cfg_for("fl", backfill=True)
    s, conn, cache = run_ing(tmp_path, src, cfg)
    st = SourceState("fl", tmp_path / "st")
    assert st.backfill_cursor == TODAY - timedelta(days=3)         # days 2 done, day 3 partial: retried next run
    assert any(r.source_id == f"r{TODAY - timedelta(days=3)}" for r in cache.records.values())   # rows kept anyway
    assert src.calls[-1] == TODAY - timedelta(days=3)               # and the loop stopped there


def test_auth_failure_stops_backfill_and_is_recorded(tmp_path):
    src = Flaky("fl", auth=[TODAY - timedelta(days=2)])
    s, conn, cache = run_ing(tmp_path, src, cfg_for("fl", backfill=True))
    st = SourceState("fl", tmp_path / "st")
    assert st.data["backfill_blocked"]["date"] == TODAY.isoformat() and "403" in st.data["backfill_blocked"]["error"]
    n = len(src.calls)
    # same day again: not retried; a later day tries once more
    src2 = Flaky("fl", auth=[TODAY - timedelta(days=2)])
    run_ing(tmp_path, src2, cfg_for("fl", backfill=True), cache=cache)
    assert TODAY - timedelta(days=2) not in src2.calls
    src3 = Flaky("fl")
    run_ing(tmp_path, src3, cfg_for("fl", backfill=True), today=TODAY + timedelta(days=1), cache=cache)
    assert TODAY - timedelta(days=2) in src3.calls


def test_cache_saved_before_cursor_state(tmp_path, monkeypatch):
    order = []
    real_save, real_state = cache_mod.MatchCache.save, SourceState.save
    monkeypatch.setattr(cache_mod.MatchCache, "save", lambda self: (order.append("cache"), real_save(self))[1])
    monkeypatch.setattr(SourceState, "save", lambda self: (order.append("state"), real_state(self))[1])
    run_ing(tmp_path, Fake("fk"), cfg_for("fk", backfill=True, daily_quota=6))
    assert "state" in order
    for i, o in enumerate(order):
        if o == "state":
            assert order[i - 1] == "cache"                          # a state write is always preceded by a cache write


def test_hourly_mode_is_light_and_gap_limited(tmp_path):
    class Odds(Fake):
        odds_calls = 0

        def fetch_odds(self, budget):
            Odds.odds_calls += 1
            return []

    src = Odds("hr")
    cfg = cfg_for("hr", backfill=True, backfill_cap_hourly=1, backfill_cap_full=3, hourly_gap_min=60)
    s, conn, cache = run_ing(tmp_path, src, cfg, mode="hourly")
    assert s["mode"] == "hourly" and s["sources"]["hr"]["backfill_days"] == 1 and Odds.odds_calls == 0
    again, *_ = run_ing(tmp_path, Odds("hr"), cfg, mode="hourly", cache=cache)
    assert "skipped" in again["sources"]["hr"]                      # fetched a moment ago: no calls this hour
    full, *_ = run_ing(tmp_path, Odds("hr"), cfg, mode="full", cache=cache)
    assert full["sources"]["hr"]["backfill_days"] == 3 and Odds.odds_calls == 1


def test_backfill_leaves_a_reserve(tmp_path):
    src = Fake("rs")
    s, *_ = run_ing(tmp_path, src, cfg_for("rs", backfill=True, daily_quota=10, backfill_reserve=6))
    # 1 fixtures + 2 recent days = 3 used; backfill may only run while more than 6 remain: 7 -> one day, then pause
    assert s["sources"]["rs"]["backfill_days"] == 1 and "backfill_paused" in s["sources"]["rs"]


def test_fixtures_survive_a_spent_quota_and_hourly_window_merges(tmp_path):
    class Fx(Fake):
        def __init__(self, name, items):
            super().__init__(name)
            self.items = items

        def fetch_fixtures(self, days, budget):
            return self.items

    far = (datetime.now(timezone.utc) + timedelta(days=5)).strftime("%Y-%m-%d")
    near = (datetime.now(timezone.utc) + timedelta(hours=3)).strftime("%Y-%m-%d")
    full_src = Fx("fx", [mk("fx", "far", far, status="scheduled", p1="Far A", p2="Far B"),
                         mk("fx", "near", near, status="scheduled", p1="Near A", p2="Near B")])
    run_ing(tmp_path, full_src, cfg_for("fx"), today=datetime.now(timezone.utc).date(), mode="full")
    assert {r.source_id for r in fx_mod.load("fx", tmp_path / "fx")} == {"far", "near"}
    # hourly run: only today..tomorrow fetched; the 5-day-out fixture is kept from the snapshot
    hourly_src = Fx("fx", [mk("fx", "near", near, status="scheduled", p1="Near A", p2="Near B")])
    s, conn, _ = run_ing(tmp_path, hourly_src, cfg_for("fx"), today=datetime.now(timezone.utc).date(), mode="hourly")
    assert conn.execute("SELECT COUNT(*) FROM matches WHERE status='scheduled'").fetchone()[0] == 2
    # quota spent / source down: nothing fetched, snapshot still used
    s, conn, _ = run_ing(tmp_path, Fx("fx", []), cfg_for("fx"), today=datetime.now(timezone.utc).date(), mode="full")
    assert conn.execute("SELECT COUNT(*) FROM matches WHERE status='scheduled'").fetchone()[0] == 2


def test_odds_store_failure_is_contained(tmp_path, monkeypatch):
    from engine import odds_history as oh
    monkeypatch.setattr(oh, "store_odds_records", lambda *a, **k: (_ for _ in ()).throw(OSError("disk full")))
    odds = [OddsRecord(source="od", date="2026-11-16T10:00:00Z", tour="ATP", p1_name="A", p2_name="B", book="x",
                       p1_odds=2.0, p2_odds=1.8, fetched_at="2026-11-16T09:00:00Z")]
    s, *_ = run_ing(tmp_path, Fake("od", odds=odds), cfg_for("od"), mode="full")
    assert any("odds store" in e for e in s["errors"])


def test_corrupt_cache_file_is_quarantined_not_fatal(tmp_path):
    c = cache_mod.MatchCache(tmp_path)
    c.add([mk("espn", "1", "2026-11-10"), mk("espn", "2", "2026-10-10")])
    c.save()
    bad = tmp_path / "atp" / "2026-10.jsonl.gz"
    bad.write_bytes(bad.read_bytes()[:20])                          # truncated gzip
    c2 = cache_mod.MatchCache(tmp_path)
    assert len(c2) == 1 and c2.quarantined == ["2026-10.jsonl.gz"] and (tmp_path / "atp" / "2026-10.jsonl.gz.bad").exists()
    assert not list(tmp_path.glob("**/*.tmp"))                      # atomic writes leave no temp files
