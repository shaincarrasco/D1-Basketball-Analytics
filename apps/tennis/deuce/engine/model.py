"""Match-win model: logistic regression vs LightGBM on feature differences, with calibration and set-score maths.

All model inputs are antisymmetric (p1 minus p2, or interactions of such a difference with a symmetric factor),
the logistic model has no intercept, the temperature calibrator has no intercept and predictions are
symmetrised, so p(p1 beats p2) = 1 - p(p2 beats p1) exactly and the DB order of the players cannot bias anything.
Training uses both orientations of every match (a superset of random flipping).
"""
from __future__ import annotations

import math
import pickle
import warnings
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from . import ratings as R
from .db import data_dir

warnings.filterwarnings("ignore", message=".*eval_set.*")
warnings.filterwarnings("ignore", message=".*X does not have valid feature names.*")

MODEL_PATH_NAME = "model.pkl"
BURN_IN = "2023-07-01"          # ratings need ~6 months to settle after the 2023-01-01 cold start
EPS = 1e-6


def model_path() -> Path:
    return data_dir() / MODEL_PATH_NAME


# ------------------------------------------------------------------ features
def _shr(rate: pd.Series | np.ndarray, n: pd.Series | np.ndarray, k: float, prior: float = 0.5) -> np.ndarray:
    """Shrink a rate toward a prior with k pseudo-observations; missing rate (n=0) -> prior."""
    rate = np.nan_to_num(np.asarray(rate, dtype=float), nan=prior)
    n = np.asarray(n, dtype=float)
    return (rate * n + prior * k) / (n + k)


def logit(p):
    p = np.clip(p, EPS, 1 - EPS)
    return np.log(p / (1 - p))


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


FEATURE_NAMES = [
    "blend_logit", "elo_d", "selo_d", "elo_trend_d", "win_rate_d", "form_d", "momentum_d", "surf_wr_d",
    "games_won_d", "tiebreak_d", "decider_d", "experience_d", "common_opp_d", "quality_d", "comeback_d",
    "m7_d", "m14_d", "sets14_d", "games14_d", "rest_d", "retired_d", "surf90_d", "home_d", "h2h_d",
    "blend_logit_x_conf", "blend_logit_x_bo5", "elo_d_x_conf",
]


def build_X(d: pd.DataFrame, w: float) -> pd.DataFrame:
    """Antisymmetric feature matrix (p1 minus p2) for the rows of a feature frame."""
    g = lambda c: d[c].to_numpy(dtype=float)  # noqa: E731
    out: dict[str, np.ndarray] = {}
    bp = R.blend_prob(g("p1_elo"), g("p1_surface_elo"), g("p2_elo"), g("p2_surface_elo"), w)
    bl = logit(bp)
    out["blend_logit"] = bl
    out["elo_d"] = (g("p1_elo") - g("p2_elo")) / 100.0
    out["selo_d"] = (g("p1_surface_elo") - g("p2_surface_elo")) / 100.0
    out["elo_trend_d"] = (np.nan_to_num(g("p1_elo_trend_90d")) - np.nan_to_num(g("p2_elo_trend_90d"))) / 100.0

    def diff(col: str, ncol: str, k: float) -> np.ndarray:
        return _shr(g(f"p1_{col}"), g(f"p1_{ncol}"), k) - _shr(g(f"p2_{col}"), g(f"p2_{ncol}"), k)

    out["win_rate_d"] = diff("win_rate_1y", "n_1y", 8)
    out["form_d"] = diff("form_10", "n_form", 4)
    out["momentum_d"] = out["form_d"] - out["win_rate_d"]
    out["surf_wr_d"] = diff("surface_win_rate_1y", "surface_matches_1y", 8)
    out["games_won_d"] = diff("games_won_pct_1y", "n_1y", 5)
    out["tiebreak_d"] = diff("tiebreak_win_pct_1y", "n_tb", 10)
    out["decider_d"] = diff("deciding_set_win_pct_1y", "n_dec", 8)
    out["experience_d"] = np.log1p(g("p1_experience")) - np.log1p(g("p2_experience"))
    out["common_opp_d"] = diff("common_opp_win_rate", "n_common", 6)
    out["quality_d"] = diff("quality_form_30d", "n_q30", 3)
    out["comeback_d"] = diff("comeback_rate", "n_lost1", 8)
    out["m7_d"] = g("p1_matches_7d") - g("p2_matches_7d")
    out["m14_d"] = g("p1_matches_14d") - g("p2_matches_14d")
    out["sets14_d"] = (g("p1_sets_14d") - g("p2_sets_14d")) / 5.0
    out["games14_d"] = (g("p1_games_14d") - g("p2_games_14d")) / 50.0
    rest = lambda s: np.clip(np.nan_to_num(g(f"{s}_days_since_last"), nan=30.0), 0, 30)  # noqa: E731
    out["rest_d"] = (rest("p1") - rest("p2")) / 10.0
    out["retired_d"] = np.nan_to_num(g("p1_last_match_retired")) - np.nan_to_num(g("p2_last_match_retired"))
    out["surf90_d"] = (g("p1_matches_on_surface_90d") - g("p2_matches_on_surface_90d")) / 5.0
    out["home_d"] = np.nan_to_num(g("p1_home")) - np.nan_to_num(g("p2_home"))
    w1, w2 = g("h2h_p1w"), g("h2h_p2w")
    out["h2h_d"] = (w1 - w2) / (w1 + w2 + 3.0)
    mn = np.minimum(g("p1_n_elo"), g("p2_n_elo"))
    conf = mn / (mn + 10.0)
    bo5 = (d["best_of"].to_numpy() == 5).astype(float)
    out["blend_logit_x_conf"] = bl * conf
    out["blend_logit_x_bo5"] = bl * bo5
    out["elo_d_x_conf"] = out["elo_d"] * conf
    return pd.DataFrame(out, index=d.index)[FEATURE_NAMES]


