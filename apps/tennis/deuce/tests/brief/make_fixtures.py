"""Regenerates tests/brief/fixtures/*.json (hand-made, fictional players) and example_briefs.json.

Run:  python tests/brief/make_fixtures.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
FIX = Path(__file__).parent / "fixtures"


def last5(rows):
    return [{"date": d, "opponent": o, "result": r, "score": s, "tournament": t} for d, o, r, s, t in rows]


MONTEVIDEO = {
    "match_id": "fx-montevideo-1",
    "date": "2026-11-17T16:00:00Z",
    "round": "Quarterfinal",
    "best_of": 3,
    "status": "scheduled",
    "tournament": {"name": "Montevideo Open", "surface": "Clay", "level": "ATP 250",
                   "location": "Montevideo, Uruguay", "country": "Uruguay", "surface_inferred": 0},
    "p1": {"id": "9001", "name": "Jonas Keller", "country": "GER"},
    "p2": {"id": "9002", "name": "Mateo Alvarez", "country": "URU"},
    "p1_prob": 0.61, "p2_prob": 0.39,
    "features": {
        "as_of": "2026-11-17T16:00:00Z",
        "p1": {"elo": 1850.2, "surface_elo": 1790.4, "elo_trend_90d": 35.1, "rank": 23,
               "win_rate_1y": 0.62, "form_10": 0.70, "momentum": 0.08,
               "surface_win_rate_1y": 0.48, "surface_matches_1y": 21,
               "games_won_pct_1y": 0.53, "tiebreak_win_pct_1y": 0.58, "deciding_set_win_pct_1y": 0.50,
               "experience": 412, "common_opp_win_rate": 0.60, "quality_form_30d": 0.44, "comeback_rate": 0.21,
               "matches_7d": 5, "matches_14d": 7, "sets_14d": 17, "games_14d": 158, "days_since_last": 1,
               "last_match_retired": False, "matches_on_surface_90d": 2, "home": False,
               "last5": last5([("2026-11-16", "T. Brandt", "W", "7-6 6-7 7-5", "Montevideo Open"),
                               ("2026-11-15", "L. Ortega", "W", "6-4 3-6 6-4", "Montevideo Open"),
                               ("2026-11-12", "P. Duval", "W", "6-3 6-4", "Rennes Challenger"),
                               ("2026-11-10", "S. Mori", "L", "4-6 6-7", "Rennes Challenger"),
                               ("2026-11-08", "A. Novak", "W", "6-2 6-3", "Rennes Challenger")])},
        "p2": {"elo": 1788.0, "surface_elo": 1801.5, "elo_trend_90d": -12.4, "rank": 41,
               "win_rate_1y": 0.57, "form_10": 0.60, "momentum": 0.02,
               "surface_win_rate_1y": 0.64, "surface_matches_1y": 33,
               "games_won_pct_1y": 0.52, "tiebreak_win_pct_1y": 0.47, "deciding_set_win_pct_1y": 0.66,
               "experience": 301, "common_opp_win_rate": 0.55, "quality_form_30d": 0.38, "comeback_rate": 0.28,
               "matches_7d": 2, "matches_14d": 3, "sets_14d": 7, "games_14d": 71, "days_since_last": 3,
               "last_match_retired": False, "matches_on_surface_90d": 11, "home": True,
               "last5": last5([("2026-11-14", "R. Pena", "W", "6-2 6-4", "Montevideo Open"),
                               ("2026-11-12", "G. Silva", "W", "6-4 6-4", "Montevideo Open"),
                               ("2026-11-02", "D. Cruz", "L", "3-6 4-6", "Buenos Aires Challenger"),
                               ("2026-10-28", "F. Lopez", "W", "7-5 6-3", "Buenos Aires Challenger"),
                               ("2026-10-25", "M. Diaz", "W", "6-1 6-2", "Buenos Aires Challenger")])},
        "h2h": {"p1_wins": 1, "p2_wins": 2,
                "last": [{"date": "2025-04-20", "winner": "p2", "score": "6-4 6-3",
                          "tournament": "Estoril", "surface": "Clay"}]},
        "common_opponents": 7,
        "radar": {"p1": {"Win Rate": 72, "Form": 80, "Momentum": 60, "Surface": 40, "Games Won": 61, "Tiebreaks": 58,
                         "Experience": 90, "Common Opponents": 64, "Quality Form": 47, "Comeback": 33},
                  "p2": {"Win Rate": 60, "Form": 66, "Momentum": 50, "Surface": 75, "Games Won": 55, "Tiebreaks": 40,
                         "Experience": 70, "Common Opponents": 58, "Quality Form": 40, "Comeback": 55}},
    },
    "odds": [
        {"source": "manual", "book": "Bet365", "p1_odds": 1.95, "p2_odds": 1.90, "fetched_at": "2026-11-16T08:00:00Z"},
        {"source": "manual", "book": "Bet365", "p1_odds": 2.10, "p2_odds": 1.78, "fetched_at": "2026-11-16T18:00:00Z"},
    ],
    "weather": {"temp_c": 19.0, "humidity": 82, "wind_kph": 28, "precip_mm": 0.4, "summary": "Damp and windy"},
    "edge_threshold": 0.02,
    "now": "2026-11-16T21:00:00Z",
}

INDOOR = {
    "match_id": "fx-indoor-2",
    "date": "2026-11-18T12:30:00Z",
    "round": "Round of 16",
    "best_of": 3,
    "status": "scheduled",
    "tournament": {"name": "Linz Indoor Open", "surface": "Indoor Hard", "level": "WTA 500",
                   "location": "Linz, Austria", "country": "Austria", "surface_inferred": 0},
    "p1": {"id": "7001", "name": "Elena Markovic", "country": "SRB"},
    "p2": {"id": "7002", "name": "Sofia Lindqvist", "country": "SWE"},
    "p1_prob": 0.54, "p2_prob": 0.46,
    "features": {
        "as_of": "2026-11-18T12:30:00Z",
        "p1": {"elo": 1702.0, "surface_elo": 1715.0, "elo_trend_90d": 8.0, "rank": 38,
               "win_rate_1y": 0.58, "form_10": 0.60, "momentum": 0.01,
               "surface_win_rate_1y": 0.61, "surface_matches_1y": 18,
               "games_won_pct_1y": 0.52, "tiebreak_win_pct_1y": 0.55, "deciding_set_win_pct_1y": 0.58,
               "experience": 240, "quality_form_30d": 0.40, "comeback_rate": 0.24,
               "matches_7d": 2, "matches_14d": 4, "sets_14d": 9, "games_14d": 92, "days_since_last": 2,
               "last_match_retired": False, "matches_on_surface_90d": 5, "home": False, "last5": []},
        "p2": {"elo": 1688.0, "surface_elo": 1676.0, "elo_trend_90d": 3.0, "rank": 44,
               "win_rate_1y": 0.56, "form_10": 0.50, "momentum": -0.01,
               "surface_win_rate_1y": 0.54, "surface_matches_1y": 14,
               "games_won_pct_1y": 0.51, "tiebreak_win_pct_1y": 0.51, "deciding_set_win_pct_1y": 0.55,
               "experience": 222, "quality_form_30d": 0.37, "comeback_rate": 0.22,
               "matches_7d": 2, "matches_14d": 4, "sets_14d": 10, "games_14d": 97, "days_since_last": 2,
               "last_match_retired": False, "matches_on_surface_90d": 4, "home": False, "last5": []},
        "h2h": {"p1_wins": 0, "p2_wins": 0, "last": []},
        "common_opponents": 3,
        "radar": {"p1": {}, "p2": {}},
    },
    "odds": [],
    "weather": None,
    "edge_threshold": 0.02,
    "now": "2026-11-16T21:00:00Z",
}


def main():
    from brief.generate import generate_brief

    FIX.mkdir(exist_ok=True)
    examples = []
    for name, ctx in (("montevideo", MONTEVIDEO), ("indoor", INDOOR)):
        (FIX / f"context_{name}.json").write_text(json.dumps(ctx, indent=2))
        examples.append(generate_brief(ctx, use_llm=False, now="2026-11-16T21:00:00Z"))
    (FIX / "example_briefs.json").write_text(json.dumps(examples, indent=2, ensure_ascii=False))
    for b in examples:
        print(json.dumps(b, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
