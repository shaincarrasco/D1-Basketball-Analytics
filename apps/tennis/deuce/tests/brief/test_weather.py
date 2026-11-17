from datetime import datetime, timedelta, timezone

import httpx

from brief import weather

NOW = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)
TOUR = {"name": "Montevideo Open", "surface": "Clay", "location": "Montevideo, Uruguay", "country": "Uruguay"}
WHEN = "2026-11-17T16:00:00Z"


def hourly():
    times = [(datetime(2026, 11, 16, tzinfo=timezone.utc) + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(48)]
    n = len(times)
    return {"time": times, "temperature_2m": [20.0] * n, "relative_humidity_2m": [85] * n,
            "wind_speed_10m": [30.0] * n, "precipitation": [0.2] * n}


def transport(calls, status=200):
    def h(req: httpx.Request):
        calls.append(req.url.host)
        if status != 200:
            return httpx.Response(status)
        if "geocoding" in req.url.host:
            return httpx.Response(200, json={"results": [
                {"latitude": 1.0, "longitude": 2.0, "country": "Spain", "country_code": "ES"},
                {"latitude": -34.9, "longitude": -56.2, "country": "Uruguay", "country_code": "UY"}]})
        return httpx.Response(200, json={"hourly": hourly()})
    return httpx.MockTransport(h)


def run(tmp_path, tour=TOUR, when=WHEN, status=200, calls=None):
    calls = [] if calls is None else calls
    weather._last_call = 0
    client = httpx.Client(transport=transport(calls, status))
    return weather.get_weather(tour, when, now=NOW, client=client, cache_dir=tmp_path), calls


def test_weather_ok_and_country_pick(tmp_path):
    w, calls = run(tmp_path)
    assert w == {"temp_c": 20.0, "humidity": 85, "wind_kph": 30, "precip_mm": 0.6, "summary": w["summary"]}
    assert "windy" in w["summary"]
    assert calls.count("geocoding-api.open-meteo.com") == 1


def test_cache_prevents_second_call(tmp_path):
    run(tmp_path)
    w, calls = run(tmp_path)
    assert w is not None and calls == []


def test_indoor_past_and_far_future_skipped(tmp_path):
    assert run(tmp_path, tour={**TOUR, "surface": "Indoor Hard"})[0] is None
    assert run(tmp_path, when="2026-11-10T10:00:00Z")[0] is None
    assert run(tmp_path, when="2026-12-20T10:00:00Z")[0] is None
    _, calls = run(tmp_path, when="2026-12-20T10:00:00Z")
    assert calls == []


def test_429_returns_none_and_is_negative_cached(tmp_path):
    w, calls = run(tmp_path, status=429)
    assert w is None
    assert run(tmp_path, status=429)[0] is None


def test_garbage_never_raises(tmp_path):
    def h(req):
        return httpx.Response(200, text="not json")
    weather._last_call = 0
    c = httpx.Client(transport=httpx.MockTransport(h))
    assert weather.get_weather(TOUR, WHEN, now=NOW, client=c, cache_dir=tmp_path) is None
    assert weather.get_weather(None, WHEN, now=NOW) is None
    assert weather.get_weather(TOUR, "garbage", now=NOW) is None
    assert weather.get_weather({"surface": "Clay"}, WHEN, now=NOW) is None
