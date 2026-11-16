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
