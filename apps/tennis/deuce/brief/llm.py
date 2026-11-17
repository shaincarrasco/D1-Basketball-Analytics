"""Optional narration through an OpenAI-compatible server (LM Studio, Ollama, ...).

`narrate(payload, llm_cfg)` returns
    {"model": str, "buckets": {key: text}, "players": {"p1": {...}, "p2": {...}}, "bottom_line": str}
or None on ANY problem (unreachable, timeout, junk, validation failure after one repair retry).
The caller then keeps the rules text. The LLM may only reword: favours/strength must be echoed
unchanged, every number it uses must already exist in the payload (rounding tolerated), and it may not bring in
injuries, quotes or news.
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

import httpx

BUCKET_KEYS = ("fitness", "motivation", "conditions", "market")

SYSTEM_PROMPT = """You are the narrator of a tennis match brief. You write like a sharp, plain-spoken tennis analyst.

HARD RULES
1. Use ONLY the facts, numbers and names in the JSON the user sends. Never invent or estimate a number.
2. Never mention injuries, illness, quotes, news, rumours, coaches, form guides or style claims (big server, grinder, etc.) that are not in the facts. A retirement is only mentioned if a fact says so.
3. The verdicts are decided already. For each bucket, copy "favours" and "strength" exactly as given. Do not argue with them.
4. Write each bucket text in 2-4 sentences, specific numbers first, no filler, no hype, never promise an outcome.
5. For each player write 1-4 short upsides and 1-4 short downsides, derived from that player's own rules bullets in the JSON. Keep the leading words of each rules bullet unchanged (they say whose upside or downside it is) and only tighten the rest. Never turn the opponent's bullet into this player's. EVERY bullet must contain a number from the facts and stay under 14 words.
6. bottom_line: 1-3 sentences. It must name the model's pick, its probability, the agreement label, the biggest risk and the value situation (or that no market price exists). Never promise a result.
7. Reply with ONE JSON object and nothing else (no markdown, no commentary).

JSON SHAPE
{"buckets":[{"key":"fitness","favours":"...","strength":...,"text":"..."},{"key":"motivation",...},{"key":"conditions",...},{"key":"market",...}],
 "players":{"p1":{"upsides":["..."],"downsides":["..."]},"p2":{"upsides":["..."],"downsides":["..."]}},
 "bottom_line":"..."}
