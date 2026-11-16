"""`python -m engine.update`: ingest -> ratings -> features -> train -> predictions.

Writes `predictions` for every scheduled/live match (current model) and for finished matches from 2025 on
(strictly out-of-sample walk-forward predictions, pre-match features) so the UI and backtest can show history.
"""
from __future__ import annotations

import argparse
import json
import pickle
from datetime import date, datetime, timezone

import numpy as np
import pandas as pd

from . import espn, features, model, odds
from .db import connect, data_dir, load_config


def oos_cache_path():
    return data_dir() / "oos_preds.pkl"


def get_rankings(conn) -> dict[str, int]:
    row = conn.execute("SELECT value FROM meta WHERE key='rankings'").fetchone()
    if not row:
        return {}
    out: dict[str, int] = {}
    for tour_ranks in json.loads(row[0]).values():
        out.update({k: int(v) for k, v in tour_ranks.items()})
    return out


def write_player_ratings(conn, fs: features.FeatureSet, rankings: dict[str, int]) -> int:
    now = datetime.now(timezone.utc)
    snap = features.player_snapshot(fs, now.timestamp())
    st = fs.state
    players = {r["id"]: r for r in conn.execute("SELECT id,name,country,tour FROM players")}
    rows = []
    for r in snap.itertuples():
        p = players.get(r.player_id)
        if p is None or r.matches == 0:
            continue
        rows.append((
            r.player_id, p["name"], p["country"], p["tour"], st.elo.get(r.player_id),
            st.selo.get((r.player_id, "Hard")), st.selo.get((r.player_id, "Clay")), st.selo.get((r.player_id, "Grass")),
            int(r.matches), int(r.matches_1y), None if np.isnan(r.win_rate_1y) else float(r.win_rate_1y),
            None if np.isnan(r.form_10) else float(r.form_10), rankings.get(r.player_id),
            None if np.isnan(r.last_ts) else datetime.fromtimestamp(r.last_ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            now.strftime("%Y-%m-%dT%H:%M:%SZ")))
    conn.execute("DELETE FROM player_ratings")
    conn.executemany("INSERT INTO player_ratings VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    conn.commit()
    return len(rows)


def run(since: str = "2023-01-01", retrain: bool = False, do_ingest: bool = True, do_odds: bool = True,
        verbose: bool = True) -> dict:
    cfg = load_config()
    conn = connect(cfg=cfg)
    summary: dict = {}
    if do_ingest:
        if verbose:
            print("ingesting ESPN ...")
        summary["ingest"] = espn.ingest(conn, date.fromisoformat(since), verbose=verbose)
    rankings = get_rankings(conn)
    df = features.load_matches(conn)
    if verbose:
        print(f"building features for {len(df)} matches ...")
    fs = features.build_features(df, current_ranks=rankings)
    fd = fs.df

    mdl = model.load()
    if mdl is not None and mdl.feature_names != model.FEATURE_NAMES:
        mdl = None
    need_train = retrain or model.is_stale(mdl)
    if need_train:
        rows = model.training_rows(fd)
        if verbose:
            print(f"training on {len(rows)} finished matches ...")
        mdl = model.train(rows, verbose=verbose)
        model.save(mdl)
        oos, folds = model.walk_forward(fd, verbose=False)
        with open(oos_cache_path(), "wb") as fh:
            pickle.dump({"oos": oos.assign(match_id=fd.loc[oos.index, "id"].values).set_index("match_id"),
                         "folds": folds}, fh)
    summary["model"] = {"version": mdl.version, "family": mdl.family, "retrained": bool(need_train),
                        "blend_w": mdl.blend_w, "trained_until": mdl.trained_until}

    oos = None
    if oos_cache_path().exists():
        with open(oos_cache_path(), "rb") as fh:
            oos = pickle.load(fh)["oos"]

    # --- which rows get predictions
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    upcoming = fd.index[fd["status"].isin(["scheduled", "live"])]
    existing = {r[0] for r in conn.execute("SELECT match_id FROM predictions")}
    out_rows = []
    up_probs = mdl.predict(fd.loc[upcoming]) if len(upcoming) else np.array([])
    for i, p in zip(upcoming, up_probs):
        out_rows.append((fd.at[i, "id"], float(p), fd.at[i, "best_of"], i, mdl.version))
    fin = fd.index[fd["status"].isin(["final", "retired"]) & (fd["date"] >= model.DEFAULT_SPLITS[0][1])]
    new_after = None
    for i in fin:
        mid = fd.at[i, "id"]
        if oos is not None and mid in oos.index:
            out_rows.append((mid, float(oos.at[mid, "p_model"]), fd.at[i, "best_of"], i, str(oos.at[mid, "model_version"])))
        elif mid not in existing:
            # finished after the OOS cache/model: pre-match prediction from the current model
            new_after = new_after if new_after is not None else []
            new_after.append(i)
    if new_after:
        p_new = mdl.predict(fd.loc[new_after])
        for i, p in zip(new_after, p_new):
            if fd.at[i, "date"] > mdl.trained_until:  # strictly after training data -> still out-of-sample
                out_rows.append((fd.at[i, "id"], float(p), fd.at[i, "best_of"], i, mdl.version))
    if verbose:
        print(f"writing {len(out_rows)} predictions ...")
    batch = []
    for mid, p, bo, i, ver in out_rows:
        ctx = fs.context(int(i))
        batch.append((mid, p, 1 - p, json.dumps(mdl.set_scores(p, int(bo))), json.dumps(ctx), ver, now_iso))
    conn.executemany("INSERT OR REPLACE INTO predictions VALUES(?,?,?,?,?,?,?)", batch)
    conn.execute("DELETE FROM predictions WHERE match_id NOT IN (SELECT id FROM matches)")
    conn.execute("DELETE FROM predictions WHERE match_id IN (SELECT id FROM matches WHERE status='walkover')")
    conn.commit()
    summary["ratings_rows"] = write_player_ratings(conn, fs, rankings)

    if do_odds:
        try:
            summary["odds"] = odds.fetch_all(conn, cfg)
        except Exception as exc:  # noqa: BLE001 - odds are optional
            summary["odds"] = {"error": str(exc)}
    conn.execute("INSERT INTO meta(key,value) VALUES('last_update',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                 (now_iso,))
    conn.commit()

    q = lambda s: conn.execute(s).fetchone()[0]  # noqa: E731
    summary["counts"] = {
        "matches": q("SELECT COUNT(*) FROM matches"), "players": q("SELECT COUNT(*) FROM players"),
        "predictions": q("SELECT COUNT(*) FROM predictions"),
        "upcoming_matches": q("SELECT COUNT(*) FROM matches WHERE status IN('scheduled','live')"),
        "upcoming_with_predictions": q("SELECT COUNT(*) FROM predictions p JOIN matches m ON m.id=p.match_id "
                                       "WHERE m.status IN('scheduled','live')"),
    }
    return summary


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest, rate, train and predict")
    ap.add_argument("--since", default="2023-01-01")
    ap.add_argument("--retrain", action="store_true")
    ap.add_argument("--no-ingest", action="store_true")
    ap.add_argument("--no-odds", action="store_true")
    a = ap.parse_args()
    s = run(a.since, a.retrain, not a.no_ingest, not a.no_odds)
    print(json.dumps(s, indent=2, default=str))


if __name__ == "__main__":
    main()
