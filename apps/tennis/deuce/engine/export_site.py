"""`python -m engine.export_site`: write the Baseline site data (docs/tennis-deuce.md).

    apps/tennis/public/data/app/predictions.json     matches from 3 days ago to 10 days ahead, with probabilities
    apps/tennis/public/data/app/model.json           backtest accuracy, calibration, splits (no betting)
    apps/tennis/public/data/app/briefs/<id>.json     Match Briefs, with no prices, edges or value flags

Players are linked to Baseline's `players.json` (`baseline_id`) by normalised name and tour. Brief files for matches
outside the window are removed. No odds, edges or value flags are ever written.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from brief import facts
from brief.config import load_config as load_brief_config
from brief.generate import generate_brief
from brief.run import build_context
from brief.weather import get_weather

from . import model as model_mod
from .countries import code3, norm_country
from .db import ROOT, connect, load_config
from .fsutil import atomic_write_text
from .names import name_key

WEATHER_CACHE = ROOT / "data" / "cache" / "weather"
SITE_APP = ROOT.parent / "public" / "data" / "app"
PAST_DAYS, FUTURE_DAYS, LOW_DATA = 3, 10, 15
TOUR_WORD = {"ATP": "men", "WTA": "women"}
NEUTRAL_CODES = {"AIN", "ROC", "NEU", "IOC", "OAR", "EOR", ""}
_BETTING = re.compile(r"\b(odds|bet|bets|betting|value|roi|profit|stake|edge|price|prices|market|retirements)\b", re.I)


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ------------------------------------------------------------------ Baseline player ids
class BaselineIndex:
    """Baseline players.json rows by (tour word, normalised order-free name)."""

    def __init__(self, rows: list[dict]):
        self.by_key: dict[tuple[str, str], list[dict]] = {}
        for r in rows:
            self.by_key.setdefault((r.get("tour"), name_key(r.get("name"))), []).append(r)

    @staticmethod
    def _conflict(cand: dict, country: Optional[str]) -> bool:
        """Both countries known and different. Neutral-athlete codes (AIN, ROC, ...) count as unknown."""
        short = (cand.get("country") or {}).get("short")
        if not country or not short or short.upper() in NEUTRAL_CODES:
            return False
        return norm_country(short) != norm_country(country)

    def _narrow(self, cands: list[dict], country: Optional[str]) -> list[dict]:
        return [c for c in cands if not self._conflict(c, country)]

    def find(self, tour: str, name: str, country: Optional[str]) -> Optional[dict]:
        """Match by order-free name and tour, then a shortened name ('Maria Lourdes Carle' / 'Maria Carle': one name's
        words all appear in the other's, at least two words, first word shared). A match is rejected when both
        countries are known and differ, and a tie is never broken by guessing."""
        word = TOUR_WORD.get(tour)
        exact = self.by_key.get((word, name_key(name)), [])
        if exact:
            ok = self._narrow(exact, country)
            return ok[0] if len(ok) == 1 else None
        toks = set(name_key(name).split())
        if len(toks) < 2:
            return None
        first = (name or "").split()[0].lower() if (name or "").split() else ""
        fuzzy = []
        for (w, key), rows in self.by_key.items():
            if w != word:
                continue
            other = set(key.split())
            if len(other) >= 2 and (toks <= other or other <= toks) and (name_key(first) in other):
                fuzzy.extend(rows)
        fuzzy = self._narrow(fuzzy, country)
        return fuzzy[0] if len(fuzzy) == 1 else None


def load_baseline(path: Path) -> BaselineIndex:
    try:
        rows = json.loads(path.read_text()).get("rows", [])
    except (OSError, ValueError):
        rows = []
    return BaselineIndex(rows)


# ------------------------------------------------------------------ briefs
_PRICE = re.compile(r"\b(market|markets|price|prices|priced|odds|bookmakers?|sportsbooks?|betting|bets?|wager|stake|value bets?)\b", re.I)
TIER = {"Grand Slam": 0, "Finals": 1, "1000": 2, "500": 3, "250": 4, "125": 5, "Challenger": 6, "ITF": 7}
MAX_BRIEFS = 150
WEATHER_SECONDS = 60
SITE_BUCKETS = ("fitness", "motivation", "conditions")


def _sanitize(b: dict) -> dict:
    """The public view has no betting wording: no market bucket, no value, no price sentences or bullets."""
    b.pop("value", None)
    b["buckets"] = [x for x in b.get("buckets", []) if x.get("key") in SITE_BUCKETS]
    if b.get("bottom_line"):
        sents = re.split(r"(?<=[.!?])\s+", b["bottom_line"])
        b["bottom_line"] = " ".join(x for x in sents if not _PRICE.search(x)).strip() or None
    for side in (b.get("players") or {}).values():
        for k in ("upsides", "downsides"):
            side[k] = [x for x in side.get(k, []) if not _PRICE.search(x)]
    return b


def site_brief(conn: sqlite3.Connection, mid: str, cfg: dict, weather: Optional[dict] = None) -> Optional[dict]:
    """The brief as the site shows it: written by rules from the numbers (never an LLM, which could talk about prices),
    three buckets (fitness, motivation, conditions), agreement over those three (score = 50 + 50 * sum / 9)."""
    ctx = build_context(conn, mid, cfg, with_weather=False)
    if ctx is None:
        return None
    ctx["odds"] = []
    ctx["site_mode"] = True
    out = generate_brief(ctx, use_llm=False, config=cfg)
    out["weather"] = weather
    return _sanitize(out)


def _strip(d: Any, ignore: tuple[str, ...]) -> Any:
    return {k: v for k, v in d.items() if k not in ignore} if isinstance(d, dict) else d


def write_json(path: Path, obj: Any, ignore: tuple[str, ...] = ("generated_at",)) -> bool:
    """Write compact JSON atomically, but leave the file alone when only `ignore`d keys (timestamps) would change,
    so a rerun with nothing new produces no git diff."""
    try:
        if _strip(json.loads(path.read_text()), ignore) == _strip(obj, ignore):
            return False
    except (OSError, ValueError):
        pass
    atomic_write_text(path, json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
    return True


def _existing_weather(path: Path) -> Optional[dict]:
    try:
        return json.loads(path.read_text()).get("weather")
    except (OSError, ValueError):
        return None


# ------------------------------------------------------------------ export
def export(conn: sqlite3.Connection, out_dir: Path, baseline_path: Path, now: Optional[datetime] = None,
           backtest_path: Optional[Path] = None, cfg: Optional[dict] = None, verbose: bool = True,
           weather_seconds: float = 0, max_briefs: int = MAX_BRIEFS) -> dict[str, Any]:
    """`weather_seconds` > 0 looks up Open-Meteo for upcoming matches for that long (full runs); otherwise the weather
    already in a match's brief file is carried over. `max_briefs` caps new briefs, top tiers and soonest first."""
    now = now or datetime.now(timezone.utc)
    cfg = cfg or load_brief_config()
    if not conn.execute("SELECT 1 FROM predictions LIMIT 1").fetchone():
        # An empty database must never overwrite the last good snapshot on the site.
        raise SystemExit("No predictions in the database; leaving the site data as it is. Run `python -m engine.update`.")
    out_dir.mkdir(parents=True, exist_ok=True)
    lo, hi = iso(now - timedelta(days=PAST_DAYS)), iso(now + timedelta(days=FUTURE_DAYS))
    base = load_baseline(baseline_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """SELECT m.id, m.date, m.tour, m.round, m.status, m.score, m.winner_id, m.p1_id, m.p2_id,
                  t.name AS tname, t.level, t.surface, t.location, t.country AS tcountry,
                  a.name AS p1n, a.country AS p1c, b.name AS p2n, b.country AS p2c,
                  p.p1_prob, p.p2_prob, p.set_probs_json, p.features_json
           FROM matches m JOIN predictions p ON p.match_id = m.id
           LEFT JOIN tournaments t ON t.id = m.tournament_id
           LEFT JOIN players a ON a.id = m.p1_id LEFT JOIN players b ON b.id = m.p2_id
           WHERE m.date >= ? AND m.date <= ? AND m.status != 'walkover' ORDER BY m.date, m.id""", (lo, hi)).fetchall()

    briefs_dir = out_dir / "briefs"
    briefs_dir.mkdir(exist_ok=True)
    existing = {f.stem for f in briefs_dir.glob("*.json")}
    upcoming = [r for r in rows if r["status"] in ("scheduled", "live")]
    want = {str(r["id"]) for r in sorted(upcoming, key=lambda r: (TIER.get(r["level"], 8), r["date"], r["id"]))[:max_briefs]}
    weather_until = time.monotonic() + weather_seconds
    matches, keep, seen_players, errors = [], set(), {}, []
    for r in rows:
        mid = str(r["id"])
        try:
            feats = json.loads(r["features_json"] or "{}")
            side_f = {"p1": feats.get("p1") or {}, "p2": feats.get("p2") or {}}
            players = {}
            for s in ("p1", "p2"):
                pid, name, country = r[f"{s}_id"], r[f"{s}n"], r[f"{s}c"]
                hit = base.find(r["tour"], name, country)
                players[s] = {
                    "id": pid if ":" in pid else f"espn:{pid}", "name": name,
                    "country": ((hit or {}).get("country") or {}).get("short") or code3(country),
                    "baseline_id": str(hit["id"]) if hit else None,
                    "elo": None if side_f[s].get("elo") is None else round(side_f[s]["elo"]),
                    # World ranking from Baseline's own rankings (theScore) when matched. Deuce's per-match "rank" is the
                    # tournament seed from ESPN, which must not be shown as a ranking.
                    "rank": (hit or {}).get("rank")}
                seen_players[pid] = bool(hit)
            has_brief = False
            path = briefs_dir / f"{mid}.json"
            if mid in want:
                try:
                    weather = _existing_weather(path)
                    if weather_seconds and time.monotonic() < weather_until:
                        tour_info = {"surface": r["surface"], "location": r["location"], "country": r["tcountry"]}
                        weather = get_weather(tour_info, r["date"], now=now, cache_dir=WEATHER_CACHE) or weather
                    brief = site_brief(conn, mid, cfg, weather)
                    if brief is not None:
                        write_json(path, brief)
                        has_brief = True
                except Exception as exc:  # noqa: BLE001 - one bad brief never aborts the export
                    errors.append(f"brief {mid}: {type(exc).__name__}: {exc}")
            if not has_brief and mid in existing:      # finished since, or beyond the cap: keep the file for the window
                has_brief = True
            if has_brief:
                keep.add(mid)
            p1p, p2p = r["p1_prob"], r["p2_prob"]
            done = r["status"] in ("final", "retired")
            matches.append({
                "id": mid, "date": r["date"], "tour": r["tour"], "level": r["level"], "tournament": r["tname"],
                "surface": r["surface"], "round": r["round"], "status": r["status"], "score": r["score"],
                "winner": ("p1" if r["winner_id"] == r["p1_id"] else "p2" if r["winner_id"] == r["p2_id"] else None) if done else None,
                "p1": players["p1"], "p2": players["p2"],
                "p1_prob": None if p1p is None else round(p1p, 4), "p2_prob": None if p2p is None else round(p2p, 4),
                "set_probs": ({k: round(v, 4) for k, v in json.loads(r["set_probs_json"]).items()} if r["set_probs_json"] else None),
                "low_data": any((side_f[s].get("experience") is None or side_f[s]["experience"] < LOW_DATA) for s in ("p1", "p2")),
                "brief": has_brief})
        except Exception as exc:  # noqa: BLE001
            errors.append(f"match {mid}: {type(exc).__name__}: {exc}")
    removed = 0
    for stem in existing - keep:
        (briefs_dir / f"{stem}.json").unlink()
        removed += 1

    mdl = model_mod.load()
    preds = {"generated_at": iso(now), "model_version": mdl.version if mdl else None, "matches": matches}
    changed = write_json(out_dir / "predictions.json", preds)

    model_json = None
    bt_path = backtest_path or (ROOT / "data" / "backtest.json")
    if bt_path.exists():
        bt = json.loads(bt_path.read_text())
        model_json = {k: bt.get(k) for k in ("generated_at", "overall", "splits", "calibration", "rolling", "by_tour",
                                             "by_level", "set_score_check")}
        model_json["notes"] = [n for n in bt.get("notes", []) if not _BETTING.search(n)]
        write_json(out_dir / "model.json", model_json)

    n_pl, n_hit = len(seen_players), sum(seen_players.values())
    stats = {"matches": len(matches), "scheduled": sum(m["status"] == "scheduled" for m in matches),
             "live": sum(m["status"] == "live" for m in matches),
             "finished": sum(m["status"] in ("final", "retired") for m in matches),
             "briefs": len(keep), "briefs_removed": removed, "players": n_pl, "players_linked": n_hit,
             "baseline_match_rate": round(n_hit / n_pl, 3) if n_pl else None, "model_json": model_json is not None,
             "predictions_changed": changed, "errors": errors[:10], "error_count": len(errors),
             "unlinked_sample": sorted({m[s]["name"] for m in matches for s in ("p1", "p2") if not m[s]["baseline_id"]})[:12]}
    if verbose:
        print(json.dumps(stats, indent=1))
    return stats


def main() -> None:
    ap = argparse.ArgumentParser(description="Write Baseline site data from the Deuce database")
    ap.add_argument("--out", default=str(SITE_APP))
    ap.add_argument("--baseline", help="Baseline players.json (default: <out>/players.json)")
    ap.add_argument("--weather", action="store_true", help=f"look up Open-Meteo for upcoming matches (up to {WEATHER_SECONDS}s)")
    ap.add_argument("--max-briefs", type=int, default=MAX_BRIEFS)
    a = ap.parse_args()
    out = Path(a.out)
    export(connect(cfg=load_config()), out, Path(a.baseline) if a.baseline else out / "players.json",
           weather_seconds=WEATHER_SECONDS if a.weather else 0, max_briefs=a.max_briefs)


if __name__ == "__main__":
    main()