"strength" is "slight", "moderate", "strong" or null (null when favours is "level")."""

FORBIDDEN = re.compile(
    r"\b(injur\w*|rumou?rs?|reportedly|press conference|coach\w*|illness|ill|sick|virus|"
    r"said|says|told|quote[sd]?|news|ankle|knee|wrist|shoulder|back problem|cramp\w*)\b", re.I)
NUM_RE = re.compile(r"(?<![\w.])\d+(?:\.\d+)?")


# --------------------------------------------------------------------------- JSON handling


def extract_json(text: str) -> Optional[dict]:
    if not text:
        return None
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.I)
    try:
        d = json.loads(t)
        return d if isinstance(d, dict) else None
    except Exception:
        pass
    a, b = t.find("{"), t.rfind("}")
    if a != -1 and b > a:
        try:
            d = json.loads(t[a:b + 1])
            return d if isinstance(d, dict) else None
        except Exception:
            return None
    return None


def _numbers(text: str) -> list[float]:
    return [float(x) for x in NUM_RE.findall(text or "")]


def allowed_numbers(payload: dict) -> list[float]:
    return _numbers(json.dumps(payload, ensure_ascii=False))


ABOUT_RE = re.compile(r"\b(about|around|roughly)\s+$", re.I)


def _num_ok(n: float, allowed: list[float], approx: bool = False) -> bool:
    """Exact match; percent form of a fraction (0.575 -> 58); +-0.5 for provided decimals;
    'about N' only when N is the provided value rounded to the nearest 10."""
    for a in allowed:
        if abs(a - n) < 1e-9:
            return True
        if not float(a).is_integer() and abs(a - n) <= 0.5:
            return True
        if 0 < a < 1 and abs(round(a * 100) - n) < 1e-9:
            return True
        if approx and a >= 10 and n == round(a / 10) * 10:
            return True
    return False


def _bad_numbers(text: str, allowed: list[float]) -> list[float]:
    bad = []
    for m in NUM_RE.finditer(text or ""):
        n = float(m.group(0))
        approx = bool(ABOUT_RE.search(text[:m.start()]))
        if not _num_ok(n, allowed, approx):
            bad.append(n)
    return bad


VALUE_WORDS = re.compile(
    r"\b(overpriced|underpriced|fair (price|odds)|value bet|value edge|betting edge|positive value|"
    r"has value|offers value|\d+(\.\d+)?% edge|edge of \d)\b|\bvalue\b(?! (cannot|flag|check))(?<!no value)", re.I)


def clean_str(x):
    return re.sub(r"[<>]", "", x) if isinstance(x, str) else x


def lead_key(text: str) -> str:
    toks = re.sub(r"[^a-z ]+", " ", (text or "").lower()).split()
    return " ".join(toks[:3])


def count_sentences(text: str) -> int:
    parts = [p for p in re.split(r"(?<=[.!?])\s+", (text or "").strip()) if p.strip()]
    return len(parts)


def _strip(x):
    if isinstance(x, dict):
        return {k: _strip(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_strip(v) for v in x]
    return clean_str(x)


def validate(result: Any, payload: dict) -> tuple[Optional[dict], list[str]]:
    """Returns (clean, errors). clean is None when errors is non-empty."""
    errs: list[str] = []
    if not isinstance(result, dict):
        return None, ["response is not a JSON object"]
    result = _strip(result)
    allowed = allowed_numbers(payload)
    rules_blob = json.dumps(payload, ensure_ascii=False)
    names = [payload["match"]["p1"], payload["match"]["p2"]]

    def check_text(label: str, text: Any, min_s: int, max_s: int, need_digit: bool = False):
        if not isinstance(text, str) or not text.strip():
            errs.append(f"{label}: missing text")
            return
        n = count_sentences(text)
        if not (min_s <= n <= max_s):
            errs.append(f"{label}: needs {min_s}-{max_s} sentences, got {n}")
        bad = _bad_numbers(text, allowed)
        if bad:
            errs.append(f"{label}: number {bad[0]:g} is not in the facts")
        if payload.get("value") is None and VALUE_WORDS.search(text):
            errs.append(f"{label}: talks about value/edge pricing but no value flag exists")
        m = FORBIDDEN.search(text)
        if m and not re.search(re.escape(m.group(0)), rules_blob, re.I):
            errs.append(f"{label}: mentions '{m.group(0)}' which is not in the facts")
        if need_digit and not NUM_RE.search(text):
            errs.append(f"{label}: must contain a number from the facts")

    # buckets
    got = {}
    bl = result.get("buckets")
    if isinstance(bl, dict):  # tolerate {"fitness": {...}}
        bl = [{"key": k, **v} for k, v in bl.items() if isinstance(v, dict)]
    if not isinstance(bl, list):
        errs.append("buckets must be a list of 4 objects")
        bl = []
    for item in bl:
        if isinstance(item, dict) and item.get("key") in BUCKET_KEYS:
            got[item["key"]] = item
    expected = {b["key"]: b for b in payload["buckets"]}
    for key in BUCKET_KEYS:
        item = got.get(key)
        if not item:
            errs.append(f"bucket {key} missing")
            continue
        exp = expected[key]
        if item.get("favours") != exp["favours"]:
            errs.append(f"bucket {key}: favours must stay '{exp['favours']}'")
        if (item.get("strength") or None) != (exp["strength"] or None):
            errs.append(f"bucket {key}: strength must stay {json.dumps(exp['strength'])}")
        check_text(f"bucket {key}", item.get("text"), 2, 4)

    # players
    pl = result.get("players")
    players_out = {}
    if not isinstance(pl, dict):
        errs.append("players missing")
        pl = {}
    for side in ("p1", "p2"):
        p = pl.get(side)
        if not isinstance(p, dict):
            errs.append(f"players.{side} missing")
            continue
        players_out[side] = {}
        for k in ("upsides", "downsides"):
            lst = p.get(k)
            if not isinstance(lst, list) or not (1 <= len(lst) <= 4) or not all(isinstance(x, str) for x in lst):
                errs.append(f"players.{side}.{k} must be 1-4 strings")
                continue
            rules_keys = {lead_key(t) for t in payload["players"][side][k]}
            opp_names = [n for n in (payload["match"]["p2" if side == "p1" else "p1"],) if n]
            opp_short = [n.split()[-1] for n in opp_names]
            for i, t in enumerate(lst):
                check_text(f"players.{side}.{k}[{i}]", t, 1, 2, need_digit=True)
                if lead_key(t) not in rules_keys:
                    errs.append(f"players.{side}.{k}[{i}]: must keep the leading words of one of this player's rules bullets")
                if any(t.strip().lower().startswith(n.lower()) for n in opp_names + opp_short):
                    errs.append(f"players.{side}.{k}[{i}]: names the opponent as its subject")
            players_out[side][k] = [t.strip() for t in lst]

    # bottom line
    bl_text = result.get("bottom_line")
    check_text("bottom_line", bl_text, 1, 3)
    if isinstance(bl_text, str):
        pick_name = payload["model"]["pick_name"]
        last = pick_name.split()[-1].lower()
        if last not in bl_text.lower():
            errs.append("bottom_line: must name the model's pick")
        prob = str(payload["model"]["probability_pct"])
        if not re.search(rf"(?<![\d.]){prob}(\.\d)?%", bl_text):
            errs.append(f"bottom_line: must state the pick's probability ({prob}%)")
    if errs:
        return None, errs
    return {
        "buckets": {k: got[k]["text"].strip() for k in BUCKET_KEYS},
        "players": players_out,
        "bottom_line": bl_text.strip(),
    }, []


# --------------------------------------------------------------------------- server calls


def pick_model(client: httpx.Client, configured: str) -> Optional[str]:
    if configured:
        return configured
    r = client.get("/models")
    r.raise_for_status()
    ids = [m.get("id") for m in (r.json().get("data") or []) if isinstance(m, dict) and m.get("id")]
    ids = [i for i in ids if "embed" not in i.lower()]
    return ids[0] if ids else None


def _chat(client: httpx.Client, model: str, messages: list[dict]) -> str:
    r = client.post("/chat/completions", json={
        "model": model, "messages": messages, "temperature": 0.2, "max_tokens": 1800, "stream": False})
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"] or ""


def narrate(payload: dict, llm_cfg: dict, transport: Optional[httpx.BaseTransport] = None) -> Optional[dict]:
    base = (llm_cfg.get("base_url") or "http://localhost:1234/v1").rstrip("/")
    timeout = float(llm_cfg.get("timeout_s") or 60)
    try:
        with httpx.Client(base_url=base, timeout=timeout, transport=transport) as client:
            model = pick_model(client, (llm_cfg.get("model") or "").strip())
            if not model:
                return None
            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": "FACTS AND RULE VERDICTS (JSON):\n" + json.dumps(payload, ensure_ascii=False)},
            ]
            raw = _chat(client, model, messages)
            clean, errs = validate(extract_json(raw), payload)
            if clean is None:
                repair = messages + [
                    {"role": "assistant", "content": raw[:6000]},
                    {"role": "user", "content": (
                        "That reply was rejected for these reasons:\n- " + "\n- ".join(errs[:8]) +
                        "\nReply again with ONE corrected JSON object only, following every rule. "
                        "Use only numbers that appear in the facts and keep favours/strength unchanged.")},
                ]
                raw = _chat(client, model, repair)
                clean, errs = validate(extract_json(raw), payload)
            if clean is None:
                return None
            clean["model"] = model
            return clean
    except Exception:
        return None
