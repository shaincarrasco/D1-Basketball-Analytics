"""Localhost write protection: Host check, JSON-only same-origin writes."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import make_demo_db
from app import server


@pytest.fixture
def demo(tmp_path, monkeypatch):
    monkeypatch.setenv("DEUCE_DB", str(tmp_path / "tennis.db"))
    monkeypatch.setenv("DEUCE_BACKTEST", str(tmp_path / "backtest.json"))
    monkeypatch.setenv("DEUCE_CONFIG", str(tmp_path / "config.toml"))
    monkeypatch.delenv("PORT", raising=False)
    make_demo_db.build(tmp_path / "tennis.db")
    return tmp_path


def client(base="http://127.0.0.1:8765"):
    return TestClient(server.app, base_url=base)


@pytest.mark.parametrize("base", ["http://127.0.0.1:8765", "http://localhost:8765"])
def test_local_hosts_allowed(demo, base):
    assert client(base).get("/api/matches").status_code == 200
    assert client(base).get("/").status_code == 200


@pytest.mark.parametrize("host", ["evil.example:8765", "127.0.0.1:9999", "localhost", "192.168.1.5:8765", ""])
def test_other_hosts_rejected(demo, host):
    r = client().get("/api/matches", headers={"host": host})
    assert r.status_code == 400
    r = client().post("/api/matches/mvd-qf-2/odds", json={"p1": 2, "p2": 2}, headers={"host": host})
    assert r.status_code == 400


def test_port_env_changes_allowed_host(demo, monkeypatch):
    monkeypatch.setenv("PORT", "9100")
    assert client("http://127.0.0.1:9100").get("/api/status").status_code == 200
    assert client().get("/api/status").status_code == 400


def test_post_requires_json(demo):
    r = client().post("/api/matches/mvd-qf-2/odds", content="p1=2&p2=2",
                      headers={"content-type": "application/x-www-form-urlencoded"})
    assert r.status_code == 403
    r = client().post("/api/matches/mvd-qf-2/odds", content='{"p1": 2, "p2": 2}', headers={"content-type": "text/plain"})
    assert r.status_code == 403


def test_post_same_origin_or_no_origin(demo):
    c = client()
    assert c.post("/api/matches/mvd-qf-2/odds", json={"p1": 2.1, "p2": 1.8}).status_code == 200
    for origin in ("http://127.0.0.1:8765", "http://localhost:8765"):
        assert c.post("/api/matches/mvd-qf-2/odds", json={"p1": 2.1, "p2": 1.8}, headers={"origin": origin}).status_code == 200


@pytest.mark.parametrize("origin", ["https://evil.example", "http://127.0.0.1:9999", "null", "http://localhost"])
def test_post_cross_origin_rejected(demo, origin):
    r = client().post("/api/matches/mvd-qf-2/odds", json={"p1": 2.1, "p2": 1.8}, headers={"origin": origin})
    assert r.status_code == 403
    # nothing was written
    hist = client().get("/api/matches/mvd-qf-2").json()["odds_history"]
    assert all(h["source"] != "manual" for h in hist)