def tune_blend(d: pd.DataFrame, y: np.ndarray) -> tuple[float, dict[float, float]]:
    """Pick the overall/surface Elo blend weight w minimising log loss on the given (training) rows."""
    res: dict[float, float] = {}
    e1, s1, e2, s2 = (d[c].to_numpy(dtype=float) for c in ("p1_elo", "p1_surface_elo", "p2_elo", "p2_surface_elo"))
    for w in np.arange(0.0, 1.0001, 0.1):
        res[round(float(w), 1)] = log_loss(y, R.blend_prob(e1, s1, e2, s2, w))
    return min(res, key=res.get), res


# ------------------------------------------------------------------ metrics
def log_loss(y: np.ndarray, p: np.ndarray) -> float:
    p = np.clip(p, EPS, 1 - EPS)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def brier(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.mean((p - y) ** 2))


def accuracy(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.mean((p >= 0.5) == (y == 1)))


# ------------------------------------------------------------------ set scores
def match_prob_from_set(s: float, best_of: int) -> float:
    """P(win match) given per-set win probability s."""
    if best_of == 5:
        return sum(_comb(2 + k, k) * s**3 * (1 - s) ** k for k in range(3))
    return s * s * (3 - 2 * s)


def _comb(n: int, k: int) -> int:
    from math import comb
    return comb(n, k)


def set_prob_from_match(p: float, best_of: int) -> float:
    """Invert match win probability to a per-set probability by bisection (monotone in s)."""
    p = min(max(p, 1e-9), 1 - 1e-9)
    lo, hi = 0.0, 1.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if match_prob_from_set(mid, best_of) < p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def _score_dist(s: float, delta: float, best_of: int) -> dict[tuple[int, int], float]:
    """Exact set-score distribution (p1 sets, p2 sets) for a Markov set model.

    P(p1 wins first set) = s; afterwards s+delta if p1 won the previous set, s-delta if he lost it
    (delta=0 is the i.i.d.-sets model). Positive delta captures the empirical clustering of straight-set results.
    """
    need = 2 if best_of == 3 else 3
    hi, lo = min(1.0, s + delta), max(0.0, s - delta)
    dist: dict[tuple[int, int], float] = {}

    def rec(w1: int, w2: int, last: int, prob: float) -> None:
        if w1 == need or w2 == need:
            dist[(w1, w2)] = dist.get((w1, w2), 0.0) + prob
            return
        q = s if last == 0 else (hi if last == 1 else lo)
        rec(w1 + 1, w2, 1, prob * q)
        rec(w1, w2 + 1, 2, prob * (1 - q))

    rec(0, 0, 0, 1.0)
    return dist


def _solve_s(p: float, delta: float, best_of: int) -> float:
    need = 2 if best_of == 3 else 3
    lo, hi = 0.0, 1.0
    for _ in range(45):
        mid = (lo + hi) / 2
        d = _score_dist(mid, delta, best_of)
        win = sum(v for (a, b), v in d.items() if a == need)
        if win < p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def set_score_probs(p: float, best_of: int, delta: float = 0.0) -> dict[str, float]:
    """Probability of each final set score from player 1's side (sums to 1).

    Inverts the match win probability to a per-set probability numerically, then enumerates set sequences.
    """
    p = min(max(p, 1e-9), 1 - 1e-9)
    s = _solve_s(p, delta, best_of)
    dist = _score_dist(s, delta, best_of)
    order = (["3-0", "3-1", "3-2", "2-3", "1-3", "0-3"] if best_of == 5 else ["2-0", "2-1", "1-2", "0-2"])
    out = {k: 0.0 for k in order}
    for (a, b), v in dist.items():
        out[f"{a}-{b}"] = float(v)
    tot = sum(out.values())
    return {k: v / tot for k, v in out.items()}


