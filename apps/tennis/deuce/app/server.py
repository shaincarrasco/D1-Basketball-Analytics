"""Deuce dashboard server.

Run with ``python -m app.server`` (http://127.0.0.1:8765, override the port with ``PORT``).

Reads SQLite directly following CONTRACT.md. It never imports the engine or brief packages.
Every endpoint copes with a missing or empty database: lists come back empty, single items 404
with a message, nothing raises a 500.

Environment overrides (handy for demos and tests):
  DEUCE_DB        path to the SQLite database (default: config [paths].db, else data/tennis.db)
  DEUCE_BACKTEST  path to backtest.json (default: data/backtest.json)
  DEUCE_CONFIG    path to config.toml (default: repo-root config.toml)
  PORT            port to listen on (default 8765)
"""
from __future__ import annotations

import json
import math
import os
import sqlite3
import tomllib
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = Path(__file__).resolve().parent / "static"

DEFAULT_EDGE = 0.02
LOW_DATA_MATCHES = 15
STATUS_GROUPS = {
    "upcoming": ("scheduled",),
    "live": ("live",),
    "finished": ("final", "retired", "walkover"),
}
# Lower number wins when choosing the odds row to show.
# The display price (CONTRACT.md): book preference after manual rows. "max" is never used.
BOOK_ORDER = ["pinnacle", "betfair", "bet365", "williamhill", "unibet", "betway", "draftkings", "fanduel"]
FRESH_HOURS = 12


# --------------------------------------------------------------------------- config & paths

def load_config() -> dict[str, Any]:
    path = Path(os.environ.get("DEUCE_CONFIG") or ROOT / "config.toml")
    try:
        with open(path, "rb") as fh:
            cfg = tomllib.load(fh)
        return cfg if isinstance(cfg, dict) else {}
    except (OSError, tomllib.TOMLDecodeError):
        return {}


def _resolve(p: str | os.PathLike) -> Path:
    path = Path(p).expanduser()
    return path if path.is_absolute() else ROOT / path


def db_path() -> Path:
    env = os.environ.get("DEUCE_DB")
    if env:
        return _resolve(env)
    cfg_db = (load_config().get("paths") or {}).get("db")
    return _resolve(cfg_db or "data/tennis.db")


def backtest_path() -> Path:
    return _resolve(os.environ.get("DEUCE_BACKTEST") or "data/backtest.json")


def edge_threshold() -> float:
    raw = (load_config().get("model") or {}).get("edge_threshold", DEFAULT_EDGE)
    try:
        val = float(raw)
        return val if math.isfinite(val) else DEFAULT_EDGE
    except (TypeError, ValueError):
        return DEFAULT_EDGE


# --------------------------------------------------------------------------- database helpers

@contextmanager
def connect(write: bool = False) -> Iterator[sqlite3.Connection | None]:
    """Yield a connection, or None when the database file does not exist.

    The file is never created here: an absent database is reported as empty.
    """
    path = db_path()
    if not path.is_file():
        yield None
        return
    conn = None
    try:
        conn = sqlite3.connect(str(path), timeout=5)
        conn.row_factory = sqlite3.Row
    except sqlite3.Error:
        yield None
        return
    try:
        yield conn
        if write:
            conn.commit()
    finally:
        conn.close()


def tables(conn: sqlite3.Connection | None) -> set[str]:
    if conn is None:
        return set()
    try:
        return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    except sqlite3.Error:
        return set()


def columns(conn: sqlite3.Connection, table: str) -> set[str]:
    try:
        return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
    except sqlite3.Error:
        return set()


def rows(conn: sqlite3.Connection | None, sql: str, args: tuple | list = ()) -> list[sqlite3.Row]:
    if conn is None:
        return []
    try:
        return conn.execute(sql, tuple(args)).fetchall()
    except sqlite3.Error:
        return []


def loads(text: Any, default: Any = None) -> Any:
    if text in (None, ""):
        return default
    if isinstance(text, (dict, list)):
        return text
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return default


