"""Historical closing odds from tennis-data.co.uk (free xlsx/xls/csv) -> compact committed extracts -> `odds` table.

    python -m engine.odds_history [--years 2023-2026] [--dir data/odds_import] [--no-download] [--weekly]

Downloaded and hand-dropped files are reduced to the columns we use and stored as `data-cache/odds/tennis-data/
{atp|wta}-{year}.csv.gz` (~50-100 KB each; a manifest records when each was fetched). `engine.update` re-applies
the extracts to a fresh database on every run, so CI needs no raw files. `--weekly` skips the network when this
year's files were fetched in the last 7 days. Odds records from key-based sources (OddsPapi) live beside them in
`data-cache/odds/records/<source>.jsonl.gz` and are matched the same way.

Files: ATP http://www.tennis-data.co.uk/{Y}/{Y}.xlsx, WTA http://www.tennis-data.co.uk/{Y}w/{Y}.xlsx (older years .xls).
When the host is unreachable, drop the files into data/odds_import/ (any name; a 'w' after the year or 'wta' in the
file name marks WTA, otherwise a 'WTA' column or ATP is assumed). Needs openpyxl (xlsx) / xlrd (xls) for Excel files.

Matching: same tour, our finished matches within +-2 days of the file's date, both players matched by
surname + first initial, and the winner must agree. Odds are stored as source 'tennis-data', book
pinnacle (fallback avg, then bet365), fetched_at = the match date (closing price).
"""
from __future__ import annotations

import argparse
import gzip
import io
import json
import re
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

import httpx
import numpy as np
import pandas as pd

from .db import ROOT, connect
from .fsutil import atomic_write_bytes, atomic_write_text
from .names import pair_key
from .odds import _ascii

SOURCE = "tennis-data"
ODDS_DIR = ROOT / "data-cache" / "odds"
EXTRACT_DIR = ODDS_DIR / "tennis-data"
RECORDS_DIR = ODDS_DIR / "records"
MANIFEST = ODDS_DIR / "manifest.json"
KEEP_COLS = ("Date", "Tournament", "Round", "Winner", "Loser", "Comment", "PSW", "PSL", "AvgW", "AvgL", "B365W", "B365L")
STALE_DAYS = 7
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
    n = path.name.lower().split(".")[0]
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
    if path.name.lower().endswith(".csv.gz"):
        df = pd.read_csv(path, encoding="utf-8", parse_dates=["Date"])
    elif suf == ".csv":
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


# ------------------------------------------------------------------ compact extracts
def _gz_bytes(text: str) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0, compresslevel=9) as gz:
        gz.write(text.encode("utf-8"))
    return buf.getvalue()


def write_extract(df: pd.DataFrame, tour: str, year: int, extract_dir: Path | None = None) -> Path:
    """Reduce a tennis-data frame to the columns we use and store it as {tour}-{year}.csv.gz (deterministic bytes)."""
    d = df.copy()
    d["Date"] = pd.to_datetime(d["Date"], errors="coerce", dayfirst=True)
    d = d[d["Date"].notna()]
    cols = [c for c in KEEP_COLS if c in d.columns]
    d = d[cols].sort_values(["Date", "Winner", "Loser"], kind="mergesort")
    d["Date"] = d["Date"].dt.strftime("%Y-%m-%d")
    for c in cols:
        if c.endswith(("W", "L")) and c not in ("Winner", "Loser"):
            d[c] = pd.to_numeric(d[c], errors="coerce").round(3)
    extract_dir = extract_dir or EXTRACT_DIR
    extract_dir.mkdir(parents=True, exist_ok=True)
    path = extract_dir / f"{tour.lower()}-{year}.csv.gz"
    data = _gz_bytes(d.to_csv(index=False))
    if not path.exists() or path.read_bytes() != data:
        atomic_write_bytes(path, data)
    return path


def load_manifest() -> dict:
    try:
        return json.loads(MANIFEST.read_text())
    except (OSError, ValueError):
        return {}


