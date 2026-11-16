import pandas as pd
import pytest

from engine import odds_history as oh
from engine.backtest import betting_section, load_odds, round_group


def _db():
    from engine.db import connect
    conn = connect(":memory:")
    for pid, name in [("1", "Jannik Sinner"), ("2", "Alex de Minaur"), ("3", "Félix Auger-Aliassime"), ("4", "Carlos Alcaraz"),
                      ("5", "Iga Swiatek"), ("6", "Coco Gauff")]:
        conn.execute("INSERT INTO players VALUES(?,?,?,?)", (pid, name, "X", "WTA" if pid in "56" else "ATP"))
    rows = [("m1", "ATP", "2025-01-14T05:00:00Z", "1", "2", "1"),
            ("m2", "ATP", "2025-01-15T22:30:00Z", "4", "3", "3"),   # p2 won; late local-time match
            ("m3", "WTA", "2025-01-14T05:00:00Z", "5", "6", "5"),
            ("m4", "ATP", "2025-06-01T05:00:00Z", "1", "2", "2")]   # no odds row for this one
    for mid, tour, date, p1, p2, w in rows:
        conn.execute("INSERT INTO matches(id,tour,date,status,p1_id,p2_id,winner_id,best_of) VALUES(?,?,?,?,?,?,?,3)",
                     (mid, tour, date, "final", p1, p2, w))
    conn.commit()
    return conn


ATP_ROWS = pd.DataFrame({
    "Date": pd.to_datetime(["2025-01-14", "2025-01-16"]), "Tournament": ["X", "X"], "Round": ["1st Round"] * 2,
    "Winner": ["Sinner J.", "Auger-Aliassime F."], "Loser": ["De Minaur A.", "Alcaraz C."],
    "PSW": [1.4, 3.2], "PSL": [3.1, 1.35], "B365W": [1.36, 3.0], "B365L": [3.0, 1.4], "AvgW": [1.38, 3.1], "AvgL": [3.05, 1.37]})


def test_match_rows_names_window_winner_and_book_priority():
    conn = _db()
    our = oh.load_our_matches(conn)
    idx = oh.NameIndex(conn.execute("SELECT id,name FROM players").fetchall())
    rows, st = oh.match_rows(ATP_ROWS, "ATP", our, idx)
    assert st["matched"] == 2 and st["match_rate"] == 1.0
    by = {r["match_id"]: r for r in rows}
    assert by["m1"]["book"] == "pinnacle" and (by["m1"]["p1_odds"], by["m1"]["p2_odds"]) == (1.4, 3.1)
    # m2: winner was p2 (Auger-Aliassime), so p1 (Alcaraz) gets the loser odds
    assert (by["m2"]["p1_odds"], by["m2"]["p2_odds"]) == (1.35, 3.2)
    assert by["m2"]["fetched_at"] == "2025-01-15T22:30:00Z"


def test_wta_separated_and_result_mismatch_skipped():
    conn = _db()
    our, idx = oh.load_our_matches(conn), oh.NameIndex(conn.execute("SELECT id,name FROM players").fetchall())
    wta = pd.DataFrame({"Date": pd.to_datetime(["2025-01-14"]), "Winner": ["Swiatek I."], "Loser": ["Gauff C."],
                        "AvgW": [1.5], "AvgL": [2.6]})
    rows, st = oh.match_rows(wta, "WTA", our, idx)
    assert len(rows) == 1 and rows[0]["book"] == "avg"
    assert oh.match_rows(wta, "ATP", our, idx)[1]["matched"] == 0  # tour must agree
    wrong = wta.assign(Winner=["Gauff C."], Loser=["Swiatek I."])
    assert oh.match_rows(wrong, "WTA", our, idx)[1]["result_mismatch"] == 1


def test_missing_odds_columns_and_unknown_names_handled():
    conn = _db()
    our, idx = oh.load_our_matches(conn), oh.NameIndex(conn.execute("SELECT id,name FROM players").fetchall())
    df = pd.DataFrame({"Date": pd.to_datetime(["2025-01-14", "2025-01-14"]), "Winner": ["Nobody Z.", "Sinner J."],
                       "Loser": ["Else Q.", "De Minaur A."], "B365W": [1.5, None], "B365L": [2.5, None]})
    rows, st = oh.match_rows(df, "ATP", our, idx)
    assert rows == [] and st["with_odds"] == 1 and st["no_names"] == 1


def test_files_csv_and_xlsx_roundtrip_and_store(tmp_path):
    conn = _db()
    ATP_ROWS.assign(Date=ATP_ROWS["Date"].dt.strftime("%d/%m/%Y")).to_csv(tmp_path / "2025.csv", index=False)
    csv_df = oh.read_file(tmp_path / "2025.csv")
    assert oh.detect_tour(tmp_path / "2025.csv", csv_df) == "ATP" and oh.detect_tour(tmp_path / "2025w.csv") == "WTA"
    our, idx = oh.load_our_matches(conn), oh.NameIndex(conn.execute("SELECT id,name FROM players").fetchall())
    rows, st = oh.match_rows(csv_df, "ATP", our, idx)  # dd/mm/yyyy strings
    assert st["matched"] == 2
    pytest.importorskip("openpyxl")
    ATP_ROWS.to_excel(tmp_path / "atp_2025.xlsx", index=False)
    rows2, st2 = oh.match_rows(oh.read_file(tmp_path / "atp_2025.xlsx"), "ATP", our, idx)
    assert st2["matched"] == 2
    assert oh.store(conn, rows2) == 2 and oh.store(conn, rows2) == 2  # idempotent re-import
    assert conn.execute("SELECT COUNT(*) FROM odds WHERE source='tennis-data'").fetchone()[0] == 2