def observed_score_key(sets: list, best_of: int) -> str | None:
    """'2-1'-style key from p1's side for a completed match, or None (retired/incomplete)."""
    need = 2 if best_of == 3 else 3
    w1 = sum(1 for x in sets if x[0] > x[1])
    w2 = sum(1 for x in sets if x[1] > x[0])
    if max(w1, w2) != need or min(w1, w2) >= need:
        return None
    return f"{w1}-{w2}"


def fit_set_delta(ps: np.ndarray, keys: list[str | None], best_of: int,
                  grid=tuple(np.arange(0.0, 0.31, 0.02))) -> float:
    """Pick the momentum parameter maximising the likelihood of observed exact set scores (p binned to 0.02)."""
    rows = [(round(float(p) / 0.02) * 0.02, k) for p, k in zip(ps, keys) if k is not None]
    if len(rows) < 300:
        return 0.0
    bins: dict[float, dict[str, int]] = {}
    for p, k in rows:
        b = bins.setdefault(min(max(p, 0.02), 0.98), {})
        b[k] = b.get(k, 0) + 1
    best, best_ll = 0.0, -1e18
    for dlt in grid:
        ll = 0.0
        for p, cnt in bins.items():
            probs = set_score_probs(p, best_of, float(dlt))
            ll += sum(c * math.log(max(probs[k], 1e-12)) for k, c in cnt.items())
        if ll > best_ll:
            best, best_ll = float(dlt), ll
    return best


# ------------------------------------------------------------------ model object
@dataclass
class Model:
    family: str                       # "logistic" | "lightgbm"
    blend_w: float
    feature_names: list[str]
    mean: np.ndarray
    std: np.ndarray
    estimator: Any
    temperature: float
    version: str
    trained_until: str
    n_train: int
    created_at: str
    set_delta: dict[int, float] = field(default_factory=lambda: {3: 0.0, 5: 0.0})
    info: dict[str, Any] = field(default_factory=dict)

    def set_scores(self, p: float, best_of: int) -> dict[str, float]:
        return set_score_probs(p, best_of, self.set_delta.get(best_of, self.set_delta.get(3, 0.0)))

    def _raw(self, X: np.ndarray) -> np.ndarray:
        if self.family == "logistic":
            return self.estimator.predict_proba((X - self.mean) / self.std)[:, 1]
        return self.estimator.predict_proba(X)[:, 1]

    def predict(self, d: pd.DataFrame) -> np.ndarray:
        """Calibrated, orientation-symmetrised P(p1 wins) for the rows of a feature frame."""
        X = build_X(d, self.blend_w).to_numpy()
        z1 = logit(self._raw(X))
        z2 = logit(self._raw(-X))
        z = 0.5 * (z1 - z2)
        return sigmoid(self.temperature * z)


def _fit_lr(X: np.ndarray, y: np.ndarray, C: float):
    mean, std = np.zeros(X.shape[1]), X.std(axis=0) + 1e-9
    Xa = np.vstack([X, -X])
    ya = np.concatenate([y, 1 - y])
    lr = LogisticRegression(C=C, fit_intercept=False, max_iter=2000)
    lr.fit((Xa - mean) / std, ya)
    return lr, mean, std


def _fit_lgbm(X: np.ndarray, y: np.ndarray, Xv: np.ndarray | None, yv: np.ndarray | None, n_trees: int | None):
    import lightgbm as lgb
    Xa, ya = np.vstack([X, -X]), np.concatenate([y, 1 - y])
    params = dict(objective="binary", learning_rate=0.03, num_leaves=15, min_child_samples=150, subsample=0.8,
                  subsample_freq=1, colsample_bytree=0.8, reg_lambda=10.0, n_estimators=n_trees or 1500,
                  random_state=7, verbose=-1, n_jobs=4)
    clf = lgb.LGBMClassifier(**params)
    if n_trees is None and Xv is not None:
        clf.fit(Xa, ya, eval_set=[(np.vstack([Xv, -Xv]), np.concatenate([yv, 1 - yv]))], eval_metric="binary_logloss",
                callbacks=[lgb.early_stopping(60, verbose=False)])
    else:
        clf.fit(Xa, ya)
    return clf


