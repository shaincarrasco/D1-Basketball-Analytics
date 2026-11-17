"""Shared fixtures: tiny synthetic leagues in an in-memory SQLite DB (no network)."""
from __future__ import annotations

import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from engine.db import connect  # noqa: E402


def make_db(n_players: int = 24, n_matches: int = 600, seed: int = 3, start: str = "2024-01-01"):
    """Round-robin-ish synthetic matches with latent player strength; returns an in-memory connection."""
    rng = random.Random(seed)
    conn = connect(":memory:")
    strength = {f"P{i}": rng.gauss(0, 1.0) for i in range(n_players)}
    for pid in strength:
        conn.execute("INSERT INTO players VALUES(?,?,?,?)", (pid, f"Player {pid}", "USA" if int(pid[1:]) % 3 == 0 else "Spain", "ATP"))
    conn.execute("INSERT INTO tournaments VALUES('T1','Test Open','ATP','2024-01-01','2026-01-01','Austin, USA','USA','Hard',0,'250')")
    conn.execute("INSERT INTO tournaments VALUES('T2','Clay Cup','ATP','2024-01-01','2026-01-01','Madrid, Spain','Spain','Clay',0,'500')")
    t = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
    ids = list(strength)
    for k in range(n_matches):
        a, b = rng.sample(ids, 2)
        t += timedelta(hours=rng.choice([5, 9, 20, 30]))
        p_a = 1 / (1 + 10 ** (-(strength[a] - strength[b])))
        a_wins = rng.random() < p_a
        w, l = (a, b) if a_wins else (b, a)
        two_sets = rng.random() < 0.6
        sets_ = [[6, 3, None, None], [6, 4, None, None]] if two_sets else [[6, 4, None, None], [3, 6, None, None], [7, 6, 7, 5]]
        # sets are from p1's (= a's) perspective; flip when a lost
        if not a_wins:
            sets_ = [[s[1], s[0], s[3], s[2]] for s in sets_]
        conn.execute(
            "INSERT INTO matches VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (f"M{k}", "T1" if k % 2 else "T2", "ATP", "Round 1", t.strftime("%Y-%m-%dT%H:%M:%SZ"), "final", a, b, w,
             "6-3 6-4", json.dumps(sets_), 3, None))
    conn.commit()
    return conn, strength


