import copy
import json

import httpx

from brief import facts, llm
from brief.generate import build_payload, generate_brief

CFG = {"llm": {"enabled": True, "base_url": "http://fake/v1", "model": "", "timeout_s": 5}}


def good_reply(payload, **override):
    """An LLM answer that is valid: reuses the rules text, which only holds facts-derived numbers."""
    pl = payload["players"]
    d = {
        "buckets": [{"key": b["key"], "favours": b["favours"], "strength": b["strength"],
                     "text": b["rules_text"]} for b in payload["buckets"]],
        "players": {s: {"upsides": list(pl[s]["upsides"]), "downsides": list(pl[s]["downsides"])} for s in ("p1", "p2")},
        "bottom_line": payload["rules_bottom_line"],
    }
    d.update(override)
    return d


def make_transport(replies, models=None, calls=None):
    replies = list(replies)

    def handler(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append((request.method, request.url.path))
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": i} for i in (models or ["text-embedding-x", "qwen-test"])]})
        item = replies.pop(0) if len(replies) > 1 else replies[0]
        if isinstance(item, Exception):
            raise item
        content = item if isinstance(item, str) else json.dumps(item)
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})
    return httpx.MockTransport(handler)


def setup(ctx):
    a = facts.analyze(ctx)
    return a, build_payload(ctx, a)


def test_valid_llm_output_is_used(montevideo):
    a, payload = setup(montevideo)
    reply = good_reply(payload)
    reply["buckets"][0]["text"] = "Alvarez is the fresher player: 71 games in 14 days against 158 for Keller. That is a real workload gap."
    calls = []
    b = generate_brief(montevideo, use_llm=True, config=CFG, transport=make_transport([reply], calls=calls))
    assert b["engine"] == "llm:qwen-test"  # skipped the embedding model
    assert b["buckets"][0]["text"].startswith("Alvarez is the fresher")
    assert b["buckets"][0]["favours"] == "p2"
    assert ("GET", "/v1/models") in calls


def test_fenced_json_is_accepted(montevideo):
    _, payload = setup(montevideo)
    raw = "Sure!\n```json\n" + json.dumps(good_reply(payload)) + "\n```"
    b = generate_brief(montevideo, config=CFG, transport=make_transport([raw]))
    assert b["engine"].startswith("llm:")


def test_unreachable_server_falls_back(montevideo):
    t = make_transport([httpx.ConnectError("refused")])

    def boom(request):
        raise httpx.ConnectError("refused")
    b = generate_brief(montevideo, config=CFG, transport=httpx.MockTransport(boom))
    rules = generate_brief(montevideo, use_llm=False)
    assert b["engine"] == "rules"
    assert b["buckets"] == rules["buckets"] and b["bottom_line"] == rules["bottom_line"]


def test_junk_output_falls_back_after_one_retry(montevideo):
    calls = []
    b = generate_brief(montevideo, config=CFG, transport=make_transport(["I cannot do that, sorry."], calls=calls))
    assert b["engine"] == "rules"
    assert len([c for c in calls if c[0] == "POST"]) == 2  # first try + one repair retry


def test_retry_repairs(montevideo):
    _, payload = setup(montevideo)
    b = generate_brief(montevideo, config=CFG, transport=make_transport(["junk", good_reply(payload)]))
    assert b["engine"].startswith("llm:")


def test_changed_verdict_rejected(montevideo):
    _, payload = setup(montevideo)
    bad = good_reply(payload)
    bad["buckets"][0]["favours"] = "p1"
    clean, errs = llm.validate(bad, payload)
    assert clean is None and any("favours must stay" in e for e in errs)
    b = generate_brief(montevideo, config=CFG, transport=make_transport([bad]))
    assert b["engine"] == "rules"
    assert b["buckets"][0]["favours"] == "p2"


def test_changed_strength_rejected(montevideo):
    _, payload = setup(montevideo)
    bad = good_reply(payload)
    bad["buckets"][2]["strength"] = "strong"
    clean, errs = llm.validate(bad, payload)
    assert clean is None and any("strength must stay" in e for e in errs)


def test_invented_number_rejected(montevideo):
    _, payload = setup(montevideo)
    bad = good_reply(payload)
    bad["buckets"][0]["text"] = "Keller has played 8 matches in 4 days across 777 games. That is far too many."
    clean, errs = llm.validate(bad, payload)
    assert clean is None and any("not in the facts" in e for e in errs)


def test_invented_injury_rejected(montevideo):
    _, payload = setup(montevideo)
    bad = good_reply(payload)
    bad["buckets"][0]["text"] = "Keller looked hampered by a shoulder injury last week. Alvarez has 71 games."
    clean, errs = llm.validate(bad, payload)
    assert clean is None and any("not in the facts" in e for e in errs)


def test_bottom_line_must_name_pick_and_prob(montevideo):
    _, payload = setup(montevideo)
    bad = good_reply(payload, bottom_line="It could go either way. Value exists.")
    clean, errs = llm.validate(bad, payload)
    assert clean is None
    assert any("pick" in e for e in errs) and any("probability" in e for e in errs)


def test_bullets_need_numbers_and_count(montevideo):
    _, payload = setup(montevideo)
    bad = good_reply(payload)
    bad["players"]["p1"]["upsides"] = ["Looks confident", "Plays well"]
    clean, errs = llm.validate(bad, payload)
    assert clean is None and any("number" in e for e in errs)
    bad2 = good_reply(payload)
    bad2["players"]["p2"]["downsides"] = []
    assert llm.validate(bad2, payload)[0] is None


