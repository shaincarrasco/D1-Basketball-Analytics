from engine import paper_bets as pb


def bets(n, win_every=2):
    return [{"date": f"2025-03-{1 + i % 28:02d}", "tour": "ATP", "tournament": "T", "level": "250", "surface": "Hard",
             "round": "R32", "book": "pinnacle", "p1": "A", "p2": "B", "pick": "p1", "prob": 0.6, "odds": 2.0,
             "won": i % win_every == 0, "profit": 1.0 if i % win_every == 0 else -1.0, "edge": 0.05, "split": "split1"}
            for i in range(n)]


def test_no_odds_report_explains_import():
    md = pb.report({"generated_at": "2026-11-16T22:00:00Z", "overall": {"accuracy": 0.65, "n": 19536}, "betting": None, "bets": []},
                   "2026-11-16", 0)
    assert "Simulation only. No real money" in md and "No odds yet" in md and "odds_history" in md and "65.0%" in md


def test_report_small_sample_and_ranges():
    bt = {"betting": {"edge_threshold": 0.02, "odds_source": "tennis-data (pinnacle)", "matches_with_odds": 500,
                      "voided_retirement_bets": 3, "baselines": {}, "cumulative": [{"date": "2025-03-01", "pnl": 1.0}]},
          "bets": bets(20)}
    md = pb.report(bt, "2026-11-16")
    assert "too few to read" in md and "Last 25 settled bets" in md and "Simulation only" in md
    assert "50.0% (29.9% to 70.1%)" in md                       # Wilson range, 10 of 20
    big = pb.row("x", bets(400))
    assert "readable, still noisy" in big and pb.row("x", [])  .endswith("no bets |")


def test_wilson_edges():
    assert pb.wilson(0, 0) == (0.0, 0.0)
    lo, hi = pb.wilson(1, 1)
    assert hi == 1.0 and 0.2 < lo < 0.21


def test_export_refuses_empty_db_and_names_link(tmp_path):
    import json
    import pytest
    from engine import export_site as ex
    from engine.db import connect
    conn = connect(":memory:")
    with pytest.raises(SystemExit):
        ex.export(conn, tmp_path, tmp_path / "players.json", verbose=False)
    assert not (tmp_path / "predictions.json").exists()
    rows = [{"id": "1", "name": "Maria Lourdes Carle", "tour": "women", "country": {"short": "ARG"}},
            {"id": "2", "name": "Carlos Alcaraz Garfia", "tour": "men", "country": {"short": "ESP"}},
            {"id": "3", "name": "Wang Yu", "tour": "women", "country": {"short": "CHN"}},
            {"id": "4", "name": "Yu Wang", "tour": "women", "country": {"short": "TPE"}}]
    (tmp_path / "players.json").write_text(json.dumps({"rows": rows}))
    b = ex.load_baseline(tmp_path / "players.json")
    assert b.find("WTA", "Maria Carle", "Argentina")["id"] == "1"      # shortened name, same country
    assert b.find("WTA", "Maria Carle", "Chile") is None                # country disagrees: no guess
    assert b.find("ATP", "Carlos Alcaraz", "Spain")["id"] == "2"
    assert b.find("ATP", "Maria Carle", None) is None                   # tour must agree
    assert b.find("WTA", "Wang Yu", "China")["id"] == "3"              # same key twice: country breaks the tie
    assert b.find("WTA", "Wang Yu", None) is None                       # ambiguous, no guess


# ----------------------------------------------------------------------------- site briefs and export robustness
import json as _json
import re as _re
from pathlib import Path as _Path

FIX = _Path(__file__).resolve().parents[1] / "brief" / "fixtures"


def _ctx(name="context_montevideo.json", odds=True):
    c = _json.loads((FIX / name).read_text())
    if odds:
        c["odds"] = [{"source": "manual", "book": "pinnacle", "p1_odds": 1.5, "p2_odds": 2.8,
                      "fetched_at": c.get("now", "2026-11-16T00:00:00Z"), "rowid": 1}]
    return c


def test_site_brief_has_three_buckets_no_betting_words_and_new_agreement():
    from brief.generate import generate_brief
    from engine.export_site import _sanitize
    for name in ("context_montevideo.json", "context_indoor.json"):
        b = _sanitize(generate_brief({**_ctx(name), "site_mode": True}, use_llm=False))
        assert [x["key"] for x in b["buckets"]] == ["fitness", "motivation", "conditions"] and "value" not in b
        blob = _json.dumps(b).lower()
        assert not _re.search(r"\b(market|price|prices|odds|bookmakers?|betting|bets?|value)\b", blob), blob[:300]
        total = sum({"slight": 1, "moderate": 2, "strong": 3}.get(x["strength"] or "", 0) *
                    (0 if x["favours"] == "level" else 1 if x["favours"] == b["model_pick"] else -1) for x in b["buckets"])
        assert b["agreement"]["score"] == max(0, min(100, round(50 + 50 * total / 9)))
        assert "three signals" in b["bottom_line"] or "agreement meter" in b["bottom_line"]
    full = generate_brief(_ctx(), use_llm=False)                   # the local dashboard keeps four buckets and prices
    assert len(full["buckets"]) == 4 and full["value"] is not None or full["buckets"][3]["key"] == "market"


