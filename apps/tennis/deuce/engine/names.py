"""Player-name normalisation shared by source dedupe, odds matching and the Baseline id match."""
from __future__ import annotations

import re
import unicodedata

_EXTRA = str.maketrans({"ø": "o", "Ø": "o", "ł": "l", "Ł": "l", "đ": "d", "Đ": "d", "ß": "ss", "æ": "ae", "Æ": "ae",
                        "œ": "oe", "Œ": "oe", "ı": "i", "þ": "th", "ð": "d"})
_NON = re.compile(r"[^a-z0-9]+")


def norm_name(name: str | None) -> str:
    """Lowercase, accents stripped, punctuation and hyphens to spaces, single spaces."""
    s = unicodedata.normalize("NFKD", (name or "").translate(_EXTRA))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return _NON.sub(" ", s).strip()


def name_key(name: str | None) -> str:
    """Order-free key: tokens sorted, so 'Fils Arthur' == 'Arthur Fils' and 'Carreno-Busta' == 'Carreno Busta'."""
    return " ".join(sorted(norm_name(name).split()))


def pair_key(tour: str, a: str | None, b: str | None) -> tuple:
    """Unordered pair key for a match: (tour, sorted(player keys))."""
    return (tour, *sorted((name_key(a), name_key(b))))