def save_manifest(m: dict) -> None:
    if not m and not MANIFEST.exists():
        return
    atomic_write_text(MANIFEST, json.dumps(m, indent=1, sort_keys=True) + "\n")


# ------------------------------------------------------------------ download
BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def url_candidates(tour: str, year: int) -> list[str]:
    folder = f"{year}w" if tour == "WTA" else f"{year}"
    return [f"http://www.tennis-data.co.uk/{folder}/{year}.xlsx", f"http://www.tennis-data.co.uk/{folder}/{year}.xls"]


def _looks_like_excel(b: bytes) -> bool:
    return b[:2] == b"PK" or b[:4] == b"\xd0\xcf\x11\xe0"   # xlsx (zip) or legacy xls (OLE)


def fetch_excel(tour: str, year: int, client: httpx.Client | None = None, retries: int = 3) -> tuple[bytes, str] | None:
    """Download one yearly file. Tries http then https for .xlsx then .xls, with retries and a browser User-Agent
    (the site rejects some default client strings). Returns (bytes, suffix) or None when unreachable."""
    own = client is None
    client = client or httpx.Client(timeout=45, follow_redirects=True, headers={"User-Agent": BROWSER_UA})
    tried: list[str] = []   # what each URL returned, printed when nothing usable came back
    try:
        for url in url_candidates(tour, year):
            for u in (url, url.replace("http://", "https://")):
                for attempt in range(retries):
                    try:
                        r = client.get(u)
                    except httpx.HTTPError as err:
                        tried.append(f"{u} -> {type(err).__name__}")
                        time.sleep(1.5 * (attempt + 1))
                        continue
                    if r.status_code == 200 and len(r.content) > 2000 and _looks_like_excel(r.content):
                        return r.content, Path(url).suffix
                    tried.append(f"{u} -> HTTP {r.status_code}, {r.headers.get('content-type', '?')}, {len(r.content)} bytes")
                    if r.status_code in (403, 404):
                        break   # won't change on retry; try the next URL
                    time.sleep(1.5 * (attempt + 1))
        for line in dict.fromkeys(tried):   # de-duplicated, in order
            print(f"    {tour} {year}: {line}")
        return None
    finally:
        if own:
            client.close()


def excel_frame(content: bytes, suffix: str) -> pd.DataFrame:
    df = pd.read_excel(io.BytesIO(content), engine="openpyxl" if suffix == ".xlsx" else "xlrd")
    df.columns = [str(c).strip() for c in df.columns]
    return df


def download(tour: str, year: int, dest_dir: Path, refresh: bool = False) -> Path | None:
    """Download one file into dest_dir as '{tour}_{year}.xlsx|xls'; None when unreachable."""
    for ext in (".xlsx", ".xls"):
        existing = dest_dir / f"{tour.lower()}_{year}{ext}"
        if existing.exists() and not refresh:
            return existing
    got = fetch_excel(tour, year)
    if got is None:
        return None
    dest = dest_dir / f"{tour.lower()}_{year}{got[1]}"
    dest.write_bytes(got[0])
    return dest


def parse_years(spec: str) -> list[int]:
    if "-" in spec:
        a, b = spec.split("-")
        return list(range(int(a), int(b) + 1))
    return [int(x) for x in spec.split(",")]


def _is_fresh(manifest: dict, key: str, today: date) -> bool:
    f = (manifest.get(SOURCE) or {}).get(key, {}).get("fetched")
    return bool(f) and (today - date.fromisoformat(f)).days < STALE_DAYS


