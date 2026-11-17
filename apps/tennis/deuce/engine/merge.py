"""Turn MatchRecords from any number of sources into database rows.

1. Dedupe: same tour + same unordered player-key pair + dates within one day => one match (only across different
   sources). The most complete record wins; missing fields are filled from the others; every source id is kept.
2. Player identity: canonical key = tour + normalised sorted-token name, plus country to split true duplicates.
   Ids are `<source>:<source id>` of the first (highest-priority) source that knew the player.
3. Tournaments and match rows in the schema of CONTRACT.md.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, replace
from datetime import date, timedelta
from typing import Iterable, Optional

from . import surfaces
from .countries import norm_country, venue_country
from .espn import format_score
from .names import name_key, norm_name, pair_key
from .records import completeness, day_of, flip, is_final, iso_z
from .sources.base import LEVELS, MatchRecord

# Lower is preferred when two records are equally complete, and decides which source names a player first.
SOURCE_PRIORITY = {"espn": 0, "livetennisapi": 1, "tennisapi": 2}
_FILL = ("round", "location", "court", "p1_rank", "p2_rank", "p1_country", "p2_country", "tournament_id",
         "tournament_start", "tournament_end", "stats")


def _prio(src: str) -> int:
    return SOURCE_PRIORITY.get(src, 9)


@dataclass
class Cluster:
    best: MatchRecord
    members: list[MatchRecord] = field(default_factory=list)   # aligned to best's orientation, best included


def dedupe(records: Iterable[MatchRecord]) -> list[Cluster]:
    ordered = sorted(records, key=lambda r: (iso_z(r.date), _prio(r.source), r.source, r.source_id))
    groups: dict[tuple, list[list[MatchRecord]]] = {}
    for r in ordered:
        clusters = groups.setdefault(pair_key(r.tour, r.p1_name, r.p2_name), [])
        for c in reversed(clusters):
            if abs((day_of(r) - day_of(c[0])).days) <= 1 and all(m.source != r.source for m in c):
                c.append(r)
                break
        else:
            clusters.append([r])
    out: list[Cluster] = []
    for clusters in groups.values():
        for c in clusters:
            best = max(c, key=lambda r: (completeness(r), -_prio(r.source)))
            bk = name_key(best.p1_name)
            members = [best] + [m if name_key(m.p1_name) == bk else flip(m) for m in c if m is not best]
            fills: dict = {}
            for m in members[1:]:
                for f in _FILL:
                    if getattr(best, f) is None and f not in fills and getattr(m, f) is not None:
                        fills[f] = getattr(m, f)
                if m.surface and (best.surface is None or (best.surface_inferred and not m.surface_inferred)) \
                        and "surface" not in fills:
                    fills["surface"], fills["surface_inferred"] = m.surface, m.surface_inferred
            if fills:
                best = replace(best, **fills)
                members[0] = best
            out.append(Cluster(best, members))
    out.sort(key=lambda c: (iso_z(c.best.date), c.best.source, c.best.source_id))
    return out


# ------------------------------------------------------------------ players
@dataclass
class _P:
    id: str
    name: str
    country: Optional[str]
    tour: str
    prio: int
    sids: dict = field(default_factory=dict)   # source -> source id


class Identity:
    def __init__(self) -> None:
        self.by_key: dict[tuple, list[_P]] = {}
        self.by_sid: dict[tuple, _P] = {}
        self.ids: set[str] = set()

    def resolve(self, tour: str, name: str, country: Optional[str], source: str, sid: Optional[str]) -> _P:
        if sid and (source, sid) in self.by_sid:
            p = self.by_sid[(source, sid)]
        else:
            key = (tour, name_key(name))
            ck = norm_country(country) if country else None
            p = None
            for cand in self.by_key.get(key, []):
                cck = norm_country(cand.country) if cand.country else None
                if ck and cck and ck != cck:
                    continue                      # same name, different country: a different player
                if sid and cand.sids.get(source) not in (None, sid):
                    continue                      # same source already knows another player under this name
                p = cand
                break
            if p is None:
                base = f"{source}:{sid}" if sid else f"{source}:n-{re.sub(r'[^a-z0-9]+', '-', name_key(name))}"
                pid, n = base, 1
                while pid in self.ids:
                    n += 1
                    pid = f"{base}-{n}"
                p = _P(pid, name, country, tour, _prio(source))
                self.ids.add(pid)
                self.by_key.setdefault(key, []).append(p)
        if sid:
            p.sids.setdefault(source, sid)
            self.by_sid[(source, sid)] = p
        if country and not p.country:
            p.country = country
        if _prio(source) < p.prio:
            p.name, p.prio = name, _prio(source)
        return p


# ------------------------------------------------------------------ rows
def match_id_for(r: MatchRecord) -> str:
    return r.source_id if r.source == "espn" else f"{r.source}-{r.source_id}"


def _tournament_id(r: MatchRecord) -> str:
    if r.tournament_id:
        return r.tournament_id if r.source == "espn" else f"{r.source}-{r.tournament_id}"
    slug = re.sub(r"[^a-z0-9]+", "-", (r.tournament or "").lower()).strip("-")
    return f"{r.source}-{slug}-{r.date[:7]}-{r.tour.lower()}"


def _score(r: MatchRecord) -> Optional[str]:
    if r.status == "walkover":
        return "w/o"
    if r.status in ("final", "retired"):
        return format_score(r.sets, r.winner == 1, "ret." if r.status == "retired" else "")
    if r.status == "live":
        return format_score(r.sets, None)
    return None


@dataclass
class Resolved:
    players: list[dict]
    tournaments: list[dict]
    matches: list[dict]
    ranks: list[tuple]
    sources: list[tuple]
    stats: dict


TOURNAMENT_GAP_DAYS = 10


def _anchor(c: Cluster) -> MatchRecord:
    """The member that names the match: fixed source priority, so ids don't change when a final arrives elsewhere."""
    return min(c.members, key=lambda m: (_prio(m.source), m.source, m.source_id))


