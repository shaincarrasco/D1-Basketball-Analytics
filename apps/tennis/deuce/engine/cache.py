"""Compact, committed match cache: `data-cache/matches/{atp|wta}/YYYY-MM.jsonl.gz`.

One gzip'd JSON Lines file per tour per month, one `MatchRecord` per line (`source` says who it came from). Only
finished matches are stored: fixtures and live matches are fetched fresh every run. Output is deterministic (sorted
lines, no gzip timestamp), so a run that changes nothing leaves the files byte-identical and git quiet.

    python -m engine.cache --from-db PATH     # one-off: export an existing Deuce tennis.db into the cache
    python -m engine.cache --stats
"""
from __future__ import annotations

import argparse
import gzip
import io
import json
import os
import sqlite3
from collections import defaultdict
from pathlib import Path
from typing import Iterable

import logging

from .db import ROOT
from .fsutil import atomic_write_bytes
from .records import from_json, is_final, iso_z, to_json
from .sources.base import MatchRecord

log = logging.getLogger("deuce.cache")
CACHE_DIR = ROOT / "data-cache" / "matches"
Key = tuple[str, str]


def month_file(tour: str, month: str, root: Path | None = None) -> Path:
    return (root or CACHE_DIR) / tour.lower() / f"{month}.jsonl.gz"


def _write_gz(path: Path, lines: list[str]) -> bool:
    """Write only when the bytes differ. Returns True if the file changed."""
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0, compresslevel=9) as gz:
        gz.write(("\n".join(lines) + "\n").encode("utf-8"))
    data = buf.getvalue()
    if path.exists() and path.read_bytes() == data:
        return False
    atomic_write_bytes(path, data)
    return True


class MatchCache:
    def __init__(self, root: Path | None = None):
        self.root = root or CACHE_DIR
        self.records: dict[Key, MatchRecord] = {}
        self._dirty: set[tuple[str, str]] = set()
        self._load()

    def _load(self) -> None:
        self.quarantined: list[str] = []
        for f in sorted(self.root.glob("*/*.jsonl.gz")):
            recs, bad = [], 0
            try:
                with gzip.open(f, "rt", encoding="utf-8") as fh:
                    for line in fh:
                        if not line.strip():
                            continue
                        try:
                            recs.append(from_json(json.loads(line)))
                        except (ValueError, TypeError):
                            bad += 1
            except (OSError, EOFError, UnicodeDecodeError) as exc:   # truncated or corrupt gzip: set it aside
                dest = f.with_name(f.name + ".bad")
                log.warning("unreadable cache file %s (%s); moved to %s", f, exc, dest.name)
                try:
                    os.replace(f, dest)
                except OSError:
                    pass
                self.quarantined.append(f.name)
                continue
            if bad:
                log.warning("%s: skipped %d unreadable line(s)", f, bad)
            for r in recs:
                self.records[(r.source, r.source_id)] = r

    def __len__(self) -> int:
        return len(self.records)

    def add(self, recs: Iterable[MatchRecord]) -> int:
        """Store finished records (replacing the same source id). Returns how many were new or changed."""
        n = 0
        for r in recs:
            if not is_final(r):
                continue
            key = (r.source, r.source_id)
            old = self.records.get(key)
            if old == r:
                continue
            if old is not None:
                self._dirty.add((old.tour, iso_z(old.date)[:7]))
            self.records[key] = r
            self._dirty.add((r.tour, iso_z(r.date)[:7]))
            n += 1
        return n

    def save(self) -> int:
        """Rewrite the month files that changed. Returns the number of files written."""
        by_file: dict[tuple[str, str], list[MatchRecord]] = defaultdict(list)
        for r in self.records.values():
            by_file[(r.tour, iso_z(r.date)[:7])].append(r)
        written = 0
        for tour, month in sorted(self._dirty):
            recs = sorted(by_file.get((tour, month), []), key=lambda r: (iso_z(r.date), r.source, r.source_id))
            path = month_file(tour, month, self.root)
            if not recs:
                path.unlink(missing_ok=True)
                continue
            lines = [json.dumps(to_json(r), ensure_ascii=False, separators=(",", ":")) for r in recs]
            written += _write_gz(path, lines)
        self._dirty.clear()
        return written

    def size_bytes(self) -> int:
        return sum(f.stat().st_size for f in self.root.glob("*/*.jsonl.gz"))

    def since(self, day: str) -> list[MatchRecord]:
        return [r for r in self.records.values() if iso_z(r.date)[:10] >= day]

    def newest_day(self, source: str) -> str | None:
        ds = [iso_z(r.date)[:10] for r in self.records.values() if r.source == source]
        return max(ds) if ds else None


def records_from_db(conn: sqlite3.Connection) -> list[MatchRecord]:
    """Export finished matches of an existing Deuce database (ids as ESPN source ids) as MatchRecords."""
    conn.row_factory = sqlite3.Row
    q = """SELECT m.id, m.tour, m.round, m.date, m.status, m.p1_id, m.p2_id, m.winner_id, m.sets_json, m.best_of,
                  m.court, m.tournament_id, t.name AS tname, t.surface, t.level, t.location, t.start_date AS tstart,
                  t.end_date AS tend, t.surface_inferred, a.name AS p1n, b.name AS p2n, a.country AS p1c,
                  b.country AS p2c, r.p1_rank, r.p2_rank
           FROM matches m LEFT JOIN tournaments t ON t.id = m.tournament_id
           LEFT JOIN players a ON a.id = m.p1_id LEFT JOIN players b ON b.id = m.p2_id
           LEFT JOIN match_ranks r ON r.match_id = m.id
           WHERE m.status IN ('final','retired','walkover') AND m.date IS NOT NULL AND a.name IS NOT NULL
             AND b.name IS NOT NULL"""
    out = []
    for x in conn.execute(q):
        winner = 1 if x["winner_id"] == x["p1_id"] else 2 if x["winner_id"] == x["p2_id"] else None
        if winner is None:
            continue
        out.append(MatchRecord(
            source="espn", source_id=str(x["id"]), tour=x["tour"], level=x["level"] or "Other",
            tournament=x["tname"] or "", date=x["date"], status=x["status"], p1_name=x["p1n"], p2_name=x["p2n"],
            p1_country=x["p1c"], p2_country=x["p2c"], winner=winner,
            sets=json.loads(x["sets_json"]) if x["sets_json"] else [], best_of=x["best_of"] or 3, round=x["round"],
            surface=x["surface"], location=x["location"], tournament_id=x["tournament_id"],
            p1_source_id=str(x["p1_id"]), p2_source_id=str(x["p2_id"]), court=x["court"],
            p1_rank=x["p1_rank"], p2_rank=x["p2_rank"],
            surface_inferred=None if x["surface_inferred"] is None else bool(x["surface_inferred"]),
            tournament_start=x["tstart"], tournament_end=x["tend"]))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Compact match cache tools")
    ap.add_argument("--from-db", help="export finished matches of this tennis.db into the cache")
    ap.add_argument("--stats", action="store_true")
    a = ap.parse_args()
    cache = MatchCache()
    if a.from_db:
        recs = records_from_db(sqlite3.connect(a.from_db))
        print(f"exported {len(recs)} matches; {cache.add(recs)} new or changed")
        print(f"wrote {cache.save()} files")
    if a.stats or not a.from_db:
        tot = defaultdict(int)
        for r in cache.records.values():
            tot[(r.source, r.tour)] += 1
        print(f"{len(cache)} records, {cache.size_bytes() / 1e6:.2f} MB: {dict(tot)}")


if __name__ == "__main__":
    main()
