"""pick_display_odds follows CONTRACT.md "The display price"."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import make_demo_db
from app import server
from app.server import pick_display_odds

NOW = datetime(2026, 11, 16, 20, 0, tzinfo=timezone.utc)


def row(source, book, p1, p2, hours_ago, rid=0):
    return {"source": source, "book": book, "p1_odds": p1, "p2_odds": p2,
            "fetched_at": server.iso(NOW - timedelta(hours=hours_ago)), "rid": rid}


def test_manual_beats_pinnacle_even_when_older_and_stale():
    rows = [row("oddsapi", "pinnacle", 2.0, 1.8, 1, 1), row("manual", "manual", 2.5, 1.5, 40, 2)]
    got = pick_display_odds(rows, "scheduled", NOW)
    assert got["source"] == "manual" and got["p1"] == 2.5


def test_latest_manual_wins_ties_by_rowid():
    rows = [row("manual", "manual", 2.5, 1.5, 0, 1), row("manual", "manual", 2.0, 1.8, 0, 2)]
    assert pick_display_odds(rows, "scheduled", NOW)["p1"] == 2.0


def test_pinnacle_beats_bet365_at_same_time():
    rows = [row("oddsapi", "bet365", 2.2, 1.7, 1, 1), row("oddsapi", "Pinnacle", 2.1, 1.75, 1, 2)]
    assert pick_display_odds(rows, "scheduled", NOW)["book"] == "Pinnacle"


def test_book_order_then_other_then_avg():
    rows = [row("x", "avg", 2.0, 1.8, 1), row("x", "somebook", 2.1, 1.7, 1), row("x", "williamhill", 2.2, 1.6, 1),
            row("x", "betfair", 2.3, 1.6, 1)]
    assert pick_display_odds(rows, "scheduled", NOW)["book"] == "betfair"
    assert pick_display_odds(rows[:3], "scheduled", NOW)["book"] == "williamhill"
    assert pick_display_odds(rows[:2], "scheduled", NOW)["book"] == "somebook"
    assert pick_display_odds(rows[:1], "scheduled", NOW)["book"] == "avg"


def test_max_is_never_used():
    rows = [row("x", "max", 3.0, 3.0, 1)]
    assert pick_display_odds(rows, "scheduled", NOW) is None
    assert pick_display_odds(rows, "final", NOW) is None
    rows.append(row("x", "avg", 2.0, 1.8, 30))
    assert pick_display_odds(rows, "final", NOW)["book"] == "avg"


@pytest.mark.parametrize("status", ["scheduled", "live"])
def test_stale_rows_ignored_before_and_during_match(status):
    rows = [row("x", "pinnacle", 2.0, 1.8, 13, 1), row("x", "bet365", 2.1, 1.7, 2, 2)]
    got = pick_display_odds(rows, status, NOW)
    assert got["book"] == "bet365"  # the fresher, less-preferred book: pinnacle is stale
    assert pick_display_odds(rows[:1], status, NOW) is None


@pytest.mark.parametrize("status", ["final", "retired", "walkover"])
def test_stale_rows_used_for_finished_matches(status):
    rows = [row("x", "pinnacle", 2.0, 1.8, 72, 1), row("x", "bet365", 2.1, 1.7, 2, 2)]
    assert pick_display_odds(rows, status, NOW)["book"] == "pinnacle"


def test_latest_fetched_at_within_same_book():
    rows = [row("x", "pinnacle", 2.0, 1.8, 5, 1), row("x", "pinnacle", 2.2, 1.7, 1, 2)]
    assert pick_display_odds(rows, "scheduled", NOW)["p1"] == 2.2


def test_invalid_prices_skipped():
    rows = [row("x", "pinnacle", 1.0, 1.8, 1), row("x", "bet365", None, 1.7, 1), row("x", "betway", 2.0, 1.8, 1)]
    assert pick_display_odds(rows, "scheduled", NOW)["book"] == "betway"


def test_api_uses_display_price_for_value(tmp_path, monkeypatch):
    monkeypatch.setenv("DEUCE_DB", str(tmp_path / "tennis.db"))
    monkeypatch.setenv("DEUCE_BACKTEST", str(tmp_path / "backtest.json"))
    monkeypatch.setenv("DEUCE_CONFIG", str(tmp_path / "config.toml"))
    monkeypatch.delenv("PORT", raising=False)
    make_demo_db.build(tmp_path / "tennis.db")
    now = server.now_utc()
    with sqlite3.connect(tmp_path / "tennis.db") as c:
        c.execute("DELETE FROM odds WHERE match_id='mvd-qf-2'")
        # Stale but generous Pinnacle price would be value on p1 (0.41 * 3.0); the fresh bet365 price is not.
        c.execute("INSERT INTO odds VALUES ('mvd-qf-2','oddsapi','pinnacle',3.0,1.4,?)", (server.iso(now - timedelta(hours=20)),))
        c.execute("INSERT INTO odds VALUES ('mvd-qf-2','oddsapi','bet365',2.2,1.65,?)", (server.iso(now - timedelta(hours=1)),))
        c.execute("INSERT INTO odds VALUES ('mvd-qf-2','oddsapi','max',4.0,4.0,?)", (server.iso(now),))
    client = TestClient(server.app, base_url="http://127.0.0.1:8765")
    item = next(i for i in client.get("/api/matches").json() if i["match_id"] == "mvd-qf-2")
    assert item["odds"]["book"] == "bet365" and item["value"] is None
    detail = client.get("/api/matches/mvd-qf-2").json()
    assert detail["odds"]["book"] == "bet365" and len(detail["odds_history"]) == 3
    posted = client.post("/api/matches/mvd-qf-2/odds", json={"p1": 3.0, "p2": 1.4}).json()
    assert posted["odds"]["source"] == "manual" and posted["value"]["side"] == "p1"
