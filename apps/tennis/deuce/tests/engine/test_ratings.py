import math

import pandas as pd

from engine import ratings as R


def test_k_factor_decays():
    assert math.isclose(R.k_factor(0), 250 / 5**0.4)
    assert R.k_factor(100) < R.k_factor(10) < R.k_factor(0)


def test_expected_and_update_math():
    assert math.isclose(R.expected(1500, 1500), 0.5)
    assert math.isclose(R.expected(1900, 1500), 1 / (1 + 10 ** (-400 / 400)))
    a, b = R.update_pair(1500, 1500, 0, 0, True)
    k = R.k_factor(0)
    assert math.isclose(a, 1500 + k * 0.5) and math.isclose(b, 1500 - k * 0.5)
    # symmetric: equal n means zero-sum
    assert math.isclose(a + b, 3000)
    # an upset moves more than an expected win
    up_a, _ = R.update_pair(1400, 1800, 20, 20, True)
    ex_a, _ = R.update_pair(1800, 1400, 20, 20, True)
    assert (up_a - 1400) > (ex_a - 1800)


def test_blend_prob_weights():
    assert math.isclose(float(R.blend(1600, 1700, 0.5)), 1650)
    assert math.isclose(float(R.blend_prob(1600, 1800, 1600, 1600, 0.0)), 0.5)
    assert R.blend_prob(1600, 1800, 1600, 1600, 1.0) > 0.5


def test_walkovers_ignored_retirements_counted_snapshots_pre_match():
    df = pd.DataFrame({
        "p1": ["a", "a", "a", "a"], "p2": ["b", "b", "b", "b"], "winner": ["a", "a", "b", None],
        "status": ["final", "walkover", "retired", "scheduled"], "surface_grp": ["Hard", "Hard", "Clay", "Hard"]})
    out, st = R.compute_ratings(df)
    assert out.loc[0, "elo1"] == 1500 and out.loc[0, "n1"] == 0  # snapshot is pre-match
    assert out.loc[1, "elo1"] == out.loc[0, "post1"]            # walkover row sees rating after match 0
    assert out.loc[1, "post1"] == out.loc[1, "elo1"]            # ...and does not change it
    assert out.loc[2, "n1"] == 1                                # walkover did not count as a match played
    assert st.n["a"] == 2 and st.n["b"] == 2                    # final + retirement counted
    assert out.loc[3, "elo1"] == out.loc[2, "post1"]            # scheduled match sees post-retirement rating
    assert out.loc[2, "post1"] < out.loc[2, "elo1"]             # retirement counted as a loss for a


def test_surface_rating_starts_from_overall():
    df = pd.DataFrame({"p1": ["a", "a"], "p2": ["b", "c"], "winner": ["a", "a"], "status": ["final", "final"],
                       "surface_grp": ["Hard", "Clay"]})
    out, _ = R.compute_ratings(df)
    assert out.loc[1, "selo1"] == out.loc[1, "elo1"]  # first clay match: surface Elo = overall at that time
