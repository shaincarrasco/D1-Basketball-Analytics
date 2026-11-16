"""Generic ingest loop over every available source.

    1. fixtures from every source          (kept in memory: they change hourly)
    2. recent results from every source    (finished matches go into the compact cache)
    3. resumable newest-first backfill     (sources that support it, within each source's quota)
    4. dedupe + player identity across sources, then rebuild matches/players/tournaments in SQLite
    5. odds from sources that have them    (stored compactly in data-cache/odds/)
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional

from . import merge
from .cache import MatchCache
from .records import is_final, iso_z
from .sources import DEFAULT_LOOKBACK_DAYS, discover, make_budget, quota_for
from .sources.base import MatchRecord, Source
from .sources.state import SourceState

log = logging.getLogger("deuce.ingest")
TABLES = ("matches", "players", "tournaments", "match_ranks", "match_sources")


def _safe(name: str, what: str, fn, summary: dict):
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001 - one broken source must not stop the others
        log.warning("source %s %s failed: %s: %s", name, what, type(exc).__name__, exc)
        summary.setdefault("errors", []).append(f"{name} {what}: {type(exc).__name__}: {exc}")
        return None


def write_db(conn, res: merge.Resolved) -> None:
    """Replace the match tables with `res` (predictions, odds and briefs are keyed by match id and stay)."""
    for t in TABLES:
        conn.execute(f"DELETE FROM {t}")
    conn.executemany("INSERT INTO players(id,name,country,tour) VALUES(:id,:name,:country,:tour)", res.players)
    conn.executemany(
        """INSERT INTO tournaments(id,name,tour,start_date,end_date,location,country,surface,surface_inferred,level)
           VALUES(:id,:name,:tour,:start_date,:end_date,:location,:country,:surface,:surface_inferred,:level)""",
        res.tournaments)
    conn.executemany(
        """INSERT INTO matches(id,tournament_id,tour,round,date,status,p1_id,p2_id,winner_id,score,sets_json,best_of,court)
           VALUES(:id,:tournament_id,:tour,:round,:date,:status,:p1_id,:p2_id,:winner_id,:score,:sets_json,:best_of,:court)""",
        res.matches)
    conn.executemany("INSERT INTO match_ranks(match_id,p1_rank,p2_rank) VALUES(?,?,?)", res.ranks)
    conn.executemany("INSERT OR IGNORE INTO match_sources(match_id,source,source_id) VALUES(?,?,?)", res.sources)
    conn.commit()


def store_rankings(conn, rankings: dict[str, dict[str, int]]) -> None:
    conn.execute("INSERT INTO meta(key,value) VALUES('rankings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                 (json.dumps(rankings),))
    conn.commit()


def run(conn, cfg: dict, sources: Optional[list[Source]] = None, cache: Optional[MatchCache] = None,
        today: Optional[date] = None, fetch: bool = True, floor: Optional[str] = None,
        max_seconds: Optional[float] = None, verbose: bool = True, state_root: Optional[Path] = None) -> dict:
    t0 = time.monotonic()
    icfg = {**(cfg.get("ingest") or {})}
    floor_day = date.fromisoformat(floor or icfg.get("floor", "2023-01-01"))
    max_s = max_seconds if max_seconds is not None else float(icfg.get("max_seconds", 150))
    fixture_days = int(icfg.get("fixture_days", 10))
    today = today or datetime.now(timezone.utc).date()
    say = print if verbose else (lambda *a, **k: None)
    cache = cache if cache is not None else MatchCache()
    summary: dict = {"cache_records": len(cache), "sources": {}}
    live: dict[tuple[str, str], MatchRecord] = {}   # fixtures + non-final results, newest fetch wins
    if fetch:
        sources = sources if sources is not None else discover(cfg)
        rankings: dict = {}
        for src in sources:
            s = summary["sources"].setdefault(src.name, {"fixtures": 0, "results": 0, "new_final": 0, "backfill_days": 0})
            state = SourceState(src.name, state_root)
            budget = make_budget(src, cfg, state, today)
            q = quota_for(src, cfg)
            say(f"[{src.name}] fixtures + results ...")
            recs = _safe(src.name, "fixtures", lambda: list(src.fetch_fixtures(fixture_days, budget)), summary) or []
            s["fixtures"] = len(recs)
            live.update({(r.source, r.source_id): r for r in recs})
            lookback = int(q.get("lookback", DEFAULT_LOOKBACK_DAYS))
            for k in range(lookback - 1, -1, -1):
                if getattr(budget, "exhausted", False):
                    break
                day = today - timedelta(days=k)
                recs = _safe(src.name, f"results {day}", lambda: list(src.fetch_results(day, budget)), summary) or []
                s["results"] += len(recs)
                s["new_final"] += cache.add(recs)
                live.update({(r.source, r.source_id): r for r in recs if not is_final(r)})
            # --- resumable newest-first backfill
            if q.get("backfill") and not state.backfill_done:
                cursor = state.backfill_cursor or (today - timedelta(days=lookback))
                while cursor >= floor_day and not getattr(budget, "exhausted", False) \
                        and time.monotonic() - t0 < max_s:
                    recs = _safe(src.name, f"backfill {cursor}", lambda: list(src.fetch_results(cursor, budget)), summary)
                    if recs is None or getattr(budget, "exhausted", False):
                        break          # failed or out of quota mid-day: retry this day next run
                    s["new_final"] += cache.add(recs)
                    s["backfill_days"] += 1
                    cursor -= timedelta(days=1)
                    state.set_backfill(cursor)
                    state.save()
                if cursor < floor_day:
                    state.set_backfill(cursor, done=True)
                s["backfill_cursor"] = state.backfill_cursor.isoformat() if state.backfill_cursor else None
            if hasattr(budget, "state"):
                s["quota_used_today"], s["quota_used_month"] = budget.used_today, budget.used_month
            odds = _safe(src.name, "odds", lambda: list(src.fetch_odds(budget)), summary) or []
            if odds:
                from .odds_history import store_odds_records
                s["odds_records"] = store_odds_records(src.name, odds)
            state.save()
            if hasattr(src, "fetch_rankings"):
                r = _safe(src.name, "rankings", src.fetch_rankings, summary)
                if r:
                    for tour, d in r.items():
                        rankings.setdefault(tour, {}).update(d)
        if rankings:
            store_rankings(conn, rankings)
        summary["cache_files_written"] = cache.save()
    # Fixtures that a source stopped reporting long after their start never happened: drop them.
    cutoff = iso_z((datetime.now(timezone.utc) - timedelta(hours=36)).isoformat())
    live_recs = [r for r in live.values() if iso_z(r.date) >= cutoff]
    finals = list(cache.records.values())
    final_keys = {(r.source, r.source_id) for r in finals}
    res = merge.resolve(finals + [r for r in live_recs if (r.source, r.source_id) not in final_keys])
    write_db(conn, res)
    summary.update(res.stats)
    summary["cache_bytes"] = cache.size_bytes()
    summary["seconds"] = round(time.monotonic() - t0, 1)
    return summary
