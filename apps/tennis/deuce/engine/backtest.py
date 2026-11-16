"""`python -m engine.backtest`: walk-forward backtest -> data/backtest.json.

Three chronological test splits; the model (and its Elo blend weight, calibration and family choice) is trained only on
matches before each split starts, using pre-match features. Closing odds, when present, are used only for the bet
decision and the payout, never as a model input.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from . import features, model
from .fsutil import atomic_write_text
from .db import connect, data_dir, load_config
from .update import get_rankings

ROLLING_WINDOW = 100
ROLLING_STEP = 25


LOW_DATA_MATCHES = 15


def coverage_note(levels, n: int) -> str:
    """What the test sets actually contain, from the data (not from which sources are configured)."""
    counts = {str(k): int(v) for k, v in pd.Series(levels).value_counts().items()}
    low = {k: counts[k] for k in ("Challenger", "ITF") if counts.get(k)}
    base = "ATP/WTA main draws, qualifying and WTA 125 events"
    if low:
        extra = " and ".join(f"{v:,} {k}" for k, v in low.items())
        return f"Test sets ({n:,} matches) include {base}, plus {extra} matches."
    return (f"Test sets ({n:,} matches) cover {base}. They have no Challenger or ITF matches yet: those tiers need the "
            "Tennis API and Live Tennis API keys to be set.")


def _clean(o: Any) -> Any:
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if (math.isnan(o) or math.isinf(o)) else float(o)
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def round_group(r: str | None) -> str:
    """Normalise ESPN round names into a few buckets."""
    s = (r or "").lower()
    if "qualif" in s:
        return "Qualifying"
    if "round robin" in s or "group" in s:
        return "Round robin"
    if "semi" in s:
        return "Semifinal"
    if "quarter" in s:
        return "Quarterfinal"
    if "final" in s:
        return "Final"
    if any(x in s for x in ("128", "64", "1st", "first", "round 1")):
        return "R128/R64"
    if any(x in s for x in ("32", "2nd", "second", "round 2")):
        return "R32"
    if any(x in s for x in ("16", "3rd", "third", "round 3", "4th", "round 4")):
        return "R16"
    return "Other"


def metrics(y: np.ndarray, p: np.ndarray) -> dict[str, float]:
    return {"accuracy": model.accuracy(y, p), "brier": model.brier(y, p), "log_loss": model.log_loss(y, p)}


def calibration_bins(y: np.ndarray, p: np.ndarray, width: float = 0.05) -> list[dict]:
    """Favourite-orientation calibration: predicted prob of the favourite vs how often it won."""
    fav = np.where(p >= 0.5, p, 1 - p)
    won = np.where(p >= 0.5, y, 1 - y)
    edges = np.arange(0.5, 1.0 + 1e-9, width)
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (fav >= lo) & (fav < hi if hi < 1.0 - 1e-9 else fav <= hi)
        if m.sum():
            out.append({"bin": f"{lo:.2f}-{hi:.2f}", "pred": float(fav[m].mean()), "actual": float(won[m].mean()),
                        "n": int(m.sum())})
    return out


def rolling(dates: np.ndarray, y: np.ndarray, p: np.ndarray) -> list[dict]:
    out = []
    correct = ((p >= 0.5) == (y == 1)).astype(float)
    se = (p - y) ** 2
    for i in range(ROLLING_WINDOW, len(y) + 1, ROLLING_STEP):
        out.append({"date": str(dates[i - 1])[:10], "accuracy_100": float(correct[i - ROLLING_WINDOW:i].mean()),
                    "brier_100": float(se[i - ROLLING_WINDOW:i].mean())})
    return out


# ------------------------------------------------------------------ betting
def load_odds(conn) -> pd.DataFrame:
    """One price per match: prefer tennis-data closing odds, else the latest price fetched at or before the start."""
    o = pd.read_sql_query("SELECT match_id, source, book, p1_odds, p2_odds, fetched_at FROM odds "
                          "WHERE p1_odds > 1 AND p2_odds > 1", conn)
    if o.empty:
        return o
    m = pd.read_sql_query("SELECT id AS match_id, date FROM matches", conn)
    o = o.merge(m, on="match_id")
    o = o[o["fetched_at"] <= o["date"]]
    o["prio"] = (o["source"] != "tennis-data").astype(int)
    o = o.sort_values(["match_id", "prio", "fetched_at"], ascending=[True, True, False])
    return o.drop_duplicates("match_id").set_index("match_id")[["source", "book", "p1_odds", "p2_odds"]]


def _summ(bets: pd.DataFrame) -> dict[str, Any]:
    n = len(bets)
    if n == 0:
        return {"traded": 0, "won": 0, "return_per_match": None, "profit": 0.0, "avg_model_prob": None}
    return {"traded": int(n), "won": int(bets["won"].sum()), "return_per_match": float(bets["profit"].mean()),
            "profit": float(bets["profit"].sum()), "avg_model_prob": float(bets["prob"].mean())}


def _group(bets: pd.DataFrame, col: str) -> list[dict]:
    out = []
    for k, g in bets.groupby(col):
        out.append({"key": str(k), "n": int(len(g)), "roi": float(g["profit"].mean()), "profit": float(g["profit"].sum()),
                    "won": int(g["won"].sum()), "avg_model_prob": float(g["prob"].mean())})
    return sorted(out, key=lambda r: -r["n"])


def betting_section(fd: pd.DataFrame, oos: pd.DataFrame, odds: pd.DataFrame, threshold: float) -> dict | None:
    """Flat $1 bets on the side with the best edge against closing odds (strictly out-of-sample predictions)."""
    if odds.empty:
        return None
    ids = fd.loc[oos.index, "id"]
    d = oos.assign(match_id=ids.values).join(odds, on="match_id", how="inner")
    if d.empty:
        return None
    meta = fd.loc[d.index]
    d["date"] = meta["date"].values
    d["tournament"], d["level"], d["surface"] = meta["tname"].values, meta["level"].values, meta["surface"].values
    d["round"], d["p1n"], d["p2n"] = meta["round"].values, meta["p1_name"].values, meta["p2_name"].values
    d["tour"] = meta["tour"].values if "tour" in meta else None
    d["status"] = meta["status"].values if "status" in meta else "final"
    # Same rule as the live dashboard: no value bets when either player has < 15 matches on record.
    if "p1_experience" in meta and "p2_experience" in meta:
        exp = np.minimum(meta["p1_experience"].fillna(0).to_numpy(), meta["p2_experience"].fillna(0).to_numpy())
        d = d[exp >= LOW_DATA_MATCHES]
        if d.empty:
            return None
    y = d["y"].to_numpy()
    p1 = d["p_model"].to_numpy()
    e1, e2 = p1 * d["p1_odds"] - 1, (1 - p1) * d["p2_odds"] - 1
    pick1 = e1 >= e2
    d["pick"] = np.where(pick1, "p1", "p2")
    d["edge"] = np.where(pick1, e1, e2)
    d["prob"] = np.where(pick1, p1, 1 - p1)
    d["odds_pick"] = np.where(pick1, d["p1_odds"], d["p2_odds"])
    d["won"] = np.where(pick1, y == 1, y == 0)
    d["profit"] = np.where(d["won"], d["odds_pick"] - 1, -1.0)
    # Retirement rule: most books void pre-completion retirements, so settle them as void (profit 0, not traded).
    retired = d["status"].to_numpy() == "retired"
    n_void = int(((d["edge"] >= threshold) & retired).sum())
    d = d[~retired].sort_values("date")
    if d.empty:
        return None

    def baseline(pick_p1: np.ndarray) -> dict:
        won = np.where(pick_p1, y == 1, y == 0)
        od = np.where(pick_p1, d["p1_odds"], d["p2_odds"])
        b = pd.DataFrame({"won": won, "profit": np.where(won, od - 1, -1.0), "prob": np.where(pick_p1, 0.5, 0.5)})
        s = _summ(b)
        s.pop("avg_model_prob")
        return s

    d = d.reset_index(drop=True)
    y = d["y"].to_numpy()
    elo_fav = d["p_elo"].to_numpy() >= 0.5
    mkt_fav = d["p1_odds"].to_numpy() <= d["p2_odds"].to_numpy()
    bets_all = d[d["edge"] >= 0]
    bets = d[d["edge"] >= threshold]
    cum = bets.groupby(bets["date"].str[:10])["profit"].sum().cumsum()
    mk = 1 / d["p1_odds"] / (1 / d["p1_odds"] + 1 / d["p2_odds"])
    traded_ids = set(bets["match_id"])
    sub = d[d["match_id"].isin(traded_ids)]
    sub_elo_fav = sub["p_elo"].to_numpy() >= 0.5
    sub_won = np.where(sub_elo_fav, sub["y"] == 1, sub["y"] == 0)
    sub_odds = np.where(sub_elo_fav, sub["p1_odds"], sub["p2_odds"])
    bt = {
        "edge_threshold": threshold,
        "threshold_note": "Headline uses the pre-set 2-point threshold (config model.edge_threshold); ROI at other "
                          "thresholds (roi_by_threshold) was chosen after seeing results and is optimistic.",
        "retirement_rule": "void", "voided_retirement_bets": n_void,
        "odds_source": ", ".join(sorted({f"{s} ({b})" for s, b in zip(d["source"], d["book"])}))[:200],
        "matches_with_odds": int(len(d)),
        **_summ(bets),
        "cumulative": [{"date": k, "pnl": float(v)} for k, v in cum.items()],
        "by_level": _group(bets, "level"), "by_surface": _group(bets, "surface"),
        "by_round": _group(bets.assign(round_group=bets["round"].map(round_group)), "round_group"),
        "by_split": _group(bets, "split"),
        "roi_by_threshold_note": "Post-hoc: thresholds other than the pre-set one were chosen after seeing results; optimistic.",
        "roi_by_threshold": [{"threshold": t, **{k: v for k, v in _summ(d[d["edge"] >= t]).items()
                                                   if k in ("traded", "return_per_match", "profit")}}
                             for t in (0.0, 0.02, 0.05, 0.10, 0.15)],
        "baselines": {
            "elo_favourite": baseline(elo_fav),
            "elo_favourite_same_matches": _summ(pd.DataFrame({"won": sub_won, "profit": np.where(sub_won, sub_odds - 1, -1.0),
                                                              "prob": 0.5})) if len(sub) else None,
            "market_favourite": baseline(mkt_fav),
        },
        "model_vs_market": {
            "n": int(len(d)), "model_brier": model.brier(y, d["p_model"].to_numpy()),
            "market_brier_devigged": model.brier(y, mk.to_numpy()),
            "model_log_loss": model.log_loss(y, d["p_model"].to_numpy()),
            "market_log_loss_devigged": model.log_loss(y, mk.to_numpy()),
        },
    }
    bt["baselines"]["elo_favourite_same_matches"] and bt["baselines"]["elo_favourite_same_matches"].pop("avg_model_prob", None)
    bt["baselines"]["market_favourite"].pop("avg_model_prob", None)
    bet_rows = [{
        "date": r.date[:10], "tour": r.tour, "tournament": r.tournament, "level": r.level, "surface": r.surface, "round": r.round,
        "book": r.book, "p1": r.p1n, "p2": r.p2n, "pick": r.pick, "prob": float(r.prob), "odds": float(r.odds_pick),
        "won": bool(r.won), "profit": float(r.profit), "edge": float(r.edge), "split": r.split,
    } for r in bets_all.itertuples()]
    return {"betting": bt, "bets": bet_rows}


def run(verbose: bool = True) -> dict[str, Any]:
    cfg = load_config()
    conn = connect(cfg=cfg)
    df = features.load_matches(conn)
    fs = features.build_features(df, current_ranks=get_rankings(conn))
    fd = fs.df
    oos, folds = model.walk_forward(fd, verbose=verbose)
    notes: list[str] = []
    if oos.empty:
        raise SystemExit("not enough data for walk-forward splits")
    oos = oos.join(fd[["date", "tour", "level", "surface", "rank1", "rank2", "p1_rank", "p2_rank", "best_of", "sets", "status"]])
    y, p = oos["y"].to_numpy(), oos["p_model"].to_numpy()

    splits = []
    for fo in folds:
        g = oos[oos["split"] == fo["name"]]
        gy = g["y"].to_numpy()
        m, mb, me = metrics(gy, g["p_model"].to_numpy()), metrics(gy, g["p_blend"].to_numpy()), metrics(gy, g["p_elo"].to_numpy())
        both = g[g["p1_rank"].notna() & g["p2_rank"].notna()]
        rank_acc = float(((both["p1_rank"] < both["p2_rank"]) == (both["y"] == 1)).mean()) if len(both) else None
        splits.append({
            "name": fo["name"], "start": g["date"].min()[:10], "end": g["date"].max()[:10], "n": int(len(g)),
            **m, "baseline_elo_brier": me["brier"], "baseline_elo_accuracy": me["accuracy"],
            "baseline_elo_log_loss": me["log_loss"], "baseline_blend_brier": mb["brier"],
            "baseline_blend_accuracy": mb["accuracy"], "baseline_rank_accuracy": rank_acc, "baseline_rank_n": int(len(both)),
            "train_n": fo["n_train"], "model_family": fo["family"], "blend_w": fo["blend_w"],
            "selection_logloss_logistic": fo["selection_logloss_logistic"],
            "selection_logloss_lightgbm": fo["selection_logloss_lightgbm"],
        })
    overall = {**metrics(y, p), "n": int(len(y)), "baseline_elo_brier": model.brier(y, oos["p_elo"].to_numpy()),
               "baseline_elo_accuracy": model.accuracy(y, oos["p_elo"].to_numpy()),
               "baseline_elo_log_loss": model.log_loss(y, oos["p_elo"].to_numpy()),
               "baseline_coin_brier": 0.25}
    by_tour = {t: {**metrics(g["y"].to_numpy(), g["p_model"].to_numpy()), "n": int(len(g)),
                   "baseline_elo_brier": model.brier(g["y"].to_numpy(), g["p_elo"].to_numpy())}
               for t, g in oos.groupby("tour")}
    by_level = {t: {**metrics(g["y"].to_numpy(), g["p_model"].to_numpy()), "n": int(len(g))}
                for t, g in oos.groupby("level") if len(g) >= 100}

    # set-score sanity: predicted vs actual straight-sets share for the favourite
    ss_pred, ss_act = [], []
    ll_iid, ll_mk, n_ll = 0.0, 0.0, 0
    for pr, bo, sets, d3, d5, st in zip(oos["p_model"], oos["best_of"], oos["sets"], oos["delta3"], oos["delta5"],
                                        oos["status"]):
        if not sets:
            continue
        dl = d3 if bo == 3 else d5
        probs = model.set_score_probs(float(pr), int(bo), float(dl))
        key_obs = model.observed_score_key(sets, int(bo)) if st == "final" else None
        if key_obs:
            iid = model.set_score_probs(float(pr), int(bo), 0.0)
            ll_iid += math.log(max(iid[key_obs], 1e-12))
            ll_mk += math.log(max(probs[key_obs], 1e-12))
            n_ll += 1
        key = "2-0" if bo == 3 else "3-0"
        fav_p1 = pr >= 0.5
        pred = probs[key] if fav_p1 else probs["0-2" if bo == 3 else "0-3"]
        w1 = sum(1 for s in sets if s[0] > s[1])
        w2 = sum(1 for s in sets if s[1] > s[0])
        need = 2 if bo == 3 else 3
        act = (w1 == need and w2 == 0) if fav_p1 else (w2 == need and w1 == 0)
        ss_pred.append(pred)
        ss_act.append(act)
    set_check = {"n": len(ss_pred), "exact_score_logloss": -ll_mk / n_ll if n_ll else None,
                 "exact_score_logloss_iid_sets": -ll_iid / n_ll if n_ll else None,
                 "set_delta_by_split": {f["name"]: f["set_delta"] for f in folds}, "favourite_straight_sets_pred": float(np.mean(ss_pred)) if ss_pred else None,
                 "favourite_straight_sets_actual": float(np.mean(ss_act)) if ss_act else None}

    result: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "splits": splits, "overall": overall,
        "calibration": calibration_bins(y, p),
        "rolling": rolling(oos["date"].to_numpy(), y, p),
        "by_tour": by_tour, "by_level": by_level, "set_score_check": set_check,
        "folds": folds,
    }
    notes += [
        f"Walk-forward: each split trains only on finished matches before its start (burn-in from {model.BURN_IN}); "
        "features use prior matches only; Elo blend weight, model family and calibration are chosen on training data only.",
        coverage_note(oos["level"], int(len(oos))),
        "baseline_elo = pure overall Elo (no surface blend); baseline_rank_accuracy uses ESPN seed/ranking where both known.",
    ]
    thr = float(cfg["model"]["edge_threshold"])
    odds = load_odds(conn)
    bet = betting_section(fd, oos, odds, thr) if not odds.empty else None
    if bet:
        result["betting"], result["bets"] = bet["betting"], bet["bets"]
        notes.append("Betting: flat $1 on the side with the larger edge (p_model*odds-1) when edge >= threshold, using "
                     "closing odds only for the decision and payout.")
    else:
        result["betting"], result["bets"] = None, []
        notes.append("No odds in the database, so there is no betting backtest. Import free closing odds with "
                     "`python -m engine.odds_history --years 2023-2026` (downloads from tennis-data.co.uk, or put the "
                     "xlsx files in data/odds_import/ first) and re-run `python -m engine.backtest`.")
    notes += [
        "Retirements are settled as void (profit 0, excluded from traded, retirement_rule='void'): most books void "
        "pre-completion retirements.",
        f"Value bets exclude matches where either player has fewer than {LOW_DATA_MATCHES} matches on record "
        "(same rule as the dashboard).",
        "Headline uses the pre-set 2-point threshold; ROI at other thresholds (roi_by_threshold) was chosen after "
        "seeing results and is optimistic.",
    ]
    result["notes"] = notes
    out = data_dir() / "backtest.json"
    atomic_write_text(out, json.dumps(_clean(result), indent=1))
    if verbose:
        print(f"wrote {out}")
        print(json.dumps(_clean({"overall": overall, "splits": [{k: s[k] for k in ('name', 'n', 'accuracy', 'brier', 'log_loss', 'baseline_elo_brier', 'baseline_elo_accuracy')} for s in splits]}), indent=1))
    return result


def main() -> None:
    run()


if __name__ == "__main__":
    main()
