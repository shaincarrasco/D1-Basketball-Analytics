"""Optional odds fetchers (The Odds API, OddsPapi) plus value-bet maths. With no keys nothing happens."""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

ODDS_API = "https://api.the-odds-api.com/v4"
PREFERRED_BOOKS = ("pinnacle", "bet365", "williamhill", "unibet_eu", "betfair_ex_eu", "marathonbet", "betclic")


# ------------------------------------------------------------------ value maths
def value(p_model: float, decimal_odds: float, threshold: float = 0.02) -> dict[str, Any]:
    """Edge = p*odds - 1 (expected profit per unit stake). fair_odds = 1/p. is_value when edge >= threshold."""
    if not p_model or p_model <= 0 or not decimal_odds or decimal_odds <= 1:
        return {"edge": None, "fair_odds": None, "market_odds": decimal_odds, "is_value": False}
    edge = p_model * decimal_odds - 1.0
    return {"edge": edge, "fair_odds": 1.0 / p_model, "market_odds": decimal_odds, "is_value": edge >= threshold}


def best_value(p1_prob: float, p1_odds: float | None, p2_odds: float | None, threshold: float = 0.02) -> dict | None:
    """Pick the side with the larger edge; None if no odds. Returns {side, edge, fair_odds, market_odds}."""
    cands = []
    if p1_odds:
        v = value(p1_prob, p1_odds, threshold)
        cands.append(("p1", v))
    if p2_odds:
        v = value(1 - p1_prob, p2_odds, threshold)
        cands.append(("p2", v))
    cands = [c for c in cands if c[1]["edge"] is not None]
    if not cands:
        return None
    side, v = max(cands, key=lambda c: c[1]["edge"])
    return {"side": side, **v}


def devig(o1: float, o2: float) -> tuple[float, float]:
    """Remove the bookmaker margin (proportional): fair probabilities for two decimal odds."""
    a, b = 1 / o1, 1 / o2
    return a / (a + b), b / (a + b)


# ------------------------------------------------------------------ name matching
def _ascii(s: str) -> str:
    t = unicodedata.normalize("NFKD", s or "")
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z ]+", " ", t.replace("-", " ").replace("'", "")).strip()


def full_name_key(name: str) -> str:
    return re.sub(r"\s+", " ", _ascii(name))


def match_initial_name(full_name: str, short: str) -> bool:
    """Does 'Jannik Sinner' match tennis-data style 'Sinner J.' (or 'De Minaur A.')?"""
    toks = re.sub(r"\s+", " ", short.replace(".", " ")).strip().split(" ")
    if len(toks) < 2:
        return False
    initial = _ascii(toks[-1])[:1]
    surname = _ascii(" ".join(toks[:-1]))
    full = full_name_key(full_name)
    if not surname or not initial or not full:
        return False
    return full.endswith(surname) and full[:1] == initial or (
        # surname-only containment for compound names, requires same initial of the first given name
        surname in full and full[:1] == initial)


