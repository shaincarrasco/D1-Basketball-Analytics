"""API tests for app/server.py against the demo database and against empty or missing data."""
from __future__ import annotations

import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

import make_demo_db
from app import server

ENDPOINTS = [
    "/api/status",
    "/api/matches",
    "/api/matches?status=upcoming",
    "/api/matches?status=live",
    "/api/matches?status=finished",
    "/api/matches?tour=WTA&value_only=1",
    "/api/matches?tournament=Montevideo%20Open",
    "/api/backtest",
    "/api/players/top?tour=ATP",
    "/api/players/top?tour=WTA",
]


@pytest.fixture
def env(tmp_path, monkeypatch):
    """Point the server at files under tmp_path and at a config file that does not exist."""
    monkeypatch.setenv("DEUCE_DB", str(tmp_path / "tennis.db"))
    monkeypatch.setenv("DEUCE_BACKTEST", str(tmp_path / "backtest.json"))
    monkeypatch.setenv("DEUCE_CONFIG", str(tmp_path / "config.toml"))
    monkeypatch.delenv("PORT", raising=False)
    return tmp_path


@pytest.fixture
def demo(env):
    make_demo_db.build(env / "tennis.db", env / "backtest.json")
    return env


@pytest.fixture
def client():
    return TestClient(server.app, base_url="http://127.0.0.1:8765", raise_server_exceptions=True)


# --------------------------------------------------------------------------- demo data

def test_matches_list_shape(demo, client):
    r = client.get("/api/matches")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 17
    keys = {"match_id", "date", "tour", "round", "status", "score", "tournament", "p1", "p2", "p1_prob", "p2_prob",
            "set_probs", "odds", "value", "has_brief"}
    for it in items:
        assert keys <= set(it)
        assert {"name", "surface", "level"} <= set(it["tournament"])
        assert {"id", "name", "country"} <= set(it["p1"])
    assert [i["date"] for i in items] == sorted(i["date"] for i in items)
    assert sum(i["has_brief"] for i in items) == 3


def test_status_filters(demo, client):
    up = client.get("/api/matches?status=upcoming").json()
    live = client.get("/api/matches?status=live").json()
    done = client.get("/api/matches?status=finished").json()
    assert {i["status"] for i in up} == {"scheduled"}
    assert [i["match_id"] for i in live] == ["mvd-r16-5"]
    assert {i["status"] for i in done} <= {"final", "retired", "walkover"}
    assert "linz-r16-2" in {i["match_id"] for i in done}  # retired counts as finished
    assert len(up) + len(live) + len(done) == 17
    assert client.get("/api/matches?status=bogus").json() == []


def test_tour_tournament_and_value_filters(demo, client):
    wta = client.get("/api/matches?tour=wta").json()
    assert wta and all(i["tour"] == "WTA" for i in wta)
    mvd = client.get("/api/matches?tournament=Montevideo Open").json()
    assert len(mvd) == 8 and all(i["tournament"]["name"] == "Montevideo Open" for i in mvd)
    vals = client.get("/api/matches?value_only=1").json()
    assert vals and all(i["value"] for i in vals)
    assert all(i["value"]["edge"] >= 0.02 for i in vals)


def test_value_and_odds_choice(demo, client):
    items = {i["match_id"]: i for i in client.get("/api/matches").json()}
    w = items["gdl-qf-1"]
    assert w["odds"]["p1"] == 2.10 and w["odds"]["p2"] == 1.74  # latest Pinnacle row
    assert w["value"]["side"] == "p2"
    assert w["value"]["edge"] == pytest.approx(0.62 * 1.74 - 1, abs=1e-4)
    assert items["fx-indoor-2"]["odds"] is None and items["fx-indoor-2"]["value"] is None
    assert items["mvd-r16-3"]["odds"] is None


def test_manual_beats_pinnacle_even_if_older(demo, client):
    db = demo / "tennis.db"
    with sqlite3.connect(db) as c:
        c.execute("INSERT INTO odds VALUES ('mvd-qf-2','manual','manual',2.5,1.6,'2000-01-01T00:00:00Z')")
        c.execute("INSERT INTO odds VALUES ('mvd-qf-2','bet365','Bet365',9.0,1.05,'2099-01-01T00:00:00Z')")
    it = client.get("/api/matches/mvd-qf-2").json()
    assert it["odds"]["source"] == "manual" and it["odds"]["p1"] == 2.5


