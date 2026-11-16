"""Import historical closing odds from tennis-data.co.uk (free xlsx/xls/csv) into the `odds` table.

    python -m engine.odds_history [--years 2023-2026] [--dir data/odds_import] [--no-download]

Files: ATP http://www.tennis-data.co.uk/{Y}/{Y}.xlsx, WTA http://www.tennis-data.co.uk/{Y}w/{Y}.xlsx (older years .xls).
When the host is unreachable, drop the files into data/odds_import/ (any name; a 'w' after the year or 'wta' in the
file name marks WTA, otherwise a 'WTA' column or ATP is assumed). Needs openpyxl (xlsx) / xlrd (xls) for Excel files.

Matching: same tour, our finished matches within +-2 days of the file's date, both players matched by
surname + first initial, and the winner must agree. Odds are stored as source 'tennis-data', book
pinnacle (fallback avg, then bet365), fetched_at = the match date (closing price).
"""
from __future__ import annotations

import argparse
import re
from datetime import timedelta
from pathlib import Path
from typing import Any, Iterable

import httpx
import numpy as np
import pandas as pd

from .db import ROOT, connect
from .odds import _ascii

SOURCE = "tennis-data"
WINDOW_DAYS = 2  # tennis-data dates are exact match dates; +-2 days only absorbs UTC/local differences
BOOKS = (("pinnacle", "PSW", "PSL"), ("avg", "AvgW", "AvgL"), ("bet365", "B365W", "B365L"))
_INITIALS = re.compile(r"^(?:[A-Za-z]\.?)+$")


# ------------------------------------------------------------------ names
def parse_short_name(short: str) -> tuple[str, str] | None:
    """'Sinner J.' -> ('sinner','j'); 'De Minaur A.' -> ('de minaur','a'); 'Carreno Busta P.' -> ('carreno busta','p')."""
    if not isinstance(short, str):
        return None
    toks = short.replace(".", ". ").split()
    if len(toks) < 2:
        return None
    init_toks: list[str] = []
    while len(toks) > 1 and _INITIALS.match(toks[-1]) and (len(toks[-1].replace(".", "")) <= 3):
        init_toks.insert(0, toks.pop())
    if not init_toks:
        return None
    surname = _ascii(" ".join(toks))
    initial = _ascii(init_toks[0])[:1]
    return (surname, initial) if surname and initial else None


def name_keys(full_name: str) -> set[tuple[str, str]]:
    """All (surname, first-initial) keys a full name could map to (every given/surname split)."""
    toks = _ascii(full_name).split()
    keys = set()
    for k in range(1, len(toks)):
        keys.add((" ".join(toks[k:]), toks[0][:1]))
    return keys


class NameIndex:
    """(surname, initial) -> player ids, built from our players table."""

    def __init__(self, players: Iterable[tuple[str, str]]):
        self.idx: dict[tuple[str, str], set[str]] = {}
        for pid, name in players:
            for k in name_keys(name or ""):
                self.idx.setdefault(k, set()).add(pid)

    def lookup(self, short: str) -> set[str]:
        key = parse_short_name(short)
        return set(self.idx.get(key, ())) if key else set()


# ------------------------------------------------------------------ reading files
def detect_tour(path: Path, df: pd.DataFrame | None = None) -> str:
    n = path.stem.lower()
    if "wta" in n or re.search(r"\d{4}w$", n) or n.endswith("_w"):
        return "WTA"
    if "atp" in n:
        return "ATP"
    if df is not None and "WTA" in df.columns and "ATP" not in df.columns:
        return "WTA"
    return "ATP"


def read_file(path: Path) -> pd.DataFrame:
    """Read an xlsx/xls/csv file of tennis-data rows."""
    suf = path.suffix.lower()
    if suf == ".csv":
        df = pd.read_csv(path, encoding="latin-1")
    elif suf == ".xlsx":
        df = pd.read_excel(path, engine="openpyxl")
    elif suf == ".xls":
        df = pd.read_excel(path, engine="xlrd")
    else:
        raise ValueError(f"unsupported file type: {path}")
    df.columns = [str(c).strip() for c in df.columns]
    return df