# ------------------------------------------------------------------ The Odds API
def _upcoming_index(conn) -> list[dict]:
    now = datetime.now(timezone.utc)
    lo = (now - timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M:%SZ")
    hi = (now + timedelta(days=4)).strftime("%Y-%m-%dT%H:%M:%SZ")
    q = """SELECT m.id, m.date, a.name AS n1, b.name AS n2 FROM matches m
           JOIN players a ON a.id=m.p1_id JOIN players b ON b.id=m.p2_id
           WHERE m.status IN('scheduled','live') AND m.date BETWEEN ? AND ?"""
    return [dict(r) for r in conn.execute(q, (lo, hi))]


def _match_event(cands: list[dict], home: str, away: str) -> tuple[dict, bool] | None:
    h, a = full_name_key(home), full_name_key(away)
    for c in cands:
        n1, n2 = full_name_key(c["n1"]), full_name_key(c["n2"])
        if (n1, n2) == (h, a):
            return c, False
        if (n1, n2) == (a, h):
            return c, True
    return None


def fetch_the_odds_api(conn, key: str, regions: str = "eu,uk", max_sports: int = 12) -> dict[str, int]:
    """Pull h2h decimal odds for active tennis events and store them against matching upcoming matches."""
    stats = {"events": 0, "matched": 0, "rows": 0}
    cands = _upcoming_index(conn)
    if not cands:
        return stats
    with httpx.Client(timeout=30) as cl:
        r = cl.get(f"{ODDS_API}/sports", params={"apiKey": key})
        r.raise_for_status()
        keys = [s["key"] for s in r.json() if s.get("key", "").startswith(("tennis_atp", "tennis_wta")) and s.get("active")]
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        for sk in keys[:max_sports]:
            resp = cl.get(f"{ODDS_API}/sports/{sk}/odds", params={
                "apiKey": key, "regions": regions, "markets": "h2h", "oddsFormat": "decimal"})
            if resp.status_code != 200:
                continue
            for ev in resp.json():
                stats["events"] += 1
                hit = _match_event(cands, ev.get("home_team", ""), ev.get("away_team", ""))
                if not hit:
                    continue
                cand, swapped = hit
                stats["matched"] += 1
                books = sorted(ev.get("bookmakers", []),
                               key=lambda b: PREFERRED_BOOKS.index(b["key"]) if b["key"] in PREFERRED_BOOKS else 99)[:6]
                for b in books:
                    mk = next((m for m in b.get("markets", []) if m.get("key") == "h2h"), None)
                    if not mk:
                        continue
                    price = {full_name_key(o["name"]): o["price"] for o in mk.get("outcomes", [])}
                    ph, pa = price.get(full_name_key(ev["home_team"])), price.get(full_name_key(ev["away_team"]))
                    if not ph or not pa:
                        continue
                    p1, p2 = (pa, ph) if swapped else (ph, pa)
                    conn.execute("INSERT INTO odds VALUES(?,?,?,?,?,?)", (cand["id"], "the-odds-api", b["key"], p1, p2, now))
                    stats["rows"] += 1
    conn.commit()
    return stats


# ------------------------------------------------------------------ OddsPapi (best effort, unverified)
def fetch_oddspapi(conn, key: str) -> dict[str, Any]:
    """Best-effort OddsPapi fetch. The v4 response shape could not be verified offline, so any failure is
    reported (never raised) and nothing is stored on an unexpected shape."""
    stats: dict[str, Any] = {"events": 0, "matched": 0, "rows": 0}
    cands = _upcoming_index(conn)
    if not cands:
        return stats
    try:
        with httpx.Client(timeout=30, base_url="https://api.oddspapi.io/v4") as cl:
            r = cl.get("/odds-by-tournaments", params={"apiKey": key, "bookmaker": "pinnacle", "sportId": 12})
            if r.status_code != 200:
                stats["error"] = f"HTTP {r.status_code}"
                return stats
            data = r.json()
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        for ev in data if isinstance(data, list) else []:
            n1, n2 = ev.get("participant1Name"), ev.get("participant2Name")
            o = ((ev.get("bookmakerOdds") or {}).get("pinnacle") or {}).get("markets", {})
            prices = o.get("171", o.get("h2h", {}))  # market id unverified
            outs = (prices or {}).get("outcomes", {})
            if not (n1 and n2 and outs):
                continue
            stats["events"] += 1
            hit = _match_event(cands, n1, n2)
            if not hit:
                continue
            cand, swapped = hit
            vals = [list(v.get("players", {}).values())[0].get("price") for v in outs.values() if v.get("players")]
            if len(vals) != 2 or not all(vals):
                continue
            ph, pa = vals
            p1, p2 = (pa, ph) if swapped else (ph, pa)
            conn.execute("INSERT INTO odds VALUES(?,?,?,?,?,?)", (cand["id"], "oddspapi", "pinnacle", p1, p2, now))
            stats["matched"] += 1
            stats["rows"] += 1
        conn.commit()
    except Exception as exc:  # noqa: BLE001
        stats["error"] = str(exc)
    return stats


def fetch_all(conn, cfg: dict) -> dict[str, Any]:
    """Run whichever fetchers have a key configured. Missing keys -> {} (no crash)."""
    out: dict[str, Any] = {}
    keys = (cfg or {}).get("odds", {}) or {}
    if keys.get("the_odds_api_key"):
        try:
            out["the_odds_api"] = fetch_the_odds_api(conn, keys["the_odds_api_key"])
        except Exception as exc:  # noqa: BLE001
            out["the_odds_api"] = {"error": str(exc)}
    if keys.get("oddspapi_key"):
        out["oddspapi"] = fetch_oddspapi(conn, keys["oddspapi_key"])
    return out
