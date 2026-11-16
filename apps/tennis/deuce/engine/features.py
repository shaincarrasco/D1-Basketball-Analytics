"""Leak-free match context features.

Everything is computed from matches strictly before each match's start. History is stored as sorted
per-player arrays with cumulative sums so each window query is two binary searches (vectorised), instead of
O(n^2) Python loops. Walkovers never count as played matches.
"""
from __future__ import annotations

import json
import sqlite3
from bisect import bisect_left
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from . import ratings as R
from .countries import norm_country
from .espn import format_score

DAY = 86400.0
BIG = 4.0e9
PLAYED = ("final", "retired")
RADAR_MAP = {
    "Win Rate": "win_rate_1y", "Form": "form_10", "Momentum": "momentum", "Surface": "surface_win_rate_1y",
    "Games Won": "games_won_pct_1y", "Tiebreaks": "tiebreak_win_pct_1y", "Experience": "experience",
    "Common Opponents": "common_opp_win_rate", "Quality Form": "quality_form_30d", "Comeback": "comeback_rate",
}
# per-side numeric columns exposed in features_json (and used by the model)
SIDE_COLS = [
    "elo", "surface_elo", "elo_trend_90d", "rank", "win_rate_1y", "form_10", "momentum", "surface_win_rate_1y",
    "surface_matches_1y", "games_won_pct_1y", "tiebreak_win_pct_1y", "deciding_set_win_pct_1y", "experience",
    "common_opp_win_rate", "quality_form_30d", "comeback_rate", "matches_7d", "matches_14d", "sets_14d",
    "games_14d", "days_since_last", "last_match_retired", "matches_on_surface_90d", "home",
]
# support counts used for shrinkage in the model (not exported)
COUNT_COLS = ["n_1y", "n_form", "n_tb", "n_dec", "n_lost1", "n_common", "n_q30", "n_surf_elo", "n_elo", "matches_1y",
              "matches_30d", "matches_90d"]


def load_matches(conn: sqlite3.Connection) -> pd.DataFrame:
    """All matches joined with tournament/player info, sorted chronologically."""
    q = """SELECT m.id, m.tour, m.round, m.date, m.status, m.p1_id AS p1, m.p2_id AS p2, m.winner_id AS winner,
                  m.score, m.sets_json, m.best_of, m.court, m.tournament_id, t.name AS tname, t.surface, t.level,
                  t.country AS tcountry, t.start_date AS tstart, t.surface_inferred, a.name AS p1_name,
                  b.name AS p2_name, a.country AS p1_country, b.country AS p2_country,
                  r.p1_rank AS rank1, r.p2_rank AS rank2
           FROM matches m
           LEFT JOIN tournaments t ON t.id = m.tournament_id
           LEFT JOIN players a ON a.id = m.p1_id LEFT JOIN players b ON b.id = m.p2_id
           LEFT JOIN match_ranks r ON r.match_id = m.id
           WHERE m.date IS NOT NULL"""
    df = pd.read_sql_query(q, conn)
    df["ts"] = (pd.to_datetime(df["date"], utc=True) - pd.Timestamp("1970-01-01", tz="UTC")).dt.total_seconds()
    df["surface"] = df["surface"].fillna("Hard")
    df["surface_grp"] = df["surface"].map(R.surf_group)
    df["sets"] = df["sets_json"].map(lambda s: json.loads(s) if isinstance(s, str) and s else [])
    df["best_of"] = df["best_of"].fillna(3).astype(int)
    df = df.sort_values(["ts", "id"], kind="mergesort").reset_index(drop=True)
    return df


def _sets_stats(sets: list, status: str, best_of: int) -> tuple:
    """Per match (p1 perspective): games1, games2, tb1_won, tb2_won, n_sets, sets1, sets2, first_set_winner, deciding."""
    g1 = sum(s[0] for s in sets)
    g2 = sum(s[1] for s in sets)
    tb1 = tb2 = 0
    s1 = s2 = 0
    for a, b, ta, tb in sets:
        if a > b:
            s1 += 1
        elif b > a:
            s2 += 1
        if ta is not None or tb is not None:
            if a > b:
                tb1 += 1
            elif b > a:
                tb2 += 1
    first = 0
    if len(sets) >= 2:
        first = 1 if sets[0][0] > sets[0][1] else 2 if sets[0][1] > sets[0][0] else 0
    deciding = int(status == "final" and len(sets) == best_of and best_of >= 3)
    return g1, g2, tb1, tb2, len(sets), s1, s2, first, deciding