def pick_odds(row: pd.Series) -> tuple[float, float, str] | None:
    """Best available (winner_odds, loser_odds, book) for a row: pinnacle, then average, then bet365."""
    for book, cw, cl in BOOKS:
        if cw in row.index and cl in row.index:
            w, l = pd.to_numeric(row[cw], errors="coerce"), pd.to_numeric(row[cl], errors="coerce")
            if pd.notna(w) and pd.notna(l) and w > 1.0 and l > 1.0:
                return float(w), float(l), book
    return None


# ------------------------------------------------------------------ matching
def match_rows(td: pd.DataFrame, tour: str, our: pd.DataFrame, index: NameIndex) -> tuple[list[dict], dict[str, Any]]:
    """Match tennis-data rows to our matches.

    `our` needs columns: id, tour, ts (datetime64 UTC), p1, p2, winner, date. Returns (odds rows, stats).
    """
    sub = our[our["tour"] == tour]
    by_pair: dict[frozenset, list[int]] = {}
    for i, (a, b) in enumerate(zip(sub["p1"].to_numpy(), sub["p2"].to_numpy())):
        by_pair.setdefault(frozenset((a, b)), []).append(i)
    ts_arr = sub["ts"].to_numpy()
    out: list[dict] = []
    st = {"rows": 0, "with_odds": 0, "matched": 0, "no_names": 0, "no_match": 0, "ambiguous": 0, "result_mismatch": 0, "unmatched": []}
    dates = pd.to_datetime(td.get("Date"), errors="coerce", dayfirst=True)
    order = np.argsort(dates.to_numpy(dtype="datetime64[ns]"), kind="stable")  # process rows in date order
    used: set[str] = set()
    for pos in order:
        row, d = td.iloc[pos], dates.iloc[pos]
        st["rows"] += 1
        po = pick_odds(row)
        if po is None or pd.isna(d):
            continue
        st["with_odds"] += 1
        wset, lset = index.lookup(row.get("Winner")), index.lookup(row.get("Loser"))
        label = f"{row.get('Winner')} v {row.get('Loser')} ({d.date()})"
        if not wset or not lset:
            st["no_names"] += 1
            if len(st["unmatched"]) < 8:
                st["unmatched"].append(label)
            continue
        d64 = np.datetime64(d.tz_localize(None) if d.tzinfo else d, "ns")
        cands: dict[int, str] = {}
        for a in wset:
            for b in lset:
                for i in by_pair.get(frozenset((a, b)), []):
                    gap = abs((ts_arr[i] - d64) / np.timedelta64(1, "D"))
                    if gap <= WINDOW_DAYS and sub.iloc[i]["id"] not in used:
                        cands[i] = a
        if not cands:
            st["no_match"] += 1
            if len(st["unmatched"]) < 8:
                st["unmatched"].append(label)
            continue
        if len(cands) > 1:  # more than one meeting fits the window: refuse to guess
            st["ambiguous"] += 1
            continue
        best, w_id = next(iter(cands.items()))
        m = sub.iloc[best]
        if m["winner"] != w_id:
            st["result_mismatch"] += 1
            continue
        wo, lo, book = po
        p1_odds, p2_odds = (wo, lo) if m["p1"] == w_id else (lo, wo)
        used.add(m["id"])
        out.append({"match_id": m["id"], "p1_odds": p1_odds, "p2_odds": p2_odds, "book": book, "fetched_at": m["date"]})
        st["matched"] += 1
    st["match_rate"] = st["matched"] / st["with_odds"] if st["with_odds"] else 0.0
    return out, st


def load_our_matches(conn) -> pd.DataFrame:
    df = pd.read_sql_query(
        "SELECT id, tour, date, p1_id AS p1, p2_id AS p2, winner_id AS winner FROM matches "
        "WHERE status IN('final','retired') AND winner_id IS NOT NULL", conn)
    df["ts"] = pd.to_datetime(df["date"], utc=True).dt.tz_localize(None)
    return df


def store(conn, rows: list[dict]) -> int:
    conn.executemany("DELETE FROM odds WHERE source=? AND match_id=?", [(SOURCE, r["match_id"]) for r in rows])
    conn.executemany("INSERT INTO odds(match_id,source,book,p1_odds,p2_odds,fetched_at) VALUES(?,?,?,?,?,?)",
                     [(r["match_id"], SOURCE, r["book"], r["p1_odds"], r["p2_odds"], r["fetched_at"]) for r in rows])
    conn.commit()
    return len(rows)


