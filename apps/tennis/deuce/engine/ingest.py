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
import os
import re
import time
from pathlib import Path
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional

from . import fixtures as fixtures_mod
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


_AUTH = re.compile(r"\b(401|403)\b")
HOURLY_LOOKBACK_MAX = 3
HOURLY_FIXTURE_DAYS = 1


def run_mode(explicit: Optional[str] = None) -> str:
    """`full` (daily refresh, pushes, manual runs) or `hourly`; DEUCE_RUN selects it, default full."""
    m = (explicit or os.environ.get("DEUCE_RUN") or "full").strip().lower()
    return "hourly" if m == "hourly" else "full"


def _auth_failed(src) -> bool:
    return bool(_AUTH.search(str(getattr(src, "last_error", None) or "")))


def _reset(src) -> None:
    for attr, val in (("last_error", None), ("last_complete", True)):
        try:
            setattr(src, attr, val)
        except Exception:  # noqa: BLE001
            pass


def _incomplete(src, budget) -> bool:
    """A fetched day is incomplete when the source says so, reported an error, or ran out of quota."""
    return (getattr(src, "last_complete", True) is False or bool(getattr(src, "last_error", None))
            or bool(getattr(budget, "exhausted", False)))


def run(conn, cfg: dict, sources: Optional[list[Source]] = None, cache: Optional[MatchCache] = None,
        today: Optional[date] = None, fetch: bool = True, floor: Optional[str] = None,
        max_seconds: Optional[float] = None, verbose: bool = True, state_root: Optional[Path] = None,
        mode: Optional[str] = None, fixtures_root: Optional[Path] = None) -> dict:
    t0 = time.monotonic()
    mode = run_mode(mode)
    hourly = mode == "hourly"
    icfg = {**(cfg.get("ingest") or {})}
    floor_day = date.fromisoformat(floor or icfg.get("floor", "2023-01-01"))
    max_s = max_seconds if max_seconds is not None else float(icfg.get("max_seconds", 150))
    full_fixture_days = int(icfg.get("fixture_days", 10))
    today = today or datetime.now(timezone.utc).date()
    say = print if verbose else (lambda *a, **k: None)
    cache = cache if cache is not None else MatchCache()
    summary: dict = {"mode": mode, "cache_records": len(cache), "sources": {}}
    if getattr(cache, "quarantined", None):
        summary["quarantined_cache_files"] = list(cache.quarantined)
    live: dict[tuple[str, str], MatchRecord] = {}   # fixtures + non-final results, newest fetch wins
    sources = sources if sources is not None else (discover(cfg) if fetch else [])
    if not fetch:                                  # offline rebuild: the committed fixture snapshots stand in
        for f in sorted((fixtures_root or fixtures_mod.FIXTURE_DIR).glob("*.json")):
            live.update({(r.source, r.source_id): r for r in fixtures_mod.load(f.stem, fixtures_root)})
    rankings: dict = {}
    for src in sources:
        s = summary["sources"].setdefault(src.name, {"fixtures": 0, "results": 0, "new_final": 0, "backfill_days": 0})
        state = SourceState(src.name, state_root)
        fx_now = datetime.now(timezone.utc)
        persisted = fixtures_mod.load(src.name, fixtures_root)   # empty for keyless sources
        if not fetch:
            live.update({(r.source, r.source_id): r for r in persisted})
            continue
        q = quota_for(src, cfg)
        gap = float(q.get("hourly_gap_min") or 0)
        last = state.data.get("last_fetch")
        if hourly and gap and last and (fx_now - datetime.fromisoformat(last)).total_seconds() < gap * 60:
            s["skipped"] = f"fetched within the last {int(gap)} min"
            live.update({(r.source, r.source_id): r for r in persisted})
            continue
        budget = make_budget(src, cfg, state, today)
        try:
            src.run_mode = mode
        except Exception:  # noqa: BLE001
            pass
        # Quota-limited sources read only today and tomorrow in hourly runs (their snapshot covers the rest);
        # keyless ones are cheap, so they always read the whole window.
        fixture_days = HOURLY_FIXTURE_DAYS if (hourly and hasattr(budget, "state")) else full_fixture_days
        say(f"[{src.name}] {mode}: fixtures + results ...")
        try:
            _reset(src)
            recs = _safe(src.name, "fixtures", lambda: list(src.fetch_fixtures(fixture_days, budget)), summary) or []
            s["fixtures"] = len(recs)
            auth_bad = _auth_failed(src)
            fresh: list[MatchRecord] = list(recs)
            s["new_final"] += cache.add(recs)               # a live listing can carry matches that just finished
            lookback = int(q.get("lookback", DEFAULT_LOOKBACK_DAYS))
            if hourly and lookback > 0:
                lookback = max(1, min(lookback, HOURLY_LOOKBACK_MAX))
            for k in range(lookback - 1, -1, -1):
                if getattr(budget, "exhausted", False) or auth_bad:
                    break
                day = today - timedelta(days=k)
                _reset(src)
                recs = _safe(src.name, f"results {day}", lambda: list(src.fetch_results(day, budget)), summary) or []
                auth_bad = _auth_failed(src)
                s["results"] += len(recs)
                s["new_final"] += cache.add(recs)
                fresh.extend(r for r in recs if not is_final(r))
            # --- resumable newest-first backfill: the cursor only moves past days that were read completely
            if q.get("backfill") and not state.backfill_done and not auth_bad:
                blocked = (state.data.get("backfill_blocked") or {}).get("date") == today.isoformat()
                cap = q.get("backfill_cap_hourly" if hourly else "backfill_cap_full")
                reserve = int(q.get("backfill_reserve") or 0)
                cursor = state.backfill_cursor or (today - timedelta(days=lookback))
                done_days = 0
                while (not blocked and cursor >= floor_day and not getattr(budget, "exhausted", False)
                       and time.monotonic() - t0 < max_s and (cap is None or done_days < int(cap))):
                    rem = budget.remaining() if hasattr(budget, "remaining") else None
                    if rem is not None and rem <= reserve:
                        s["backfill_paused"] = f"keeping {reserve} requests for the rest of the day"
                        break
                    _reset(src)
                    recs = _safe(src.name, f"backfill {cursor}", lambda: list(src.fetch_results(cursor, budget)), summary)
                    if recs is None:
                        break                                # exception: retry this day next run
                    s["new_final"] += cache.add(recs)         # keep what was read, even from a partial day
                    if _auth_failed(src):
                        state.data["backfill_blocked"] = {"date": today.isoformat(), "error": str(src.last_error)[:200]}
                        s["backfill_blocked"] = state.data["backfill_blocked"]["error"]
                        cache.save()
                        break
                    if _incomplete(src, budget):
                        cache.save()
                        break                                # partial day: cursor stays, retried next run
                    s["backfill_days"] += 1
                    done_days += 1
                    cursor -= timedelta(days=1)
                    cache.save()                             # cache first, then the cursor that points past it
                    state.set_backfill(cursor)
                    state.save()
                if cursor < floor_day:
                    state.set_backfill(cursor, done=True)
                s["backfill_cursor"] = state.backfill_cursor.isoformat() if state.backfill_cursor else None
            if hasattr(budget, "state"):
                s["quota_used_today"], s["quota_used_month"] = budget.used_today, budget.used_month
            if not hourly and not auth_bad:                  # odds cost quota: the daily full run only
                _reset(src)
                odds = _safe(src.name, "odds", lambda: list(src.fetch_odds(budget)), summary) or []
                if odds:
                    from .odds_history import store_odds_records
                    n = _safe(src.name, "odds store", lambda: store_odds_records(src.name, odds), summary)
                    if n is not None:
                        s["odds_records"] = n
            if hasattr(src, "fetch_rankings"):
                r = _safe(src.name, "rankings", src.fetch_rankings, summary)
                if r:
                    for tour, d in r.items():
                        rankings.setdefault(tour, {}).update(d)
            if auth_bad:
                s["auth_error"] = str(getattr(src, "last_error", ""))[:200]
                state.data["auth_error"] = {"date": today.isoformat(), "error": s["auth_error"]}
            else:
                state.data.pop("auth_error", None)
            window_end = today + timedelta(days=fixture_days)
            if gap:
                state.data["last_fetch"] = fx_now.strftime("%Y-%m-%dT%H:%M:%SZ")
            if hasattr(budget, "state"):
                # Quota-limited sources keep committed state and a fixture snapshot, so a spent quota loses nothing.
                # Keyless ones (ESPN) are cheap to re-read every run and would only churn git.
                kept = fixtures_mod.store(src.name, fresh, window_end, fixtures_root)
            else:
                kept = fresh
            live.update({(r.source, r.source_id): r for r in kept})
        finally:
            cache.save()                                     # cache first, then the state that refers to it
            state.save()
    if rankings:
        store_rankings(conn, rankings)
    summary["cache_files_written"] = cache.save()
    # Non-final matches whose start is long past never happened (or finished unseen): drop them, but keep a recently
    # started one a little longer so it still dedupes with a final that arrives from another source.
    now = datetime.now(timezone.utc)
    keep_from = iso_z((now - timedelta(days=4)).isoformat())
    stale_before = iso_z((now - timedelta(hours=36)).isoformat())
    live_recs = [r for r in live.values() if iso_z(r.date) >= keep_from]
    finals = list(cache.records.values())
    final_keys = {(r.source, r.source_id) for r in finals}
    res = merge.resolve(finals + [r for r in live_recs if (r.source, r.source_id) not in final_keys],
                        stale_before=stale_before)
    write_db(conn, res)
    summary.update(res.stats)
    summary["cache_bytes"] = cache.size_bytes()
    summary["seconds"] = round(time.monotonic() - t0, 1)
    return summary