def resolve(records: Iterable[MatchRecord], stale_before: Optional[str] = None) -> Resolved:
    """`stale_before` (ISO): drop matches that are still not final and started before it."""
    clusters = [c for c in dedupe(records)
                if not (stale_before and not is_final(c.best) and iso_z(c.best.date) < stale_before)]
    ident = Identity()
    # Players are named by the highest-priority source first, so ids don't depend on processing order.
    for c in sorted(clusters, key=lambda c: (_prio(c.best.source), iso_z(c.best.date), c.best.source_id)):
        b = c.best
        for m in c.members:
            ident.resolve(b.tour, m.p1_name, m.p1_country, m.source, m.p1_source_id)
            ident.resolve(b.tour, m.p2_name, m.p2_country, m.source, m.p2_source_id)
    tournaments: dict[str, dict] = {}
    groups: dict[tuple, list[dict]] = {}     # (tour, normalised name) -> [{id, lo, hi}]: one event, several source ids
    matches, ranks, srcs = [], [], []
    ordered = sorted(clusters, key=lambda c: (_prio(_anchor(c).source), iso_z(c.best.date), c.best.source_id))
    for c in ordered:
        b = c.best
        anchor = _anchor(c)
        p1 = ident.resolve(b.tour, b.p1_name, b.p1_country, b.source, b.p1_source_id)
        p2 = ident.resolve(b.tour, b.p2_name, b.p2_country, b.source, b.p2_source_id)
        if p1.id == p2.id:
            continue
        mid = match_id_for(anchor)
        start = iso_z(b.date)
        year = int(start[:4])
        day = date.fromisoformat(start[:10])
        lo = date.fromisoformat(b.tournament_start) if b.tournament_start else day
        hi = date.fromisoformat(b.tournament_end) if b.tournament_end else day
        level = b.level if b.level in LEVELS else surfaces.guess_level(b.tournament, b.tour, year=year)
        if b.surface:
            surface, inferred = b.surface, bool(b.surface_inferred)
        else:
            surface, inferred = surfaces.guess_surface(b.tournament, b.tour, year, b.location)
        gkey = (b.tour, norm_name(b.tournament))
        grp = next((g for g in groups.get(gkey, [])
                    if g["lo"] - timedelta(days=TOURNAMENT_GAP_DAYS) <= day <= g["hi"] + timedelta(days=TOURNAMENT_GAP_DAYS)), None)
        if grp is None:
            tid = _tournament_id(anchor)
            while tid in tournaments:
                tid += "x"
            grp = {"id": tid, "lo": lo, "hi": hi}
            groups.setdefault(gkey, []).append(grp)
            tournaments[tid] = {
                "id": tid, "name": b.tournament, "tour": b.tour, "start_date": lo.isoformat(), "end_date": hi.isoformat(),
                "location": b.location, "country": venue_country(b.location), "surface": surface,
                "surface_inferred": int(inferred), "level": level}
        else:
            grp["lo"], grp["hi"] = min(grp["lo"], lo), max(grp["hi"], hi)
            t = tournaments[grp["id"]]
            t["start_date"], t["end_date"] = grp["lo"].isoformat(), grp["hi"].isoformat()
            if t["surface_inferred"] and not inferred:
                t["surface"], t["surface_inferred"] = surface, 0
            if not t["location"] and b.location:
                t["location"], t["country"] = b.location, venue_country(b.location)
        tid = grp["id"]
        winner = p1.id if b.winner == 1 else p2.id if b.winner == 2 else None
        if b.status in ("final", "retired", "walkover") and winner is None:
            continue
        matches.append({
            "id": mid, "tournament_id": tid, "tour": b.tour, "round": b.round, "date": start, "status": b.status,
            "p1_id": p1.id, "p2_id": p2.id, "winner_id": winner, "score": _score(b),
            "sets_json": None if (not b.sets or b.status == "walkover") else json.dumps(b.sets),
            "best_of": b.best_of or 3, "court": b.court})
        if b.p1_rank or b.p2_rank:
            ranks.append((mid, b.p1_rank, b.p2_rank))
        for m in c.members:
            srcs.append((mid, m.source, m.source_id))
    used = {m["p1_id"] for m in matches} | {m["p2_id"] for m in matches}
    players = [{"id": p.id, "name": p.name, "country": p.country, "tour": p.tour}
               for ps in ident.by_key.values() for p in ps if p.id in used]
    n_merged = sum(1 for c in clusters if len(c.members) > 1)
    return Resolved(players, list(tournaments.values()), matches, ranks, srcs,
                    {"records": sum(len(c.members) for c in clusters), "matches": len(matches),
                     "merged_across_sources": n_merged, "tournaments": len(tournaments)})
