"""ESPN scoreboard ingest for ATP/WTA singles (no API key)."""
from __future__ import annotations

import argparse
import json
import re
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

import httpx

from . import surfaces
from .countries import norm_country, venue_country
from .db import connect, data_dir

BASE = "https://site.api.espn.com/apis/site/v2/sports/tennis/{tour}/{what}"
TOURS = ("atp", "wta")
REFETCH_DAYS = 21
FUTURE_DAYS = 7
SKIP_NAMES = {"tbd", "bye", "qualifier", "lucky loser", "tba", ""}

_RET_RE = re.compile(r"\bret(?:\.|ired|irement)?\b", re.I)
_WO_RE = re.compile(r"\bw/o\b|\bwalkover\b", re.I)


# ---------------------------------------------------------------- parsing helpers
def parse_sets(c1_lines: list[dict], c2_lines: list[dict]) -> list[list[int | None]]:
    """Build [[p1_games, p2_games, p1_tb, p2_tb], ...] from ESPN linescores (tiebreak keys are optional)."""
    sets: list[list[int | None]] = []
    for i in range(max(len(c1_lines), len(c2_lines))):
        a = c1_lines[i] if i < len(c1_lines) else {}
        b = c2_lines[i] if i < len(c2_lines) else {}
        ga, gb = a.get("value"), b.get("value")
        if ga is None and gb is None:
            continue
        ta, tb = a.get("tiebreak"), b.get("tiebreak")
        sets.append([int(ga or 0), int(gb or 0), None if ta is None else int(ta), None if tb is None else int(tb)])
    return sets


def format_score(sets: list[list[int | None]], winner_is_p1: bool | None, suffix: str = "") -> str:
    """Score text from the winner's perspective ('6-3 7-6(5) 4-1 ret.'); p1 order if no winner. Tiebreak shows loser's points."""
    parts = []
    for g1, g2, t1, t2 in sets:
        a, b, ta, tb = (g2, g1, t2, t1) if winner_is_p1 is False else (g1, g2, t1, t2)
        txt = f"{a}-{b}"
        loser_tb = None
        if ta is not None or tb is not None:
            loser_tb = min(x for x in (ta, tb) if x is not None) if (ta is not None and tb is not None) else (ta if ta is not None else tb)
            txt += f"({loser_tb})"
        parts.append(txt)
    out = " ".join(parts)
    if suffix:
        out = f"{out} {suffix}".strip()
    return out


def classify_status(status_name: str, state: str, note: str) -> str | None:
    """Map ESPN status to scheduled|live|final|retired|walkover. None = drop (cancelled)."""
    name = (status_name or "").upper()
    if "CANCEL" in name:
        return None
    if name == "STATUS_WALKOVER" or (state == "post" and _WO_RE.search(note or "")):
        return "walkover"
    if name == "STATUS_RETIRED" or (state == "post" and _RET_RE.search(note or "")):
        return "retired"
    if state == "post" or name == "STATUS_FINAL":
        return "final"
    if state == "in":
        return "live"
    return "scheduled"


def iso_utc(s: str | None) -> str | None:
    if not s:
        return None
    s = s.replace("Z", "")
    if len(s) == 16:
        s += ":00"
    return s + "Z"


def best_of_for(tour: str, level: str, round_name: str, sets: list) -> int:
    """5 for men's Grand Slam main draw, else 3 (and 5 if any player is seen winning 3 sets)."""
    bo = 5 if (tour == "ATP" and level == "Grand Slam" and "qualif" not in (round_name or "").lower()) else 3
    if bo == 3 and sets:
        w1 = sum(1 for s in sets if s[0] > s[1])
        w2 = sum(1 for s in sets if s[1] > s[0])
        if max(w1, w2) >= 3:
            bo = 5
    return bo