def test_pinnacle_beats_other_books(demo, client):
    now = server.iso(server.now_utc())
    with sqlite3.connect(demo / "tennis.db") as c:
        c.execute("DELETE FROM odds WHERE match_id='mvd-qf-2'")
        c.execute("INSERT INTO odds VALUES ('mvd-qf-2','oddsapi','bet365',9.0,1.05,?)", (now,))
        c.execute("INSERT INTO odds VALUES ('mvd-qf-2','oddsapi','pinnacle',2.4,1.6,?)", (now,))
        c.execute("INSERT INTO odds VALUES ('mvd-qf-2','oddsapi','max',9.9,9.9,?)", (now,))
    it = client.get("/api/matches/mvd-qf-2").json()
    assert it["odds"]["book"] == "pinnacle" and it["odds"]["p1"] == 2.4


def test_match_detail(demo, client):
    r = client.get("/api/matches/gdl-qf-1")
    assert r.status_code == 200
    d = r.json()
    assert d["features"]["radar"]["p1"]["Win Rate"] is not None
    assert len(d["features"]["p2"]["last5"]) == 5
    assert d["features"]["h2h"]["p2_wins"] == 2
    assert len(d["odds_history"]) == 3
    assert d["odds_history"][0]["fetched_at"] < d["odds_history"][-1]["fetched_at"]
    b = d["brief"]
    assert b["model_pick"] == "p2" and len(b["buckets"]) == 4
    assert b["engine"].startswith("llm:")
    assert d["edge_threshold"] == 0.02
    no_brief = client.get("/api/matches/mvd-qf-2").json()
    assert no_brief["brief"] is None and no_brief["has_brief"] is False


def test_fixture_briefs_are_used_when_present(demo, client):
    if not (make_demo_db.BRIEF_FIXTURES / "example_briefs.json").is_file():
        pytest.skip("brief fixtures not written yet")
    d = client.get("/api/matches/fx-montevideo-1").json()
    assert d["brief"]["players"]["p1"]["name"] == "Jonas Keller"


def test_unknown_match_404(demo, client):
    r = client.get("/api/matches/nope")
    assert r.status_code == 404
    assert "engine.update" in r.json()["detail"]


def test_manual_odds_post_updates_value(demo, client):
    before = client.get("/api/matches/mvd-qf-2").json()
    assert before["value"] is None  # p1 0.41 at 2.32 is not value
    r = client.post("/api/matches/mvd-qf-2/odds", json={"p1": 2.8, "p2": 1.45})
    assert r.status_code == 200
    body = r.json()
    assert body["odds"] == {**body["odds"], "p1": 2.8, "p2": 1.45, "source": "manual"}
    assert body["value"]["side"] == "p1"
    assert body["value"]["edge"] == pytest.approx(0.41 * 2.8 - 1, abs=1e-4)
    after = client.get("/api/matches/mvd-qf-2").json()
    assert after["value"] == body["value"]
    assert after["odds_history"][-1]["source"] == "manual"
    assert any(i["match_id"] == "mvd-qf-2" for i in client.get("/api/matches?value_only=1").json())
    # Typing a worse price removes the flag again.
    r = client.post("/api/matches/mvd-qf-2/odds", json={"p1": 2.0, "p2": 1.6})
    assert r.json()["value"] is None
    assert client.get("/api/matches/mvd-qf-2").json()["value"] is None


def test_manual_odds_without_prediction_still_saves(demo, client):
    with sqlite3.connect(demo / "tennis.db") as c:
        c.execute("DELETE FROM predictions WHERE match_id='gdl-r16-2'")
    r = client.post("/api/matches/gdl-r16-2/odds", json={"p1": 1.5, "p2": 2.6})
    assert r.status_code == 200
    assert r.json()["value"] is None and r.json()["odds"]["p1"] == 1.5


@pytest.mark.parametrize("payload", [{"p1": 1.0, "p2": 2.0}, {"p1": 0.5, "p2": 2.0}, {"p1": "x", "p2": 2.0}, {"p1": 2.0}])
def test_manual_odds_validation(demo, client, payload):
    r = client.post("/api/matches/mvd-qf-2/odds", json=payload)
    assert r.status_code == 422


def test_manual_odds_unknown_match(demo, client):
    assert client.post("/api/matches/nope/odds", json={"p1": 2, "p2": 2}).status_code == 404


def test_edge_threshold_from_config(demo, client):
    (demo / "config.toml").write_text("[model]\nedge_threshold = 0.5\n")
    items = client.get("/api/matches").json()
    assert all(i["value"] is None for i in items)
    (demo / "config.toml").write_text("[model]\nedge_threshold = 0.0\n")
    assert any(i["value"] for i in client.get("/api/matches").json())
    (demo / "config.toml").write_text("this is [not toml")
    assert client.get("/api/status").json()["edge_threshold"] == 0.02