class Long:
    """Sorted per-player history with cumulative sums. Key = pid*BIG + ts (sorted)."""

    def __init__(self, pid: np.ndarray, ts: np.ndarray, extra_key: np.ndarray | None, cols: dict[str, np.ndarray]):
        k = pid if extra_key is None else extra_key
        order = np.lexsort((ts, k))
        self.key = k[order].astype(float) * BIG + ts[order]
        self.ts = ts[order]
        self.cols = {n: c[order] for n, c in cols.items()}
        self.cs = {n: np.concatenate([[0.0], np.cumsum(c.astype(float))]) for n, c in self.cols.items()}

    def hi(self, base: np.ndarray, t: np.ndarray) -> np.ndarray:
        return np.searchsorted(self.key, base * BIG + t, side="left")

    def window(self, base: np.ndarray, t: np.ndarray, days: float) -> np.ndarray:
        return np.searchsorted(self.key, base * BIG + t - days * DAY, side="left")

    def rng(self, name: str, lo: np.ndarray, hi: np.ndarray) -> np.ndarray:
        cs = self.cs[name]
        return cs[hi] - cs[lo]


def _rate(num: np.ndarray, den: np.ndarray) -> np.ndarray:
    out = np.full(len(num), np.nan)
    ok = den > 0
    out[ok] = num[ok] / den[ok]
    return out


@dataclass
class FeatureSet:
    """Computed features for all matches plus helpers to render features_json."""
    df: pd.DataFrame                       # matches (chronological) with p1_*/p2_* feature columns
    state: R.RatingState
    long: Long
    pair_hist: dict[tuple[str, str], list[int]]
    pid_code: dict[str, int]
    current_ranks: dict[str, int] = field(default_factory=dict)
    radar: dict[str, np.ndarray] = field(default_factory=dict)  # "p1"/"p2" -> (n, 10) percentile matrix

    # ----------------------------------------------------------- json rendering
    def _last5(self, side: str, i: int) -> list[dict]:
        row = self.df.iloc[i]
        pid = row["p1"] if side == "p1" else row["p2"]
        code = self.pid_code[pid]
        L = self.long
        hi = int(L.hi(np.array([code]), np.array([row["ts"]]))[0])
        seg0 = int(np.searchsorted(L.key, code * BIG, side="left"))
        out = []
        for j in range(hi - 1, max(seg0, hi - 5) - 1, -1):
            mi = int(L.cols["mrow"][j])
            m = self.df.iloc[mi]
            my_side = int(L.cols["side"][j])
            won = bool(L.cols["won"][j])
            opp = m["p2_name"] if my_side == 1 else m["p1_name"]
            sc = format_score(m["sets"], my_side == 1, "ret." if m["status"] == "retired" else "")
            out.append({"date": m["date"][:10], "opponent": opp, "result": "W" if won else "L", "score": sc,
                        "tournament": m["tname"]})
        return out

    def _h2h(self, i: int) -> dict:
        row = self.df.iloc[i]
        key = tuple(sorted((row["p1"], row["p2"])))
        idxs = [k for k in self.pair_hist.get(key, []) if self.df.at[k, "ts"] < row["ts"]]
        w1 = w2 = 0
        last = []
        for k in idxs:
            m = self.df.iloc[k]
            p1_won = m["winner"] == row["p1"]
            w1 += p1_won
            w2 += not p1_won
        for k in reversed(idxs[-5:]):
            m = self.df.iloc[k]
            last.append({"date": m["date"][:10], "winner": "p1" if m["winner"] == row["p1"] else "p2",
                         "score": m["score"], "tournament": m["tname"], "surface": m["surface"]})
        return {"p1_wins": int(w1), "p2_wins": int(w2), "last": last}

    def context(self, i: int) -> dict[str, Any]:
        """features_json dict for match row i (contract shape)."""
        row = self.df.iloc[i]

        def clean(v):
            if v is None or (isinstance(v, float) and np.isnan(v)):
                return None
            if isinstance(v, (np.integer,)):
                return int(v)
            if isinstance(v, (np.floating,)):
                return round(float(v), 4)
            if isinstance(v, (np.bool_,)):
                return bool(v)
            return v

        out: dict[str, Any] = {"as_of": row["date"]}
        for s in ("p1", "p2"):
            d: dict[str, Any] = {}
            for c in SIDE_COLS:
                v = clean(row[f"{s}_{c}"])
                if c in ("rank", "experience", "surface_matches_1y", "matches_7d", "matches_14d", "sets_14d",
                         "games_14d", "matches_on_surface_90d") and v is not None:
                    v = int(v)
                if c == "days_since_last" and v is not None:
                    v = int(v)
                if c == "last_match_retired" and v is not None:
                    v = bool(v)
                if c == "home" and v is not None:
                    v = bool(v)
                if c in ("elo", "surface_elo", "elo_trend_90d") and v is not None:
                    v = round(float(v), 1)
                d[c] = v
            d["last5"] = self._last5(s, i)
            out[s] = d
        out["h2h"] = self._h2h(i)
        out["common_opponents"] = clean(row["common_opponents"])
        if self.radar:
            out["radar"] = {
                s: {name: (None if np.isnan(self.radar[s][i, k]) else int(round(self.radar[s][i, k])))
                    for k, name in enumerate(RADAR_MAP)} for s in ("p1", "p2")
            }
        return out


