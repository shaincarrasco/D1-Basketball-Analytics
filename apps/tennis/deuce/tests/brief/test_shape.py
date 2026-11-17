import json
from pathlib import Path

from brief.generate import generate_brief

FIX = Path(__file__).parent / "fixtures"
TOP = {"match_id", "tournament", "surface", "model_pick", "model_prob", "agreement", "buckets", "players",
       "value", "weather", "bottom_line", "engine", "generated_at"}


def check_brief(b):
    assert set(b) == TOP
    assert isinstance(b["match_id"], str)
    assert b["model_pick"] in ("p1", "p2")
    assert 0.5 <= b["model_prob"] <= 1
    assert set(b["agreement"]) == {"score", "label"} and 0 <= b["agreement"]["score"] <= 100
    assert [x["key"] for x in b["buckets"]] == ["fitness", "motivation", "conditions", "market"]
    titles = ["Fitness & Fatigue", "Motivation & Pressure", "Conditions", "Market"]
    for x, t in zip(b["buckets"], titles):
        assert set(x) == {"key", "title", "favours", "strength", "text", "facts"}
        assert x["title"] == t
        assert x["favours"] in ("p1", "p2", "level")
        if x["favours"] == "level":
            assert x["strength"] is None
        else:
            assert x["strength"] in ("slight", "moderate", "strong")
        assert x["text"].strip()
        for f in x["facts"]:
            assert set(f) == {"label", "p1", "p2"}
    assert set(b["players"]) == {"p1", "p2"}
    for p in b["players"].values():
        assert set(p) == {"name", "upsides", "downsides"}
        assert 1 <= len(p["upsides"]) <= 4 and 1 <= len(p["downsides"]) <= 4
    if b["value"] is not None:
        assert set(b["value"]) == {"side", "edge", "fair_odds", "market_odds"}
    if b["weather"] is not None:
        assert {"temp_c", "humidity", "wind_kph", "precip_mm", "summary"} <= set(b["weather"])
    assert b["bottom_line"].strip()
    assert b["engine"] == "rules" or b["engine"].startswith("llm:")
    json.dumps(b)


def test_contract_shape_on_fixtures(montevideo, indoor):
    for ctx in (montevideo, indoor):
        check_brief(generate_brief(ctx, use_llm=False))


def test_agreement_in_brief_matches_buckets(montevideo):
    from brief.facts import compute_agreement
    b = generate_brief(montevideo, use_llm=False)
    assert b["agreement"] == compute_agreement(b["model_pick"], b["buckets"])


def test_example_briefs_file_valid():
    ex = json.loads((FIX / "example_briefs.json").read_text())
    assert len(ex) == 2
    for b in ex:
        check_brief(b)
