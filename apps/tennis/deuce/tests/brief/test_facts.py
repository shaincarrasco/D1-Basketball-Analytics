import copy

import pytest

from brief import facts
from brief.generate import generate_brief


def bucket(a, key):
    return next(b for b in a["buckets"] if b["key"] == key)


# ---------------------------------------------------------------- agreement math

@pytest.mark.parametrize("pick,verdicts,score,label", [
    ("p1", [("p1", "strong")] * 4, 100, "Strong agreement"),
    ("p1", [("p2", "strong")] * 4, 0, "Conflicting signals"),
    ("p1", [("level", None)] * 4, 50, "Mixed signals"),
    ("p1", [("p1", "slight"), ("p2", "moderate"), ("level", None), ("level", None)], 46, "Mixed signals"),
    ("p2", [("p2", "moderate"), ("p2", "moderate"), ("level", None), ("level", None)], 67, "Strong agreement"),
    ("p1", [("p2", "strong"), ("p2", "moderate"), ("level", None), ("level", None)], 29, "Conflicting signals"),
])
def test_agreement_math_and_labels(pick, verdicts, score, label):
    buckets = [{"favours": f, "strength": s} for f, s in verdicts]
    ag = facts.compute_agreement(pick, buckets)
    assert ag == {"score": score, "label": label}


def test_agreement_label_edges():
    assert facts.agreement_label(39) == "Conflicting signals"
    assert facts.agreement_label(40) == "Mixed signals"
    assert facts.agreement_label(65) == "Mixed signals"
    assert facts.agreement_label(66) == "Strong agreement"


def test_agreement_clamped():
    ag = facts.compute_agreement("p1", [{"favours": "p1", "strength": "strong"}] * 6)
    assert ag["score"] == 100


# ---------------------------------------------------------------- verdicts

def test_tired_player_loses_fitness_bucket(montevideo):
    a = facts.analyze(montevideo)
    b = bucket(a, "fitness")
    assert b["favours"] == "p2"  # p1 played 158 games / 5 matches in a week
    assert b["strength"] in ("moderate", "strong")
    assert "71" in b["text"] and "158" in b["text"]


def test_fitness_flips_when_players_swap(montevideo):
    ctx = copy.deepcopy(montevideo)
    f = ctx["features"]
    f["p1"], f["p2"] = f["p2"], f["p1"]
    assert bucket(facts.analyze(ctx), "fitness")["favours"] == "p1"


def _even_fitness(ctx):
    for s in ("p1", "p2"):
        for k, v in (("matches_7d", 2), ("matches_14d", 3), ("games_14d", 60), ("sets_14d", 7)):
            ctx["features"][s][k] = v
    return ctx


def test_layoff_is_rust(montevideo):
    ctx = _even_fitness(copy.deepcopy(montevideo))
    ctx["features"]["p2"]["days_since_last"] = 45
    b = bucket(facts.analyze(ctx), "fitness")
    assert b["favours"] == "p1" and b["strength"] == "slight"
    assert "45" in b["text"]


def test_retirement_hurts(montevideo):
    ctx = _even_fitness(copy.deepcopy(montevideo))
    ctx["features"]["p1"]["last_match_retired"] = True
    b = bucket(facts.analyze(ctx), "fitness")
    assert b["favours"] == "p2"
    assert "retired" in b["text"].lower()


def test_home_player_gets_motivation_edge(indoor):
    ctx = copy.deepcopy(indoor)
    ctx["features"]["p2"]["home"] = True
    ctx["features"]["p2"]["elo_trend_90d"] = 8.0  # equal trends
    ctx["features"]["p1"]["elo_trend_90d"] = 8.0
    ctx["features"]["p1"]["deciding_set_win_pct_1y"] = 0.55
    ctx["features"]["p2"]["deciding_set_win_pct_1y"] = 0.55
    b = bucket(facts.analyze(ctx), "motivation")
    assert b["favours"] == "p2"
    assert "home" in b["text"].lower()


def test_nothing_separates_is_level(indoor):
    a = facts.analyze(indoor)
    for key in ("fitness", "motivation"):
        b = bucket(a, key)
        assert b["favours"] == "level" and b["strength"] is None