def _predict_raw_sym(family: str, est, mean, std, X: np.ndarray) -> np.ndarray:
    f = (lambda A: est.predict_proba((A - mean) / std)[:, 1]) if family == "logistic" else (
        lambda A: est.predict_proba(A)[:, 1])
    return 0.5 * (logit(f(X)) - logit(f(-X)))


def _fit_temperature(z: np.ndarray, y: np.ndarray) -> float:
    """Slope-only Platt scaling: p = sigmoid(a * z), a>0. Fitted by 1-D Newton on log loss."""
    a = 1.0
    for _ in range(50):
        p = sigmoid(a * z)
        g = np.sum((p - y) * z)
        h = np.sum(p * (1 - p) * z * z) + 1e-9
        step = g / h
        a -= step
        if abs(step) < 1e-8:
            break
    return float(min(max(a, 0.3), 3.0))


def train(d: pd.DataFrame, y: np.ndarray | None = None, now: datetime | None = None, force_family: str | None = None,
          verbose: bool = False) -> Model:
    """Train on chronologically sorted finished-match rows `d` (needs column 'ts' and 'p1_won' or y).

    1. Tune Elo blend weight on all of d. 2. Selection run: fit on first 65%, calibrate on next 17.5%,
    compare logistic vs LightGBM on the final 17.5% (keep LightGBM only if it wins on out-of-sample log loss).
    3. Final model: fit the chosen family on the first 80%, calibrate (temperature) on the last 20%.
    """
    now = now or datetime.now(timezone.utc)
    d = d.sort_values("ts", kind="mergesort")
    y = (d["winner"] == d["p1"]).to_numpy(dtype=float) if y is None else y
    n = len(d)
    f_end = int(n * 0.8)
    w, _ = tune_blend(d.iloc[:f_end], y[:f_end])  # fit slice only (never the selection slice)
    X = build_X(d, w).to_numpy()
    a_end, b_end = int(n * 0.65), int(n * 0.825)
    XA, yA, XB, yB, XC, yC = X[:a_end], y[:a_end], X[a_end:b_end], y[a_end:b_end], X[b_end:], y[b_end:]

    # --- selection run
    best_C, best_ll = 0.1, 9.0
    for C in (0.003, 0.01, 0.03, 0.1, 0.3, 1.0):
        lr, mu, sd = _fit_lr(XA, yA, C)
        z = _predict_raw_sym("logistic", lr, mu, sd, XB)
        ll = log_loss(yB, sigmoid(z))
        if ll < best_ll:
            best_C, best_ll = C, ll
    lr, mu, sd = _fit_lr(XA, yA, best_C)
    zB = _predict_raw_sym("logistic", lr, mu, sd, XB)
    tB = _fit_temperature(zB, yB)
    ll_lr = log_loss(yC, sigmoid(tB * _predict_raw_sym("logistic", lr, mu, sd, XC)))
    n_trees, ll_gb = 0, float("inf")
    try:
        gb = _fit_lgbm(XA, yA, XB, yB, None)
        n_trees = int(getattr(gb, "best_iteration_", None) or gb.n_estimators)
        zBg = _predict_raw_sym("lightgbm", gb, None, None, XB)
        tBg = _fit_temperature(zBg, yB)
        ll_gb = log_loss(yC, sigmoid(tBg * _predict_raw_sym("lightgbm", gb, None, None, XC)))
    except Exception as exc:  # noqa: BLE001 - ImportError/OSError (missing libomp on macOS) or lightgbm errors
        print(f"  note: LightGBM unavailable ({type(exc).__name__}: {str(exc)[:80]}); using logistic regression")
        force_family = "logistic"
    family = force_family or ("lightgbm" if ll_gb < ll_lr - 2e-4 else "logistic")
    info = {"selection_logloss_logistic": ll_lr, "selection_logloss_lightgbm": ll_gb, "logistic_C": best_C,
            "lgbm_trees": n_trees, "blend_w": w}
    if verbose:
        print(f"  selection: logistic={ll_lr:.4f} lightgbm={ll_gb:.4f} -> {family}; blend_w={w}")

    # --- final fit
    XF, yF, XG, yG = X[:f_end], y[:f_end], X[f_end:], y[f_end:]
    if family == "logistic":
        est, mean, std = _fit_lr(XF, yF, best_C)
    else:
        est, mean, std = _fit_lgbm(XF, yF, None, None, n_trees), np.zeros(X.shape[1]), np.ones(X.shape[1])
    temp = _fit_temperature(_predict_raw_sym(family, est, mean, std, XG), yG)
    info["temperature"] = temp
    # set-score momentum parameter, fitted on the calibration slice (calibrated probs, observed set scores)
    dG = d.iloc[f_end:]
    pG = sigmoid(temp * _predict_raw_sym(family, est, mean, std, XG))
    deltas = {}
    for bo in (3, 5):
        mk = (dG["best_of"].to_numpy() == bo) & (dG["status"].to_numpy() == "final")
        keys = [observed_score_key(sv, bo) for sv in dG["sets"].to_numpy()[mk]]
        deltas[bo] = fit_set_delta(pG[mk], keys, bo)
    if deltas[5] == 0.0:
        deltas[5] = deltas[3]
    info["set_delta"] = deltas
    if family == "logistic":
        info["coefficients"] = {nm: float(c) for nm, c in zip(FEATURE_NAMES, est.coef_[0] / std)}
    return Model(
        family=family, blend_w=w, feature_names=list(FEATURE_NAMES), mean=mean, std=std, estimator=est,
        temperature=temp, version=f"{family}-{now:%Y%m%d}", trained_until=str(d["date"].iloc[-1]), n_train=n,
        created_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"), set_delta=deltas, info=info)


def save(model: Model, path: Path | None = None) -> Path:
    p = path or model_path()
    with open(p, "wb") as fh:
        pickle.dump(model, fh)
    return p


def load(path: Path | None = None) -> Model | None:
    p = path or model_path()
    if not p.exists():
        return None
    try:
        with open(p, "rb") as fh:
            return pickle.load(fh)
    except Exception:  # noqa: BLE001 - corrupt/incompatible pickle -> retrain
        return None


def is_stale(model: Model | None, max_age_days: int = 7, now: datetime | None = None) -> bool:
    if model is None:
        return True
    now = now or datetime.now(timezone.utc)
    created = datetime.strptime(model.created_at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return (now - created).days >= max_age_days


# ------------------------------------------------------------------ walk-forward
DEFAULT_SPLITS = [
    ("split1", "2025-01-01", "2025-09-01"),
    ("split2", "2025-09-01", "2026-05-01"),
    ("split3", "2026-05-01", "2100-01-01"),
]


def training_rows(fd: pd.DataFrame) -> pd.DataFrame:
    """Finished matches (final/retired with a winner) after the burn-in period."""
    m = fd["status"].isin(["final", "retired"]) & fd["winner"].notna() & (fd["date"] >= BURN_IN)
    return fd[m]


def walk_forward(fd: pd.DataFrame, splits=DEFAULT_SPLITS, verbose: bool = False) -> tuple[pd.DataFrame, list[dict]]:
    """Train strictly on matches before each split start; predict the split. Returns (oos frame, fold info).

    oos frame index = fd index; columns: p_model (calibrated), p_elo (pure overall Elo), p_blend, split, y.
    """
    rows = training_rows(fd)
    parts, folds = [], []
    for name, start, end in splits:
        tr = rows[rows["date"] < start]
        te = rows[(rows["date"] >= start) & (rows["date"] < end)]
        if len(tr) < 2000 or len(te) == 0:
            continue
        if verbose:
            print(f"{name}: train {len(tr)} ({tr['date'].min()[:10]}..{tr['date'].max()[:10]}) test {len(te)}")
        mdl = train(tr, verbose=verbose)
        out = pd.DataFrame(index=te.index)
        out["p_model"] = mdl.predict(te)
        out["p_elo"] = R.blend_prob(te["p1_elo"], te["p1_surface_elo"], te["p2_elo"], te["p2_surface_elo"], 0.0)
        out["p_blend"] = R.blend_prob(te["p1_elo"], te["p1_surface_elo"], te["p2_elo"], te["p2_surface_elo"], mdl.blend_w)
        out["split"] = name
        out["y"] = (te["winner"] == te["p1"]).astype(float)
        out["model_version"] = mdl.version + "-oos"
        out["delta3"], out["delta5"] = mdl.set_delta[3], mdl.set_delta[5]
        parts.append(out)
        folds.append({"name": name, "start": start, "end": end, "n_train": int(len(tr)), "n_test": int(len(te)),
                      "family": mdl.family, "blend_w": mdl.blend_w, "set_delta": mdl.set_delta, "temperature": mdl.temperature,
                      "selection_logloss_logistic": mdl.info["selection_logloss_logistic"],
                      "selection_logloss_lightgbm": mdl.info["selection_logloss_lightgbm"]})
    oos = pd.concat(parts) if parts else pd.DataFrame()
    return oos, folds
