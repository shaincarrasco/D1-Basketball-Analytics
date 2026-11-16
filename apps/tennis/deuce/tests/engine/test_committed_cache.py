"""Guard: the committed match cache holds only real provider records (no test fixtures leaking into git)."""
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KNOWN_SOURCES = {"espn", "livetennisapi", "tennisapi"}


def test_committed_cache_has_only_real_sources():
    files = sorted((ROOT / "data-cache" / "matches").glob("*/*.jsonl.gz"))
    bad = []
    for f in files:
        with gzip.open(f, "rt", encoding="utf-8") as fh:
            for n, line in enumerate(fh, 1):
                if not line.strip():
                    continue
                r = json.loads(line)
                if r.get("source") not in KNOWN_SOURCES or "Foo" in r.get("tournament", ""):
                    bad.append(f"{f.relative_to(ROOT)}:{n} source={r.get('source')!r} {r.get('p1_name')} v {r.get('p2_name')}")
    assert not bad, "test or unknown records in the committed cache:\n" + "\n".join(bad[:20])