def test_wrong_schema(montevideo):
    _, payload = setup(montevideo)
    assert llm.validate(["nope"], payload)[0] is None
    assert llm.validate({"buckets": "x"}, payload)[0] is None


def test_configured_model_skips_models_call(montevideo):
    _, payload = setup(montevideo)
    calls = []
    cfg = {"llm": {**CFG["llm"], "model": "my-model"}}
    b = generate_brief(montevideo, config=cfg, transport=make_transport([good_reply(payload)], calls=calls))
    assert b["engine"] == "llm:my-model"
    assert not any(p.endswith("/models") for _, p in calls)


def test_disabled_in_config(montevideo):
    cfg = {"llm": {**CFG["llm"], "enabled": False}}
    assert generate_brief(montevideo, use_llm=True, config=cfg, transport=make_transport([{}]))["engine"] == "rules"


def test_extract_json_variants():
    assert llm.extract_json('{"a":1}') == {"a": 1}
    assert llm.extract_json('blah {"a":1} trailing') == {"a": 1}
    assert llm.extract_json("") is None
    assert llm.extract_json("[1,2]") is None


def test_num_ok_rules():
    allowed = [158.0, 57.5, 0.575, 61.0]
    ok = llm._num_ok
    assert ok(158, allowed) and ok(57.5, allowed)
    assert ok(58, allowed)            # decimal +-0.5 and percent form of 0.575
    assert not ok(59, allowed)
    assert not ok(157, allowed) and not ok(160, allowed)
    assert ok(160, allowed, approx=True) and not ok(150, allowed, approx=True)
    assert not ok(62, allowed)


def test_about_needs_the_word(montevideo):
    _, payload = setup(montevideo)
    r = good_reply(payload)
    r["buckets"][0]["text"] = "Keller has played about 160 games in 14 days against 71 for Alvarez. That is a heavy load."
    assert llm.validate(r, payload)[0] is not None
    r["buckets"][0]["text"] = "Keller has played 160 games in 14 days against 71 for Alvarez. That is a heavy load."
    clean, errs = llm.validate(r, payload)
    assert clean is None and any("160" in e for e in errs)
    r["buckets"][0]["text"] = "Keller has played about 150 games in 14 days against 71 for Alvarez. That is a heavy load."
    assert llm.validate(r, payload)[0] is None


def test_loose_rounding_no_longer_passes(montevideo):
    _, payload = setup(montevideo)
    r = good_reply(payload)
    r["buckets"][0]["text"] = "Keller has played 6 matches in 14 days against 71 games for Alvarez. That is heavy."
    assert llm.validate(r, payload)[0] is None
    r["buckets"][0]["text"] = "Keller has 157 games in 14 days against 71 for Alvarez. That is heavy."
    assert llm.validate(r, payload)[0] is None


def test_value_words_rejected_when_no_value(indoor):
    _, payload = setup(indoor)
    assert payload["value"] is None
    for bad in ("Lindqvist looks underpriced here. Markovic has 18 matches on Indoor Hard.",
                "There is value on Markovic at 54%. She has 18 matches on Indoor Hard.",
                "The fair price on Markovic is 1.85. She has 18 matches on Indoor Hard."):
        r = good_reply(payload)
        r["buckets"][2]["text"] = bad
        clean, errs = llm.validate(r, payload)
        assert clean is None and any("value" in e or "not in the facts" in e for e in errs), bad
    r = good_reply(payload)  # the rules text itself ("no market price", "value cannot be assessed") must pass
    assert llm.validate(r, payload)[0] is not None


def test_probability_word_boundary(montevideo):
    _, payload = setup(montevideo)
    r = good_reply(payload, bottom_line="Keller is the pick at 161% with mixed signals. Value exists at 2.10.")
    clean, errs = llm.validate(r, payload)
    assert clean is None and any("probability" in e for e in errs)
    ok = good_reply(payload, bottom_line="Keller is the pick at 61.0% with mixed signals. Value exists at 2.10.")
    assert llm.validate(ok, payload)[0] is not None


def test_angle_brackets_stripped(montevideo):
    _, payload = setup(montevideo)
    r = good_reply(payload)
    r["buckets"][0]["text"] = "<b>Alvarez</b> has 71 games in 14 days against 158 for Keller. <script>x</script>That is a gap."
    clean, errs = llm.validate(r, payload)
    assert clean is not None
    assert "<" not in clean["buckets"]["fitness"] and ">" not in clean["buckets"]["fitness"]


def test_bullet_attribution(montevideo):
    _, payload = setup(montevideo)
    # moving the opponent's bullet into this player's list is rejected
    r = good_reply(payload)
    r["players"]["p1"]["upsides"] = list(payload["players"]["p2"]["upsides"][:2])
    clean, errs = llm.validate(r, payload)
    assert clean is None and any("leading words" in e for e in errs)
    # naming the opponent as the subject is rejected even with a matching lead
    r = good_reply(payload)
    lead = payload["players"]["p1"]["upsides"][0]
    r["players"]["p1"]["upsides"][0] = "Alvarez " + lead
    clean, errs = llm.validate(r, payload)
    assert clean is None
    r = good_reply(payload)
    r["players"]["p1"]["upsides"][0] = "Alvarez 71 games lighter in 14 days"
    assert any("opponent" in e or "leading" in e for e in llm.validate(r, payload)[1])
    # a tightened bullet that keeps the lead passes
    r = good_reply(payload)
    r["players"]["p1"]["downsides"][0] = payload["players"]["p1"]["downsides"][0].split(" vs ")[0]
    assert llm.validate(r, payload)[0] is not None
