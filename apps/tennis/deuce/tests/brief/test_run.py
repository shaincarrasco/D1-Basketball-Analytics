import json
import sqlite3
import time

from brief import run as runmod

from datetime import datetime, timedelta, timezone

FRESH = (datetime.now(timezone.utc) - timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%SZ')

DDL = """
CREATE TABLE players(id TEXT PRIMARY KEY, name TEXT, country TEXT, tour TEXT);
CREATE TABLE tournaments(id TEXT PRIMARY KEY, name TEXT, tour TEXT, start_date TEXT, end_date TEXT,
    location TEXT, country TEXT, surface TEXT, surface_inferred INTEGER, level TEXT);
CREATE TABLE matches(id TEXT PRIMARY KEY, tournament_id TEXT, tour TEXT, round TEXT, date TEXT, status TEXT,
    p1_id TEXT, p2_id TEXT, winner_id TEXT, score TEXT, sets_json TEXT, best_of INTEGER, court TEXT);
CREATE TABLE predictions(match_id TEXT PRIMARY KEY, p1_prob REAL, p2_prob REAL, set_probs_json TEXT,
    features_json TEXT, model_version TEXT, created_at TEXT);
CREATE TABLE odds(match_id TEXT, source TEXT, book TEXT, p1_odds REAL, p2_odds REAL, fetched_at TEXT);
CREATE TABLE briefs(match_id TEXT PRIMARY KEY, brief_json TEXT, engine TEXT, created_at TEXT);
"""


def build_db(path, montevideo, indoor, with_briefs_table=True):
    conn = sqlite3.connect(path)
    ddl = DDL if with_briefs_table else DDL.replace(
        "CREATE TABLE briefs(match_id TEXT PRIMARY KEY, brief_json TEXT, engine TEXT, created_at TEXT);", "")
    conn.executescript(ddl)
    for ctx, tid in ((montevideo, "t1"), (indoor, "t2")):
        t = ctx["tournament"]
        conn.execute("INSERT INTO tournaments VALUES (?,?,?,?,?,?,?,?,?,?)",
                     (tid, t["name"], "ATP", None, None, t["location"], t["country"], t["surface"], 0, t["level"]))
        for s in ("p1", "p2"):
            p = ctx[s]
            conn.execute("INSERT OR IGNORE INTO players VALUES (?,?,?,?)", (p["id"], p["name"], p["country"], "ATP"))
        conn.execute("INSERT INTO matches VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                     (ctx["match_id"], tid, "ATP", ctx["round"], ctx["date"], "scheduled", ctx["p1"]["id"],
                      ctx["p2"]["id"], None, None, None, 3, None))
        conn.execute("INSERT INTO predictions VALUES (?,?,?,?,?,?,?)",
                     (ctx["match_id"], ctx["p1_prob"], ctx["p2_prob"], "{}", json.dumps(ctx["features"]), "v1", "2026-11-16T00:00:00Z"))
        for o in ctx["odds"]:
            conn.execute("INSERT INTO odds VALUES (?,?,?,?,?,?)",
                         (ctx["match_id"], o["source"], o["book"], o["p1_odds"], o["p2_odds"], FRESH))
    # a finished match and one without prediction: must be ignored
    conn.execute("INSERT INTO matches VALUES ('done','t1','ATP','R1','2026-11-01T10:00:00Z','final','9001','9002',NULL,NULL,NULL,3,NULL)")
    conn.execute("INSERT INTO predictions VALUES ('done',0.5,0.5,'{}','{}','v1','2026-11-16T00:00:00Z')")
    conn.execute("INSERT INTO matches VALUES ('nopred','t1','ATP','R1','2026-11-19T10:00:00Z','scheduled','9001','9002',NULL,NULL,NULL,3,NULL)")
    conn.commit()
    conn.close()