def test_no_odds_market_is_level(indoor):
    a = facts.analyze(indoor)
    m = bucket(a, "market")
    assert m["favours"] == "level" and m["strength"] is None
    assert "no market price" in m["text"].lower()
    assert a["value"] is None
    assert "no market price" in a["bottom_line"].lower()


def test_market_vs_model_and_value(montevideo):
    a = facts.analyze(montevideo)
    m = bucket(a, "market")
    assert m["favours"] == "p2"  # no-vig 54% for p2
    assert m["strength"] == "slight"
    v = a["value"]
    assert v["side"] == "p1"
    assert v["market_odds"] == 2.10
    assert v["fair_odds"] == round(1 / 0.61, 2)
    assert v["edge"] == pytest.approx(0.61 * 2.10 - 1, abs=1e-3)


def test_value_threshold_respected(montevideo):
    ctx = copy.deepcopy(montevideo)
    ctx["edge_threshold"] = 0.5
    assert facts.analyze(ctx)["value"] is None


def test_no_vig_helper():
    q1, q2 = facts.no_vig(1.90, 1.90)
    assert q1 == pytest.approx(0.5) and q2 == pytest.approx(0.5)
    q1, _ = facts.no_vig(1.50, 2.75)
    assert q1 == pytest.approx((1 / 1.5) / (1 / 1.5 + 1 / 2.75))


NOW = facts._parse_ts("2026-11-16T21:00:00Z")


def row(book, p1, p2, at, source="api"):
    return {"source": source, "book": book, "p1_odds": p1, "p2_odds": p2, "fetched_at": at}


def test_display_price_manual_wins_even_if_older():
    rows = [row("pinnacle", 2.0, 1.8, "2026-11-16T20:00:00Z"),
            row("x", 2.5, 1.6, "2026-11-10T08:00:00Z", source="manual")]
    assert facts.pick_display_odds(rows, "scheduled", NOW)["p1_odds"] == 2.5


def test_display_price_latest_manual():
    rows = [row("m", 2.5, 1.6, "2026-11-10T08:00:00Z", "manual"), row("m", 2.6, 1.55, "2026-11-11T08:00:00Z", "manual")]
    assert facts.pick_display_odds(rows, "scheduled", NOW)["p1_odds"] == 2.6


def test_display_price_stale_rows_ignored_for_upcoming():
    rows = [row("pinnacle", 2.0, 1.8, "2026-11-16T05:00:00Z")]  # 16h old
    assert facts.pick_display_odds(rows, "scheduled", NOW) is None
    assert facts.pick_display_odds(rows, "final", NOW) is not None


def test_display_price_book_order_and_never_max():
    rows = [row("bet365", 2.0, 1.8, "2026-11-16T20:50:00Z"),
            row("pinnacle", 1.95, 1.85, "2026-11-16T15:00:00Z"),
            row("max", 3.0, 2.9, "2026-11-16T20:59:00Z"),
            row("avg", 2.1, 1.7, "2026-11-16T20:59:00Z")]
    assert facts.pick_display_odds(rows, "scheduled", NOW)["book"] == "pinnacle"
    rows = [row("max", 3.0, 2.9, "2026-11-16T20:59:00Z"), row("avg", 2.1, 1.7, "2026-11-16T20:00:00Z"),
            row("somebook", 2.0, 1.8, "2026-11-16T19:00:00Z")]
    assert facts.pick_display_odds(rows, "live", NOW)["book"] == "somebook"
    rows = [row("max", 3.0, 2.9, "2026-11-16T20:59:00Z"), row("avg", 2.1, 1.7, "2026-11-16T20:00:00Z")]
    assert facts.pick_display_odds(rows, "live", NOW)["book"] == "avg"


def test_display_price_tie_latest_then_order():
    rows = [row("bet365", 2.0, 1.8, "2026-11-16T19:00:00Z"), row("bet365", 2.1, 1.75, "2026-11-16T20:00:00Z"),
            row("bet365", 2.2, 1.7, "2026-11-16T20:00:00Z")]
    assert facts.pick_display_odds(rows, "scheduled", NOW)["p1_odds"] == 2.2


def test_display_price_invalid_rows():
    rows = [row("pinnacle", None, 1.0, "2026-11-16T20:00:00Z")]
    assert facts.pick_display_odds(rows, "scheduled", NOW) is None
    assert facts.pick_display_odds([], "scheduled", NOW) is None


