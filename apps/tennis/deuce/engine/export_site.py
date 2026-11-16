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
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from brief import facts
from brief.config import load_config as load_brief_config
from brief.generate import generate_brief
from brief.run import build_context

from . import model as model_mod
from .countries import code3, norm_country
from .db import ROOT, connect, load_config
from .names import name_key

SITE_APP = ROOT.parent / "public" / "data" / "app"
PAST_DAYS, FUTURE_DAYS, LOW_DATA = 3, 10, 15
TOUR_WORD = {"ATP": "men", "WTA": "women"}
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
    def _narrow(cands: list[dict], country: Optional[str], strict: bool) -> list[dict]:
        """Keep candidates whose country agrees. Exact-name matches only narrow ties; shortened names must agree."""
        if not country or (not strict and len(cands) <= 1):
            return cands
        same = [c for c in cands if norm_country((c.get("country") or {}).get("short")) == norm_country(country)]
        return same if strict else (same or cands)

    def find(self, tour: str, name: str, country: Optional[str]) -> Optional[dict]:
        """Exact order-free name match first; then a shortened name ('Maria Lourdes Carle' / 'Maria Carle':
        one name's words all appear in the other's, at least two words, first word shared) if exactly one fits."""
        word = TOUR_WORD.get(tour)
        cands = self._narrow(self.by_key.get((word, name_key(name)), []), country, False)
        if len(cands) == 1:
            return cands[0]
        if cands:
            return None
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
        fuzzy = self._narrow(fuzzy, country, True)
        return fuzzy[0] if len(fuzzy) == 1 else None


def load_baseline(path: Path) -> BaselineIndex:
    try:
        rows = json.loads(path.read_text()).get("rows", [])
    except (OSError, ValueError):
        rows = []
    return BaselineIndex(rows)


# ------------------------------------------------------------------ briefs
def _uses_market(b: dict) -> bool:
    mk = next((x for x in b.get("buckets", []) if x.get("key") == "market"), None)
    return bool(b.get("value")) or bool(mk and (mk.get("favours") != "level" or mk.get("facts")))


_PRICE = re.compile(r"\b(market|price|prices|odds|bookmakers?|value)\b", re.I)
NEUTRAL_MARKET = "Betting markets aren't part of this view, so this signal is left out."


def _sanitize(b: dict) -> dict:
    """No prices anywhere: neutral market bucket, price sentences dropped from the bottom line and player bullets."""
    for bk in b.get("buckets", []):
        if bk.get("key") == "market":
            bk.update(favours="level", strength=None, text=NEUTRAL_MARKET, facts=[])
    if b.get("bottom_line"):
        sents = re.split(r"(?<=[.!?])\s+", b["bottom_line"])
        b["bottom_line"] = " ".join(x for x in sents if not _PRICE.search(x)).strip() or None
    for side in (b.get("players") or {}).values():
        for k in ("upsides", "downsides"):
            side[k] = [x for x in side.get(k, []) if not _PRICE.search(x)]
    return b


def site_brief(conn: sqlite3.Connection, mid: str, stored: Optional[dict], cfg: dict) -> Optional[dict]:
    """The brief as the site may show it: no `value`, and no market bucket built on prices."""
    if stored is not None and not _uses_market(stored):
        out = dict(stored)
    else:
        ctx = build_context(conn, mid, cfg, with_weather=False)
        if ctx is None:
            return None
        ctx["odds"] = []                      # the site never shows prices: regenerate as if there were none
        out = generate_brief(ctx, use_llm=False, config=cfg)
        if stored is not None and stored.get("weather"):
            out["weather"] = stored["weather"]
    out.pop("value", None)
    out["agreement"] = facts.compute_agreement(out["model_pick"], out["buckets"])
    return _sanitize(out)