def refresh_extracts(years: list[int], extract_dir: Path, weekly: bool, verbose: bool = True) -> dict[str, str]:
    """Download missing years once, and this year's file again when stale (every run, or weekly with --weekly)."""
    today = datetime.now(timezone.utc).date()
    manifest, status = load_manifest(), {}
    for y in years:
        for tour in ("ATP", "WTA"):
            key = f"{tour.lower()}-{y}"
            have = (extract_dir / f"{key}.csv.gz").exists()
            if have and y < today.year:
                continue
            if have and weekly and _is_fresh(manifest, key, today):
                status[key] = "fresh"
                continue
            got = fetch_excel(tour, y)
            if got is None:
                status[key] = "unreachable" if not have else "kept old"
                if verbose:
                    print(f"  {tour} {y}: not available ({status[key]})")
                continue
            df = excel_frame(*got)
            write_extract(df, tour, y, extract_dir)
            manifest.setdefault(SOURCE, {})[key] = {"fetched": today.isoformat(), "rows": int(len(df))}
            status[key] = "ok"
            if verbose:
                print(f"  {tour} {y}: ok, {len(df)} rows")
    save_manifest(manifest)
    return status


def _apply_files(conn, files: list[Path], verbose: bool) -> dict[str, Any]:
    our = load_our_matches(conn)
    index = NameIndex(conn.execute("SELECT id, name FROM players").fetchall())
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
    return total


# ------------------------------------------------------------------ odds records from key-based sources
def store_odds_records(source: str, recs: list, root: Path | None = None) -> int:
    """Merge OddsRecords into data-cache/odds/records/<source>.jsonl.gz (deduped, deterministic). Returns new count."""
    from dataclasses import asdict
    root = root or RECORDS_DIR
    path = root / f"{source}.jsonl.gz"
    rows: dict[tuple, dict] = {}
    if path.exists():
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    d = json.loads(line)
                    rows[(d["date"], d["tour"], d["p1_name"], d["p2_name"], d["book"], d["fetched_at"])] = d
    before = len(rows)
    for r in recs:
        d = {k: v for k, v in asdict(r).items() if v is not None}
        rows[(d["date"], d["tour"], d["p1_name"], d["p2_name"], d["book"], d["fetched_at"])] = d
    lines = [json.dumps(rows[k], ensure_ascii=False, separators=(",", ":")) for k in sorted(rows)]
    data = _gz_bytes("\n".join(lines) + "\n")
    if not path.exists() or path.read_bytes() != data:
        atomic_write_bytes(path, data)
    return len(rows) - before


def apply_odds_records(conn, root: Path | None = None) -> dict[str, int]:
    """Match stored OddsRecords to our matches (tour + player-key pair + start date within a day) and insert."""
    root = root or RECORDS_DIR
    files = sorted(root.glob("*.jsonl.gz")) if root.exists() else []
    if not files:
        return {}
    ours: dict[tuple, list[tuple]] = {}
    for mid, tour, date_, a, b, pa, pb in conn.execute(
            "SELECT m.id, m.tour, m.date, m.p1_id, m.p2_id, a.name, b.name FROM matches m "
            "JOIN players a ON a.id=m.p1_id JOIN players b ON b.id=m.p2_id"):
        ours.setdefault(pair_key(tour, pa, pb), []).append((mid, date_, pa))
    out: dict[str, int] = {}
    from .names import name_key
    for f in files:
        src, n = f.name.split(".")[0], 0
        conn.execute("DELETE FROM odds WHERE source=?", (src,))
        with gzip.open(f, "rt", encoding="utf-8") as fh:
            for line in fh:
                if not line.strip():
                    continue
                d = json.loads(line)
                try:
                    day = datetime.fromisoformat(d["date"].replace("Z", "+00:00")).date()
                except ValueError:
                    continue
                for mid, mdate, pa in ours.get(pair_key(d["tour"], d["p1_name"], d["p2_name"]), []):
                    if abs((datetime.fromisoformat(mdate.replace("Z", "+00:00")).date() - day).days) <= 1:
                        same = name_key(pa) == name_key(d["p1_name"])
                        o1, o2 = (d["p1_odds"], d["p2_odds"]) if same else (d["p2_odds"], d["p1_odds"])
                        conn.execute("INSERT INTO odds(match_id,source,book,p1_odds,p2_odds,fetched_at) VALUES(?,?,?,?,?,?)",
                                     (mid, src, d["book"], o1, o2, d["fetched_at"]))
                        n += 1
                        break
        out[src] = n
    conn.commit()
    return out