def test_value_uses_single_display_price(montevideo):
    ctx = copy.deepcopy(montevideo)
    ctx["odds"] = [row("pinnacle", 2.0, 1.85, "2026-11-16T20:00:00Z"),
                   row("bet365", 2.4, 1.6, "2026-11-16T20:30:00Z")]
    a = facts.analyze(ctx)
    assert a["value"]["market_odds"] == 2.0  # pinnacle, not the best-looking 2.4
    assert a["value"]["edge"] == pytest.approx(0.61 * 2.0 - 1, abs=1e-3)


def test_stale_odds_mean_no_market(montevideo):
    ctx = copy.deepcopy(montevideo)
    ctx["odds"] = [row("pinnacle", 2.0, 1.85, "2026-11-10T20:00:00Z")]
    a = facts.analyze(ctx)
    assert a["value"] is None and bucket(a, "market")["favours"] == "level"


def test_thin_history_blocks_value(montevideo):
    ctx = copy.deepcopy(montevideo)
    ctx["features"]["p2"]["experience"] = 9
    a = facts.analyze(ctx)
    assert a["value"] is None
    m = bucket(a, "market")
    assert "too thin" in m["text"] and "Value edge %" not in [f["label"] for f in m["facts"]]
    assert "too thin" in a["bottom_line"]


def test_weather_heat_changes_conditions(montevideo):
    ctx = copy.deepcopy(montevideo)
    ctx["weather"] = {"temp_c": 34, "humidity": 55, "wind_kph": 8, "precip_mm": 0}
    t = bucket(facts.analyze(ctx), "conditions")["text"]
    assert "34" in t


def test_indoor_skips_weather_text(indoor):
    ctx = copy.deepcopy(indoor)
    ctx["weather"] = {"temp_c": 36, "humidity": 90, "wind_kph": 40, "precip_mm": 5}
    t = bucket(facts.analyze(ctx), "conditions")["text"]
    assert "36" not in t and "indoors" in t.lower()


def test_deterministic(montevideo):
    assert facts.analyze(montevideo) == facts.analyze(copy.deepcopy(montevideo))


def test_sparse_context_does_not_crash():
    ctx = {"match_id": "x", "p1": {"name": "A B"}, "p2": {"name": "C D"}, "p1_prob": 0.5, "p2_prob": 0.5,
           "tournament": {}, "features": {}, "odds": []}
    a = facts.analyze(ctx)
    assert len(a["buckets"]) == 4
    for b in a["buckets"]:
        assert b["text"]
    assert facts.compute_agreement(a["model_pick"], a["buckets"])["score"] == 50


def test_upsides_downsides_shape_and_numbers(montevideo, indoor):
    for ctx in (montevideo, indoor):
        a = facts.analyze(ctx)
        for s in ("p1", "p2"):
            for k in ("upsides", "downsides"):
                lst = a["players"][s][k]
                assert 1 <= len(lst) <= 4
                for t in lst:
                    assert any(ch.isdigit() for ch in t), t
        # tired player's downsides mention the workload
    ds = " ".join(facts.analyze(montevideo)["players"]["p1"]["downsides"])
    assert "158" in ds


def test_bottom_line_content(montevideo):
    a = facts.analyze(montevideo)
    bl = a["bottom_line"]
    assert "Keller" in bl and "61%" in bl
    assert "Conflicting signals".lower() in bl.lower() or "mixed" in bl.lower()
    assert "guarantee" not in bl.lower() and "will win" not in bl.lower()


def test_text_variety_across_matches(montevideo):
    leads = set()
    for i in range(12):
        ctx = copy.deepcopy(montevideo)
        ctx["match_id"] = f"m{i}"
        leads.add(bucket(facts.analyze(ctx), "fitness")["text"].split(".")[0])
    assert len(leads) >= 2


def test_sentence_counts(montevideo, indoor):
    from brief.llm import count_sentences
    for ctx in (montevideo, indoor):
        for b in facts.analyze(ctx)["buckets"]:
            assert 1 <= count_sentences(b["text"]) <= 4, b["text"]


def test_no_filler_bullets(montevideo, indoor):
    for ctx in (montevideo, indoor):
        for p in facts.analyze(ctx)["players"].values():
            for t in p["upsides"] + p["downsides"]:
                assert not t.startswith(("Slim edge", "Still in range", "Elo rating", "Market price implies"))