def test_config_db_path_used_without_env(demo, client, monkeypatch):
    monkeypatch.delenv("DEUCE_DB")
    (demo / "config.toml").write_text(f'[paths]\ndb = "{demo / "tennis.db"}"\n')
    assert len(client.get("/api/matches").json()) == 17


def test_backtest_served(demo, client):
    d = client.get("/api/backtest").json()
    assert d["empty"] is False
    assert d["betting"]["traded"] > 1000
    assert len(d["bets"]) >= 2000
    b = d["bets"][0]
    assert {"date", "tournament", "level", "surface", "round", "p1", "p2", "pick", "prob", "odds", "won", "profit"} <= set(b)
    assert all(x["prob"] * x["odds"] - 1 >= -1e-9 for x in d["bets"])
    assert len(d["splits"]) == 3 and d["calibration"]


def test_backtest_without_betting(env, client):
    make_demo_db.write_backtest(env / "backtest.json", betting=False)
    d = client.get("/api/backtest").json()
    assert d["betting"] is None and d["bets"] == [] and d["splits"]


def test_players_top(demo, client):
    atp = client.get("/api/players/top?tour=ATP").json()
    assert 0 < len(atp) <= 20
    assert [p["elo"] for p in atp] == sorted((p["elo"] for p in atp), reverse=True)
    assert atp[0]["position"] == 1 and atp[0]["name"] == "Jonas Keller"
    wta = client.get("/api/players/top?tour=wta").json()
    assert wta and all(p["tour"] == "WTA" for p in wta)


def test_players_top_from_matches_only(env, client):
    with sqlite3.connect(env / "tennis.db") as c:
        c.executescript(make_demo_db.SCHEMA)
        c.execute("INSERT INTO players VALUES ('a','Ann','X','WTA'),('b','Bea','Y','WTA')")
        for k in range(12):
            w = "a" if k % 3 else "b"
            c.execute("INSERT INTO matches(id,tour,date,status,p1_id,p2_id,winner_id) VALUES (?,?,?,?,?,?,?)",
                      (f"m{k}", "WTA", f"2026-01-{k + 1:02d}T10:00:00Z", "final", "a", "b", w))
    top = client.get("/api/players/top?tour=WTA").json()
    assert [p["name"] for p in top] == ["Ann", "Bea"]
    assert top[0]["source"] == "matches"


def test_players_top_prefers_engine_ratings(demo, client):
    with sqlite3.connect(demo / "tennis.db") as c:
        c.execute("CREATE TABLE player_ratings(player_id TEXT PRIMARY KEY, name TEXT, country TEXT, tour TEXT, elo REAL,"
                  " hard_elo REAL, clay_elo REAL, grass_elo REAL, matches INTEGER, matches_1y INTEGER, win_rate_1y REAL,"
                  " form_10 REAL, rank INTEGER, last_match_date TEXT, updated_at TEXT)")
        c.execute("INSERT INTO player_ratings VALUES ('z','Zed','Q','ATP',2100,2050,2000,1990,300,60,0.8,0.9,1,"
                  "'2026-11-10','2026-11-16')")
    top = client.get("/api/players/top?tour=ATP").json()
    assert top[0]["name"] == "Zed" and top[0]["source"] == "ratings" and top[0]["surface_elo"]["clay"] == 2000


def test_dashboard_served(demo, client):
    r = client.get("/")
    assert r.status_code == 200 and "Deuce" in r.text
    assert client.get("/js/main.js").status_code == 200
    assert client.get("/css/deuce.css").status_code == 200
    assert client.get("/fonts/big-shoulders-display-latin-800-normal.woff2").status_code == 200


def test_unknown_api_path_is_404_json(demo, client):
    r = client.get("/api/nothing/here")
    assert r.status_code == 404 and "detail" in r.json()


# --------------------------------------------------------------------------- empty and missing data

def _make_empty_variants(env):
    yield "missing"
    (env / "tennis.db").write_bytes(b"")
    yield "zero-byte file"
    (env / "tennis.db").unlink()
    with sqlite3.connect(env / "tennis.db") as c:
        c.executescript(make_demo_db.SCHEMA)
    yield "schema, no rows"
    (env / "tennis.db").unlink()
    with sqlite3.connect(env / "tennis.db") as c:
        c.execute("CREATE TABLE matches(id TEXT PRIMARY KEY, tournament_id TEXT, tour TEXT, round TEXT, date TEXT, "
                  "status TEXT, p1_id TEXT, p2_id TEXT, winner_id TEXT, score TEXT, sets_json TEXT, best_of INTEGER, court TEXT)")
        c.execute("INSERT INTO matches(id, tour, date, status, p1_id, p2_id) VALUES ('x','ATP',?, 'scheduled','a','b')",
                  (server.iso(server.now_utc()),))
    yield "matches table only"
    (env / "tennis.db").unlink()
    (env / "tennis.db").write_bytes(b"this is not a database at all" * 100)
    yield "garbage file"