def build_features(df: pd.DataFrame, current_ranks: dict[str, int] | None = None) -> FeatureSet:
    """Compute ratings + all context features for every match row of df (chronological)."""
    df = df.copy()
    n = len(df)
    ra, state = R.compute_ratings(df)
    for c in ra.columns:
        df[c] = ra[c].to_numpy()

    codes, uniq = pd.factorize(pd.concat([df["p1"], df["p2"]], ignore_index=True))
    pid_code = {p: i for i, p in enumerate(uniq)}
    c1, c2 = codes[:n].astype(float), codes[n:].astype(float)
    df["c1"], df["c2"] = c1, c2

    # --- per-match derived stats (python loop over parsed sets; ~40k rows)
    st = np.zeros((n, 9))
    for i, (sets, status, bo) in enumerate(zip(df["sets"], df["status"], df["best_of"])):
        st[i] = _sets_stats(sets, status, int(bo))
    g1, g2, tb1, tb2, nsets, s1, s2, first, deciding = st.T
    played = df["status"].isin(PLAYED).to_numpy() & df["winner"].notna().to_numpy()
    p1_won = (df["winner"] == df["p1"]).to_numpy()
    retired = (df["status"] == "retired").to_numpy()

    # --- long table (one row per player per played match)
    idx = np.where(played)[0]

    def side_cols(side: int) -> dict[str, np.ndarray]:
        mine_is1 = side == 1
        won = p1_won[idx] if mine_is1 else ~p1_won[idx]
        gw, gl = (g1, g2) if mine_is1 else (g2, g1)
        tw, tl = (tb1, tb2) if mine_is1 else (tb2, tb1)
        sw, sl = (s1, s2) if mine_is1 else (s2, s1)
        opp_elo = df["elo2"].to_numpy()[idx] if mine_is1 else df["elo1"].to_numpy()[idx]
        post = df["post1"].to_numpy()[idx] if mine_is1 else df["post2"].to_numpy()[idx]
        lost_first = (first[idx] == (2 if mine_is1 else 1))
        wgt = 10.0 ** ((opp_elo - 1500.0) / 800.0)
        return {
            "pid": (c1 if mine_is1 else c2)[idx], "opp": (c2 if mine_is1 else c1)[idx],
            "won": won.astype(float), "gw": gw[idx], "gl": gl[idx], "tbw": tw[idx], "tbn": (tw + tl)[idx],
            "sets": nsets[idx], "dec": deciding[idx], "dec_won": deciding[idx] * won,
            "lost1": lost_first.astype(float), "comeback": (lost_first & won).astype(float),
            "ret_self": (retired[idx] & ~won).astype(float), "q_w": wgt * won, "q_n": wgt,
            "grp": df["surface_grp"].map({"Hard": 0, "Clay": 1, "Grass": 2}).to_numpy()[idx].astype(float),
            "ts": df["ts"].to_numpy()[idx], "post": post, "mrow": idx.astype(float),
            "side": np.full(len(idx), float(side)), "one": np.ones(len(idx)),
        }

    a, b = side_cols(1), side_cols(2)
    cols = {k: np.concatenate([a[k], b[k]]) for k in a}
    L = Long(cols["pid"], cols["ts"], None, {k: v for k, v in cols.items() if k != "ts"})
    # surface view: key = pid*3 + grp
    LS = Long(cols["pid"], cols["ts"], cols["pid"] * 3 + cols["grp"], {"won": cols["won"], "one": cols["one"]})

    ts = df["ts"].to_numpy()
    grp_code = df["surface_grp"].map({"Hard": 0, "Clay": 1, "Grass": 2}).to_numpy().astype(float)

    def side_feats(pcode: np.ndarray, elo_now: np.ndarray, selo_now: np.ndarray, n_elo: np.ndarray, country: pd.Series):
        hi = L.hi(pcode, ts)
        seg0 = np.searchsorted(L.key, pcode * BIG, side="left")
        has = hi > seg0
        lo = {d: L.window(pcode, ts, d) for d in (7, 14, 30, 90, 365, 730)}
        out: dict[str, np.ndarray] = {}
        n1y = (hi - lo[365]).astype(float)
        out["n_1y"] = n1y
        out["win_rate_1y"] = _rate(L.rng("won", lo[365], hi), n1y)
        lo10 = np.maximum(hi - 10, lo[90])
        nform = (hi - lo10).astype(float)
        out["n_form"] = nform
        out["form_10"] = _rate(L.rng("won", lo10, hi), nform)
        out["momentum"] = out["form_10"] - out["win_rate_1y"]
        gw, gl = L.rng("gw", lo[365], hi), L.rng("gl", lo[365], hi)
        out["games_won_pct_1y"] = _rate(gw, gw + gl)
        tbn = L.rng("tbn", lo[365], hi)
        out["n_tb"] = tbn
        out["tiebreak_win_pct_1y"] = _rate(L.rng("tbw", lo[365], hi), tbn)
        dec = L.rng("dec", lo[365], hi)
        out["n_dec"] = dec
        out["deciding_set_win_pct_1y"] = _rate(L.rng("dec_won", lo[365], hi), dec)
        lost1 = L.rng("lost1", lo[365], hi)
        out["n_lost1"] = lost1
        out["comeback_rate"] = _rate(L.rng("comeback", lo[365], hi), lost1)
        qn = L.rng("q_n", lo[30], hi)
        out["n_q30"] = (hi - lo[30]).astype(float)
        out["quality_form_30d"] = _rate(L.rng("q_w", lo[30], hi), qn)
        out["experience"] = (hi - seg0).astype(float)
        out["matches_7d"] = (hi - lo[7]).astype(float)
        out["matches_14d"] = (hi - lo[14]).astype(float)
        out["sets_14d"] = L.rng("sets", lo[14], hi)
        out["games_14d"] = L.rng("gw", lo[14], hi) + L.rng("gl", lo[14], hi)
        out["matches_30d"] = (hi - lo[30]).astype(float)
        out["matches_90d"] = (hi - lo[90]).astype(float)
        out["matches_1y"] = n1y
        last_i = np.maximum(hi - 1, 0)
        dsl = (ts - L.ts[last_i]) / DAY if len(L.ts) else np.full(n, np.nan)
        out["days_since_last"] = np.where(has, np.floor(dsl), np.nan)
        out["last_match_retired"] = np.where(has, L.cols["ret_self"][last_i], np.nan)
        # elo
        prev90 = np.where(lo[90] > seg0, L.cols["post"][np.maximum(lo[90] - 1, 0)], R.START)
        out["elo"] = elo_now
        out["elo_trend_90d"] = np.where(has, elo_now - prev90, np.nan)
        out["surface_elo"] = selo_now
        out["n_elo"] = n_elo
        # surface-specific
        skey = pcode * 3 + grp_code
        shi = LS.hi(skey, ts)
        s365 = LS.window(skey, ts, 365)
        s90 = LS.window(skey, ts, 90)
        sn = (shi - s365).astype(float)
        out["surface_matches_1y"] = sn
        out["surface_win_rate_1y"] = _rate(LS.rng("won", s365, shi), sn)
        out["matches_on_surface_90d"] = (shi - s90).astype(float)
        sseg0 = np.searchsorted(LS.key, skey * BIG, side="left")
        out["n_surf_elo"] = (shi - sseg0).astype(float)
        # home
        tc = df["tcountry"].map(norm_country)
        pc = country.map(norm_country)
        home = np.where(tc.isna() | pc.isna(), np.nan, (tc == pc).astype(float))
        out["home"] = home
        out["_hi"], out["_lo730"] = hi, lo[730]
        return out

    f1 = side_feats(c1, df["elo1"].to_numpy(), df["selo1"].to_numpy(), df["n1"].to_numpy(), df["p1_country"])
    f2 = side_feats(c2, df["elo2"].to_numpy(), df["selo2"].to_numpy(), df["n2"].to_numpy(), df["p2_country"])

    # --- common opponents (last 730 days), python loop with numpy slices
    opp, won_arr = L.cols["opp"].astype(np.int64), L.cols["won"]
    cr1, cr2 = np.full(n, np.nan), np.full(n, np.nan)
    ncommon_players = np.full(n, np.nan)
    ncm1, ncm2 = np.zeros(n), np.zeros(n)
    h1, l1, h2, l2 = f1["_hi"], f1["_lo730"], f2["_hi"], f2["_lo730"]
    for i in range(n):
        if h1[i] - l1[i] == 0 or h2[i] - l2[i] == 0:
            continue
        o1, o2 = opp[l1[i]:h1[i]], opp[l2[i]:h2[i]]
        common = np.intersect1d(o1, o2)
        if common.size == 0:
            ncommon_players[i] = 0
            continue
        m1, m2 = np.isin(o1, common), np.isin(o2, common)
        cr1[i] = won_arr[l1[i]:h1[i]][m1].mean()
        cr2[i] = won_arr[l2[i]:h2[i]][m2].mean()
        ncommon_players[i] = common.size
        ncm1[i], ncm2[i] = m1.sum(), m2.sum()
    f1["common_opp_win_rate"], f2["common_opp_win_rate"] = cr1, cr2
    f1["n_common"], f2["n_common"] = ncm1, ncm2
    df["common_opponents"] = ncommon_players

    # --- h2h (chronological pass) and rank carry-forward
    pair_hist: dict[tuple[str, str], list[int]] = {}
    p1w, p2w = np.zeros(n), np.zeros(n)
    ranks1, ranks2 = np.full(n, np.nan), np.full(n, np.nan)
    last_rank: dict[str, tuple[float, int]] = {}
    cur = current_ranks or {}
    ts_now = float(pd.Timestamp.now("UTC").timestamp())
    P1, P2, W = df["p1"].to_numpy(), df["p2"].to_numpy(), df["winner"].to_numpy()
    r1c, r2c = df["rank1"].to_numpy(), df["rank2"].to_numpy()
    for i in range(n):
        key = (P1[i], P2[i]) if P1[i] <= P2[i] else (P2[i], P1[i])
        hist = pair_hist.get(key)
        if hist:
            for k in hist:
                if W[k] == P1[i]:
                    p1w[i] += 1
                else:
                    p2w[i] += 1
        for side, pid, rc, arr in ((1, P1[i], r1c[i], ranks1), (2, P2[i], r2c[i], ranks2)):
            val = rc if not (rc is None or (isinstance(rc, float) and np.isnan(rc))) else None
            if val is None:
                lr = last_rank.get(pid)
                if lr and ts[i] - lr[0] <= 120 * DAY:
                    val = lr[1]
                elif ts[i] >= ts_now - 2 * DAY and pid in cur:
                    val = cur[pid]
            if val is not None:
                arr[i] = val
                if rc is not None and not (isinstance(rc, float) and np.isnan(rc)):
                    last_rank[pid] = (ts[i], int(val))
        if played[i]:
            pair_hist.setdefault(key, []).append(i)
    df["h2h_p1w"], df["h2h_p2w"] = p1w, p2w
    f1["rank"], f2["rank"] = ranks1, ranks2

    for pre, f in (("p1_", f1), ("p2_", f2)):
        for k, v in f.items():
            if not k.startswith("_"):
                df[pre + k] = v
    fs = FeatureSet(df=df, state=state, long=L, pair_hist=pair_hist, pid_code=pid_code, current_ranks=cur)
    fs.radar = compute_radar(df)
    return fs