def test_baseline_country_conflict_rejected_neutral_codes_ok(tmp_path):
    from engine import export_site as ex
    (tmp_path / "p.json").write_text(_json.dumps({"rows": [
        {"id": "1", "name": "Alex Smith", "tour": "men", "country": {"short": "GBR"}},
        {"id": "2", "name": "Daniil Medvedev", "tour": "men", "country": {"short": "AIN"}},
        {"id": "3", "name": "Damir Dzumhur", "tour": "men", "country": {"short": "BOS"}}]}))
    b = ex.load_baseline(tmp_path / "p.json")
    assert b.find("ATP", "Alex Smith", "United States") is None     # same name, different countries
    assert b.find("ATP", "Alex Smith", "Great Britain")["id"] == "1" and b.find("ATP", "Alex Smith", None)["id"] == "1"
    assert b.find("ATP", "Daniil Medvedev", "Russia")["id"] == "2"   # neutral athlete code is "unknown"
    assert b.find("ATP", "Damir Dzumhur", "Bosnia and Herzegovina")["id"] == "3"


def _mini_db(n=3):
    from engine.db import connect
    conn = connect(":memory:")
    now = datetime_now()
    conn.execute("INSERT INTO tournaments VALUES('T','Test Open','ATP','2026-11-01','2026-11-30','Austin, USA','USA','Hard',0,'250')")
    for i in range(n):
        for k in (1, 2):
            conn.execute("INSERT INTO players VALUES(?,?,?,?)", (f"p{i}{k}", f"Player {i}{k}", "USA", "ATP"))
        d = (now + __import__("datetime").timedelta(hours=3 + i)).strftime("%Y-%m-%dT%H:%M:%SZ")
        conn.execute("INSERT INTO matches(id,tournament_id,tour,round,date,status,p1_id,p2_id,best_of) VALUES(?,?,?,?,?,?,?,?,3)",
                     (f"m{i}", "T", "ATP", "R1", d, "scheduled", f"p{i}1", f"p{i}2"))
        conn.execute("INSERT INTO predictions VALUES(?,?,?,?,?,?,?)",
                     (f"m{i}", 0.6, 0.4, '{"2-0":0.4,"2-1":0.2,"1-2":0.15,"0-2":0.25}',
                      _json.dumps({"p1": {"elo": 1800.4, "experience": 50}, "p2": {"elo": 1700, "experience": 5}}), "v1", d))
    conn.commit()
    return conn


def datetime_now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


def test_export_one_bad_brief_never_aborts_and_rerun_is_byte_identical(tmp_path, monkeypatch):
    from engine import export_site as ex
    conn = _mini_db()
    real = ex.site_brief

    def fake(conn_, mid, cfg, weather=None):
        if mid == "m1":
            raise RuntimeError("boom")
        return {"match_id": mid, "buckets": [], "players": {}, "bottom_line": "x", "generated_at": datetime_now().isoformat(),
                "weather": weather}
    monkeypatch.setattr(ex, "site_brief", fake)
    (tmp_path / "players.json").write_text(_json.dumps({"rows": []}))
    st = ex.export(conn, tmp_path, tmp_path / "players.json", verbose=False)
    assert st["matches"] == 3 and st["error_count"] == 1 and st["briefs"] == 2
    p = _json.loads((tmp_path / "predictions.json").read_text())
    assert [m["brief"] for m in p["matches"]] == [True, False, True]
    assert p["matches"][0]["p2"]["rank"] is None and p["matches"][0]["low_data"] is True
    snap = {f: f.read_bytes() for f in tmp_path.rglob("*.json")}
    ex.export(conn, tmp_path, tmp_path / "players.json", now=datetime_now(), verbose=False)   # new generated_at, same content
    assert {f: f.read_bytes() for f in tmp_path.rglob("*.json")} == snap                      # nothing rewritten
    assert not list(tmp_path.rglob("*.tmp"))


def test_export_carries_weather_over_and_caps_briefs(tmp_path, monkeypatch):
    from engine import export_site as ex
    conn = _mini_db(4)
    (tmp_path / "players.json").write_text(_json.dumps({"rows": []}))
    calls = []
    monkeypatch.setattr(ex, "site_brief", lambda c, mid, cfg, weather=None: (calls.append((mid, weather)),
                        {"match_id": mid, "weather": weather, "buckets": []})[1])
    (tmp_path / "briefs").mkdir()
    (tmp_path / "briefs" / "m0.json").write_text(_json.dumps({"weather": {"temp_c": 20}}))
    st = ex.export(conn, tmp_path, tmp_path / "players.json", verbose=False, max_briefs=2)
    assert [m for m, _ in calls] == ["m0", "m1"]                    # soonest first, capped at 2
    assert dict(calls)["m0"] == {"temp_c": 20}                      # hourly run: weather kept from the earlier file
    assert st["briefs"] == 2 and (tmp_path / "briefs" / "m0.json").exists() and not (tmp_path / "briefs" / "m3.json").exists()


def test_backtest_coverage_note_follows_the_data():
    import pandas as pd
    from engine.backtest import coverage_note
    assert "no Challenger or ITF matches yet" in coverage_note(pd.Series(["250", "500"]), 2)
    assert "plus 2 Challenger and 1 ITF matches" in coverage_note(pd.Series(["250", "Challenger", "Challenger", "ITF"]), 4)