def test_every_endpoint_survives_empty_data(env, client):
    for label in _make_empty_variants(env):
        for url in ENDPOINTS:
            r = client.get(url)
            assert r.status_code == 200, (label, url, r.text)
        assert client.get("/api/matches/x").status_code in (200, 404), label
        assert client.post("/api/matches/x/odds", json={"p1": 2.0, "p2": 1.9}).status_code in (200, 404), label
        assert client.get("/").status_code == 200


def test_missing_db_payloads(env, client):
    assert client.get("/api/matches").json() == []
    assert client.get("/api/players/top").json() == []
    st = client.get("/api/status").json()
    assert st["db_exists"] is False and st["counts"]["matches"] == 0
    r = client.get("/api/matches/abc")
    assert r.status_code == 404 and "engine.update" in r.json()["detail"]
    assert client.post("/api/matches/abc/odds", json={"p1": 2.0, "p2": 1.9}).status_code == 404
    assert not (env / "tennis.db").exists()  # never created by reading


def test_matches_table_only_still_lists(env, client):
    with sqlite3.connect(env / "tennis.db") as c:
        c.execute("CREATE TABLE matches(id TEXT PRIMARY KEY, tournament_id TEXT, tour TEXT, round TEXT, date TEXT, "
                  "status TEXT, p1_id TEXT, p2_id TEXT, winner_id TEXT, score TEXT, sets_json TEXT, best_of INTEGER, court TEXT)")
        c.execute("INSERT INTO matches(id, tour, date, status, p1_id, p2_id) VALUES ('x','ATP',?, 'scheduled','a','b')",
                  (server.iso(server.now_utc()),))
    items = client.get("/api/matches").json()
    assert len(items) == 1 and items[0]["p1_prob"] is None and items[0]["odds"] is None
    # Posting odds creates the odds table when the engine hasn't yet.
    r = client.post("/api/matches/x/odds", json={"p1": 1.8, "p2": 2.0})
    assert r.status_code == 200 and r.json()["odds"]["p1"] == 1.8


def test_backtest_missing_or_broken(env, client):
    d = client.get("/api/backtest").json()
    assert d["empty"] is True and d["betting"] is None and d["bets"] == []
    assert any("engine.backtest" in n for n in d["notes"])
    (env / "backtest.json").write_text("{not json")
    d = client.get("/api/backtest").json()
    assert d["empty"] is True and "engine.backtest" in d["notes"][0]
    (env / "backtest.json").write_text(json.dumps([1, 2, 3]))
    assert client.get("/api/backtest").json()["empty"] is True
    (env / "backtest.json").write_text(json.dumps({"generated_at": "x", "splits": None}))
    d = client.get("/api/backtest").json()
    assert d["splits"] == [] and d["bets"] == [] and d["betting"] is None


def test_bad_json_columns_do_not_break(demo, client):
    with sqlite3.connect(demo / "tennis.db") as c:
        c.execute("UPDATE predictions SET features_json='{bad', set_probs_json='nope' WHERE match_id='gdl-qf-1'")
        c.execute("UPDATE briefs SET brief_json='{bad' WHERE match_id='gdl-qf-1'")
    d = client.get("/api/matches/gdl-qf-1").json()
    assert d["features"] is None and d["set_probs"] is None and d["brief"] is None
    assert client.get("/api/matches").status_code == 200


def test_set_probs_sum_to_one():
    for p in (0.2, 0.5, 0.83):
        sp = make_demo_db.set_probs(p)
        assert sum(sp.values()) == pytest.approx(1, abs=1e-3)
        assert sp["2-0"] + sp["2-1"] == pytest.approx(p, abs=1e-3)


def test_brief_and_prediction_times_exposed(demo, client):
    d = client.get("/api/matches/gdl-qf-1").json()
    assert d["predicted_at"] and d["brief_created_at"]
    item = next(i for i in client.get("/api/matches").json() if i["match_id"] == "gdl-qf-1")
    assert item["predicted_at"] == d["predicted_at"]
    assert client.get("/api/matches/mvd-qf-2").json()["brief_created_at"] is None