def test_run_reads_dropped_files_without_network(tmp_path, monkeypatch):
    pytest.importorskip("openpyxl")
    ATP_ROWS.to_excel(tmp_path / "2025.xlsx", index=False)
    conn = _db()
    monkeypatch.setattr(oh, "connect", lambda *a, **k: conn)
    res = oh.run([2025], tmp_path, do_download=False, verbose=False)
    assert res["matched"] == 2 and res["files"] == 1 and res["match_rate"] == 1.0


def test_parse_years_and_urls():
    assert oh.parse_years("2023-2026") == [2023, 2024, 2025, 2026] and oh.parse_years("2024,2026") == [2024, 2026]
    assert oh.url_candidates("ATP", 2025)[0] == "http://www.tennis-data.co.uk/2025/2025.xlsx"
    assert oh.url_candidates("WTA", 2025)[0] == "http://www.tennis-data.co.uk/2025w/2025.xlsx"


def test_round_group():
    assert round_group("Qualifying 1st Round") == "Qualifying" and round_group("Quarterfinal") == "Quarterfinal"
    assert round_group("Final") == "Final" and round_group("Semifinal") == "Semifinal" and round_group("Round 2") == "R32"


def test_betting_section_leak_free_inputs_and_roi():
    """Hand-built OOS frame + odds: verify staking, edge filter, baselines and payout maths."""
    fd = pd.DataFrame({"id": ["a", "b", "c"], "date": ["2025-02-01T10:00:00Z"] * 3, "tname": ["T"] * 3, "level": ["250"] * 3,
                       "surface": ["Hard"] * 3, "round": ["Final"] * 3, "p1_name": ["A", "B", "C"], "p2_name": ["X", "Y", "Z"]})
    oos = pd.DataFrame({"p_model": [0.70, 0.40, 0.55], "p_elo": [0.6, 0.45, 0.4], "y": [1.0, 0.0, 0.0], "split": ["s1"] * 3})
    odds = pd.DataFrame({"source": ["tennis-data"] * 3, "book": ["pinnacle"] * 3, "p1_odds": [1.60, 2.00, 1.80],
                         "p2_odds": [2.40, 1.90, 2.10]}, index=["a", "b", "c"])
    res = betting_section(fd, oos, odds, 0.02)
    bt = res["betting"]
    # a: p1 edge 0.7*1.6-1=0.12 (won, +0.6); b: p1 -0.2, p2 0.6*1.9-1=0.14 (y=0 -> p2 won, +0.9);
    # c: p1 edge -0.01, p2 0.45*2.1-1=-0.055 -> best edge -0.01 < 0 -> no bet
    assert bt["traded"] == 2 and bt["won"] == 2 and abs(bt["profit"] - 1.5) < 1e-9 and abs(bt["return_per_match"] - 0.75) < 1e-9
    assert len(res["bets"]) == 2 and {b["pick"] for b in res["bets"]} == {"p1", "p2"}
    # baseline: back the Elo favourite on all 3: a p1 +0.6, b p2 +0.9, c p2 (y=0 means p2 won) +1.1 -> 2.6
    assert abs(bt["baselines"]["elo_favourite"]["profit"] - 2.6) < 1e-9
    assert bt["model_vs_market"]["n"] == 3


def test_ambiguous_rematch_skipped_and_window_is_two_days():
    conn = _db()
    # rematch of Sinner v De Minaur one day after m1 -> two candidates fit a row dated in between
    conn.execute("INSERT INTO matches(id,tour,date,status,p1_id,p2_id,winner_id,best_of) VALUES('m5','ATP','2025-01-15T05:00:00Z','final','1','2','1',3)")
    conn.commit()
    our, idx = oh.load_our_matches(conn), oh.NameIndex(conn.execute("SELECT id,name FROM players").fetchall())
    row = pd.DataFrame({"Date": pd.to_datetime(["2025-01-14"]), "Winner": ["Sinner J."], "Loser": ["De Minaur A."],
                        "PSW": [1.4], "PSL": [3.1]})
    rows, st = oh.match_rows(row, "ATP", our, idx)
    assert rows == [] and st["ambiguous"] == 1
    far = row.assign(Date=pd.to_datetime(["2025-01-20"]))  # 5-6 days away: outside the +-2 day window
    rows, st = oh.match_rows(far, "ATP", our, idx)
    assert rows == [] and st["no_match"] == 1


def test_no_max_fallback_and_book_per_row():
    row = pd.Series({"MaxW": 2.0, "MaxL": 2.0})
    assert oh.pick_odds(row) is None
    assert oh.pick_odds(pd.Series({"B365W": 1.5, "B365L": 2.6, "MaxW": 9, "MaxL": 9}))[2] == "bet365"


def test_reimport_purges_prior_rows_for_year(tmp_path, monkeypatch):
    pytest.importorskip("openpyxl")
    conn = _db()
    conn.execute("INSERT INTO odds VALUES('m4','tennis-data','avg',1.5,2.5,'2025-06-01T05:00:00Z')")  # stale wrong row
    conn.commit()
    ATP_ROWS.to_excel(tmp_path / "2025.xlsx", index=False)
    monkeypatch.setattr(oh, "connect", lambda *a, **k: conn)
    oh.run([2025], tmp_path, do_download=False, verbose=False)
    assert conn.execute("SELECT COUNT(*) FROM odds WHERE match_id='m4'").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM odds WHERE source='tennis-data'").fetchone()[0] == 2