def test_negative_trend_phrased_relatively(montevideo):
    ctx = copy.deepcopy(montevideo)
    ctx["features"]["p1"]["elo_trend_90d"] = -46.0
    ctx["features"]["p2"]["elo_trend_90d"] = -108.0
    a = facts.analyze(ctx)
    assert "Sliding less: -46 Elo over 90 days vs -108" in a["players"]["p1"]["upsides"]
    assert "Sliding faster: -108 Elo over 90 days vs -46" in a["players"]["p2"]["downsides"]


def test_negative_surface_delta_phrased_relatively(indoor):
    ctx = copy.deepcopy(indoor)
    ctx["features"]["p1"].update(elo=1900, surface_elo=1811)
    ctx["features"]["p2"].update(elo=1900, surface_elo=1797)
    a = facts.analyze(ctx)
    assert "Holds up better on Indoor Hard: -89 vs -103 relative to overall Elo" in a["players"]["p1"]["upsides"]


def test_momentum_in_points_no_raw_decimals(montevideo):
    ctx = copy.deepcopy(montevideo)
    ctx["features"]["p1"]["momentum"] = -0.21
    ctx["features"]["p2"]["momentum"] = -0.11
    comp = next(x for x in facts.motivation_comps(facts.Ctx(ctx)) if x.key == "momentum")
    assert comp.fav == "p2"
    assert comp.down == "Recent form 21 pts below season win rate (Alvarez 11 pts below)"
    assert comp.up == "Recent form 11 pts below season win rate (Keller 21 pts below)"
    assert "0.21" not in comp.sentence and "0.11" not in comp.sentence


def test_bottom_line_names_opponents_strength_when_no_bucket_against(indoor):
    ctx = copy.deepcopy(indoor)
    ctx["features"]["h2h"] = {"p1_wins": 1, "p2_wins": 2, "last": []}
    ctx["features"]["p1"]["games_14d"] = 67
    ctx["features"]["p2"]["games_14d"] = 39
    a = facts.analyze(ctx)
    assert all(b["favours"] in ("level", a["model_pick"]) for b in a["buckets"])
    bl = a["bottom_line"]
    assert "The main risk: Lindqvist" in bl and "39 vs 67 games" in bl and "2-1" in bl
    assert "simply the" not in bl


def test_level_text_names_both_sides_or_admits_lean(montevideo):
    ctx = copy.deepcopy(montevideo)
    ctx["features"]["p1"].update(elo_trend_90d=50.0)
    ctx["features"]["p2"].update(elo_trend_90d=-10.0, home=True)
    t = bucket(facts.analyze(ctx), "motivation")
    if t["favours"] == "level":
        assert "offsetting" in t["text"] or "opposite" in t["text"]
        assert "home" in t["text"].lower() and "+50" in t["text"]


def test_possessive_and_plural():
    assert facts.poss("Fils") == "Fils'"
    assert facts.poss("Jodar") == "Jodar's"
    assert facts.nm(1) == "1 match" and facts.nm(3) == "3 matches"


def test_pts_txt_and_sgn():
    assert facts.pts_txt(-0.21) == "21 pts below"
    assert facts.pts_txt(0.01) == "1 pt above"
    assert facts.pts_txt(0.001) == "in line with"
    assert facts.sgn(-0.3) == "0" and facts.sgn(3.4) == "+3"


def test_thin_sample_players_do_not_drive_rates(montevideo):
    ctx = copy.deepcopy(montevideo)
    ctx["features"]["p2"]["experience"] = 4
    ctx["features"]["p2"]["tiebreak_win_pct_1y"] = 0.0
    a = facts.analyze(ctx)
    blob = " ".join(t for p in a["players"].values() for t in p["upsides"] + p["downsides"])
    assert "tiebreaks" not in blob and "Win rate" not in blob
    assert any("provisional" in t for t in a["players"]["p2"]["downsides"])


def test_idle_player_phrasing(montevideo):
    ctx = copy.deepcopy(montevideo)
    ctx["features"]["p2"].update(games_14d=0, matches_14d=0, matches_7d=0, sets_14d=0)
    a = facts.analyze(ctx)
    assert "No matches in the last 14 days (vs 158 games)" in a["players"]["p2"]["upsides"]
    assert "0 games" not in bucket(a, "fitness")["text"]
