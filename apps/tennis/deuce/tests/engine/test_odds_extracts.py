"""tennis-data.co.uk download -> compact extract -> odds table, with the network mocked (CI has it, the sandbox does not)."""
import io
from datetime import date, datetime, timezone

import httpx
import pandas as pd
import pytest

from engine import odds_history as oh
from test_odds_history import ATP_ROWS, _db

pytest.importorskip("openpyxl")


def xlsx_bytes(df):
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    return buf.getvalue()


def client(files):
    def handler(req):
        body = files.get(str(req.url))
        return httpx.Response(200, content=body) if body else httpx.Response(404)
    return httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=True)


def test_fetch_excel_tries_urls_and_validates_content():
    data = xlsx_bytes(ATP_ROWS.assign(pad="x" * 5000))
    got = oh.fetch_excel("ATP", 2025, client({"https://www.tennis-data.co.uk/2025/2025.xlsx": data}), retries=1)
    assert got and got[1] == ".xlsx"                                  # http 404 -> https works
    assert oh.fetch_excel("ATP", 2025, client({"http://www.tennis-data.co.uk/2025/2025.xlsx": b"<html>blocked</html>" * 200}), retries=1) is None
    assert oh.fetch_excel("WTA", 2025, client({}), retries=1) is None


def test_refresh_apply_roundtrip_and_weekly_skip(tmp_path, monkeypatch):
    monkeypatch.setattr(oh, "MANIFEST", tmp_path / "manifest.json")
    data = xlsx_bytes(ATP_ROWS.assign(pad="x" * 5000))
    calls = []
    real = oh.fetch_excel
    monkeypatch.setattr(oh, "fetch_excel", lambda tour, y, *a, **k: (calls.append((tour, y)), (data, ".xlsx") if tour == "ATP" else None)[1])
    ex = tmp_path / "td"
    year = datetime.now(timezone.utc).year
    st = oh.refresh_extracts([year], ex, weekly=True, verbose=False)
    assert st[f"atp-{year}"] == "ok" and st[f"wta-{year}"] == "unreachable"
    assert (ex / f"atp-{year}.csv.gz").stat().st_size < 3000        # compact: only the columns we use
    n = len(calls)
    st2 = oh.refresh_extracts([year], ex, weekly=True, verbose=False)   # fetched today: weekly mode doesn't hit the network for ATP
    assert st2[f"atp-{year}"] == "fresh" and calls[n:] == [("WTA", year)]
    # past years are downloaded once, then never again
    monkeypatch.setattr(oh, "fetch_excel", lambda *a, **k: pytest.fail("must not refetch a stored past year"))
    oh.write_extract(ATP_ROWS, "ATP", year - 1, ex)
    oh.write_extract(ATP_ROWS, "WTA", year - 1, ex)
    assert oh.refresh_extracts([year - 1], ex, weekly=False, verbose=False) == {}

    conn = _db()
    (ex / f"atp-{year}.csv.gz").rename(ex / "atp-2025.csv.gz")        # the fixture matches are dated 2025
    res = oh.apply_cached(conn, ex)
    assert res["matched"] >= 2 and res["tennis_data_files"] >= 2
    again = oh.apply_cached(conn, ex)                                   # idempotent
    assert conn.execute("SELECT COUNT(*) FROM odds WHERE source='tennis-data'").fetchone()[0] == again["matched"]
    # bytes are deterministic, so unchanged data means no git diff
    p = oh.write_extract(ATP_ROWS, "ATP", 2024, ex)
    b1 = p.read_bytes()
    assert oh.write_extract(ATP_ROWS, "ATP", 2024, ex).read_bytes() == b1