# ------------------------------------------------------------------ export
def export(conn: sqlite3.Connection, out_dir: Path, baseline_path: Path, now: Optional[datetime] = None,
           backtest_path: Optional[Path] = None, cfg: Optional[dict] = None, verbose: bool = True) -> dict[str, Any]:
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
                  t.name AS tname, t.level, t.surface, a.name AS p1n, a.country AS p1c, b.name AS p2n, b.country AS p2c,
                  p.p1_prob, p.p2_prob, p.set_probs_json, p.features_json, p.model_version, br.brief_json
           FROM matches m JOIN predictions p ON p.match_id = m.id
           LEFT JOIN tournaments t ON t.id = m.tournament_id
           LEFT JOIN players a ON a.id = m.p1_id LEFT JOIN players b ON b.id = m.p2_id
           LEFT JOIN briefs br ON br.match_id = m.id
           WHERE m.date >= ? AND m.date <= ? AND m.status != 'walkover' ORDER BY m.date, m.id""", (lo, hi)).fetchall()

    briefs_dir = out_dir / "briefs"
    briefs_dir.mkdir(exist_ok=True)
    existing = {f.stem for f in briefs_dir.glob("*.json")}
    matches, keep, seen_players, linked = [], set(), {}, {}
    for r in rows:
        feats = json.loads(r["features_json"] or "{}")
        side_f = {"p1": feats.get("p1") or {}, "p2": feats.get("p2") or {}}
        players = {}
        for s in ("p1", "p2"):
            pid, name, country = r[f"{s}_id"], r[f"{s}n"], r[f"{s}c"]
            hit = base.find(r["tour"], name, country)
            f = side_f[s]
            players[s] = {
                "id": pid if ":" in pid else f"espn:{pid}", "name": name,
                "country": ((hit or {}).get("country") or {}).get("short") or code3(country),
                "baseline_id": str(hit["id"]) if hit else None,
                "elo": None if f.get("elo") is None else round(f["elo"]),
                "rank": f.get("rank")}
            seen_players[pid] = bool(hit)
        mid = str(r["id"])
        stored = json.loads(r["brief_json"]) if r["brief_json"] else None
        brief = site_brief(conn, mid, stored, cfg) if stored is not None else None
        has_brief = False
        if brief is not None:
            (briefs_dir / f"{mid}.json").write_text(json.dumps(brief, ensure_ascii=False, separators=(",", ":")))
            has_brief = True
        elif mid in existing:                 # finished since its brief was written: keep the file for the window
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
    removed = 0
    for stem in existing - keep:
        (briefs_dir / f"{stem}.json").unlink()
        removed += 1

    mdl = model_mod.load()
    preds = {"generated_at": iso(now), "model_version": mdl.version if mdl else None, "matches": matches}
    (out_dir / "predictions.json").write_text(json.dumps(preds, ensure_ascii=False, separators=(",", ":")))

    model_json = None
    bt_path = backtest_path or (ROOT / "data" / "backtest.json")
    if bt_path.exists():
        bt = json.loads(bt_path.read_text())
        model_json = {k: bt.get(k) for k in ("generated_at", "overall", "splits", "calibration", "rolling", "by_tour",
                                             "by_level", "set_score_check")}
        model_json["notes"] = [n for n in bt.get("notes", []) if not _BETTING.search(n)]
        (out_dir / "model.json").write_text(json.dumps(model_json, ensure_ascii=False, separators=(",", ":")))

    n_pl, n_hit = len(seen_players), sum(seen_players.values())
    stats = {"matches": len(matches), "scheduled": sum(m["status"] == "scheduled" for m in matches),
             "live": sum(m["status"] == "live" for m in matches),
             "finished": sum(m["status"] in ("final", "retired") for m in matches),
             "briefs": len(keep), "briefs_removed": removed, "players": n_pl, "players_linked": n_hit,
             "baseline_match_rate": round(n_hit / n_pl, 3) if n_pl else None, "model_json": model_json is not None,
             "unlinked_sample": sorted({m[s]["name"] for m in matches for s in ("p1", "p2") if not m[s]["baseline_id"]})[:12]}
    if verbose:
        print(json.dumps(stats, indent=1))
    return stats


def main() -> None:
    ap = argparse.ArgumentParser(description="Write Baseline site data from the Deuce database")
    ap.add_argument("--out", default=str(SITE_APP))
    ap.add_argument("--baseline", help="Baseline players.json (default: <out>/players.json)")
    a = ap.parse_args()
    out = Path(a.out)
    export(connect(cfg=load_config()), out, Path(a.baseline) if a.baseline else out / "players.json")


if __name__ == "__main__":
    main()
