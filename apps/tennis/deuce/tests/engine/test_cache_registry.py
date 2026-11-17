"""Compact cache, source state/budget and the registry."""
import gzip
import json
from datetime import date

import pytest

from engine import cache as cache_mod
from engine import sources
from engine.records import to_json
from engine.sources.base import MatchRecord
from engine.sources.state import QuotaBudget, SourceState


def rec(sid, d="2026-11-10T13:00:00Z", status="final", tour="ATP", source="espn"):
    return MatchRecord(source=source, source_id=sid, tour=tour, level="250", tournament="T", date=d, status=status,
                       p1_name="A B", p2_name="C D", winner=1 if status == "final" else None,
                       sets=[[6, 4, None, None]] if status == "final" else [])


def test_cache_roundtrip_only_final_deterministic(tmp_path):
    c = cache_mod.MatchCache(tmp_path)
    assert c.add([rec("1"), rec("2", status="scheduled"), rec("3", "2026-10-02T10:00:00Z", tour="WTA")]) == 2
    assert c.save() == 2
    assert (tmp_path / "atp" / "2026-11.jsonl.gz").exists() and (tmp_path / "wta" / "2026-10.jsonl.gz").exists()
    first = (tmp_path / "atp" / "2026-11.jsonl.gz").read_bytes()
    c2 = cache_mod.MatchCache(tmp_path)
    assert len(c2) == 2 and c2.add([rec("1")]) == 0 and c2.save() == 0   # unchanged: nothing rewritten
    assert (tmp_path / "atp" / "2026-11.jsonl.gz").read_bytes() == first
    # a correction replaces the record; a month change moves it
    assert c2.add([rec("1", "2026-12-01T10:00:00Z")]) == 1 and c2.save() == 1
    assert not (tmp_path / "atp" / "2026-11.jsonl.gz").exists()
    line = gzip.open(tmp_path / "atp" / "2026-12.jsonl.gz", "rt").readline()
    assert json.loads(line) == to_json(rec("1", "2026-12-01T10:00:00Z"))


def test_budget_daily_monthly_and_persistence(tmp_path):
    st = SourceState("x", tmp_path)
    b = QuotaBudget(st, daily=3, monthly=4, today=date(2026, 11, 16))
    assert [b.take() for _ in range(4)] == [True, True, True, False] and b.exhausted
    st.save()
    b2 = QuotaBudget(SourceState("x", tmp_path), daily=3, monthly=4, today=date(2026, 11, 16))
    assert b2.take() is False                                       # persisted across runs
    b3 = QuotaBudget(SourceState("x", tmp_path), daily=3, monthly=4, today=date(2026, 11, 17))
    assert b3.remaining() == 1 and b3.take() is True                # new day, but 3 of the 4 monthly requests are used
    assert b3.take() is False and b3.exhausted


def test_budget_rate_limit_sleeps():
    slept = []
    t = [0.0]
    st = SourceState.__new__(SourceState)
    st.data = {}
    b = QuotaBudget(st, per_minute=30, today=date(2026, 1, 1), sleep=slept.append, clock=lambda: t[0])
    b.take(); b.take()
    assert slept == [pytest.approx(2.0)]


def test_backfill_cursor_state(tmp_path):
    st = SourceState("z", tmp_path)
    assert st.backfill_cursor is None and not st.backfill_done
    st.set_backfill(date(2026, 9, 3))
    st.save()
    st2 = SourceState("z", tmp_path)
    assert st2.backfill_cursor == date(2026, 9, 3) and not st2.backfill_done


def test_registry_skips_missing_keys_and_modules(monkeypatch):
    monkeypatch.delenv("TENNISAPI_TEST_KEY", raising=False)
    srcs = sources.discover({})
    assert [s.name for s in srcs][0] == "espn"                      # keyless source always on
    assert sources.get_key({"sources": {"foo_key": "abc"}}, "foo", "NOPE_ENV") == "abc"
    assert sources.get_key({"sources": {"foo": {"key": "k2"}}}, "foo", None) == "k2"
    monkeypatch.setenv("NOPE_ENV", "fromenv")
    assert sources.get_key({"sources": {"foo_key": "abc"}}, "foo", "NOPE_ENV") == "fromenv"
