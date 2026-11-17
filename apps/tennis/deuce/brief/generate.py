"""generate_brief(context) -> contract Brief JSON."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from . import facts
from .config import load_config


def _now_iso(now: Optional[str]) -> str:
    return now or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_payload(context: dict, analysis: dict) -> dict:
    """What the LLM sees: computed facts and rule verdicts only."""
    t = context.get("tournament") or {}
    pl = analysis["players"]
    return {
        "match": {
            "p1": pl["p1"]["name"], "p2": pl["p2"]["name"],
            "tournament": t.get("name"), "surface": t.get("surface"),
            "round": context.get("round"), "best_of": context.get("best_of"),
        },
        "model": {
            "pick": analysis["model_pick"], "pick_name": pl[analysis["model_pick"]]["name"],
            "probability_pct": round(analysis["model_prob"] * 100),
        },
        "agreement": analysis["agreement"],
        "buckets": [
            {"key": b["key"], "title": b["title"], "favours": b["favours"], "strength": b["strength"],
             "facts": b["facts"], "rules_text": b["text"]}
            for b in analysis["buckets"]
        ],
        "players": {s: {"name": pl[s]["name"], "upsides": pl[s]["upsides"], "downsides": pl[s]["downsides"]}
                    for s in ("p1", "p2")},
        "value": analysis["value"],
        "weather": context.get("weather"),
        "rules_bottom_line": analysis["bottom_line"],
    }


def generate_brief(context: dict, use_llm: bool = True, config: Optional[dict] = None,
                   now: Optional[str] = None, transport=None) -> dict:
    cfg = config if config is not None else load_config()
    analysis = facts.analyze(context, cfg)
    t = context.get("tournament") or {}
    brief = {
        "match_id": str(context.get("match_id")),
        "tournament": t.get("name"),
        "surface": t.get("surface"),
        "model_pick": analysis["model_pick"],
        "model_prob": analysis["model_prob"],
        "agreement": analysis["agreement"],
        "buckets": [dict(b) for b in analysis["buckets"]],
        "players": analysis["players"],
        "value": analysis["value"],
        "weather": context.get("weather"),
        "bottom_line": analysis["bottom_line"],
        "engine": "rules",
        "generated_at": _now_iso(now),
    }
    llm_cfg = cfg.get("llm") or {}
    if use_llm and llm_cfg.get("enabled", True):
        from . import llm
        try:
            res = llm.narrate(build_payload(context, analysis), llm_cfg, transport=transport)
        except Exception:
            res = None
        if res:
            texts = res["buckets"]
            for b in brief["buckets"]:
                b["text"] = texts[b["key"]]
            for s in ("p1", "p2"):
                brief["players"][s]["upsides"] = res["players"][s]["upsides"]
                brief["players"][s]["downsides"] = res["players"][s]["downsides"]
            brief["bottom_line"] = res["bottom_line"]
            brief["engine"] = f"llm:{res['model']}"
    return brief
