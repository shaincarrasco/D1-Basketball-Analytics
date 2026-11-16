"""python -m brief.run [--match ID] [--force] [--no-llm] [--no-weather] [--limit N] [--db PATH]

Builds briefs for scheduled/live matches that have a prediction and no brief yet,
and writes them to the `briefs` table. Safe on empty or missing tables.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from .config import load_config, resolve_db_path
from .generate import generate_brief

BRIEFS_DDL = ("CREATE TABLE IF NOT EXISTS briefs(match_id TEXT PRIMARY KEY, brief_json TEXT, "
              "engine TEXT, created_at TEXT)")
NEEDED = ("matches", "predictions")


def _tables(conn: sqlite3.Connection) -> set[str]:
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def _row(conn, sql, args=()):
    cur = conn.execute(sql, args)
    r = cur.fetchone()
    if r is None:
        return None
    return dict(zip([d[0] for d in cur.description], r))


def build_context(conn: sqlite3.Connection, match_id: str, cfg: Optional[dict] = None,
                  with_weather: bool = True, now: Optional[datetime] = None) -> Optional[dict]:
    """Assemble the brief context from the contract tables. None if no match/prediction."""
    conn.row_factory = None
    m = _row(conn, "SELECT * FROM matches WHERE id=?", (str(match_id),))
    pr = _row(conn, "SELECT * FROM predictions WHERE match_id=?", (str(match_id),))
    if not m or not pr:
        return None
    t = _row(conn, "SELECT * FROM tournaments WHERE id=?", (m.get("tournament_id"),)) or {}
    players = {}
    for side in ("p1", "p2"):
        pid = m.get(f"{side}_id")
        p = _row(conn, "SELECT * FROM players WHERE id=?", (pid,)) or {}
        players[side] = {"id": pid, "name": p.get("name") or f"Player {pid}", "country": p.get("country")}
    try:
        features = json.loads(pr.get("features_json") or "{}")
    except Exception:
        features = {}
    odds = []
    if "odds" in _tables(conn):
        cur = conn.execute("SELECT source, book, p1_odds, p2_odds, fetched_at, rowid FROM odds WHERE match_id=? "
                           "ORDER BY fetched_at, rowid", (str(match_id),))
        odds = [dict(zip(("source", "book", "p1_odds", "p2_odds", "fetched_at", "rowid"), r)) for r in cur.fetchall()]
    p1p, p2p = pr.get("p1_prob"), pr.get("p2_prob")
    ctx = {
        "match_id": str(match_id), "date": m.get("date"), "round": m.get("round"),
        "best_of": m.get("best_of"), "status": m.get("status"),
        "tournament": {k: t.get(k) for k in ("name", "surface", "level", "location", "country", "surface_inferred")},
        "p1": players["p1"], "p2": players["p2"],
        "p1_prob": p1p, "p2_prob": p2p,
        "features": features, "odds": odds, "weather": None,
        "now": (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "edge_threshold": ((cfg or {}).get("model") or {}).get("edge_threshold", 0.02),
    }
    if with_weather and t:
        try:
            from .weather import get_weather
            ctx["weather"] = get_weather(ctx["tournament"], m.get("date") or "", now=now)
        except Exception:
            ctx["weather"] = None
    return ctx


def _stale_reason(conn: sqlite3.Connection, mid: str, brief_json: str, brief_at: str,
                  pred_at, p1, p2, has_odds: bool) -> Optional[str]:
    """Why an existing brief needs rebuilding, or None if still current."""
    if pred_at and str(pred_at) > str(brief_at or ""):
        return "prediction updated"
    if has_odds:
        r = conn.execute("SELECT MAX(fetched_at) FROM odds WHERE match_id=?", (mid,)).fetchone()
        if r and r[0] and str(r[0]) > str(brief_at or ""):
            return "new odds"
    try:
        old = json.loads(brief_json).get("model_pick")
    except Exception:
        return "unreadable brief"
    if p1 is not None and p2 is not None and old != ("p1" if p1 >= p2 else "p2"):
        return "model pick changed"
    return None


def select_matches(conn: sqlite3.Connection, match_id: Optional[str], force: bool,
                   limit: Optional[int], days: Optional[float] = None) -> list[str]:
    if match_id:
        return [str(match_id)]
    has_odds = "odds" in _tables(conn)
    rows = conn.execute(
        "SELECT m.id, b.brief_json, b.created_at, p.created_at, p.p1_prob, p.p2_prob "
        "FROM matches m JOIN predictions p ON p.match_id = m.id LEFT JOIN briefs b ON b.match_id = m.id "
        "WHERE m.status IN ('scheduled','live') ORDER BY m.date ASC").fetchall()
    if days is not None:   # only matches that start within the next `days` days (the site window)
        end = (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
        due = {r[0] for r in conn.execute("SELECT id FROM matches WHERE date <= ?", (end,))}
        rows = [r for r in rows if r[0] in due]
    ids = []
    for mid, bj, bat, pat, p1, p2 in rows:
        if force or bj is None or _stale_reason(conn, mid, bj, bat, pat, p1, p2, has_odds):
            ids.append(mid)
    return ids[:int(limit)] if limit else ids


def run(db_path: Path, match_id: Optional[str] = None, force: bool = False, use_llm: bool = True,
        with_weather: bool = True, limit: Optional[int] = None, cfg: Optional[dict] = None,
        out=print, transport=None, days: Optional[float] = None) -> int:
    cfg = cfg if cfg is not None else load_config()
    if not Path(db_path).exists():
        out(f"No database at {db_path}. Run `python -m engine.update` first to ingest matches and predictions.")
        return 0
    conn = sqlite3.connect(str(db_path))
    try:
        have = _tables(conn)
        missing = [t for t in NEEDED if t not in have]
        if missing:
            out(f"Database is missing table(s): {', '.join(missing)}. "
                "Run `python -m engine.update` to build matches and predictions first.")
            return 0
        conn.execute(BRIEFS_DDL)
        conn.commit()
        ids = select_matches(conn, match_id, force, limit, days)
        if not ids:
            out("Nothing to do: no scheduled/live matches with predictions are missing a brief "
                "(use --force to rebuild, or --match ID).")
            return 0
        out(f"Building {len(ids)} brief(s) ({'LLM if available' if use_llm else 'rules only'})...")
        done = 0
        for i, mid in enumerate(ids, 1):
            ctx = build_context(conn, mid, cfg, with_weather=with_weather)
            if ctx is None:
                out(f"[{i}/{len(ids)}] match {mid}: no match row or no prediction, skipped")
                continue
            try:
                brief = generate_brief(ctx, use_llm=use_llm, config=cfg, transport=transport)
            except Exception as e:  # keep going
                out(f"[{i}/{len(ids)}] match {mid}: failed ({type(e).__name__}: {e})")
                continue
            now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            conn.execute("INSERT OR REPLACE INTO briefs(match_id, brief_json, engine, created_at) VALUES (?,?,?,?)",
                         (str(mid), json.dumps(brief, ensure_ascii=False), brief["engine"], now))
            conn.commit()
            done += 1
            out(f"[{i}/{len(ids)}] {ctx['p1']['name']} v {ctx['p2']['name']} -> engine={brief['engine']}, "
                f"agreement {brief['agreement']['score']} ({brief['agreement']['label']})")
        out(f"Done: {done} brief(s) written.")
        return done
    finally:
        conn.close()


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m brief.run", description="Generate Match Briefs.")
    ap.add_argument("--match", help="only this match id (works for any status)")
    ap.add_argument("--force", action="store_true", help="regenerate even if a brief exists")
    ap.add_argument("--no-llm", action="store_true", help="rules text only")
    ap.add_argument("--no-weather", action="store_true", help="skip Open-Meteo lookups")
    ap.add_argument("--limit", type=int, help="max matches to process")
    ap.add_argument("--days", type=float, help="only matches starting within this many days (the site window is 10)")
    ap.add_argument("--db", help="database path (default from config)")
    ap.add_argument("--config", help="config.toml path")
    a = ap.parse_args(argv)
    cfg = load_config(a.config)
    db = Path(a.db) if a.db else resolve_db_path(cfg)
    run(db, a.match, a.force or bool(a.match), not a.no_llm, not a.no_weather, a.limit, cfg, days=a.days)
    return 0


if __name__ == "__main__":
    sys.exit(main())
