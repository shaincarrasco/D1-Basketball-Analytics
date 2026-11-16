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
    s = ingest.run(conn, cfg, sources=[src], cache=cache, today=TODAY, verbose=False, state_root=tmp_path / "st")
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
               state_root=tmp_path / "st")
    assert (TODAY - timedelta(days=6)) in src2.calls and (TODAY - timedelta(days=3)) not in src2.calls[3:]


def test_backfill_stops_at_floor_and_marks_done(tmp_path):
    conn = connect(":memory:")
    src = Fake("fake")
    cfg = cfg_for("fake", backfill=True)
    cfg["ingest"]["floor"] = "2026-11-12"
    ingest.run(conn, cfg, sources=[src], cache=cache_mod.MatchCache(tmp_path / "m"), today=TODAY, verbose=False,
               state_root=tmp_path / "st")
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
                   today=TODAY, verbose=False, state_root=tmp_path / "st")
    assert s["errors"] and conn.execute("SELECT COUNT(*) FROM matches").fetchone()[0] >= 2


def test_two_sources_same_match_become_one_with_both_ids(tmp_path):
    conn = connect(":memory:")

    class Same(Fake):
        def fetch_results(self, day, budget):
            return [mk(self.name, f"x{self.name}", "2026-11-16", p1="Alpha One", p2="Beta Two")] if day == TODAY else []

    ingest.run(conn, cfg_for("a"), sources=[Same("a"), Same("b")], cache=cache_mod.MatchCache(tmp_path / "m"),
               today=TODAY, verbose=False, state_root=tmp_path / "st")
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
                   state_root=tmp_path / "st")
    assert s["sources"]["fake"]["odds_records"] == 1
    res = oh.apply_odds_records(conn, tmp_path / "rec")
    assert res == {"fake": 1}
    row = conn.execute("SELECT p1_odds, p2_odds FROM odds").fetchone()
    assert tuple(row) == (1.55, 2.5)                              # flipped into the match's own orientation