def num(v: Any) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def status_group(status: str | None) -> str:
    s = (status or "").lower()
    for group, members in STATUS_GROUPS.items():
        if s in members:
            return group
    return "other"


# --------------------------------------------------------------------------- odds & value

def odds_row_dict(r: sqlite3.Row | dict) -> dict:
    return {
        "p1": num(r["p1_odds"]),
        "p2": num(r["p2_odds"]),
        "source": r["source"],
        "book": r["book"] or r["source"],
        "fetched_at": r["fetched_at"],
    }


def _book_rank(r) -> int | None:
    book = (r["book"] or r["source"] or "").strip().lower().replace(" ", "").replace("_", "")
    if book == "max":
        return None
    if book in BOOK_ORDER:
        return BOOK_ORDER.index(book)
    if book == "avg":
        return len(BOOK_ORDER) + 1
    return len(BOOK_ORDER)


def _parse_time(text: str | None) -> datetime | None:
    if not text:
        return None
    try:
        dt = datetime.fromisoformat(str(text).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def pick_display_odds(odds_rows: list, status: str | None = None, now: datetime | None = None) -> dict | None:
    """The single price used for value, per CONTRACT.md "The display price".

    1. The latest manual row, if any.
    2. Otherwise only fresh rows: within 12 hours of now for scheduled/live matches, any row for finished ones.
    3. Prefer pinnacle, then BOOK_ORDER, then other books, then avg; never max.
       Ties: latest fetched_at, then rowid.
    """
    def rid(r):
        try:
            return r["rid"] or 0
        except (IndexError, KeyError):
            return 0

    usable = [r for r in odds_rows if (num(r["p1_odds"]) or 0) > 1 and (num(r["p2_odds"]) or 0) > 1]
    manual = [r for r in usable if (r["source"] or "").lower() == "manual"]
    if manual:
        return odds_row_dict(max(manual, key=lambda r: (r["fetched_at"] or "", rid(r))))
    if status_group(status) != "finished":
        cutoff = (now or now_utc()) - timedelta(hours=FRESH_HOURS)
        usable = [r for r in usable if (t := _parse_time(r["fetched_at"])) is not None and t >= cutoff]
    ranked = [(rank, r) for r in usable if (rank := _book_rank(r)) is not None]
    if not ranked:
        return None
    top = min(rank for rank, _ in ranked)
    best = max((r for rank, r in ranked if rank == top), key=lambda r: (r["fetched_at"] or "", rid(r)))
    return odds_row_dict(best)


def edges(p1_prob: float | None, p2_prob: float | None, odds: dict | None) -> dict | None:
    if odds is None or p1_prob is None:
        return None
    p2 = p2_prob if p2_prob is not None else 1 - p1_prob
    if not odds.get("p1") or not odds.get("p2"):
        return None
    return {"p1": round(p1_prob * odds["p1"] - 1, 4), "p2": round(p2 * odds["p2"] - 1, 4)}


def value_of(e: dict | None, threshold: float) -> dict | None:
    if not e:
        return None
    side = "p1" if e["p1"] >= e["p2"] else "p2"
    return {"side": side, "edge": e[side]} if e[side] >= threshold else None


def odds_by_match(conn: sqlite3.Connection | None, ids: list[str]) -> dict[str, list]:
    out: dict[str, list] = {}
    if conn is None or not ids or "odds" not in tables(conn):
        return out
    for i in range(0, len(ids), 500):
        chunk = ids[i:i + 500]
        marks = ",".join("?" * len(chunk))
        for r in rows(conn, f"SELECT rowid AS rid, match_id, source, book, p1_odds, p2_odds, fetched_at FROM odds "
                            f"WHERE match_id IN ({marks}) ORDER BY fetched_at, rowid", chunk):
            out.setdefault(str(r["match_id"]), []).append(r)
    return out


# --------------------------------------------------------------------------- match items

def _match_select(conn: sqlite3.Connection) -> tuple[str, set[str]]:
    have = tables(conn)
    sel = ["m.id AS match_id", "m.date", "m.tour", "m.round", "m.status", "m.score", "m.sets_json",
           "m.best_of", "m.court", "m.winner_id", "m.p1_id", "m.p2_id", "m.tournament_id"]
    joins = []
    if "tournaments" in have:
        sel += ["t.name AS t_name", "t.surface AS t_surface", "t.level AS t_level",
                "t.location AS t_location", "t.surface_inferred AS t_surface_inferred"]
        joins.append("LEFT JOIN tournaments t ON t.id = m.tournament_id")
    else:
        sel += ["NULL AS t_name", "NULL AS t_surface", "NULL AS t_level", "NULL AS t_location",
                "NULL AS t_surface_inferred"]
    if "players" in have:
        sel += ["a.name AS p1_name", "a.country AS p1_country", "b.name AS p2_name", "b.country AS p2_country"]
        joins.append("LEFT JOIN players a ON a.id = m.p1_id")
        joins.append("LEFT JOIN players b ON b.id = m.p2_id")
    else:
        sel += ["NULL AS p1_name", "NULL AS p1_country", "NULL AS p2_name", "NULL AS p2_country"]
    if "predictions" in have:
        sel += ["pr.p1_prob", "pr.p2_prob", "pr.set_probs_json", "pr.model_version", "pr.created_at AS predicted_at",
                "CASE WHEN json_valid(pr.features_json) THEN "
                "MIN(COALESCE(json_extract(pr.features_json, '$.p1.experience'), 0), "
                "COALESCE(json_extract(pr.features_json, '$.p2.experience'), 0)) END AS min_exp"]
        joins.append("LEFT JOIN predictions pr ON pr.match_id = m.id")
    else:
        sel += ["NULL AS p1_prob", "NULL AS p2_prob", "NULL AS set_probs_json", "NULL AS model_version",
                "NULL AS predicted_at", "NULL AS min_exp"]
    if "briefs" in have:
        sel.append("(br.match_id IS NOT NULL) AS has_brief")
        joins.append("LEFT JOIN briefs br ON br.match_id = m.id")
    else:
        sel.append("0 AS has_brief")
    return f"SELECT {', '.join(sel)} FROM matches m {' '.join(joins)}", have


def build_item(r: sqlite3.Row, odds_rows: list, threshold: float) -> dict:
    p1_prob, p2_prob = num(r["p1_prob"]), num(r["p2_prob"])
    if p1_prob is not None and p2_prob is None:
        p2_prob = round(1 - p1_prob, 6)
    odds = pick_display_odds(odds_rows, r["status"])
    e = edges(p1_prob, p2_prob, odds)
    min_exp = num(r["min_exp"]) if "min_exp" in r.keys() else None
    low = min_exp is not None and p1_prob is not None and min_exp < LOW_DATA_MATCHES
    winner = None
    if r["winner_id"]:
        winner = "p1" if str(r["winner_id"]) == str(r["p1_id"]) else (
            "p2" if str(r["winner_id"]) == str(r["p2_id"]) else None)
    return {
        "match_id": str(r["match_id"]),
        "date": r["date"],
        "tour": r["tour"],
        "round": r["round"],
        "status": r["status"],
        "status_group": status_group(r["status"]),
        "score": r["score"],
        "sets": loads(r["sets_json"], None),
        "best_of": r["best_of"],
        "court": r["court"],
        "winner": winner,
        "tournament": {
            "id": r["tournament_id"],
            "name": r["t_name"],
            "surface": r["t_surface"],
            "surface_inferred": bool(r["t_surface_inferred"]) if r["t_surface_inferred"] is not None else None,
            "level": r["t_level"],
            "location": r["t_location"],
        },
        "p1": {"id": r["p1_id"], "name": r["p1_name"] or "Unknown player", "country": r["p1_country"]},
        "p2": {"id": r["p2_id"], "name": r["p2_name"] or "Unknown player", "country": r["p2_country"]},
        "p1_prob": p1_prob,
        "p2_prob": p2_prob,
        "set_probs": loads(r["set_probs_json"], None),
        "model_version": r["model_version"],
        "predicted_at": r["predicted_at"],
        "odds": odds,
        "edges": e,
        # Thin history (either player < LOW_DATA_MATCHES matches on record): probabilities are shaky,
        # so never flag value on them.
        "low_data": low,
        "value": None if low else value_of(e, threshold),
        "has_brief": bool(r["has_brief"]),
    }


def get_item(conn: sqlite3.Connection | None, match_id: str, threshold: float) -> tuple[dict | None, set[str]]:
    have = tables(conn)
    if conn is None or "matches" not in have:
        return None, have
    sql, have = _match_select(conn)
    found = rows(conn, sql + " WHERE m.id = ?", (match_id,))
    if not found:
        return None, have
    odds_rows = odds_by_match(conn, [match_id]).get(match_id, [])
    return build_item(found[0], odds_rows, threshold), have


# --------------------------------------------------------------------------- app

app = FastAPI(title="Deuce", docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")


def _port() -> str:
    return os.environ.get("PORT", "8765")


@app.middleware("http")
async def localhost_only(request, call_next):
    """Refuse requests that don't come from this machine's own dashboard.

    The Host header must be 127.0.0.1:PORT or localhost:PORT (blocks DNS rebinding), and writes must be
    JSON from the same origin (blocks other web pages posting into the database).
    """
    port = _port()
    host = (request.headers.get("host") or "").lower()
    allowed = {f"127.0.0.1:{port}", f"localhost:{port}", f"[::1]:{port}"}
    if host not in allowed:
        return JSONResponse(status_code=400, content={
            "detail": f"Deuce only answers on http://127.0.0.1:{port} or http://localhost:{port}."})
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        ctype = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
        if ctype != "application/json":
            return JSONResponse(status_code=403, content={"detail": "Writes must be sent as application/json."})
        origin = request.headers.get("origin")
        if origin is not None and origin.lower().rstrip("/") not in {f"http://{h}" for h in allowed}:
            return JSONResponse(status_code=403, content={"detail": "Writes are only accepted from the Deuce dashboard itself."})
    return await call_next(request)


@app.exception_handler(Exception)
async def _unhandled(_request, exc: Exception):  # pragma: no cover - last-resort guard
    return JSONResponse(status_code=503, content={
        "detail": "The server hit an unexpected problem reading the data.",
        "error": type(exc).__name__,
    })


@app.get("/api/status")
def api_status() -> dict:
    """Small health payload the dashboard uses for its first-run empty states."""
    path = db_path()
    out: dict[str, Any] = {
        "db_exists": path.is_file(),
        "backtest_exists": backtest_path().is_file(),
        "edge_threshold": edge_threshold(),
        "counts": {},
        "latest_prediction_at": None,
        "server_time": iso(now_utc()),
    }
    with connect() as conn:
        have = tables(conn)
        for t in ("matches", "predictions", "odds", "briefs", "players"):
            if t in have:
                r = rows(conn, f"SELECT COUNT(*) AS n FROM {t}")
                out["counts"][t] = r[0]["n"] if r else 0
            else:
                out["counts"][t] = 0
        if "predictions" in have:
            r = rows(conn, "SELECT MAX(created_at) AS m FROM predictions")
            out["latest_prediction_at"] = r[0]["m"] if r else None
    return out


@app.get("/api/matches")
def api_matches(
    status: str | None = Query(None, description="upcoming | live | finished"),
    tour: str | None = Query(None, description="ATP | WTA"),
    value_only: int = Query(0),
    tournament: str | None = Query(None),
    date_from: str | None = Query(None, alias="from", description="ISO date/time lower bound (extension)"),
    date_to: str | None = Query(None, alias="to", description="ISO date/time upper bound (extension)"),
    limit: int = Query(1000, ge=1, le=5000),
) -> list[dict]:
    threshold = edge_threshold()
    with connect() as conn:
        if conn is None or "matches" not in tables(conn):
            return []
        sql, _ = _match_select(conn)
        where, args = [], []
        if status:
            members = STATUS_GROUPS.get(status.lower())
            if members is None:
                return []
            where.append(f"LOWER(m.status) IN ({','.join('?' * len(members))})")
            args += list(members)
        if tour:
            where.append("UPPER(m.tour) = ?")
            args.append(tour.upper())
        if tournament:
            where.append("(m.tournament_id = ? OR LOWER(t.name) = LOWER(?))" if "t_name" in sql
                         else "m.tournament_id = ?")
            args += [tournament, tournament] if "t_name" in sql else [tournament]
        # Default window keeps a years-deep history table from flooding the list.
        now = now_utc()
        lo = date_from or iso(now - timedelta(days=3))
        hi = date_to or iso(now + timedelta(days=14))
        if status and status.lower() == "live" and not date_from:
            lo = iso(now - timedelta(days=2))
        where.append("(m.date >= ? AND m.date <= ?)")
        args += [lo, hi if len(hi) > 10 else hi + "T23:59:59Z"]
        full = sql + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY m.date, m.id LIMIT ?"
        args.append(limit)
        found = rows(conn, full, args)
        odds_map = odds_by_match(conn, [str(r["match_id"]) for r in found])
        items = [build_item(r, odds_map.get(str(r["match_id"]), []), threshold) for r in found]
    if value_only:
        items = [i for i in items if i["value"]]
    return items


@app.get("/api/matches/{match_id}")
def api_match(match_id: str) -> dict:
    threshold = edge_threshold()
    with connect() as conn:
        item, have = get_item(conn, match_id, threshold)
        if item is None:
            raise HTTPException(404, detail="No match with that id. Run `python -m engine.update` to load matches.")
        features = None
        if "predictions" in have:
            r = rows(conn, "SELECT features_json FROM predictions WHERE match_id = ?", (match_id,))
            features = loads(r[0]["features_json"], None) if r else None
        history = [odds_row_dict(r) for r in odds_by_match(conn, [match_id]).get(match_id, [])]
        brief = None
        brief_created_at = None
        if "briefs" in have:
            r = rows(conn, "SELECT brief_json, engine, created_at FROM briefs WHERE match_id = ?", (match_id,))
            if r:
                brief = loads(r[0]["brief_json"], None)
                if isinstance(brief, dict):
                    brief.setdefault("engine", r[0]["engine"])
                    brief.setdefault("generated_at", r[0]["created_at"])
                    brief_created_at = r[0]["created_at"]
                else:
                    brief = None
    item.update({"features": features, "odds_history": history, "brief": brief, "edge_threshold": threshold,
                 "brief_created_at": brief_created_at if brief is not None else None})
    item["has_brief"] = brief is not None
    return item


class ManualOdds(BaseModel):
    p1: float
    p2: float


@app.post("/api/matches/{match_id}/odds")
def api_manual_odds(match_id: str, body: ManualOdds) -> dict:
    for side in ("p1", "p2"):
        v = getattr(body, side)
        if not math.isfinite(v) or v <= 1.0 or v > 1000:
            raise HTTPException(422, detail=f"Decimal odds for {side} must be above 1.00 (for example 1.85).")
    threshold = edge_threshold()
    with connect(write=True) as conn:
        item, have = get_item(conn, match_id, threshold)
        if item is None:
            raise HTTPException(404, detail="No match with that id. Run `python -m engine.update` to load matches.")
        try:
            if "odds" not in have:
                conn.execute("CREATE TABLE IF NOT EXISTS odds(match_id TEXT, source TEXT, book TEXT, "
                             "p1_odds REAL, p2_odds REAL, fetched_at TEXT)")
            conn.execute("INSERT INTO odds(match_id, source, book, p1_odds, p2_odds, fetched_at) "
                         "VALUES (?, 'manual', 'manual', ?, ?, ?)",
                         (match_id, round(body.p1, 3), round(body.p2, 3), iso(now_utc())))
            conn.commit()
        except sqlite3.Error as exc:
            raise HTTPException(409, detail=f"Could not save odds: {exc}. Is the engine writing right now?")
        item, _ = get_item(conn, match_id, threshold)
    assert item is not None
    return {"match_id": match_id, "odds": item["odds"], "edges": item["edges"], "value": item["value"],
            "edge_threshold": threshold}


EMPTY_BACKTEST = {
    "generated_at": None, "splits": [], "calibration": [], "rolling": [], "betting": None, "bets": [],
    "empty": True,
    "notes": ["No backtest yet. Run `python -m engine.backtest` to write data/backtest.json."],
}


@app.get("/api/backtest")
def api_backtest() -> dict:
    path = backtest_path()
    if not path.is_file():
        return dict(EMPTY_BACKTEST)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        out = dict(EMPTY_BACKTEST)
        out["notes"] = ["data/backtest.json could not be read. Run `python -m engine.backtest` again."]
        return out
    if not isinstance(data, dict):
        return dict(EMPTY_BACKTEST)
    for key, default in (("splits", []), ("calibration", []), ("rolling", []), ("notes", []), ("bets", [])):
        if not isinstance(data.get(key), list):
            data[key] = default
    data.setdefault("betting", None)
    data.setdefault("generated_at", None)
    data["empty"] = False
    return data


def _top_from_ratings(conn, tour: str) -> list[dict]:
    cols = columns(conn, "player_ratings")
    if not {"player_id", "elo"} <= cols:
        return []
    want = [c for c in ("player_id", "name", "country", "tour", "elo", "hard_elo", "clay_elo", "grass_elo",
                        "rank", "win_rate_1y", "form_10", "matches_1y", "last_match_date") if c in cols]
    where = "WHERE elo IS NOT NULL"
    args: list = []
    if "tour" in cols:
        where += " AND UPPER(tour) = ?"
        args.append(tour)
    if "last_match_date" in cols:
        where += " AND (last_match_date IS NULL OR last_match_date >= ?)"
        args.append(iso(now_utc() - timedelta(days=365))[:10])
    found = rows(conn, f"SELECT {', '.join(want)} FROM player_ratings {where} ORDER BY elo DESC LIMIT 20", args)
    out = []
    for r in found:
        d = dict(r)
        out.append({
            "id": d.get("player_id"), "name": d.get("name"), "country": d.get("country"), "tour": d.get("tour"),
            "elo": num(d.get("elo")),
            "surface_elo": {k: num(d.get(f"{k}_elo")) for k in ("hard", "clay", "grass") if f"{k}_elo" in d},
            "rank": d.get("rank"), "win_rate_1y": num(d.get("win_rate_1y")), "form_10": num(d.get("form_10")),
            "matches_1y": d.get("matches_1y"), "last_match_date": d.get("last_match_date"),
            "source": "ratings",
        })
    return out


def _top_from_features(conn, tour: str, have: set[str]) -> list[dict]:
    if not {"predictions", "matches"} <= have:
        return []
    names = {}
    if "players" in have:
        names = {r["id"]: (r["name"], r["country"]) for r in rows(conn, "SELECT id, name, country FROM players")}
    found = rows(conn, "SELECT m.date, m.p1_id, m.p2_id, pr.features_json FROM predictions pr "
                       "JOIN matches m ON m.id = pr.match_id WHERE UPPER(m.tour) = ? ORDER BY m.date", (tour,))
    latest: dict[str, dict] = {}
    for r in found:
        f = loads(r["features_json"], {}) or {}
        for side, pid in (("p1", r["p1_id"]), ("p2", r["p2_id"])):
            s = f.get(side) or {}
            if pid and num(s.get("elo")) is not None:
                latest[pid] = {"date": r["date"], **s}
    out = []
    for pid, s in latest.items():
        name, country = names.get(pid, (None, None))
        out.append({
            "id": pid, "name": name or pid, "country": country, "tour": tour, "elo": num(s.get("elo")),
            "surface_elo": {}, "rank": s.get("rank"), "win_rate_1y": num(s.get("win_rate_1y")),
            "form_10": num(s.get("form_10")), "matches_1y": None, "last_match_date": (s.get("date") or "")[:10],
            "source": "predictions",
        })
    out.sort(key=lambda d: d["elo"] or 0, reverse=True)
    return out[:20]


def _top_from_matches(conn, tour: str, have: set[str]) -> list[dict]:
    if "matches" not in have:
        return []
    found = rows(conn, "SELECT p1_id, p2_id, winner_id, date FROM matches WHERE UPPER(tour) = ? "
                       "AND LOWER(status) IN ('final', 'retired') AND winner_id IS NOT NULL ORDER BY date", (tour,))
    elo: dict[str, float] = {}
    played: dict[str, int] = {}
    won: dict[str, int] = {}
    last: dict[str, str] = {}
    for r in found:
        a, b, w = r["p1_id"], r["p2_id"], r["winner_id"]
        if not a or not b:
            continue
        ra, rb = elo.get(a, 1500.0), elo.get(b, 1500.0)
        ea = 1 / (1 + 10 ** ((rb - ra) / 400))
        sa = 1.0 if w == a else 0.0
        ka = 250 / ((played.get(a, 0) + 5) ** 0.4)
        kb = 250 / ((played.get(b, 0) + 5) ** 0.4)
        elo[a] = ra + ka * (sa - ea)
        elo[b] = rb + kb * ((1 - sa) - (1 - ea))
        for p in (a, b):
            played[p] = played.get(p, 0) + 1
            last[p] = r["date"]
        won[w] = won.get(w, 0) + 1
    names = {}
    if "players" in have:
        names = {r["id"]: (r["name"], r["country"]) for r in rows(conn, "SELECT id, name, country FROM players")}
    out = []
    for pid, e in sorted(elo.items(), key=lambda kv: kv[1], reverse=True):
        if played.get(pid, 0) < 5:
            continue
        name, country = names.get(pid, (None, None))
        out.append({
            "id": pid, "name": name or pid, "country": country, "tour": tour, "elo": round(e, 1),
            "surface_elo": {}, "rank": None, "win_rate_1y": round(won.get(pid, 0) / played[pid], 3),
            "form_10": None, "matches_1y": played[pid], "last_match_date": (last.get(pid) or "")[:10],
            "source": "matches",
        })
        if len(out) == 20:
            break
    return out


@app.get("/api/players/top")
def api_players_top(tour: str = Query("ATP")) -> list[dict]:
    tour = (tour or "ATP").upper()
    with connect() as conn:
        have = tables(conn)
        if conn is None:
            return []
        result: list[dict] = []
        if "player_ratings" in have:
            result = _top_from_ratings(conn, tour)
        if not result:
            result = _top_from_features(conn, tour, have)
        if not result:
            result = _top_from_matches(conn, tour, have)
    for i, p in enumerate(result, 1):
        p["position"] = i
    return result


@app.get("/api/{rest:path}")
def api_not_found(rest: str):
    raise HTTPException(404, detail=f"No endpoint /api/{rest}.")


class NoCacheStatic(StaticFiles):
    """Static files that the browser re-validates, so edits to the dashboard show up on reload."""

    async def get_response(self, path: str, scope) -> Response:
        resp = await super().get_response(path, scope)
        if not path.startswith("fonts/"):
            resp.headers["Cache-Control"] = "no-cache"
        return resp


app.mount("/", NoCacheStatic(directory=STATIC_DIR, html=True), name="static")


def main() -> None:
    import uvicorn

    port = int(_port())
    print(f"Deuce is running at http://127.0.0.1:{port}  (database: {db_path()})")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
