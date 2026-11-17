import math

import pytest

from engine import model, odds


@pytest.mark.parametrize("bo", [3, 5])
@pytest.mark.parametrize("p", [0.02, 0.3, 0.5, 0.65, 0.9, 0.995])
@pytest.mark.parametrize("delta", [0.0, 0.1])
def test_set_scores_sum_to_one_and_match_prob(bo, p, delta):
    probs = model.set_score_probs(p, bo, delta)
    assert math.isclose(sum(probs.values()), 1.0, abs_tol=1e-9)
    assert len(probs) == (6 if bo == 5 else 4)
    won = sum(v for k, v in probs.items() if int(k[0]) > int(k[2]))
    assert math.isclose(won, p, abs_tol=1e-6)  # the inversion reproduces the match probability


def test_iid_matches_closed_form_and_inversion():
    s = model.set_prob_from_match(0.7, 3)
    assert math.isclose(model.match_prob_from_set(s, 3), 0.7, abs_tol=1e-9)
    pr = model.set_score_probs(0.7, 3)
    assert math.isclose(pr["2-0"], s * s, abs_tol=1e-9) and math.isclose(pr["2-1"], 2 * s * s * (1 - s), abs_tol=1e-9)
    s5 = model.set_prob_from_match(0.7, 5)
    assert math.isclose(model.match_prob_from_set(s5, 5), 0.7, abs_tol=1e-9)
    assert math.isclose(model.set_score_probs(0.7, 5)["3-0"], s5**3, abs_tol=1e-9)


def test_symmetry_and_momentum_raises_straight_sets():
    a, b = model.set_score_probs(0.7, 3, 0.1), model.set_score_probs(0.3, 3, 0.1)
    assert math.isclose(a["2-0"], b["0-2"], abs_tol=1e-9) and math.isclose(a["2-1"], b["1-2"], abs_tol=1e-9)
    assert model.set_score_probs(0.6, 3, 0.1)["2-0"] > model.set_score_probs(0.6, 3, 0.0)["2-0"]


def test_value_math():
    v = odds.value(0.6, 2.0, 0.02)
    assert math.isclose(v["edge"], 0.2) and math.isclose(v["fair_odds"], 1 / 0.6) and v["is_value"]
    assert not odds.value(0.5, 2.0, 0.02)["is_value"]  # zero edge
    assert odds.value(0.505, 2.0, 0.02)["is_value"] is False  # edge 0.01 < threshold
    assert odds.value(0.0, 2.0)["edge"] is None and odds.value(0.5, 1.0)["edge"] is None
    b = odds.best_value(0.55, 1.7, 2.6, 0.02)
    assert b["side"] == "p2" and math.isclose(b["edge"], 0.45 * 2.6 - 1)
    assert odds.best_value(0.55, None, None) is None
    p1, p2 = odds.devig(1.5, 3.0)
    assert math.isclose(p1 + p2, 1.0) and p1 > p2


def test_fetch_all_without_keys_is_a_noop():
    assert odds.fetch_all(None, {}) == {}
    assert odds.fetch_all(None, {"odds": {"the_odds_api_key": "", "oddspapi_key": ""}}) == {}


def test_name_matching():
    assert odds.match_initial_name("Jannik Sinner", "Sinner J.")
    assert odds.match_initial_name("Alex de Minaur", "De Minaur A.")
    assert odds.match_initial_name("Félix Auger-Aliassime", "Auger-Aliassime F.")
    assert not odds.match_initial_name("Jannik Sinner", "Sinner M.")