def parse_competition(comp: dict, tour: str, tourn_id: str, level: str) -> dict | None:
    """Turn one ESPN competition into a match dict (players included) or None if unusable."""
    cs = comp.get("competitors") or []
    if len(cs) != 2 or any("athlete" not in c for c in cs):
        return None
    for c in cs:
        a = c["athlete"]
        if (a.get("displayName") or "").strip().lower() in SKIP_NAMES or not c.get("id"):
            return None
    cs = sorted(cs, key=lambda c: c.get("order") or 0)
    c1, c2 = cs
    st = comp.get("status", {}).get("type", {})
    note = ((comp.get("notes") or [{}])[0]).get("text", "") or ""
    status = classify_status(st.get("name", ""), st.get("state", ""), note)
    if status is None:
        return None
    sets = [] if status == "walkover" else parse_sets(c1.get("linescores") or [], c2.get("linescores") or [])
    winner = None
    if status in ("final", "retired", "walkover"):
        if c1.get("winner"):
            winner = str(c1["id"])
        elif c2.get("winner"):
            winner = str(c2["id"])
        if winner is None:
            return None  # finished but undecided: ignore
    score = None
    if status == "walkover":
        score = "w/o"
    elif status in ("final", "retired"):
        score = format_score(sets, winner == str(c1["id"]), "ret." if status == "retired" else "")
    elif status == "live":
        score = format_score(sets, None)
    rnd = (comp.get("round") or {}).get("displayName")
    rank = lambda c: (c.get("curatedRank") or {}).get("current")  # noqa: E731
    return {
        "id": str(comp["id"]),
        "tournament_id": tourn_id,
        "tour": tour,
        "round": rnd,
        "date": iso_utc(comp.get("date") or comp.get("startDate")),
        "status": status,
        "p1_id": str(c1["id"]),
        "p2_id": str(c2["id"]),
        "winner_id": winner,
        "score": score,
        "sets_json": json.dumps(sets) if sets else None,
        "best_of": best_of_for(tour, level, rnd or "", sets),
        "court": (comp.get("venue") or {}).get("court") or None,
        "venue": (comp.get("venue") or {}).get("fullName"),
        "players": [
            {
                "id": str(c["id"]),
                "name": c["athlete"].get("displayName"),
                "country": (c["athlete"].get("flag") or {}).get("alt"),
                "tour": tour,
            }
            for c in (c1, c2)
        ],
        "ranks": (rank(c1), rank(c2)),
    }


def parse_scoreboard(payload: dict) -> tuple[list[dict], dict[str, dict]]:
    """Parse a scoreboard payload into (matches, tournaments); singles only."""
    matches: list[dict] = []
    tournaments: dict[str, dict] = {}
    for ev in payload.get("events", []) or []:
        for grp in ev.get("groupings", []) or []:
            gname = (grp.get("grouping") or {}).get("displayName", "")
            low = gname.lower()
            if "singles" not in low or "double" in low or "mixed" in low:
                continue
            tour = "ATP" if low.startswith("men") else "WTA" if low.startswith("women") else None
            if tour is None:
                continue
            ev_name = ev.get("name") or ev.get("shortName") or ""
            tid = f"{ev.get('id')}-{tour.lower()}"
            comps = grp.get("competitions") or []
            venue_name = (ev.get("venue") or {}).get("displayName") or next(
                ((c.get("venue") or {}).get("fullName") for c in comps if (c.get("venue") or {}).get("fullName")), None)
            year = None
            try:
                year = int((ev.get("season") or {}).get("year") or str(ev.get("date"))[:4])
            except (TypeError, ValueError):
                pass
            surface, inferred = surfaces.guess_surface(ev_name, tour, year, venue_name)
            level = surfaces.guess_level(ev_name, tour, bool(ev.get("major")))
            t = tournaments.setdefault(tid, {
                "id": tid, "name": ev_name, "tour": tour,
                "start_date": (ev.get("date") or "")[:10] or None, "end_date": (ev.get("endDate") or "")[:10] or None,
                "location": venue_name, "country": venue_country(venue_name),
                "surface": surface, "surface_inferred": int(inferred), "level": level,
            })
            for comp in comps:
                m = parse_competition(comp, tour, tid, level)
                if m:
                    matches.append(m)
    return matches, tournaments


# ---------------------------------------------------------------- fetching
def _cache_file(tour: str, d: date) -> Path:
    p = data_dir() / "cache" / "espn" / tour
    p.mkdir(parents=True, exist_ok=True)
    return p / f"{d:%Y%m%d}.json"


