"""Build a realistic demo database and backtest.json for developing and testing the Deuce dashboard.

    python tests/app/fixtures/make_demo_db.py --out /tmp/deuce-demo
    DEUCE_DB=/tmp/deuce-demo/tennis.db DEUCE_BACKTEST=/tmp/deuce-demo/backtest.json python -m app.server

Everything follows CONTRACT.md. Match times are relative to "now", so the Today / Tomorrow filters always
have something in them. Players are fictional. When tests/brief/fixtures/example_briefs.json exists (written
by the brief agent), its briefs and contexts are used for two of the matches.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BRIEF_FIXTURES = ROOT / "tests" / "brief" / "fixtures"

SCHEMA = """
CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY, name TEXT, country TEXT, tour TEXT);
CREATE TABLE IF NOT EXISTS tournaments(id TEXT PRIMARY KEY, name TEXT, tour TEXT, start_date TEXT, end_date TEXT,
    location TEXT, country TEXT, surface TEXT, surface_inferred INTEGER, level TEXT);
CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY, tournament_id TEXT, tour TEXT, round TEXT, date TEXT,
    status TEXT, p1_id TEXT, p2_id TEXT, winner_id TEXT, score TEXT, sets_json TEXT, best_of INTEGER, court TEXT);
CREATE TABLE IF NOT EXISTS predictions(match_id TEXT PRIMARY KEY, p1_prob REAL, p2_prob REAL, set_probs_json TEXT,
    features_json TEXT, model_version TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS odds(match_id TEXT, source TEXT, book TEXT, p1_odds REAL, p2_odds REAL, fetched_at TEXT);
CREATE TABLE IF NOT EXISTS briefs(match_id TEXT PRIMARY KEY, brief_json TEXT, engine TEXT, created_at TEXT);
"""

# --------------------------------------------------------------------------- players

# id: (name, country, tour, elo, surface offsets {surface: delta}, rank)
PLAYERS = {
    "9001": ("Jonas Keller", "GER", "ATP", 1850, {}, 23),
    "9002": ("Mateo Alvarez", "URU", "ATP", 1788, {}, 47),
    "9003": ("Luca Ortega", "ARG", "ATP", 1742, {"Clay": 30}, 61),
    "9004": ("Tobias Brandt", "AUT", "ATP", 1768, {"Clay": 10}, 52),
    "9005": ("Hugo Sandoval", "CHI", "ATP", 1690, {"Clay": 25}, 88),
    "9006": ("Lucas Pereira", "BRA", "ATP", 1720, {"Clay": 40}, 70),
    "9007": ("Pierre Duval", "FRA", "ATP", 1801, {"Clay": -10}, 39),
    "9008": ("Rafael Mendes", "POR", "ATP", 1705, {"Clay": 20}, 79),
    "9009": ("Facundo Ríos", "ARG", "ATP", 1776, {"Clay": 35}, 44),
    "9010": ("Bruno Kovač", "CRO", "ATP", 1758, {"Clay": 5}, 55),
    "9011": ("Nicolás Ferreyra", "ARG", "ATP", 1731, {"Clay": 45}, 66),
    "9012": ("Daniel Ott", "SUI", "ATP", 1764, {"Clay": -20}, 50),
    "7001": ("Elena Markovic", "SRB", "WTA", 1702, {"Indoor Hard": 13}, 38),
    "7002": ("Sofia Lindqvist", "SWE", "WTA", 1688, {"Indoor Hard": -12}, 44),
    "7003": ("Anna Hofer", "AUT", "WTA", 1741, {"Indoor Hard": 22}, 29),
    "7004": ("Hanna Berg", "NOR", "WTA", 1660, {"Indoor Hard": 5}, 71),
    "7005": ("Léa Fontaine", "FRA", "WTA", 1725, {"Indoor Hard": 18}, 33),
    "7006": ("Yuki Tanabe", "JPN", "WTA", 1679, {"Indoor Hard": -8}, 58),
    "7007": ("Maja Kowalczyk", "POL", "WTA", 1758, {"Indoor Hard": -15}, 24),
    "7008": ("Kateřina Dvořáková", "CZE", "WTA", 1733, {"Indoor Hard": 30}, 31),
    "7101": ("Valeria Ochoa", "MEX", "WTA", 1712, {"Hard": -14}, 41),
    "7102": ("Grace Whitfield", "USA", "WTA", 1795, {"Hard": 25}, 19),
    "7103": ("Camila Duarte", "BRA", "WTA", 1698, {"Hard": 6}, 49),
    "7104": ("Irina Volkova", "KAZ", "WTA", 1681, {"Hard": 10}, 57),
    "7105": ("Chloe Bennett", "GBR", "WTA", 1709, {"Hard": 0}, 45),
    "7106": ("Ana Lucía Pérez", "COL", "WTA", 1664, {"Hard": -5}, 74),
    "7107": ("Zoe Harrington", "AUS", "WTA", 1749, {"Hard": 12}, 27),
}

OPPONENT_POOL = {
    "ATP": ["T. Brandt", "L. Ortega", "P. Duval", "S. Moreau", "K. Nakamura", "J. Lindgren", "M. Rossi", "A. Petrov",
            "D. Coleman", "E. Varga", "F. Bianchi", "R. Okafor"],
    "WTA": ["A. Hofer", "M. Kowalczyk", "L. Fontaine", "Y. Tanabe", "C. Duarte", "I. Volkova", "N. Fischer",
            "E. Rossi", "P. Novak", "S. Ahmed", "T. Ivanova", "J. Park"],
}

TOURNAMENTS = {
    "t-mvd": ("Montevideo Open", "ATP", "Montevideo, Uruguay", "Uruguay", "Clay", "ATP 250"),
    "t-linz": ("Linz Indoor Open", "WTA", "Linz, Austria", "Austria", "Indoor Hard", "WTA 500"),
    "t-gdl": ("Guadalajara Open", "WTA", "Guadalajara, Mexico", "Mexico", "Hard", "WTA 500"),
}
HOME = {"9002": "t-mvd", "7003": "t-linz", "7101": "t-gdl"}


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def side_features(pid: str, surface: str, as_of: datetime, rng: random.Random, overrides: dict | None = None) -> dict:
    name, country, tour, elo, offs, rank = PLAYERS[pid]
    strength = (elo - 1650) / 250  # roughly 0..1
    wr = clamp(0.45 + 0.25 * strength + rng.uniform(-0.04, 0.04), 0.3, 0.8)
    form = clamp(round((wr + rng.uniform(-0.15, 0.15)) * 10) / 10, 0.2, 1.0)
    surf_delta = offs.get(surface, 0)
    swr = clamp(wr + surf_delta / 400 + rng.uniform(-0.05, 0.05), 0.25, 0.85)
    f = {
        "elo": float(elo), "surface_elo": float(elo + surf_delta), "elo_trend_90d": round(rng.uniform(-30, 40), 1),
        "rank": rank, "win_rate_1y": round(wr, 2), "form_10": form, "momentum": round(rng.uniform(-0.08, 0.1), 2),
        "surface_win_rate_1y": round(swr, 2), "surface_matches_1y": rng.randint(8, 34),
        "games_won_pct_1y": round(clamp(0.47 + 0.08 * strength + rng.uniform(-0.02, 0.02), 0.4, 0.6), 2),
        "tiebreak_win_pct_1y": round(clamp(0.45 + 0.15 * strength + rng.uniform(-0.08, 0.08), 0.25, 0.75), 2),
        "deciding_set_win_pct_1y": round(clamp(0.45 + 0.15 * strength + rng.uniform(-0.1, 0.1), 0.2, 0.8), 2),
        "experience": rng.randint(120, 460), "common_opp_win_rate": round(clamp(wr + rng.uniform(-0.08, 0.08), 0.2, 0.9), 2),
        "quality_form_30d": round(clamp(0.3 + 0.25 * strength + rng.uniform(-0.1, 0.1), 0.1, 0.8), 2),
        "comeback_rate": round(rng.uniform(0.12, 0.32), 2),
        "matches_7d": 0, "matches_14d": 0, "sets_14d": 0, "games_14d": 0, "days_since_last": 0,
        "last_match_retired": False, "matches_on_surface_90d": rng.randint(2, 12), "home": HOME.get(pid) is not None,
    }
    m14 = rng.randint(2, 6)
    f.update({"matches_14d": m14, "matches_7d": min(m14, rng.randint(1, 4)), "sets_14d": m14 * 2 + rng.randint(0, m14),
              "days_since_last": rng.randint(1, 5)})
    f["games_14d"] = f["sets_14d"] * rng.randint(9, 11)
    if overrides:
        f.update(overrides)
    # last 5 matches, newest first
    pool = [o for o in OPPONENT_POOL[tour] if not name.endswith(o.split(". ")[-1])]
    last5, d = [], as_of - timedelta(days=f["days_since_last"])
    wins_left = round(f["form_10"] * 5)
    for i in range(5):
        won = i < wins_left if rng.random() < 0.7 else rng.random() < f["form_10"]
        s1 = rng.choice(["6-3", "6-4", "7-5", "6-2", "7-6"])
        s2 = rng.choice(["6-4", "6-3", "7-6", "6-1"])
        score = f"{s1} {s2}" if rng.random() < 0.6 else f"{s1} {'-'.join(reversed(s2.split('-')))} 6-4"
        if not won:
            score = " ".join("-".join(reversed(s.split("-"))) for s in score.split())
        last5.append({"date": d.strftime("%Y-%m-%d"), "opponent": rng.choice(pool), "result": "W" if won else "L",
                      "score": score, "tournament": rng.choice(["Rennes Challenger", "Bratislava", "Stockholm", "Basel",
                                                               "Paris Masters", "Athens", "Montevideo Open"])
                      if tour == "ATP" else rng.choice(["Hong Kong", "Tokyo", "Jiujiang", "Merida", "Chennai",
                                                        "Linz Indoor Open", "Guadalajara Open"])})
        d -= timedelta(days=rng.randint(1, 6))
    f["last5"] = last5
    return f


def radar_of(f: dict) -> dict:
    def sc(v, lo, hi):
        return None if v is None else int(round(clamp((v - lo) / (hi - lo), 0, 1) * 100))
    return {
        "Win Rate": sc(f.get("win_rate_1y"), 0.3, 0.8), "Form": sc(f.get("form_10"), 0.1, 1.0),
        "Momentum": sc(f.get("momentum"), -0.12, 0.12), "Surface": sc(f.get("surface_win_rate_1y"), 0.25, 0.85),
        "Games Won": sc(f.get("games_won_pct_1y"), 0.42, 0.6), "Tiebreaks": sc(f.get("tiebreak_win_pct_1y"), 0.25, 0.75),
        "Experience": sc(f.get("experience"), 50, 500), "Common Opponents": sc(f.get("common_opp_win_rate"), 0.2, 0.85),
        "Quality Form": sc(f.get("quality_form_30d"), 0.1, 0.7), "Comeback": sc(f.get("comeback_rate"), 0.05, 0.4),
    }


def set_probs(p1: float, best_of: int = 3) -> dict:
    """Per-set probability s so that the match probability matches p1, then the scoreline distribution."""
    need = best_of // 2 + 1

    def match_p(s):
        return sum(math.comb(need - 1 + k, k) * s ** need * (1 - s) ** k for k in range(need))

    lo, hi = 0.0, 1.0
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if match_p(mid) < p1 else (lo, mid)
    s = (lo + hi) / 2
    out = {}
    for k in range(need):
        c = math.comb(need - 1 + k, k)
        out[f"{need}-{k}"] = round(c * s ** need * (1 - s) ** k, 4)
        out[f"{k}-{need}"] = round(c * (1 - s) ** need * s ** k, 4)
    return out


def market_odds(q1: float, margin: float = 1.035) -> tuple[float, float]:
    return round(1 / (q1 * margin), 2), round(1 / ((1 - q1) * margin), 2)


# --------------------------------------------------------------------------- the hand-written third brief

WHITFIELD_BRIEF = {
    "match_id": "gdl-qf-1",
    "tournament": "Guadalajara Open", "surface": "Hard",
    "model_pick": "p2", "model_prob": 0.62,
    "agreement": {"score": 75, "label": "Strong agreement"},
    "buckets": [
        {"key": "fitness", "title": "Fitness & Fatigue", "favours": "p2", "strength": "moderate",
         "text": "Whitfield arrives far fresher. She has played 58 games in the last 14 days against 121 for Ochoa, "
                 "who has been on court three times this week and played yesterday. Whitfield has had four days off.",
         "facts": [{"label": "Matches, last 7 days", "p1": 3, "p2": 1},
                   {"label": "Matches, last 14 days", "p1": 5, "p2": 3},
                   {"label": "Games, last 14 days", "p1": 121, "p2": 58},
                   {"label": "Days since last match", "p1": 1, "p2": 4},
                   {"label": "Retired last match", "p1": "No", "p2": "No"}]},
        {"key": "motivation", "title": "Motivation & Pressure", "favours": "level", "strength": None,
         "text": "The signals cancel out. Ochoa is the home player in Guadalajara and should have the crowd on the big "
                 "points. Whitfield leads the head-to-head 2-0 and is the one trending up, +28 Elo over 90 days "
                 "against -6 for Ochoa.",
         "facts": [{"label": "Home player", "p1": "Yes", "p2": "No"},
                   {"label": "Elo trend, 90 days", "p1": -6.0, "p2": 28.0},
                   {"label": "Head-to-head wins", "p1": 0, "p2": 2},
                   {"label": "Deciding-set win % (1y)", "p1": 47.0, "p2": 64.0}]},
        {"key": "conditions", "title": "Conditions", "favours": "p2", "strength": "moderate",
         "text": "Whitfield is the stronger hard-court player on every measure: 70% wins on hard over 12 months "
                 "(27 matches) against 52% for Ochoa (19). Her hard-court Elo sits 25 above her overall rating, "
                 "Ochoa's 14 below. A dry, mild evening, 21°C with little wind, shouldn't change that.",
         "facts": [{"label": "Hard win % (1y)", "p1": 52.0, "p2": 70.0},
                   {"label": "Matches on surface (1y)", "p1": 19, "p2": 27},
                   {"label": "Surface Elo", "p1": 1698, "p2": 1820},
                   {"label": "Surface Elo minus overall Elo", "p1": -14, "p2": 25},
                   {"label": "Tiebreak win % (1y)", "p1": 44.0, "p2": 61.0}]},
        {"key": "market", "title": "Market", "favours": "p2", "strength": "moderate",
         "text": "With the margin stripped out, the books make Whitfield a 55% favourite. The model is higher still "
                 "at 62%. The price has shortened since opening, 1.87 to 1.74, but at 1.74 the model still sees a "
                 "7.9% edge on Whitfield (fair price 1.61).",
         "facts": [{"label": "Model win %", "p1": 38.0, "p2": 62.0},
                   {"label": "Market win % (no vig)", "p1": 45.3, "p2": 54.7},
                   {"label": "Opening market win %", "p1": 48.9, "p2": 51.1},
                   {"label": "Best decimal odds", "p1": 2.10, "p2": 1.74},
                   {"label": "Value edge %", "p1": -20.2, "p2": 7.9}]},
    ],
    "players": {
        "p1": {"name": "Valeria Ochoa",
               "upsides": ["Home player, and 6 wins in her last 10 matches",
                           "Games won 51% over 12 months, so rarely blown off court"],
               "downsides": ["121 games in 14 days, more than twice Whitfield's 58",
                             "Wins 52% on hard over 12 months against 70%",
                             "Wins only 44% of tiebreaks (1y)",
                             "0-2 in the head-to-head"]},
        "p2": {"name": "Grace Whitfield",
               "upsides": ["Fresh: 58 games in 14 days and 4 days' rest",
                           "70% win rate on hard over 12 months (27 matches)",
                           "Elo up 28 in 90 days, 8 of her last 10 won",
                           "Model edge of 7.9% at 1.74"],
               "downsides": ["Price has shortened from 1.87 to 1.74, so some value is gone",
                             "Only 3 matches in 14 days: some rust risk after 4 days off"]},
    },
    "value": {"side": "p2", "edge": 0.079, "fair_odds": 1.61, "market_odds": 1.74},
    "weather": {"temp_c": 21.0, "humidity": 38, "wind_kph": 9, "precip_mm": 0.0, "summary": "Dry and mild"},
    "bottom_line": "Whitfield is the pick at 62%, and three of the four signals point her way. She is fresher, "
                   "better on hard courts and still a shade underpriced at 1.74; the home crowd is Ochoa's best hope.",
    "engine": "llm:qwen2.5-7b-instruct",
    "generated_at": None,
}

WHITFIELD_OVR = {
    "7101": {"elo": 1712.0, "surface_elo": 1698.0, "elo_trend_90d": -6.0, "rank": 41, "win_rate_1y": 0.55,
             "form_10": 0.6, "momentum": -0.02, "surface_win_rate_1y": 0.52, "surface_matches_1y": 19,
             "games_won_pct_1y": 0.51, "tiebreak_win_pct_1y": 0.44, "deciding_set_win_pct_1y": 0.47,
             "experience": 198, "common_opp_win_rate": 0.48, "quality_form_30d": 0.36, "comeback_rate": 0.19,
             "matches_7d": 3, "matches_14d": 5, "sets_14d": 12, "games_14d": 121, "days_since_last": 1,
             "matches_on_surface_90d": 6, "home": True},
    "7102": {"elo": 1795.0, "surface_elo": 1820.0, "elo_trend_90d": 28.0, "rank": 19, "win_rate_1y": 0.66,
             "form_10": 0.8, "momentum": 0.06, "surface_win_rate_1y": 0.70, "surface_matches_1y": 27,
             "games_won_pct_1y": 0.55, "tiebreak_win_pct_1y": 0.61, "deciding_set_win_pct_1y": 0.64,
             "experience": 286, "common_opp_win_rate": 0.62, "quality_form_30d": 0.52, "comeback_rate": 0.27,
             "matches_7d": 1, "matches_14d": 3, "sets_14d": 6, "games_14d": 58, "days_since_last": 4,
             "matches_on_surface_90d": 9, "home": False},
}


# --------------------------------------------------------------------------- builder

def build(db_path: str | Path, backtest_path: str | Path | None = None, *, now: datetime | None = None,
          betting: bool = True, seed: int = 7) -> Path:
    rng = random.Random(seed)
    now = now or datetime.now(timezone.utc)
    day0 = now.replace(hour=0, minute=0, second=0, microsecond=0)

    def at(days: int, hhmm: str) -> datetime:
        h, m = map(int, hhmm.split(":"))
        return day0 + timedelta(days=days, hours=h, minutes=m)

    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)

    # Brief fixtures from the brief agent, if present.
    fx_briefs, fx_ctx = {}, {}
    if (BRIEF_FIXTURES / "example_briefs.json").is_file():
        try:
            for b in json.loads((BRIEF_FIXTURES / "example_briefs.json").read_text()):
                fx_briefs[b["match_id"]] = b
            for f in BRIEF_FIXTURES.glob("context_*.json"):
                c = json.loads(f.read_text())
                fx_ctx[c["match_id"]] = c
        except (ValueError, KeyError):
            fx_briefs, fx_ctx = {}, {}

    for pid, (name, country, tour, *_rest) in PLAYERS.items():
        conn.execute("INSERT INTO players VALUES (?,?,?,?)", (pid, name, country, tour))
    for tid, (name, tour, loc, country, surface, level) in TOURNAMENTS.items():
        conn.execute("INSERT INTO tournaments VALUES (?,?,?,?,?,?,?,?,?,?)",
                     (tid, name, tour, (day0 - timedelta(days=3)).date().isoformat(),
                      (day0 + timedelta(days=4)).date().isoformat(), loc, country, surface, 0, level))

    # (id, tournament, round, when, status, p1, p2, winner, score, sets, p1_prob | None, court)
    M = [
        ("mvd-r16-1", "t-mvd", "Round of 16", at(-1, "15:00"), "final", "9002", "9005", "9002", "6-2 6-3",
         [[6, 2, None, None], [6, 3, None, None]], 0.71, "Cancha Central"),
        ("mvd-r16-2", "t-mvd", "Round of 16", at(-1, "17:30"), "final", "9003", "9006", "9006", "6-3 3-6 4-6",
         [[6, 3, None, None], [3, 6, None, None], [4, 6, None, None]], 0.55, "Cancha 1"),
        ("mvd-r16-3", "t-mvd", "Round of 16", at(0, "11:00"), "final", "9007", "9008", "9007", "6-4 6-4",
         [[6, 4, None, None], [6, 4, None, None]], 0.66, "Cancha 1"),
        ("mvd-r16-4", "t-mvd", "Round of 16", at(0, "13:00"), "final", "9001", "9004", "9001", "7-6 6-7 7-5",
         [[7, 6, 7, 5], [6, 7, 4, 7], [7, 5, None, None]], 0.58, "Cancha Central"),
        ("mvd-r16-5", "t-mvd", "Round of 16", at(0, "15:30"), "live", "9009", "9010", None, "6-4 3-2",
         [[6, 4, None, None], [3, 2, None, None]], 0.57, "Cancha Central"),
        ("mvd-r16-6", "t-mvd", "Round of 16", at(0, "18:00"), "scheduled", "9011", "9012", None, None, None, 0.52,
         "Cancha 1"),
        ("fx-montevideo-1", "t-mvd", "Quarterfinal", at(1, "16:00"), "scheduled", "9001", "9002", None, None, None,
         0.61, "Cancha Central"),
        ("mvd-qf-2", "t-mvd", "Quarterfinal", at(1, "18:30"), "scheduled", "9006", "9007", None, None, None, 0.41,
         "Cancha Central"),
        ("linz-r16-1", "t-linz", "Round of 16", at(-1, "12:00"), "final", "7003", "7004", "7003", "6-3 7-5",
         [[6, 3, None, None], [7, 5, None, None]], 0.68, "Centre Court"),
        ("linz-r16-2", "t-linz", "Round of 16", at(-1, "14:00"), "retired", "7005", "7006", "7005", "6-2 2-1 ret.",
         [[6, 2, None, None], [2, 1, None, None]], 0.6, "Court 1"),
        ("linz-r16-3", "t-linz", "Round of 16", at(0, "17:00"), "scheduled", "7007", "7008", None, None, None, 0.47,
         "Centre Court"),
        ("linz-qf-1", "t-linz", "Quarterfinal", at(0, "19:30"), "scheduled", "7003", "7005", None, None, None, 0.56,
         "Centre Court"),
        ("fx-indoor-2", "t-linz", "Round of 16", at(2, "12:30"), "scheduled", "7001", "7002", None, None, None, 0.54,
         "Court 1"),
        ("gdl-r16-1", "t-gdl", "Round of 16", at(-1, "23:00"), "final", "7103", "7104", "7103", "7-5 6-4",
         [[7, 5, None, None], [6, 4, None, None]], 0.55, "Estadio"),
        ("gdl-r16-2", "t-gdl", "Round of 16", at(1, "00:00"), "scheduled", "7105", "7106", None, None, None, 0.61,
         "Cancha 2"),
        ("gdl-qf-1", "t-gdl", "Quarterfinal", at(1, "02:00"), "scheduled", "7101", "7102", None, None, None, 0.38,
         "Estadio"),
        ("gdl-qf-2", "t-gdl", "Quarterfinal", at(2, "01:30"), "scheduled", "7107", "7103", None, None, None, 0.63,
         "Estadio"),
    ]

    created = iso(now - timedelta(hours=2))
    for mid, tid, rnd, when, status, p1, p2, winner, score, sets, prob, court in M:
        tour = TOURNAMENTS[tid][1]
        surface = TOURNAMENTS[tid][4]
        conn.execute("INSERT INTO matches VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                     (mid, tid, tour, rnd, iso(when), status, p1, p2, winner, score,
                      json.dumps(sets) if sets else None, 3, court))
        ctx = fx_ctx.get(mid)
        if ctx:
            feats = json.loads(json.dumps(ctx["features"]))
            feats["as_of"] = iso(when)
            for side, pid in (("p1", p1), ("p2", p2)):
                if not feats[side].get("last5"):
                    feats[side]["last5"] = side_features(pid, surface, when, rng)["last5"]
            if not (feats.get("radar") or {}).get("p1"):
                feats["radar"] = {"p1": radar_of(feats["p1"]), "p2": radar_of(feats["p2"])}
            prob = ctx.get("p1_prob", prob)
        else:
            f1 = side_features(p1, surface, when, rng, WHITFIELD_OVR.get(p1))
            f2 = side_features(p2, surface, when, rng, WHITFIELD_OVR.get(p2))
            if mid == "gdl-qf-1":
                f2["last5"] = [dict(g, result="W") for g in f2["last5"][:4]] + f2["last5"][4:]
            h2h_n = rng.randint(0, 3)
            last = []
            for k in range(h2h_n):
                w = rng.choice(["p1", "p2"])
                last.append({"date": (when - timedelta(days=120 + 160 * k)).strftime("%Y-%m-%d"), "winner": w,
                             "score": rng.choice(["6-4 6-3", "7-6 4-6 6-3", "6-2 7-5"]),
                             "tournament": rng.choice(["Madrid", "Rome", "Miami", "Cincinnati", "Doha", "Beijing"]),
                             "surface": rng.choice(["Hard", "Clay"])})
            if mid == "gdl-qf-1":
                last = [{"date": "2025-08-12", "winner": "p2", "score": "6-3 6-4", "tournament": "Cincinnati", "surface": "Hard"},
                        {"date": "2024-03-09", "winner": "p2", "score": "4-6 6-3 6-2", "tournament": "Indian Wells", "surface": "Hard"}]
            feats = {
                "as_of": iso(when), "p1": f1, "p2": f2,
                "h2h": {"p1_wins": sum(1 for g in last if g["winner"] == "p1"),
                        "p2_wins": sum(1 for g in last if g["winner"] == "p2"), "last": last},
                "common_opponents": rng.randint(2, 11),
                "radar": {"p1": radar_of(f1), "p2": radar_of(f2)},
            }
        conn.execute("INSERT INTO predictions VALUES (?,?,?,?,?,?,?)",
                     (mid, prob, round(1 - prob, 4), json.dumps(set_probs(prob)), json.dumps(feats),
                      "demo-lgbm-2026.11", created))

    # Odds: (match, [(hours_before_now, q1, source, book)])
    def add_odds(mid, rows):
        for hrs, q1, source, book in rows:
            o1, o2 = market_odds(q1, 1.025 if source == "pinnacle" else 1.05)
            conn.execute("INSERT INTO odds VALUES (?,?,?,?,?,?)",
                         (mid, source, book, o1, o2, iso(now - timedelta(hours=hrs))))

    add_odds("mvd-r16-1", [(30, 0.70, "pinnacle", "Pinnacle")])
    add_odds("mvd-r16-2", [(28, 0.56, "pinnacle", "Pinnacle")])
    add_odds("mvd-r16-4", [(14, 0.55, "pinnacle", "Pinnacle"), (6, 0.53, "pinnacle", "Pinnacle")])
    add_odds("mvd-r16-5", [(10, 0.55, "pinnacle", "Pinnacle")])
    add_odds("mvd-r16-6", [(20, 0.53, "pinnacle", "Pinnacle"), (8, 0.52, "pinnacle", "Pinnacle")])
    add_odds("mvd-qf-2", [(5, 0.40, "pinnacle", "Pinnacle"), (2, 0.42, "pinnacle", "Pinnacle")])
    add_odds("linz-r16-1", [(30, 0.66, "pinnacle", "Pinnacle")])
    add_odds("linz-r16-3", [(26, 0.58, "pinnacle", "Pinnacle"), (18, 0.56, "pinnacle", "Pinnacle"),
                            (9, 0.55, "pinnacle", "Pinnacle"), (3, 0.565, "pinnacle", "Pinnacle")])
    add_odds("linz-qf-1", [(12, 0.57, "pinnacle", "Pinnacle"), (4, 0.555, "pinnacle", "Pinnacle")])
    add_odds("gdl-r16-1", [(36, 0.54, "pinnacle", "Pinnacle")])
    add_odds("gdl-qf-2", [(3, 0.60, "pinnacle", "Pinnacle")])
    # The Whitfield match: exact prices the brief quotes.
    for hrs, o1, o2 in ((20, 1.95, 1.87), (9, 2.05, 1.78), (2, 2.10, 1.74)):
        conn.execute("INSERT INTO odds VALUES (?,?,?,?,?,?)",
                     ("gdl-qf-1", "pinnacle", "Pinnacle", o1, o2, iso(now - timedelta(hours=hrs))))
    # The Montevideo fixture's odds, as the brief agent wrote them.
    mv = fx_ctx.get("fx-montevideo-1")
    mv_odds = (mv or {}).get("odds") or [
        {"source": "manual", "book": "Bet365", "p1_odds": 1.95, "p2_odds": 1.90},
        {"source": "manual", "book": "Bet365", "p1_odds": 2.10, "p2_odds": 1.78}]
    for k, o in enumerate(mv_odds):
        conn.execute("INSERT INTO odds VALUES (?,?,?,?,?,?)",
                     ("fx-montevideo-1", o["source"], o.get("book"), o["p1_odds"], o["p2_odds"],
                      iso(now - timedelta(hours=10 - 8 * k / max(1, len(mv_odds) - 1)))))

    # Briefs
    briefs = dict(fx_briefs)
    wb = dict(WHITFIELD_BRIEF, generated_at=iso(now - timedelta(minutes=40)))
    briefs["gdl-qf-1"] = wb
    for mid, b in briefs.items():
        if not any(m[0] == mid for m in M):
            continue
        b = dict(b)
        b["generated_at"] = b.get("generated_at") or iso(now - timedelta(hours=1))
        conn.execute("INSERT INTO briefs VALUES (?,?,?,?)", (mid, json.dumps(b), b.get("engine"), b["generated_at"]))

    conn.commit()
    conn.close()

    if backtest_path:
        write_backtest(backtest_path, betting=betting, seed=seed, now=now)
    return db_path


# --------------------------------------------------------------------------- backtest

BT_EVENTS = [  # (name, ATP level, surface, month, ATP and WTA both)
    ("Auckland", "250", "Hard", 1), ("Australian Open", "GS", "Hard", 1), ("Doha", "500", "Hard", 2),
    ("Indian Wells", "1000", "Hard", 3), ("Miami", "1000", "Hard", 3), ("Estoril", "250", "Clay", 4),
    ("Monte Carlo", "1000", "Clay", 4), ("Madrid", "1000", "Clay", 4), ("Rome", "1000", "Clay", 5),
    ("Roland Garros", "GS", "Clay", 5), ("Halle", "500", "Grass", 6), ("Eastbourne", "250", "Grass", 6),
    ("Wimbledon", "GS", "Grass", 7), ("Washington", "500", "Hard", 7), ("Cincinnati", "1000", "Hard", 8),
    ("US Open", "GS", "Hard", 8), ("Beijing", "500", "Hard", 9), ("Shanghai", "1000", "Hard", 10),
    ("Vienna", "500", "Indoor Hard", 10), ("Metz", "250", "Indoor Hard", 11), ("Paris", "1000", "Indoor Hard", 11),
]
ROUNDS_GS = ["1st Round", "2nd Round", "3rd Round", "4th Round", "Quarterfinals", "Semifinals", "The Final"]
ROUNDS = ["1st Round", "2nd Round", "Quarterfinals", "Semifinals", "The Final"]
FIRST = ["Jonas", "Mateo", "Luca", "Pierre", "Bruno", "Daniel", "Hugo", "Tomás", "Kenji", "Erik", "Marco", "Ivan"]
LAST = ["Keller", "Alvarez", "Ortega", "Duval", "Kovač", "Ott", "Sandoval", "Brandt", "Nakamura", "Lindgren",
        "Rossi", "Petrov", "Coleman", "Varga", "Bianchi", "Okafor", "Moreau", "Fischer"]
FIRST_W = ["Elena", "Sofia", "Anna", "Maja", "Léa", "Yuki", "Grace", "Camila", "Irina", "Chloe", "Zoe", "Nadia"]


def level_name(code: str, tour: str) -> str:
    if code == "GS":
        return "Grand Slam"
    return {"ATP": {"1000": "Masters 1000", "500": "ATP 500", "250": "ATP 250"},
            "WTA": {"1000": "WTA 1000", "500": "WTA 500", "250": "WTA 250"}}[tour][code]


def synth_bets(rng: random.Random, until: date) -> list[dict]:
    bets = []
    for year in (2024, 2025, 2026):
        for name, lvl, surface, month in BT_EVENTS:
            for tour in ("ATP", "WTA"):
                if name in ("Halle", "Vienna", "Metz", "Estoril", "Monte Carlo", "Shanghai", "Paris") and tour == "WTA":
                    continue
                start = date(year, month, 1 if name not in ("Miami", "Madrid", "Rome", "Roland Garros", "Wimbledon",
                                                             "US Open", "Paris") else 15)
                if start > until:
                    continue
                n = {"GS": 46, "1000": 28, "500": 13, "250": 8}[lvl] + rng.randint(-4, 4)
                rounds = ROUNDS_GS if lvl == "GS" else ROUNDS
                for _ in range(n):
                    ri = min(len(rounds) - 1, int(rng.expovariate(1.1)))
                    d = start + timedelta(days=min(13, ri * 2 + rng.randint(0, 1)))
                    if d > until:
                        continue
                    prob = clamp(rng.betavariate(5, 4), 0.22, 0.9)
                    edge = rng.uniform(0, 0.02) if rng.random() < 0.18 else min(0.6, rng.expovariate(1 / 0.075))
                    odds = round((1 + edge) / prob, 2)
                    while prob * odds < 1:
                        odds = round(odds + 0.01, 2)
                    edge = prob * odds - 1
                    adj = {"Grass": 0.955, "Clay": 1.012, "Indoor Hard": 1.0, "Hard": 1.004}[surface]
                    if rounds[ri] == "The Final":
                        adj *= 0.97
                    true_p = clamp(prob * (1 + edge) ** -0.72 * adj, 0.02, 0.97)
                    won = rng.random() < true_p
                    fn = FIRST if tour == "ATP" else FIRST_W
                    a = f"{rng.choice(fn)} {rng.choice(LAST)}"
                    b = f"{rng.choice(fn)} {rng.choice(LAST)}"
                    while b.split()[-1] == a.split()[-1]:
                        b = f"{rng.choice(fn)} {rng.choice(LAST)}"
                    bets.append({
                        "date": d.isoformat(), "tour": tour, "tournament": name, "level": level_name(lvl, tour),
                        "surface": surface, "round": rounds[ri], "p1": a, "p2": b, "pick": rng.choice(["p1", "p2"]),
                        "prob": round(prob, 4), "odds": odds, "won": won,
                        "profit": round(odds - 1, 2) if won else -1.0,
                    })
    bets.sort(key=lambda x: x["date"])
    return bets


def write_backtest(path: str | Path, *, betting: bool = True, seed: int = 7, now: datetime | None = None) -> Path:
    rng = random.Random(seed + 1)
    now = now or datetime.now(timezone.utc)
    until = min(date(2026, 10, 31), now.date())
    splits = [
        {"name": "Split 1", "train_end": "2023-12-31", "test_start": "2024-01-01", "test_end": "2024-12-31",
         "n": 5214, "accuracy": 0.664, "brier": 0.2093, "log_loss": 0.6061, "elo_accuracy": 0.651, "elo_brier": 0.2141},
        {"name": "Split 2", "train_end": "2024-12-31", "test_start": "2025-01-01", "test_end": "2025-12-31",
         "n": 5388, "accuracy": 0.671, "brier": 0.2061, "log_loss": 0.5994, "elo_accuracy": 0.655, "elo_brier": 0.2122},
        {"name": "Split 3", "train_end": "2025-12-31", "test_start": "2026-01-01", "test_end": until.isoformat(),
         "n": 4471, "accuracy": 0.668, "brier": 0.2079, "log_loss": 0.6032, "elo_accuracy": 0.649, "elo_brier": 0.2150},
    ]
    calib = []
    for i in range(10):
        lo = i / 10
        pred = lo + 0.05 + rng.uniform(-0.01, 0.01)
        n = int(2600 * math.exp(-((pred - 0.5) ** 2) / 0.09)) + 60
        calib.append({"bin": f"{lo:.1f}-{lo + 0.1:.1f}", "predicted": round(pred, 3),
                      "actual": round(clamp(pred + rng.uniform(-0.025, 0.025) + (0.5 - pred) * 0.04, 0, 1), 3), "n": n})
    rolling = []
    d = date(2024, 1, 1)
    while d <= until:
        rolling.append({"date": d.isoformat(), "accuracy": round(0.667 + rng.uniform(-0.03, 0.03), 3),
                        "brier": round(0.208 + rng.uniform(-0.012, 0.012), 4), "n": rng.randint(320, 520)})
        d = date(d.year + (d.month == 12), d.month % 12 + 1, 1)

    data = {
        "generated_at": iso(now - timedelta(hours=5)),
        "splits": splits, "calibration": calib, "rolling": rolling,
        "notes": ["Walk-forward: each split is predicted by a model trained only on matches before it.",
                  "Demo data generated by tests/app/fixtures/make_demo_db.py, not real results."],
        "betting": None, "bets": [],
    }
    if betting:
        bets = synth_bets(rng, until)
        thr = 0.02
        traded = [b for b in bets if b["prob"] * b["odds"] - 1 >= thr]

        def grp(key):
            g = {}
            for b in traded:
                x = g.setdefault(b[key], {"key": b[key], "n": 0, "profit": 0.0})
                x["n"] += 1
                x["profit"] += b["profit"]
            return [{"key": v["key"], "n": v["n"], "roi": round(v["profit"] / v["n"], 4)} for v in g.values()]

        cum, run = [], 0.0
        for b in traded:
            run += b["profit"]
            if cum and cum[-1]["date"] == b["date"]:
                cum[-1]["pnl"] = round(run, 2)
            else:
                cum.append({"date": b["date"], "pnl": round(run, 2)})
        for b in traded:
            b["split"] = None
        for b in traded:
            for s in splits:
                if s["test_start"] <= b["date"] <= s["test_end"]:
                    b["split"] = s["name"]
        by_split = grp("split")
        for b in traded:
            del b["split"]
        # Elo-favourite baseline: every match, flat $1, about -3.6% per bet after the margin.
        base_cum, brun, dd, base_n = [], 0.0, date(2024, 1, 7), 0
        while dd <= until:
            n = rng.randint(30, 70) if dd.month not in (12,) else rng.randint(0, 6)
            base_n += n
            brun += sum((rng.random() < 0.66) * (1 / 0.66 * 0.965) - 1 for _ in range(n))
            base_cum.append({"date": dd.isoformat(), "pnl": round(brun, 2)})
            dd += timedelta(days=7)
        profit = sum(b["profit"] for b in traded)
        data["betting"] = {
            "edge_threshold": thr, "odds_source": "Pinnacle closing odds (tennis-data.co.uk)",
            "traded": len(traded), "won": sum(1 for b in traded if b["won"]),
            "return_per_match": round(profit / len(traded), 4), "profit": round(profit, 2),
            "avg_model_prob": round(sum(b["prob"] for b in traded) / len(traded), 4),
            "cumulative": cum, "by_level": grp("level"), "by_surface": grp("surface"), "by_round": grp("round"),
            "by_split": by_split,
            "baseline": {"name": "Elo favourite", "traded": base_n, "profit": round(brun, 2),
                         "roi": round(brun / max(1, base_n), 4), "cumulative": base_cum},
        }
        data["bets"] = bets
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False))
    return path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="/tmp/deuce-demo", help="folder for tennis.db and backtest.json")
    ap.add_argument("--no-betting", action="store_true", help="write a backtest without odds (betting: null)")
    args = ap.parse_args()
    out = Path(args.out)
    db = build(out / "tennis.db", out / "backtest.json", betting=not args.no_betting)
    print(f"Demo database: {db}\nDemo backtest: {out / 'backtest.json'}")
    print(f"Run: DEUCE_DB={db} DEUCE_BACKTEST={out / 'backtest.json'} python -m app.server")


if __name__ == "__main__":
    main()
