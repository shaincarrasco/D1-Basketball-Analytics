"""Elo ratings per tour: overall + per-surface, FiveThirtyEight-style decaying K.

Walkovers are ignored, retirements count. Pre-match snapshots are recorded so features never leak.
Surface Elo groups Hard and Indoor Hard together (3 groups: Hard, Clay, Grass) and a player's
surface rating starts from their current overall rating the first time they play on a surface.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

START = 1500.0
K_NUM, K_OFF, K_EXP = 250.0, 5.0, 0.4
SURF_K_OFFSET = 15.0  # extra pseudo-matches for surface K (surface rating starts from overall); tuned on 2024 only
SURFACE_GROUPS = ("Hard", "Clay", "Grass")


def surf_group(surface: str | None) -> str:
    """Map the 4 contract surfaces to the 3 Elo groups."""
    if surface == "Clay":
        return "Clay"
    if surface == "Grass":
        return "Grass"
    return "Hard"


def k_factor(n: int, offset: float = K_OFF) -> float:
    """K = 250 / (n + 5) ** 0.4 where n is the matches played so far."""
    return K_NUM / (n + offset) ** K_EXP


def expected(ra: float, rb: float) -> float:
    return 1.0 / (1.0 + 10.0 ** (-(ra - rb) / 400.0))


def update_pair(ra: float, rb: float, na: int, nb: int, a_won: bool, off_a: float = K_OFF, off_b: float = K_OFF):
    """One Elo update. Returns (new_ra, new_rb)."""
    ea = expected(ra, rb)
    sa = 1.0 if a_won else 0.0
    return ra + k_factor(na, off_a) * (sa - ea), rb + k_factor(nb, off_b) * ((1 - sa) - (1 - ea))


def blend(elo: np.ndarray | float, selo: np.ndarray | float, w: float):
    """Blended rating for prediction: (1-w)*overall + w*surface."""
    return (1.0 - w) * np.asarray(elo) + w * np.asarray(selo)


def blend_prob(e1, s1, e2, s2, w: float):
    d = blend(e1, s1, w) - blend(e2, s2, w)
    return 1.0 / (1.0 + 10.0 ** (-np.asarray(d) / 400.0))


class RatingState:
    """Mutable current ratings (overall, per surface group, match counts)."""

    def __init__(self) -> None:
        self.elo: dict[str, float] = {}
        self.n: dict[str, int] = {}
        self.selo: dict[tuple[str, str], float] = {}
        self.sn: dict[tuple[str, str], int] = {}

    def get(self, pid: str, grp: str) -> tuple[float, float, int, int]:
        e = self.elo.get(pid, START)
        s = self.selo.get((pid, grp), e)  # lazily start from overall
        return e, s, self.n.get(pid, 0), self.sn.get((pid, grp), 0)


def compute_ratings(df: pd.DataFrame) -> tuple[pd.DataFrame, RatingState]:
    """Walk matches chronologically. df needs: p1, p2, winner, status, surface_grp (sorted by date).

    Returns per-match frame (aligned to df.index) with pre-match values
    elo1, elo2, selo1, selo2, n1, n2, plus post-match overall elo (post1, post2), and the final state.
    """
    st = RatingState()
    m = len(df)
    out = {k: np.zeros(m) for k in ("elo1", "elo2", "selo1", "selo2", "n1", "n2", "post1", "post2")}
    p1s, p2s, ws = df["p1"].to_numpy(), df["p2"].to_numpy(), df["winner"].to_numpy()
    sts, grps = df["status"].to_numpy(), df["surface_grp"].to_numpy()
    for i in range(m):
        a, b, g = p1s[i], p2s[i], grps[i]
        ea, sa, na, sna = st.get(a, g)
        eb, sb, nb, snb = st.get(b, g)
        out["elo1"][i], out["elo2"][i], out["selo1"][i], out["selo2"][i] = ea, eb, sa, sb
        out["n1"][i], out["n2"][i] = na, nb
        post_a, post_b = ea, eb
        if sts[i] in ("final", "retired") and ws[i] in (a, b):
            a_won = ws[i] == a
            post_a, post_b = update_pair(ea, eb, na, nb, a_won)
            ns_a, ns_b = update_pair(sa, sb, sna, snb, a_won, SURF_K_OFFSET, SURF_K_OFFSET)
            st.elo[a], st.elo[b] = post_a, post_b
            st.n[a], st.n[b] = na + 1, nb + 1
            st.selo[(a, g)], st.selo[(b, g)] = ns_a, ns_b
            st.sn[(a, g)], st.sn[(b, g)] = sna + 1, snb + 1
        out["post1"][i], out["post2"][i] = post_a, post_b
    return pd.DataFrame(out, index=df.index), st