def _needs_refetch(payload: dict, d: date, fetched_at: float) -> bool:
    """A cached day is stale if it was fetched before the day was over (+1 day margin), or it still holds
    non-final competitions whose own day (+1 day) had not passed when it was fetched - regardless of age."""
    if fetched_at < datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp() + 2 * 86400:
        return True
    for ev in payload.get("events", []) or []:
        for grp in ev.get("groupings", []) or []:
            for c in grp.get("competitions", []) or []:
                if (c.get("status", {}).get("type", {}).get("state") or "post") == "post":
                    continue
                try:
                    cd = datetime.fromisoformat(str(c.get("date")).replace("Z", "+00:00"))
                    if cd.timestamp() + 86400 > fetched_at:
                        return True
                except ValueError:
                    return True
    return False


def fetch_day(client: httpx.Client, tour: str, d: date, refresh: bool, delay: float = 0.25) -> dict | None:
    """Fetch (or read from cache) one scoreboard day. Retries with backoff; None on repeated failure.

    Cached files carry `_fetched_at`; old days are re-fetched when the cache predates the day's end or still
    holds unfinished matches (so a long gap between updates cannot lose results).
    """
    cf = _cache_file(tour, d)
    cached = None
    if cf.exists() and not refresh:
        try:
            cached = json.loads(cf.read_text())
            fetched_at = float(cached.get("_fetched_at") or cf.stat().st_mtime)
            if not _needs_refetch(cached, d, fetched_at):
                return cached
        except (json.JSONDecodeError, ValueError):
            cached = None
    url = BASE.format(tour=tour, what="scoreboard")
    for attempt in range(5):
        try:
            time.sleep(delay)
            r = client.get(url, params={"dates": f"{d:%Y%m%d}"})
            if r.status_code == 200:
                payload = r.json()
                payload["_fetched_at"] = time.time()
                cf.write_text(json.dumps(payload))
                return payload
            if r.status_code in (404, 400):
                return cached
        except (httpx.HTTPError, ValueError):
            pass
        time.sleep(1.5 * (2 ** attempt))
    return cached


def date_walk(since: date, today: date) -> list[tuple[date, bool]]:
    """Weekly dates since..today+7 (refresh flag = within last 21 days or future), plus daily dates near now."""
    end = today + timedelta(days=FUTURE_DAYS)
    out: dict[date, bool] = {}
    d = since
    while d <= end:
        out[d] = d >= today - timedelta(days=REFETCH_DAYS)
        d += timedelta(days=7)
    out[end] = True
    d = today - timedelta(days=3)
    while d <= end:  # daily near the present so live/scheduled matches are fresh
        out[d] = True
        d += timedelta(days=1)
    return sorted(out.items())


def fetch_all(since: date, today: date | None = None, verbose: bool = True) -> list[dict]:
    today = today or datetime.now(timezone.utc).date()
    walk = date_walk(since, today)
    payloads: list[dict] = []
    with httpx.Client(timeout=30, headers={"User-Agent": "tennis-brain-free/0.1"}) as client:
        for i, (d, refresh) in enumerate(walk):
            for tour in TOURS:
                p = fetch_day(client, tour, d, refresh)
                if p:
                    payloads.append(p)
            if verbose and i % 25 == 0:
                print(f"  espn fetch {i + 1}/{len(walk)} ({d})", flush=True)
    return payloads


def fetch_rankings(tour: str) -> dict[str, int]:
    """Current top-150 ranking from ESPN: {athlete_id: rank}. Empty on failure."""
    try:
        r = httpx.get(BASE.format(tour=tour, what="rankings"), timeout=30)
        r.raise_for_status()
        ranks = r.json()["rankings"][0]["ranks"]
        return {str(x["athlete"]["id"]): int(x["current"]) for x in ranks if x.get("athlete")}
    except Exception:  # noqa: BLE001 - optional enrichment
        return {}