def apply_cached(conn, extract_dir: Path | None = None) -> dict[str, Any]:
    """Apply every committed extract and odds record to `conn` (idempotent). Cheap enough to run on every update."""
    extract_dir = extract_dir or EXTRACT_DIR
    files = sorted(extract_dir.glob("*.csv.gz")) if extract_dir.exists() else []
    res: dict[str, Any] = {"tennis_data_files": len(files)}
    if files:
        conn.execute("DELETE FROM odds WHERE source=?", (SOURCE,))
        conn.commit()
        t = _apply_files(conn, files, verbose=False)
        res.update(matched=t["matched"], rows_with_odds=t["rows_with_odds"], match_rate=round(t["match_rate"], 3))
    res["records"] = apply_odds_records(conn)
    return res


def run(years: list[int], folder: Path, do_download: bool = True, verbose: bool = True,
        extract_dir: Path | None = None, weekly: bool = False) -> dict[str, Any]:
    """Import odds. With `extract_dir` (the CLI default) files are downloaded into / read from the compact
    committed extracts; without it, files in `folder` are matched directly (tests, one-off imports)."""
    folder.mkdir(parents=True, exist_ok=True)
    if extract_dir is not None:
        if do_download:
            refresh_extracts(years, extract_dir, weekly, verbose)
        for f in sorted(p for p in folder.iterdir() if p.suffix.lower() in (".xlsx", ".xls", ".csv")):
            try:   # hand-dropped files join the compact cache so they survive without the raw file
                df = read_file(f)
                dts = pd.to_datetime(df.get("Date"), errors="coerce", dayfirst=True).dropna()
                if len(dts):
                    write_extract(df, detect_tour(f, df), int(dts.dt.year.mode().iloc[0]), extract_dir)
            except Exception as exc:  # noqa: BLE001
                print(f"  could not read {f.name}: {exc}")
        conn = connect()
        conn.execute("DELETE FROM odds WHERE source=?", (SOURCE,))
        conn.commit()
        files = sorted(extract_dir.glob("*.csv.gz"))
    else:
        if do_download:
            for y in years:
                for tour in ("ATP", "WTA"):
                    p = download(tour, y, folder, refresh=(y == date.today().year))
                    if verbose:
                        print(f"  {tour} {y}: {'ok ' + p.name if p else 'not available (host unreachable?)'}")
        conn = connect()
        # re-import starts clean for the imported years so stale/wrong earlier matches cannot survive
        conn.execute(f"DELETE FROM odds WHERE source=? AND substr(fetched_at,1,4) IN ({','.join('?' * len(years))})",
                     (SOURCE, *[str(y) for y in years]))
        conn.commit()
        files = sorted(p for p in folder.iterdir() if p.suffix.lower() in (".xlsx", ".xls", ".csv"))
    total = _apply_files(conn, files, verbose)
    if extract_dir is not None:
        total["records"] = apply_odds_records(conn)
    if not files and verbose:
        print(f"No odds files found. Put tennis-data.co.uk xlsx files in {folder} or let the download run.")
    return total


def main() -> None:
    ap = argparse.ArgumentParser(description="Import tennis-data.co.uk historical odds")
    ap.add_argument("--years", default=f"2023-{date.today().year}")
    ap.add_argument("--dir", default="data/odds_import", help="folder for hand-downloaded files")
    ap.add_argument("--no-download", action="store_true")
    ap.add_argument("--weekly", action="store_true", help="skip the download if this year's files are under 7 days old")
    a = ap.parse_args()
    d = Path(a.dir)
    d = d if d.is_absolute() else ROOT / d
    res = run(parse_years(a.years), d, not a.no_download, extract_dir=EXTRACT_DIR, weekly=a.weekly)
    print(f"matched {res['matched']} of {res['rows_with_odds']} rows with odds ({res['match_rate']:.1%}); "
          f"no_match {res['no_match']}, ambiguous {res['ambiguous']}")


if __name__ == "__main__":
    main()
