"""Open-Meteo geocoding + hourly forecast at match time, cached on disk.

`get_weather(tournament, match_iso)` returns
    {"temp_c", "humidity", "wind_kph", "precip_mm", "summary"} or None.
It never raises: indoor events, matches in the past or >14 days ahead, geocoding
misses, HTTP errors (including 429) and bad payloads all give None.
Only the forecast endpoint is used (no archive); past matches are skipped.
"""
from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import httpx

from .config import REPO_ROOT

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
FORECAST_TTL_S = 3 * 3600
NEGATIVE_TTL_S = 15 * 60
MIN_INTERVAL_S = 0.4
MAX_DAYS_AHEAD = 14
LIVE_GRACE_H = 3

_last_call = 0.0


def default_cache_dir() -> Path:
    return REPO_ROOT / "data" / "cache" / "weather"


def _parse_iso(s: str) -> Optional[datetime]:
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _cache_path(cache_dir: Path, kind: str, key: str) -> Path:
    h = hashlib.md5(key.encode()).hexdigest()[:16]
    return cache_dir / f"{kind}_{h}.json"


def _read_cache(path: Path, ttl: Optional[float], now_ts: float):
    try:
        d = json.loads(path.read_text())
    except Exception:
        return None
    if ttl is not None and now_ts - float(d.get("_ts", 0)) > ttl:
        return None
    return d


def _write_cache(path: Path, data: dict, now_ts: float) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({**data, "_ts": now_ts}))
    except Exception:
        pass


def _get(client: httpx.Client, url: str, params: dict) -> Optional[dict]:
    global _last_call
    wait = MIN_INTERVAL_S - (time.monotonic() - _last_call)
    if wait > 0:
        time.sleep(wait)
    _last_call = time.monotonic()
    r = client.get(url, params=params)
    if r.status_code == 429:
        raise _RateLimited()
    r.raise_for_status()
    return r.json()


class _RateLimited(Exception):
    pass


def geocode(location: str, country: Optional[str], client: httpx.Client, cache_dir: Path, now_ts: float):
    """'Montevideo, Uruguay' -> (lat, lon) or None."""
    if not location:
        return None
    city = location.split(",")[0].strip()
    key = f"{city.lower()}|{(country or '').lower()}|{location.lower()}"
    path = _cache_path(cache_dir, "geo", key)
    cached = _read_cache(path, None, now_ts)
    if cached is not None:
        return (cached["lat"], cached["lon"]) if cached.get("lat") is not None else None
    data = _get(client, GEOCODE_URL, {"name": city, "count": 5, "language": "en", "format": "json"})
    results = (data or {}).get("results") or []
    want = {x.strip().lower() for x in [country or "", *location.split(",")[1:]] if x and x.strip()}
    best = None
    for r in results:
        names = {str(r.get("country", "")).lower(), str(r.get("country_code", "")).lower()}
        if want & names:
            best = r
            break
    best = best or (results[0] if results else None)
    if not best:
        _write_cache(path, {"lat": None, "lon": None}, now_ts)
        return None
    _write_cache(path, {"lat": best["latitude"], "lon": best["longitude"]}, now_ts)
    return best["latitude"], best["longitude"]


def summarize(temp_c: float, humidity: float, wind_kph: float, precip_mm: float) -> str:
    parts = []
    if temp_c > 30:
        parts.append("Hot")
    elif temp_c >= 24:
        parts.append("Warm")
    elif temp_c >= 14:
        parts.append("Mild")
    elif temp_c >= 6:
        parts.append("Cool")
    else:
        parts.append("Cold")
    if humidity > 80 and temp_c >= 24:
        parts[0] += " and humid"
    extras = []
    if precip_mm >= 1.0:
        extras.append("wet")
    elif precip_mm >= 0.3:
        extras.append("damp")
    if wind_kph > 25:
        extras.append("windy")
    elif wind_kph > 15:
        extras.append("breezy")
    if extras:
        return parts[0] + ", " + " and ".join(extras)
    return parts[0] + (", light wind" if wind_kph <= 15 else "")


def _forecast(lat: float, lon: float, client: httpx.Client, cache_dir: Path, now_ts: float) -> Optional[dict]:
    key = f"{lat:.2f},{lon:.2f}"
    path = _cache_path(cache_dir, "fc", key)
    cached = _read_cache(path, FORECAST_TTL_S, now_ts)
    if cached is not None:
        return cached
    neg = _read_cache(_cache_path(cache_dir, "neg", key), NEGATIVE_TTL_S, now_ts)
    if neg is not None:
        return None
    try:
        data = _get(client, FORECAST_URL, {
            "latitude": lat, "longitude": lon,
            "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation",
            "wind_speed_unit": "kmh", "timezone": "UTC", "forecast_days": 16,
        })
    except _RateLimited:
        _write_cache(_cache_path(cache_dir, "neg", key), {"rate_limited": True}, now_ts)
        return None
    if not data or "hourly" not in data:
        return None
    _write_cache(path, data, now_ts)
    return data


def get_weather(tournament: dict, match_iso: str, now: Optional[datetime] = None,
                client: Optional[httpx.Client] = None, cache_dir: Optional[Path] = None) -> Optional[dict]:
    try:
        if not tournament or tournament.get("surface") == "Indoor Hard":
            return None
        when = _parse_iso(match_iso)
        if when is None:
            return None
        now = now or datetime.now(timezone.utc)
        if when < now - timedelta(hours=LIVE_GRACE_H) or when > now + timedelta(days=MAX_DAYS_AHEAD):
            return None
        location = tournament.get("location") or ""
        if not location:
            return None
        cache_dir = Path(cache_dir) if cache_dir else default_cache_dir()
        own = client is None
        client = client or httpx.Client(timeout=10.0, headers={"User-Agent": "tennis-brain-free/0.1"})
        try:
            now_ts = now.timestamp()
            coords = geocode(location, tournament.get("country"), client, cache_dir, now_ts)
            if not coords:
                return None
            data = _forecast(coords[0], coords[1], client, cache_dir, now_ts)
            if not data:
                return None
            return _extract(data["hourly"], when)
        finally:
            if own:
                client.close()
    except Exception:
        return None


def _extract(hourly: dict, when: datetime) -> Optional[dict]:
    times = hourly.get("time") or []
    parsed = [(_parse_iso(t), i) for i, t in enumerate(times)]
    parsed = [(d, i) for d, i in parsed if d is not None]
    if not parsed:
        return None
    _, idx = min(parsed, key=lambda x: abs((x[0] - when).total_seconds()))

    def at(name):
        arr = hourly.get(name) or []
        return arr[idx] if idx < len(arr) and arr[idx] is not None else None

    t, h, w = at("temperature_2m"), at("relative_humidity_2m"), at("wind_speed_10m")
    if t is None or h is None or w is None:
        return None
    prec = hourly.get("precipitation") or []
    window = [p for p in prec[idx:idx + 3] if p is not None]
    p = round(sum(window), 1) if window else 0.0
    return {"temp_c": round(float(t), 1), "humidity": int(round(h)), "wind_kph": int(round(w)),
            "precip_mm": p, "summary": summarize(float(t), float(h), float(w), p)}