# ------------------------------------------------------------------ download
def url_candidates(tour: str, year: int) -> list[str]:
    folder = f"{year}w" if tour == "WTA" else f"{year}"
    return [f"http://www.tennis-data.co.uk/{folder}/{year}.xlsx", f"http://www.tennis-data.co.uk/{folder}/{year}.xls"]


def download(tour: str, year: int, dest_dir: Path, refresh: bool = False) -> Path | None:
    """Download one file into dest_dir as '{tour}_{year}.xlsx|xls'; None when unreachable."""
    for ext in (".xlsx", ".xls"):
        existing = dest_dir / f"{tour.lower()}_{year}{ext}"
        if existing.exists() and not refresh:
            return existing
    for url in url_candidates(tour, year):
        try:
            r = httpx.get(url, timeout=30, follow_redirects=True, headers={"User-Agent": "tennis-brain-free/0.1"})
            if r.status_code == 200 and len(r.content) > 2000:
                dest = dest_dir / f"{tour.lower()}_{year}{Path(url).suffix}"
                dest.write_bytes(r.content)
                return dest
        except httpx.HTTPError:
            continue
    return None


def parse_years(spec: str) -> list[int]:
    if "-" in spec:
        a, b = spec.split("-")
        return list(range(int(a), int(b) + 1))
    return [int(x) for x in spec.split(",")]


def run(years: list[int], folder: Path, do_download: bool = True, verbose: bool = True) -> dict[str, Any]:
    from datetime import date
    folder.mkdir(parents=True, exist_ok=True)
    if do_download:
        for y in years:
            for tour in ("ATP", "WTA"):
                p = download(tour, y, folder, refresh=(y == date.today().year))
                if verbose:
                    print(f"  {tour} {y}: {'ok ' + p.name if p else 'not available (host unreachable?)'}")
    conn = connect()
    our = load_our_matches(conn)
    index = NameIndex(conn.execute("SELECT id, name FROM players").fetchall())
    # re-import starts clean for the imported years so stale/wrong earlier matches cannot survive
    conn.execute(f"DELETE FROM odds WHERE source=? AND substr(fetched_at,1,4) IN ({','.join('?' * len(years))})",
                 (SOURCE, *[str(y) for y in years]))
    conn.commit()
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in (".xlsx", ".xls", ".csv"))
    total = {"files": 0, "rows_with_odds": 0, "matched": 0, "no_match": 0, "ambiguous": 0, "per_file": []}
    for f in files:
        try:
            df = read_file(f)
        except Exception as exc:  # noqa: BLE001
            total["per_file"].append({"file": f.name, "error": str(exc)})
            continue
        tour = detect_tour(f, df)
        rows, st = match_rows(df, tour, our, index)
        store(conn, rows)
        total["files"] += 1
        total["rows_with_odds"] += st["with_odds"]
        total["matched"] += st["matched"]
        total["no_match"] += st["no_match"] + st["no_names"]
        total["ambiguous"] += st["ambiguous"]
        total["per_file"].append({"file": f.name, "tour": tour, **{k: v for k, v in st.items() if k != "unmatched"},
                                  "unmatched_sample": st["unmatched"][:5]})
        if verbose:
            print(f"  {f.name} [{tour}]: {st['matched']}/{st['with_odds']} matched ({st['match_rate']:.1%})")
    total["match_rate"] = total["matched"] / total["rows_with_odds"] if total["rows_with_odds"] else 0.0
    if not files and verbose:
        print(f"No files found in {folder}. Download the xlsx files from tennis-data.co.uk and drop them there.")
    return total


def main() -> None:
    ap = argparse.ArgumentParser(description="Import tennis-data.co.uk historical odds")
    ap.add_argument("--years", default="2023-2026")
    ap.add_argument("--dir", default="data/odds_import")
    ap.add_argument("--no-download", action="store_true")
    a = ap.parse_args()
    d = Path(a.dir)
    d = d if d.is_absolute() else ROOT / d
    res = run(parse_years(a.years), d, not a.no_download)
    print(f"matched {res['matched']} of {res['rows_with_odds']} rows with odds ({res['match_rate']:.1%}); "
          f"no_match {res['no_match']}, ambiguous {res['ambiguous']}")


if __name__ == "__main__":
    main()