def compute_radar(df: pd.DataFrame) -> dict[str, np.ndarray]:
    """Percentiles (0-100) of the radar metrics within tour, vs rows of the previous 4 weeks (leak-free)."""
    n = len(df)
    week = (df["ts"].to_numpy() // (7 * DAY)).astype(int)
    tour = df["tour"].to_numpy()
    out = {s: np.full((n, len(RADAR_MAP)), np.nan) for s in ("p1", "p2")}
    for tr in np.unique(tour):
        tmask = tour == tr
        weeks = np.unique(week[tmask])
        for w in weeks:
            cur = np.where(tmask & (week == w))[0]
            ref_mask = tmask & (week >= w - 4) & (week < w)
            for k, metric in enumerate(RADAR_MAP.values()):
                vals = np.concatenate([df[f"p1_{metric}"].to_numpy()[ref_mask], df[f"p2_{metric}"].to_numpy()[ref_mask]])
                vals = vals[~np.isnan(vals)]
                if len(vals) < 200:  # early weeks: fall back to current week + previous
                    m2 = tmask & (week >= w - 4) & (week <= w)
                    vals = np.concatenate([df[f"p1_{metric}"].to_numpy()[m2], df[f"p2_{metric}"].to_numpy()[m2]])
                    vals = vals[~np.isnan(vals)]
                if len(vals) == 0:
                    continue
                vals = np.sort(vals)
                for s in ("p1", "p2"):
                    x = df[f"{s}_{metric}"].to_numpy()[cur]
                    lt = np.searchsorted(vals, x, side="left")
                    le = np.searchsorted(vals, x, side="right")
                    pct = 100.0 * (lt + 0.5 * (le - lt)) / len(vals)
                    pct[np.isnan(x)] = np.nan
                    out[s][cur, k] = pct
    return out


def player_snapshot(fs: FeatureSet, now_ts: float) -> pd.DataFrame:
    """Current per-player stats (as of now) for the top-players table: matches, 1y win rate, form_10, last match."""
    L = fs.long
    codes = np.array(sorted(set(fs.pid_code.values())), dtype=float)
    inv = {v: k for k, v in fs.pid_code.items()}
    t = np.full(len(codes), now_ts)
    hi = L.hi(codes, t)
    seg0 = np.searchsorted(L.key, codes * BIG, side="left")
    lo365 = L.window(codes, t, 365)
    lo90 = L.window(codes, t, 90)
    lo10 = np.maximum(hi - 10, lo90)
    n1y = (hi - lo365).astype(float)
    last_ts = np.where(hi > seg0, L.ts[np.maximum(hi - 1, 0)], np.nan)
    return pd.DataFrame({
        "player_id": [inv[int(c)] for c in codes], "matches": hi - seg0, "matches_1y": n1y,
        "win_rate_1y": _rate(L.rng("won", lo365, hi), n1y),
        "form_10": _rate(L.rng("won", lo10, hi), (hi - lo10).astype(float)),
        "last_ts": last_ts,
    })