def test_run_no_llm_writes_briefs(tmp_path, montevideo, indoor):
    db = tmp_path / "t.db"
    build_db(db, montevideo, indoor)
    out = []
    n = runmod.run(db, use_llm=False, with_weather=False, out=out.append)
    assert n == 2
    conn = sqlite3.connect(db)
    rows = conn.execute("SELECT match_id, brief_json, engine FROM briefs ORDER BY match_id").fetchall()
    assert [r[0] for r in rows] == ["fx-indoor-2", "fx-montevideo-1"]
    for _, js, eng in rows:
        b = json.loads(js)
        assert eng == "rules" and b["engine"] == "rules"
        assert len(b["buckets"]) == 4
    mont = json.loads(rows[1][1])
    assert mont["value"]["side"] == "p1"  # odds came from the odds table
    assert mont["players"]["p1"]["name"] == "Jonas Keller"
    # second run: nothing to do
    out.clear()
    assert runmod.run(db, use_llm=False, with_weather=False, out=out.append) == 0
    assert "Nothing to do" in out[0]
    # --force rebuilds, --limit respected
    assert runmod.run(db, force=True, use_llm=False, with_weather=False, limit=1, out=out.append) == 1
    # --match works
    assert runmod.run(db, match_id="fx-indoor-2", use_llm=False, with_weather=False, out=out.append) == 1


def test_creates_briefs_table_if_missing(tmp_path, montevideo, indoor):
    db = tmp_path / "t.db"
    build_db(db, montevideo, indoor, with_briefs_table=False)
    assert runmod.run(db, use_llm=False, with_weather=False, out=lambda *_: None) == 2


def test_missing_db_and_tables_are_friendly(tmp_path):
    out = []
    assert runmod.run(tmp_path / "nope.db", out=out.append) == 0
    assert "engine.update" in out[0]
    db = tmp_path / "empty.db"
    sqlite3.connect(db).close()
    out.clear()
    assert runmod.run(db, out=out.append) == 0
    assert "missing table" in out[0]


def test_empty_tables(tmp_path, montevideo, indoor):
    db = tmp_path / "e.db"
    conn = sqlite3.connect(db)
    conn.executescript(DDL)
    conn.close()
    out = []
    assert runmod.run(db, use_llm=False, with_weather=False, out=out.append) == 0
    assert "Nothing to do" in out[0]


def test_cli_main(tmp_path, montevideo, indoor, capsys):
    db = tmp_path / "t.db"
    build_db(db, montevideo, indoor)
    assert runmod.main(["--db", str(db), "--no-llm", "--no-weather", "--limit", "1"]) == 0
    assert "Done: 1 brief" in capsys.readouterr().out


def _briefs(db):
    c = sqlite3.connect(db)
    r = {m: (json.loads(j), at) for m, j, at in c.execute("SELECT match_id, brief_json, created_at FROM briefs")}
    c.close()
    return r


def test_stale_brief_regenerated(tmp_path, montevideo, indoor):
    db = tmp_path / "t.db"
    build_db(db, montevideo, indoor)
    quiet = lambda *_: None
    assert runmod.run(db, use_llm=False, with_weather=False, out=quiet) == 2
    assert runmod.run(db, use_llm=False, with_weather=False, out=quiet) == 0  # nothing changed

    conn = sqlite3.connect(db)
    # 1. prediction updated after the brief
    conn.execute("UPDATE predictions SET created_at='2999-01-01T00:00:00Z' WHERE match_id='fx-indoor-2'")
    conn.commit()
    assert runmod.select_matches(conn, None, False, None) == ["fx-indoor-2"]
    conn.execute("UPDATE predictions SET created_at='2026-11-16T00:00:00Z' WHERE match_id='fx-indoor-2'")
    # 2. new odds row after the brief
    conn.execute("INSERT INTO odds VALUES ('fx-indoor-2','api','pinnacle',1.8,2.0,'2999-01-01T00:00:00Z')")
    conn.commit()
    assert runmod.select_matches(conn, None, False, None) == ["fx-indoor-2"]
    conn.execute("DELETE FROM odds WHERE match_id='fx-indoor-2'")
    conn.commit()
    assert runmod.select_matches(conn, None, False, None) == []
    # 3. model pick flipped without a newer timestamp
    conn.execute("UPDATE predictions SET p1_prob=0.3, p2_prob=0.7 WHERE match_id='fx-indoor-2'")
    conn.commit()
    assert runmod.select_matches(conn, None, False, None) == ["fx-indoor-2"]
    conn.close()
    assert runmod.run(db, use_llm=False, with_weather=False, out=quiet) == 1
    assert _briefs(db)["fx-indoor-2"][0]["model_pick"] == "p2"
    assert runmod.run(db, use_llm=False, with_weather=False, out=quiet) == 0