# ---------------------------------------------------------------- persistence
def upsert(conn, matches: Iterable[dict], tournaments: dict[str, dict]) -> dict[str, int]:
    """Upsert tournaments, players and matches. Returns counts."""
    n_m = 0
    for t in tournaments.values():
        conn.execute(
            """INSERT INTO tournaments(id,name,tour,start_date,end_date,location,country,surface,surface_inferred,level)
               VALUES(:id,:name,:tour,:start_date,:end_date,:location,:country,:surface,:surface_inferred,:level)
               ON CONFLICT(id) DO UPDATE SET name=excluded.name,start_date=excluded.start_date,end_date=excluded.end_date,
               location=excluded.location,country=excluded.country,surface=excluded.surface,
               surface_inferred=excluded.surface_inferred,level=excluded.level""", t)
    for m in matches:
        for p in m["players"]:
            conn.execute(
                """INSERT INTO players(id,name,country,tour) VALUES(:id,:name,:country,:tour)
                   ON CONFLICT(id) DO UPDATE SET name=excluded.name,
                   country=COALESCE(excluded.country, players.country)""", p)
        conn.execute(
            """INSERT INTO matches(id,tournament_id,tour,round,date,status,p1_id,p2_id,winner_id,score,sets_json,best_of,court)
               VALUES(:id,:tournament_id,:tour,:round,:date,:status,:p1_id,:p2_id,:winner_id,:score,:sets_json,:best_of,:court)
               ON CONFLICT(id) DO UPDATE SET tournament_id=excluded.tournament_id,round=excluded.round,date=excluded.date,
               status=excluded.status,p1_id=excluded.p1_id,p2_id=excluded.p2_id,winner_id=excluded.winner_id,
               score=excluded.score,sets_json=excluded.sets_json,best_of=excluded.best_of,court=excluded.court""", m)
        r1, r2 = m["ranks"]
        if r1 or r2:
            conn.execute(
                """INSERT INTO match_ranks(match_id,p1_rank,p2_rank) VALUES(?,?,?)
                   ON CONFLICT(match_id) DO UPDATE SET p1_rank=COALESCE(excluded.p1_rank,p1_rank),
                   p2_rank=COALESCE(excluded.p2_rank,p2_rank)""", (m["id"], r1, r2))
        n_m += 1
    conn.commit()
    return {"matches": n_m, "tournaments": len(tournaments)}


def cleanup_stale(conn, now: datetime | None = None) -> int:
    """Drop scheduled/live matches that ESPN no longer reports and whose start is long past."""
    now = now or datetime.now(timezone.utc)
    cutoff = (now - timedelta(hours=36)).strftime("%Y-%m-%dT%H:%M:%SZ")
    ids = [r[0] for r in conn.execute("SELECT id FROM matches WHERE status IN('scheduled','live') AND date<?", (cutoff,))]
    for i in ids:
        conn.execute("DELETE FROM matches WHERE id=?", (i,))
        conn.execute("DELETE FROM predictions WHERE match_id=?", (i,))
    conn.commit()
    return len(ids)


def store_rankings(conn, rankings: dict[str, dict[str, int]]) -> None:
    """Remember the latest published ranking in meta (used for upcoming-match rank display)."""
    conn.execute("INSERT INTO meta(key,value) VALUES('rankings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                 (json.dumps(rankings),))
    conn.commit()


def ingest(conn, since: date, verbose: bool = True) -> dict[str, int]:
    """Fetch (with cache), parse, dedupe by competition id and upsert."""
    payloads = fetch_all(since, verbose=verbose)
    by_id: dict[str, dict] = {}
    tournaments: dict[str, dict] = {}
    for p in payloads:
        ms, ts = parse_scoreboard(p)
        tournaments.update(ts)
        for m in ms:
            prev = by_id.get(m["id"])
            # prefer the freshest-looking record: finished beats live beats scheduled
            order = {"scheduled": 0, "live": 1, "final": 2, "retired": 2, "walkover": 2}
            if prev is None or order[m["status"]] >= order[prev["status"]]:
                by_id[m["id"]] = m
    res = upsert(conn, by_id.values(), tournaments)
    res["stale_removed"] = cleanup_stale(conn)
    store_rankings(conn, {t: fetch_rankings(t) for t in TOURS})
    return res


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest ESPN ATP/WTA singles")
    ap.add_argument("--since", default="2023-01-01")
    args = ap.parse_args()
    conn = connect()
    print(ingest(conn, date.fromisoformat(args.since)))


if __name__ == "__main__":
    main()
