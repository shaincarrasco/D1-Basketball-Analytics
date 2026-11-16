import json

import numpy as np
import pandas as pd

from engine import features, model
from engine_testutil import make_db


def _build(conn):
    return features.build_features(features.load_matches(conn))


def test_no_future_leakage_changing_later_results_leaves_earlier_features_untouched(league):
    conn, _ = league
    base = _build(conn).df
    cut = base["ts"].quantile(0.6)
    # rewrite every result after the cut (flip winners and scores)
    for mid, ts, p1, p2 in base[["id", "ts", "p1", "p2"]].itertuples(index=False):
        if ts > cut:
            conn.execute("UPDATE matches SET winner_id = CASE WHEN winner_id=p1_id THEN p2_id ELSE p1_id END, "
                         "sets_json='[[0,6,null,null],[0,6,null,null]]', status='retired' WHERE id=?", (mid,))
    conn.commit()
    changed = _build(conn).df
    early = base["ts"] <= cut
    num = [c for c in base.columns if (c.startswith(("p1_", "p2_", "h2h_")) or c in ("elo1", "elo2", "selo1", "selo2", "common_opponents"))
           and pd.api.types.is_numeric_dtype(base[c])]
    a, b = base.loc[early, num].astype(float), changed.loc[early, num].astype(float)
    pd.testing.assert_frame_equal(a.reset_index(drop=True), b.reset_index(drop=True), check_exact=False, atol=1e-9)
    # ...and a later match really did change (the test is not vacuous)
    late = ~early
    assert not np.allclose(base.loc[late, "p1_elo"], changed.loc[late, "p1_elo"])


def test_window_counts_use_prior_matches_only(league):
    conn, _ = league
    fs = _build(conn)
    d = fs.df
    i = len(d) - 1
    row = d.iloc[i]
    prior = d[(d["ts"] < row["ts"]) & ((d["p1"] == row["p1"]) | (d["p2"] == row["p1"]))]
    assert row["p1_experience"] == len(prior)
    week = prior[prior["ts"] >= row["ts"] - 7 * 86400]
    assert row["p1_matches_7d"] == len(week)
    wins = (prior["winner"] == row["p1"])
    one_y = prior[prior["ts"] >= row["ts"] - 365 * 86400]
    assert np.isclose(row["p1_win_rate_1y"], (one_y["winner"] == row["p1"]).mean())
    if len(prior):
        assert row["p1_days_since_last"] == np.floor((row["ts"] - prior["ts"].max()) / 86400)
    assert wins.sum() >= 0


def test_context_json_shape_and_h2h(league):
    conn, _ = league
    fs = _build(conn)
    ctx = fs.context(len(fs.df) - 1)
    assert set(ctx) >= {"as_of", "p1", "p2", "h2h", "common_opponents", "radar"}
    for k in ("elo", "surface_elo", "elo_trend_90d", "win_rate_1y", "form_10", "momentum", "surface_win_rate_1y",
              "games_won_pct_1y", "tiebreak_win_pct_1y", "deciding_set_win_pct_1y", "experience", "quality_form_30d",
              "comeback_rate", "matches_7d", "matches_14d", "sets_14d", "games_14d", "days_since_last",
              "last_match_retired", "matches_on_surface_90d", "home", "last5", "rank", "common_opp_win_rate"):
        assert k in ctx["p1"]
    assert len(ctx["p1"]["last5"]) <= 5
    assert set(ctx["radar"]["p1"]) == {"Win Rate", "Form", "Momentum", "Surface", "Games Won", "Tiebreaks", "Experience",
                                       "Common Opponents", "Quality Form", "Comeback"}
    json.dumps(ctx)  # serialisable
    d = fs.df
    r = d.iloc[-1]
    prior = d[(d["ts"] < r["ts"]) & (((d["p1"] == r["p1"]) & (d["p2"] == r["p2"])) | ((d["p1"] == r["p2"]) & (d["p2"] == r["p1"])))]
    assert ctx["h2h"]["p1_wins"] + ctx["h2h"]["p2_wins"] == len(prior)
    assert all(h["date"] <= ctx["as_of"][:10] for h in ctx["h2h"]["last"])


def test_home_flag(league):
    conn, _ = league
    d = _build(conn).df
    r = d[d["tcountry"] == "USA"].iloc[-1]
    assert r["p1_home"] == (1.0 if r["p1_country"] == "USA" else 0.0)


def test_model_orientation_symmetry_and_training(league):
    conn, _ = make_db(n_players=30, n_matches=2500, seed=5)
    fs = _build(conn)
    d = fs.df
    mdl = model.train(d, force_family="logistic")
    p = mdl.predict(d.tail(200))
    sw = d.tail(200).copy()
    for c in [c for c in sw.columns if c.startswith("p1_")]:
        o = "p2_" + c[3:]
        sw[c], sw[o] = d.tail(200)[o].to_numpy(), d.tail(200)[c].to_numpy()
    for a, b in (("elo1", "elo2"), ("selo1", "selo2"), ("h2h_p1w", "h2h_p2w")):
        sw[a], sw[b] = d.tail(200)[b].to_numpy(), d.tail(200)[a].to_numpy()
    p_sw = mdl.predict(sw)
    np.testing.assert_allclose(p + p_sw, 1.0, atol=1e-9)
    y = (d["winner"] == d["p1"]).to_numpy(dtype=float)
    assert model.accuracy(y[-500:], mdl.predict(d.tail(500))) > 0.55  # learned something from latent strengths


def test_lightgbm_import_failure_falls_back_to_logistic(monkeypatch, capsys):
    import sys
    conn, _ = make_db(n_players=30, n_matches=1500, seed=9)
    d = _build(conn).df
    monkeypatch.setitem(sys.modules, "lightgbm", None)  # `import lightgbm` now raises ImportError
    mdl = model.train(d)
    assert mdl.family == "logistic"
    assert "LightGBM unavailable" in capsys.readouterr().out
    assert len(mdl.predict(d.tail(5))) == 5


def test_tune_blend_uses_fit_slice_only(monkeypatch):
    conn, _ = make_db(n_players=30, n_matches=1500, seed=9)
    d = _build(conn).df
    seen = {}
    orig = model.tune_blend

    def spy(dd, yy):
        seen["n"] = len(dd)
        return orig(dd, yy)

    monkeypatch.setattr(model, "tune_blend", spy)
    model.train(d, force_family="logistic")
    assert seen["n"] == int(len(d) * 0.8)
