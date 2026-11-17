"""Committed fixture snapshots: `data-cache/fixtures/<source>.json`.

Fixtures and live matches change by the hour, so they are replaced on every fetch, but a source whose daily quota is
spent (or that errors) must not make them vanish: its last snapshot is used until the next successful fetch. An hourly
fetch only covers today and tomorrow, so entries beyond the fetched window are kept from the previous snapshot.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Iterable, Optional

from .db import ROOT
from .fsutil import atomic_write_text
from .records import day_of, from_json, iso_z, to_json
from .sources.base import MatchRecord

FIXTURE_DIR = ROOT / "data-cache" / "fixtures"


def _path(source: str, root: Optional[Path]) -> Path:
    return (root or FIXTURE_DIR) / f"{source}.json"


def load(source: str, root: Optional[Path] = None) -> list[MatchRecord]:
    try:
        return [from_json(d) for d in json.loads(_path(source, root).read_text())]
    except (OSError, ValueError, TypeError):
        return []


def store(source: str, fresh: Iterable[MatchRecord], window_end: date, root: Optional[Path] = None) -> list[MatchRecord]:
    """Replace the snapshot's entries up to `window_end` with `fresh`. An empty `fresh` changes nothing (no information).
    Returns the records now in force for this source."""
    fresh = [r for r in fresh if r.status in ("scheduled", "live")]
    old = load(source, root)
    if not fresh:
        return old
    kept = [r for r in old if day_of(r) > window_end]
    recs = sorted({(r.source_id): r for r in kept + fresh}.values(), key=lambda r: (iso_z(r.date), r.source_id))
    text = json.dumps([to_json(r) for r in recs], ensure_ascii=False, separators=(",", ":")) + "\n"
    p = _path(source, root)
    if not p.exists() or p.read_text() != text:
        atomic_write_text(p, text)
    return recs
