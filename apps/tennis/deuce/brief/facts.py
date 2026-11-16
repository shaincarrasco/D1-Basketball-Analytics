"""Pure, deterministic match facts -> scored bucket verdicts.

Input is a *context* dict (see README in tests/brief/fixtures):

    {
      "match_id", "date", "round", "best_of", "status",
      "tournament": {"name", "surface", "level", "location", "country", "surface_inferred"},
      "p1": {"id", "name", "country"}, "p2": {...},
      "p1_prob", "p2_prob",
      "features": <predictions.features_json>,
      "odds": [ {"p1_odds","p2_odds","book","source","fetched_at"}, ... ],   # any order
      "weather": {"temp_c","humidity","wind_kph","precip_mm","summary"} | None,
      "edge_threshold": 0.02,
    }

`analyze(context)` returns buckets, agreement, value, per-player upsides and
downsides and a rules-written bottom line. Nothing here touches the network or
the clock, so identical input always gives identical output.

Scoring model: every component produces signed points (positive favours p1).
A bucket sums its components; |sum| below the bucket's "level" threshold means
level, otherwise slight / moderate / strong by fixed cut-offs.
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from typing import Any, Optional

BUCKET_ORDER = ("fitness", "motivation", "conditions", "market")
BUCKET_TITLES = {
    "fitness": "Fitness & Fatigue",
    "motivation": "Motivation & Pressure",
    "conditions": "Conditions",
    "market": "Market",
}
PLURAL_TOPIC = {"motivation", "conditions"}
BUCKET_TOPIC = {
    "fitness": "freshness",
    "motivation": "motivation and pressure",
    "conditions": "conditions",
    "market": "the market",
}
STRENGTH_WEIGHT = {"slight": 1, "moderate": 2, "strong": 3}
DEFAULT_EDGE_THRESHOLD = 0.02

# bucket-score cut-offs (points)
LEVEL_BELOW = {"fitness": 1.0, "motivation": 1.2, "conditions": 1.0}
SLIGHT_BELOW = 2.2
MODERATE_BELOW = 3.8

# weather thresholds
HEAT_C = 30.0
HUMID_PCT = 80.0
WIND_KPH = 25.0
RAIN_MM = 1.0

PARTICLES = {"de", "van", "von", "da", "del", "di", "der", "la", "le", "dos", "den", "mc"}


# --------------------------------------------------------------------------- helpers


def num(x: Any) -> Optional[float]:
    if isinstance(x, bool) or x is None:
        return None
    if isinstance(x, (int, float)) and not (isinstance(x, float) and math.isnan(x)):
        return float(x)
    return None


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def short_name(name: str) -> str:
    toks = (name or "").replace(" ", " ").split()
    if not toks:
        return "Player"
    if len(toks) >= 3 and toks[-2].lower() in PARTICLES:
        return " ".join(toks[-2:])
    if len(toks) >= 2 and toks[-2].lower() in PARTICLES:
        return " ".join(toks[-2:])
    return toks[-1]


def pts_txt(m: float) -> str:
    """momentum (form_10 - season win rate) as 'N pts below/above' (or 'in line with')."""
    n = round(abs(m) * 100)
    if n == 0:
        return "in line with"
    return f"{n} pt{'s' if n != 1 else ''} {'above' if m >= 0 else 'below'}"


def nm(n) -> str:
    n = int(n)
    return f"{n} match" if n == 1 else f"{n} matches"


def pct(x: float) -> str:
    return f"{round(x * 100)}%"


def pct1(x: float) -> float:
    return round(x * 100, 1)


def sgn(x: float, digits: int = 0) -> str:
    if round(x, digits) == 0:
        return "0"
    return f"{x:+.{digits}f}"


def ordinal_words(n: int, singular: str, plural: str | None = None) -> str:
    return f"{n} {singular if n == 1 else (plural or singular + 's')}"


def agreement_label(score: int) -> str:
    if score < 40:
        return "Conflicting signals"
    if score <= 65:
        return "Mixed signals"
    return "Strong agreement"


def compute_agreement(model_pick: str, buckets: list[dict]) -> dict:
    """Contract: +w if a bucket favours the pick, -w if against, 0 if level.
    score = round(50 + 50 * sum / 12) clamped 0-100."""
    total = 0
    for b in buckets:
        w = STRENGTH_WEIGHT.get(b.get("strength") or "", 0)
        fav = b.get("favours")
        if fav == "level" or not w:
            continue
        total += w if fav == model_pick else -w
    score = int(clamp(round(50 + 50 * total / 12), 0, 100))
    return {"score": score, "label": agreement_label(score)}


def strength_for(total: float, level_below: float) -> tuple[str, Optional[str]]:
    a = abs(total)
    if a < level_below:
        return "level", None
    side = "p1" if total > 0 else "p2"
    if a < SLIGHT_BELOW:
        return side, "slight"
    if a < MODERATE_BELOW:
        return side, "moderate"
    return side, "strong"


def other(side: str) -> str:
    return "p2" if side == "p1" else "p1"


def poss(name: str) -> str:
    return name + ("'" if name.endswith("s") else "'s")


def _lower_first(s: str, names: tuple = ()) -> str:
    if not s or any(s.startswith(n) for n in names if n):
        return s
    return s[:1].lower() + s[1:]


# --------------------------------------------------------------------------- context wrapper


class Ctx:
    def __init__(self, raw: dict):
        self.raw = raw
        self.feat = raw.get("features") or {}
        self.f = {"p1": self.feat.get("p1") or {}, "p2": self.feat.get("p2") or {}}
        self.tour = raw.get("tournament") or {}
        self.player = {"p1": raw.get("p1") or {}, "p2": raw.get("p2") or {}}
        self.full = {s: (self.player[s].get("name") or ("Player 1" if s == "p1" else "Player 2")) for s in ("p1", "p2")}
        self.name = {s: short_name(self.full[s]) for s in ("p1", "p2")}
        if self.name["p1"] == self.name["p2"]:
            self.name = dict(self.full)
        from datetime import datetime, timezone
        self.now = _parse_ts(raw.get("now")) if raw.get("now") else datetime.now(timezone.utc)
        self.seed = str(raw.get("match_id") or "")
        self.surface = self.tour.get("surface") or "this surface"
        self.indoor = (self.tour.get("surface") == "Indoor Hard")
        self.round = (raw.get("round") or "").strip()
        self.weather = raw.get("weather") if isinstance(raw.get("weather"), dict) else None
        p1 = num(raw.get("p1_prob"))
        p2 = num(raw.get("p2_prob"))
        if p1 is None and p2 is not None:
            p1 = 1 - p2
        if p1 is None:
            p1 = 0.5
        self.p = {"p1": p1, "p2": 1 - p1 if p2 is None else p2}
        self.pick = "p1" if self.p["p1"] >= self.p["p2"] else "p2"
        thr = num(raw.get("edge_threshold"))
        self.edge_threshold = DEFAULT_EDGE_THRESHOLD if thr is None else thr

    def v(self, side: str, key: str) -> Optional[float]:
        return num(self.f[side].get(key))

    def pair(self, key: str) -> tuple[Optional[float], Optional[float]]:
        return self.v("p1", key), self.v("p2", key)

    def thin(self, side: str) -> bool:
        e = self.v(side, "experience")
        return e is not None and e < 15

    def rates_ok(self) -> bool:
        return not (self.thin("p1") or self.thin("p2"))

    def rel_pair(self, key: str) -> tuple[Optional[float], Optional[float]]:
        """Rate-type metric pair, dropped when either player has a tiny sample (experience < 15)
        or a value of exactly 0/1, which in practice means 'no data'."""
        a, b = self.pair(key)
        if not self.rates_ok() or any(x is not None and (x <= 0.0 or x >= 1.0) for x in (a, b)):
            return None, None
        return a, b

    def choose(self, key: str, options: list[str]) -> str:
        h = int(hashlib.md5(f"{self.seed}:{key}".encode()).hexdigest(), 16)
        return options[h % len(options)]


@dataclass
class Comp:
    key: str
    bucket: Optional[str]
    pts: float  # positive favours p1
    label: str = ""
    sentence: Optional[str] = None
    up: Optional[str] = None  # bullet for the advantaged player
    down: Optional[str] = None  # bullet for the disadvantaged player
    headline: Optional[str] = None
    extra: bool = False  # neutral context sentence, no direction
    d1: str = ""
    d2: str = ""

    @property
    def fav(self) -> Optional[str]:
        if self.pts > 0:
            return "p1"
        if self.pts < 0:
            return "p2"
        return None

    @property
    def weight(self) -> float:
        return abs(self.pts)


def _dir(pts: float) -> str:
    return "p1" if pts > 0 else "p2"


# --------------------------------------------------------------------------- fitness


def fitness_comps(c: Ctx) -> list[Comp]:
    out: list[Comp] = []
    g1, g2 = c.pair("games_14d")
    m1, m2 = c.pair("matches_14d")
    if g1 is not None and g2 is not None:
        pts = clamp((g2 - g1) / 40.0, -2.0, 2.0)
        if abs(pts) >= 0.25:
            w = _dir(pts)
            l = other(w)
            gw, gl = int(c.v(w, "games_14d")), int(c.v(l, "games_14d"))
            mw, ml = c.v(w, "matches_14d"), c.v(l, "matches_14d")
            W, L = c.name[w], c.name[l]
            if gw == 0:
                s = c.choose("load14z", [
                    f"{W} has not played in the last 14 days, while {L} has logged {gl} games across {nm(ml) if ml is not None else 'recent matches'}.",
                    f"{L} has {gl} games in the last fortnight; {W} has had a clean two weeks off.",
                ])
                up = f"No matches in the last 14 days (vs {gl} games)"
            elif mw is not None and ml is not None:
                s = c.choose("load14", [
                    f"{W} has {gw} games on the legs over 14 days ({nm(mw)}) against {gl} for {L} ({int(ml)}).",
                    f"Workload tilts to {W}: {gw} games in the last fortnight to {poss(L)} {gl}.",
                    f"{L} has logged {gl} games across {nm(ml)} in 14 days, {W} only {gw} across {int(mw)}.",
                ])
                up = f"Lighter recent workload: {gw} games in 14 days vs {gl}"
            else:
                s = f"Workload tilts to {W}: {gw} games in the last fortnight to {poss(L)} {gl}."
                up = f"Lighter recent workload: {gw} games in 14 days vs {gl}"
            out.append(Comp(
                "load14", "fitness", pts, "Games, last 14 days",
                sentence=s, up=up,
                down=f"Heavier recent workload: {gl} games in 14 days vs {gw}",
                headline=(f"{W} is fresher ({gw} vs {gl} games in 14 days)" if gw else
                          f"{W} is fresher (no matches in 14 days vs {gl} games)"),
            ))
    a1, a2 = c.pair("matches_7d")
    if a1 is not None and a2 is not None and abs(a1 - a2) >= 1:
        pts = clamp((a2 - a1) * 0.5, -1.5, 1.5)
        w = _dir(pts)
        l = other(w)
        aw, al = int(c.v(w, "matches_7d")), int(c.v(l, "matches_7d"))
        W, L = c.name[w], c.name[l]
        s = c.choose("load7", [
            f"In the past week {L} has played {nm(al)}, {W} {aw}.",
            f"Over the last 7 days it is {nm(al)} for {L} against {aw} for {W}.",
        ])
        out.append(Comp("load7", "fitness", pts, "Matches, last 7 days", sentence=s,
                        up=(f"No matches in the last 7 days (vs {al})" if aw == 0 else f"Played {nm(aw)} in 7 days vs {al}"),
                        down=f"Played {nm(al)} in 7 days vs {aw}",
                        headline=f"{W} has played fewer matches this week ({aw} vs {al})"))
    for side in ("p1", "p2"):
        d = c.v(side, "days_since_last")
        if d is not None and d > 30:
            pts = -1.0 if side == "p1" else 1.0
            N = c.name[side]
            s = c.choose(f"rust{side}", [
                f"{N} has not played for {int(d)} days, so match rhythm is a fair question.",
                f"A {int(d)}-day layoff for {N} raises the chance of early rust.",
            ])
            out.append(Comp("rust", "fitness", pts, "Days since last match", sentence=s,
                            down=f"{int(d)} days since last match (rust risk)",
                            headline=f"{N} returns after {int(d)} days off"))
        if c.f[side].get("last_match_retired") is True:
            pts = -1.5 if side == "p1" else 1.5
            N = c.name[side]
            s = c.choose(f"ret{side}", [
                f"{N} retired from the last match, which leaves a physical question mark.",
                f"{N} did not finish the previous match (retired), so fitness is not a given.",
            ])
            out.append(Comp("retired", "fitness", pts, "Retired last match", sentence=s,
                            down="Retired in the previous match",
                            headline=f"{N} retired last time out"))
    return out


def fitness_facts(c: Ctx) -> list[dict]:
    rows = [
        ("Matches, last 7 days", "matches_7d", int),
        ("Matches, last 14 days", "matches_14d", int),
        ("Sets, last 14 days", "sets_14d", int),
        ("Games, last 14 days", "games_14d", int),
        ("Days since last match", "days_since_last", int),
    ]
    facts = []
    for label, key, cast in rows:
        a, b = c.pair(key)
        if a is not None or b is not None:
            facts.append({"label": label, "p1": cast(a) if a is not None else None,
                          "p2": cast(b) if b is not None else None})
    r1, r2 = c.f["p1"].get("last_match_retired"), c.f["p2"].get("last_match_retired")
    if r1 is not None or r2 is not None:
        facts.append({"label": "Retired last match", "p1": "Yes" if r1 else "No", "p2": "Yes" if r2 else "No"})
    return facts


# --------------------------------------------------------------------------- motivation


def motivation_comps(c: Ctx) -> list[Comp]:
    out: list[Comp] = []
    h1, h2 = bool(c.f["p1"].get("home")), bool(c.f["p2"].get("home"))
    if h1 != h2:
        w = "p1" if h1 else "p2"
        l = other(w)
        place = c.tour.get("location") or c.tour.get("name") or "home soil"
        s = c.choose("home", [
            f"{c.name[w]} is playing at home in {place}, and the crowd should help with the big points.",
            f"{c.name[w]} has the home crowd in {place}, an added pressure point for {c.name[l]}.",
            f"{c.name[w]} has the home support in {place}.",
        ])
        out.append(Comp("home", "motivation", 1.3 if w == "p1" else -1.3, "Home player", sentence=s,
                        up=f"Playing at home ({place})",
                        down=f"Away from home while {c.name[w]} plays in front of a home crowd",
                        headline=f"{c.name[w]} has the home crowd"))

    t1, t2 = c.pair("elo_trend_90d")
    e_1, e_2 = c.pair("experience")
    if t1 is not None and t2 is not None and (e_1 or 0) >= 20 and (e_2 or 0) >= 20:
        pts = clamp((t1 - t2) / 40.0, -1.5, 1.5)
        if abs(pts) >= 0.3:
            w = _dir(pts)
            l = other(w)
            tw, tl = c.v(w, "elo_trend_90d"), c.v(l, "elo_trend_90d")
            W, L = c.name[w], c.name[l]
            if tw > 0 and abs(tl) < 5:
                s = f"{W} is climbing ({sgn(tw)} Elo over 90 days) while {L} is flat ({sgn(tl)})."
                up = f"Elo trend {sgn(tw)} over 90 days (opponent {sgn(tl)})"
                down = f"Flat Elo trend ({sgn(tl)}) over 90 days vs {sgn(tw)} for {W}"
                hl = f"{W} is rising ({sgn(tw)} Elo in 90 days) while {L} is flat"
            elif tw > 0 and tl <= -5:
                s = f"{W} is on the way up ({sgn(tw)} Elo over 90 days) while {L} has been sliding ({sgn(tl)})."
                up = f"Elo trend {sgn(tw)} over 90 days (opponent {sgn(tl)})"
                down = f"Elo trend {sgn(tl)} over 90 days vs {sgn(tw)} for {W}"
                hl = f"{W} is rising ({sgn(tw)} Elo in 90 days) while {L} slides ({sgn(tl)})"
            elif tw <= 0 and tl < 0 and not (tw > 0):
                s = c.choose("trendneg", [
                    f"Neither is trending up, but {W} is sliding less: {sgn(tw)} Elo over 90 days against {sgn(tl)} for {L}.",
                    f"Both have lost ground over 90 days ({sgn(tw)} for {W}, {sgn(tl)} for {L}), though {W} has lost less.",
                ])
                up = f"Sliding less: {sgn(tw)} Elo over 90 days vs {sgn(tl)}"
                down = f"Sliding faster: {sgn(tl)} Elo over 90 days vs {sgn(tw)}"
                hl = f"{W} is sliding less ({sgn(tw)} vs {sgn(tl)} Elo in 90 days)"
            else:  # both rising (or winner flat/rising, loser flat)
                s = c.choose("trendpos", [
                    f"Both are gaining ground, but {W} faster: {sgn(tw)} Elo over 90 days against {sgn(tl)} for {L}.",
                    f"Over 90 days {poss(W)} Elo has moved {sgn(tw)} against {sgn(tl)} for {L}.",
                ])
                up = f"Climbing faster: {sgn(tw)} Elo over 90 days vs {sgn(tl)}"
                down = f"Climbing more slowly: {sgn(tl)} Elo over 90 days vs {sgn(tw)}"
                hl = f"{W} has the better 90-day Elo trend ({sgn(tw)} vs {sgn(tl)})"
            out.append(Comp("trend", "motivation", pts, "Elo trend, 90 days", sentence=s,
                            up=up, down=down, headline=hl))

    h2h = c.feat.get("h2h") or {}
    w1, w2 = num(h2h.get("p1_wins")), num(h2h.get("p2_wins"))
    if w1 is not None and w2 is not None and w1 + w2 >= 2 and w1 != w2:
        pts = clamp((w1 - w2) * 0.5, -1.5, 1.5)
        w = _dir(pts)
        l = other(w)
        a, b = int(max(w1, w2)), int(min(w1, w2))
        W, L = c.name[w], c.name[l]
        last = (h2h.get("last") or [None])[0]
        tail = ""
        if isinstance(last, dict) and last.get("winner") in ("p1", "p2"):
            when = (last.get("date") or "")[:4]
            surf = last.get("surface")
            who = c.name[last["winner"]]
            tail = f" {who} took the latest meeting" + (f" on {surf}" if surf else "") + (f" in {when}" if when else "") + "."
        s = c.choose("h2h", [
            f"{W} leads the head-to-head {a}-{b}.",
            f"Head-to-head favours {W}, {a}-{b}.",
        ]) + tail
        out.append(Comp("h2h", "motivation", pts, "Head-to-head wins", sentence=s,
                        up=f"Leads head-to-head {a}-{b}", down=f"Trails head-to-head {b}-{a}",
                        headline=f"{W} leads the head-to-head {a}-{b}"))

    d1, d2 = c.rel_pair("deciding_set_win_pct_1y")
    if d1 is not None and d2 is not None:
        pts = clamp((d1 - d2) / 0.15, -1.0, 1.0)
        if abs(pts) >= 0.3:
            w = _dir(pts)
            l = other(w)
            dw, dl = c.v(w, "deciding_set_win_pct_1y"), c.v(l, "deciding_set_win_pct_1y")
            W, L = c.name[w], c.name[l]
            s = c.choose("dec", [
                f"When it goes the distance, {W} has won {pct(dw)} of deciding sets over the past year to {poss(L)} {pct(dl)}.",
                f"Deciding-set record under pressure: {W} {pct(dw)}, {L} {pct(dl)}.",
            ])
            down = (f"Wins only {pct(dl)} of deciding sets (1y)" if dl < 0.5
                    else f"Wins {pct(dl)} of deciding sets (1y), {pct(dw)} for {W}")
            out.append(Comp("deciding", "motivation", pts, "Deciding-set win % (1y)", sentence=s,
                            up=f"Wins {pct(dw)} of deciding sets (1y) vs {pct(dl)}", down=down,
                            headline=f"{W} is stronger in deciding sets ({pct(dw)} vs {pct(dl)})"))

    k1, k2 = c.rel_pair("comeback_rate")
    if k1 is not None and k2 is not None:
        pts = clamp((k1 - k2) / 0.2, -1.0, 1.0)
        if abs(pts) >= 0.3:
            w = _dir(pts)
            l = other(w)
            kw, kl = c.v(w, "comeback_rate"), c.v(l, "comeback_rate")
            W, L = c.name[w], c.name[l]
            s = f"{poss(W)} comeback rate is {pct(kw)} against {pct(kl)} for {L}, which matters if the first set slips away."
            out.append(Comp("comeback", "motivation", pts, "Comeback rate", sentence=s,
                            up=f"Comeback rate {pct(kw)} vs {pct(kl)}",
                            down=f"Comeback rate of {pct(kl)} vs {pct(kw)} for {W}",
                            headline=f"{W} is the better comeback player ({pct(kw)} vs {pct(kl)})"))

    mo1, mo2 = c.pair("momentum")
    if mo1 is not None and mo2 is not None and c.rates_ok():
        pts = clamp((mo1 - mo2) / 0.15, -1.0, 1.0) * 0.7
        if abs(pts) >= 0.25:
            w = _dir(pts)
            l = other(w)
            mw, ml = c.v(w, "momentum"), c.v(l, "momentum")
            W, L = c.name[w], c.name[l]
            s = (f"Recent form sits {pts_txt(mw)} {poss(W)} season win rate, against {pts_txt(ml)} {poss(L)}."
                 if mw * ml >= 0 else
                 f"{poss(W)} last 10 run {pts_txt(mw)} the season win rate, while {L} is {pts_txt(ml)} it.")
            out.append(Comp("momentum", "motivation", pts, "Momentum", sentence=s,
                            up=f"Recent form {pts_txt(mw)} season win rate ({L} {pts_txt(ml)})",
                            down=f"Recent form {pts_txt(ml)} season win rate ({W} {pts_txt(mw)})",
                            headline=f"{W} has the better recent form ({pts_txt(mw)} vs {pts_txt(ml)} season win rate)"))

    e1, e2 = c.pair("experience")
    rnd = c.round.lower()
    lvl = (c.tour.get("level") or "").lower()
    big = any(k in rnd for k in ("final", "semi", "quarter")) or "slam" in lvl or "grand" in lvl
    if big and e1 is not None and e2 is not None and abs(e1 - e2) >= 100:
        pts = clamp((e1 - e2) / 300.0, -1.0, 1.0) * 0.8
        w = _dir(pts)
        l = other(w)
        ew, el = int(c.v(w, "experience")), int(c.v(l, "experience"))
        W, L = c.name[w], c.name[l]
        where = c.round or c.tour.get("name") or "a match this size"
        s = f"With {where} pressure, {poss(W)} {ew} career matches on record against {el} for {L} count for something."
        out.append(Comp("experience", "motivation", pts, "Experience (matches)", sentence=s,
                        up=f"{ew} career matches on record vs {el}",
                        down=f"Only {el} career matches on record vs {ew}",
                        headline=f"{W} has far more big-match experience ({ew} vs {el} matches)"))
    return out


def motivation_facts(c: Ctx) -> list[dict]:
    facts = []
    h1, h2 = c.f["p1"].get("home"), c.f["p2"].get("home")
    if h1 or h2:
        facts.append({"label": "Home player", "p1": "Yes" if h1 else "No", "p2": "Yes" if h2 else "No"})
    t1, t2 = c.pair("elo_trend_90d")
    if t1 is not None or t2 is not None:
        facts.append({"label": "Elo trend, 90 days", "p1": None if t1 is None else round(t1, 1),
                      "p2": None if t2 is None else round(t2, 1)})
    h2h = c.feat.get("h2h") or {}
    if num(h2h.get("p1_wins")) is not None and num(h2h.get("p2_wins")) is not None:
        facts.append({"label": "Head-to-head wins", "p1": int(h2h["p1_wins"]), "p2": int(h2h["p2_wins"])})
    for label, key in (("Deciding-set win % (1y)", "deciding_set_win_pct_1y"), ("Comeback rate %", "comeback_rate")):
        a, b = c.pair(key)
        if a is not None or b is not None:
            facts.append({"label": label, "p1": None if a is None else pct1(a), "p2": None if b is None else pct1(b)})
    e1, e2 = c.pair("experience")
    if e1 is not None or e2 is not None:
        facts.append({"label": "Experience (matches)", "p1": None if e1 is None else int(e1),
                      "p2": None if e2 is None else int(e2)})
    return facts


# --------------------------------------------------------------------------- conditions


def weather_flags(w: Optional[dict]) -> dict:
    if not w:
        return {}
    t, h, wd, p = num(w.get("temp_c")), num(w.get("humidity")), num(w.get("wind_kph")), num(w.get("precip_mm"))
    return {
        "hot": t is not None and (t > HEAT_C or (t >= 27 and h is not None and h > HUMID_PCT)),
        "humid": h is not None and h > HUMID_PCT,
        "windy": wd is not None and wd > WIND_KPH,
        "rain": p is not None and p >= RAIN_MM,
        "t": t, "h": h, "wd": wd, "p": p,
    }


def conditions_comps(c: Ctx) -> list[Comp]:
    out: list[Comp] = []
    surf = c.surface
    s1, s2 = c.pair("surface_win_rate_1y")
    n1, n2 = c.pair("surface_matches_1y")
    enough = (n1 is None or n1 >= 5) and (n2 is None or n2 >= 5)
    if s1 is not None and s2 is not None and enough and c.rates_ok():
        pts = clamp((s1 - s2) / 0.10, -1.5, 1.5)
        if abs(pts) >= 0.3:
            w = _dir(pts)
            l = other(w)
            sw, sl = c.v(w, "surface_win_rate_1y"), c.v(l, "surface_win_rate_1y")
            nw, nl = c.v(w, "surface_matches_1y"), c.v(l, "surface_matches_1y")
            W, L = c.name[w], c.name[l]
            nwt = f" ({int(nw)} matches)" if nw is not None else ""
            nlt = f" ({int(nl)})" if nl is not None else ""
            s = c.choose("surfwr", [
                f"On {surf}, {W} has won {pct(sw)} over the past year{nwt} to {poss(L)} {pct(sl)}{nlt}.",
                f"{W} is the more proven player on {surf}: {pct(sw)} wins in 12 months against {pct(sl)} for {L}.",
            ])
            out.append(Comp("surf_wr", "conditions", pts, f"{surf} win % (1y)", sentence=s,
                            up=f"Wins {pct(sw)} on {surf} over 12 months" + (f" ({int(nw)} matches)" if nw is not None else ""),
                            down=f"Wins only {pct(sl)} on {surf} over 12 months" + (f" ({int(nl)} matches)" if nl is not None else "")
                            if sl < 0.5 else f"{pct(sl)} win rate on {surf} (1y) vs {pct(sw)} for {W}",
                            headline=f"{W} has the stronger {surf} record ({pct(sw)} vs {pct(sl)})"))

    e1, e2 = c.pair("elo")
    se1, se2 = c.pair("surface_elo")
    if None not in (e1, e2, se1, se2) and c.rates_ok() and abs(se1 - e1) <= 150 and abs(se2 - e2) <= 150:
        d1, d2 = se1 - e1, se2 - e2
        pts = clamp((d1 - d2) / 30.0, -1.5, 1.5)
        if abs(pts) >= 0.3:
            w = _dir(pts)
            l = other(w)
            dw = d1 if w == "p1" else d2
            dl = d2 if w == "p1" else d1
            W, L = c.name[w], c.name[l]
            if dw < 0 and dl < 0:
                s = c.choose("surfeloneg", [
                    f"Both rate below their overall level on {surf}, but {W} holds up better ({sgn(dw)} Elo against {sgn(dl)} for {L}).",
                    f"{surf} costs both players Elo relative to their overall rating: {sgn(dw)} for {W}, {sgn(dl)} for {L}.",
                ])
                up = f"Holds up better on {surf}: {sgn(dw)} vs {sgn(dl)} relative to overall Elo"
                down = f"Drops off more on {surf}: {sgn(dl)} vs {sgn(dw)} relative to overall Elo"
                hl = f"{W} holds up better on {surf} ({sgn(dw)} vs {sgn(dl)} vs overall Elo)"
            elif dw >= 0 and dl >= 0:
                s = f"Both rate above their overall level on {surf}, {W} by more ({sgn(dw)} Elo against {sgn(dl)} for {L})."
                up = f"Gains more on {surf}: {sgn(dw)} vs {sgn(dl)} relative to overall Elo"
                down = f"Gains less on {surf}: {sgn(dl)} vs {sgn(dw)} relative to overall Elo"
                hl = f"{W} is the bigger {surf} specialist ({sgn(dw)} vs {sgn(dl)} vs overall Elo)"
            else:
                s = c.choose("surfelo", [
                    f"{W} rates {sgn(dw)} Elo points better on {surf} than overall; for {L} it is {sgn(dl)}.",
                    f"Surface Elo versus overall Elo: {W} {sgn(dw)}, {L} {sgn(dl)}, so {W} is the better fit for {surf}.",
                ])
                up = f"Surface Elo is {sgn(dw)} vs overall Elo on {surf}"
                down = f"Surface Elo is {sgn(dl)} vs overall Elo on {surf}"
                hl = f"{W} is a better fit for {surf} ({sgn(dw)} vs {sgn(dl)} Elo)"
            out.append(Comp("surf_spec", "conditions", pts, f"{surf} Elo minus overall Elo", sentence=s,
                            up=up, down=down, headline=hl))

    v1, v2 = c.pair("matches_on_surface_90d")
    if v1 is not None and v2 is not None and abs(v1 - v2) >= 3:
        pts = clamp((v1 - v2) / 6.0, -1.0, 1.0)
        w = _dir(pts)
        l = other(w)
        vw, vl = int(c.v(w, "matches_on_surface_90d")), int(c.v(l, "matches_on_surface_90d"))
        W, L = c.name[w], c.name[l]
        s = (f"{W} has {vw} matches on {surf} in the last 90 days, {L} {'none' if vl == 0 else 'only ' + str(vl)}, "
             "so the adjustment period is shorter.")
        out.append(Comp("surf_volume", "conditions", pts, f"Matches on {surf}, 90 days", sentence=s,
                        up=f"{vw} matches on {surf} in 90 days vs {vl}",
                        down=(f"No matches on {surf} in 90 days vs {vw}" if vl == 0 else f"Just {vl} matches on {surf} in 90 days vs {vw}"),
                        headline=f"{W} is more recently settled on {surf} ({vw} vs {vl} matches in 90 days)"))

    # weather / indoor
    fl = weather_flags(c.weather)
    tb1, tb2 = c.rel_pair("tiebreak_win_pct_1y")
    g1, g2 = c.pair("games_14d")
    if fl and not c.indoor:
        if fl.get("hot") and g1 is not None and g2 is not None:
            pts = clamp((g2 - g1) / 50.0, -1.0, 1.0) * 0.8
            if abs(pts) >= 0.3:
                w = _dir(pts)
                l = other(w)
                gw, gl = int(c.v(w, "games_14d")), int(c.v(l, "games_14d"))
                s = (f"It is {fl['t']:.0f}°C" + (f" and {fl['h']:.0f}% humid" if fl.get("humid") else "") +
                     f", so mileage matters: {c.name[w]} has {gw} games in 14 days to {poss(c.name[l])} {gl}.")
                out.append(Comp("heat", "conditions", pts, "Games, last 14 days (heat)", sentence=s,
                                up=f"Lighter load ({gw} vs {gl} games in 14 days) for a {fl['t']:.0f}°C day",
                                down=f"Heavier load ({gl} vs {gw} games in 14 days) for a {fl['t']:.0f}°C day",
                                headline=f"{c.name[w]} has less mileage for a {fl['t']:.0f}°C day"))
        if fl.get("windy") and tb1 is not None and tb2 is not None:
            pts = clamp((tb1 - tb2) / 0.15, -1.0, 1.0) * 0.8
            if abs(pts) >= 0.25:
                w = _dir(pts)
                l = other(w)
                tw, tl = c.v(w, "tiebreak_win_pct_1y"), c.v(l, "tiebreak_win_pct_1y")
                s = (f"With wind at {fl['wd']:.0f} km/h, margins shrink and tiebreaks loom; "
                     f"{c.name[w]} wins {pct(tw)} of them against {pct(tl)} for {c.name[l]}.")
                out.append(Comp("wind", "conditions", pts, "Tiebreak win % (wind)", sentence=s,
                                up=f"Wins {pct(tw)} of tiebreaks (1y) in {fl['wd']:.0f} km/h wind",
                                down=f"Wins {pct(tl)} of tiebreaks (1y) vs {pct(tw)} for {c.name[w]}",
                                headline=f"{c.name[w]} is better in tiebreaks ({pct(tw)} vs {pct(tl)}) with {fl['wd']:.0f} km/h wind"))
        bits = []
        if fl.get("t") is not None:
            bits.append(f"{fl['t']:.0f}°C")
        if fl.get("h") is not None:
            bits.append(f"{fl['h']:.0f}% humidity")
        if fl.get("wd") is not None:
            bits.append(f"{fl['wd']:.0f} km/h wind")
        if fl.get("rain"):
            bits.append(f"{fl['p']:.1f} mm of rain")
        if (fl.get("rain") or fl.get("windy") or fl.get("hot")) and bits:
            tail = " Expect possible delays and a stop-start rhythm." if fl.get("rain") else ""
            out.append(Comp("weather", "conditions", 0.0, "Forecast",
                            sentence=f"Forecast for the match window: {', '.join(bits)}.{tail}", extra=True))
    elif c.indoor:
        out.append(Comp("indoor", "conditions", 0.0, "Indoor",
                        sentence="Played indoors, so weather is not a factor.", extra=True))
    if c.indoor and tb1 is not None and tb2 is not None:
        pts = clamp((tb1 - tb2) / 0.20, -1.0, 1.0) * 0.8
        if abs(pts) >= 0.25:
            w = _dir(pts)
            l = other(w)
            tw, tl = c.v(w, "tiebreak_win_pct_1y"), c.v(l, "tiebreak_win_pct_1y")
            s = (f"Indoors there is no weather to worry about, and hold-heavy conditions raise the value of tiebreaks, "
                 f"where {c.name[w]} wins {pct(tw)} against {pct(tl)} for {c.name[l]}.")
            out.append(Comp("indoor_tb", "conditions", pts, "Tiebreak win % (indoor)", sentence=s,
                            up=f"Wins {pct(tw)} of tiebreaks (1y), useful indoors",
                            down=f"Wins {pct(tl)} of tiebreaks (1y) vs {pct(tw)} for {c.name[w]}",
                            headline=f"{c.name[w]} is better in tiebreaks ({pct(tw)} vs {pct(tl)}) indoors"))
    return out


def conditions_facts(c: Ctx) -> list[dict]:
    facts = []
    surf = c.surface
    spec = [
        (f"{surf} win % (1y)", "surface_win_rate_1y", pct1),
        ("Matches on surface (1y)", "surface_matches_1y", lambda x: int(x)),
        ("Surface Elo", "surface_elo", lambda x: int(round(x))),
        (f"Matches on {surf}, 90 days", "matches_on_surface_90d", lambda x: int(x)),
        ("Tiebreak win % (1y)", "tiebreak_win_pct_1y", pct1),
        ("Games won % (1y)", "games_won_pct_1y", pct1),
    ]
    for label, key, fn in spec:
        a, b = c.pair(key)
        if a is not None or b is not None:
            facts.append({"label": label, "p1": None if a is None else fn(a), "p2": None if b is None else fn(b)})
    e1, e2 = c.pair("elo")
    se1, se2 = c.pair("surface_elo")
    if None not in (e1, e2, se1, se2):
        facts.append({"label": "Surface Elo minus overall Elo", "p1": int(round(se1 - e1)), "p2": int(round(se2 - e2))})
    return facts


# --------------------------------------------------------------------------- market


def no_vig(o1: float, o2: float) -> tuple[float, float]:
    a, b = 1 / o1, 1 / o2
    return a / (a + b), b / (a + b)


def _valid_row(r: dict) -> bool:
    o1, o2 = num(r.get("p1_odds")), num(r.get("p2_odds"))
    return o1 is not None and o2 is not None and o1 > 1.0 and o2 > 1.0


BOOK_ORDER = ["pinnacle", "betfair", "bet365", "williamhill", "unibet", "betway", "draftkings", "fanduel"]
FRESH_HOURS = 12


def _parse_ts(x):
    from datetime import datetime, timezone
    try:
        d = datetime.fromisoformat(str(x).replace("Z", "+00:00"))
    except Exception:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def pick_display_odds(rows: list[dict], status: Optional[str], now) -> Optional[dict]:
    """The single price used for value (CONTRACT.md "The display price").
    1. latest source='manual' row; 2. else fresh rows only (scheduled/live: fetched_at within 12h of now;
    finished: any); 3. prefer pinnacle, betfair, bet365, williamhill, unibet, betway, draftkings, fanduel,
    other books, then 'avg'; never 'max'. Ties: latest fetched_at, then row order (rowid)."""
    from datetime import timedelta
    indexed = [(i, r) for i, r in enumerate(rows or []) if isinstance(r, dict) and _valid_row(r)]
    if not indexed:
        return None

    def recency(item):
        i, r = item
        rid = r.get("rowid")
        return (str(r.get("fetched_at") or ""), rid if isinstance(rid, (int, float)) else i, i)

    manual = [x for x in indexed if str(x[1].get("source") or "").lower() == "manual"]
    if manual:
        return max(manual, key=recency)[1]
    finished = status in ("final", "retired", "walkover")
    pool = []
    for i, r in indexed:
        if str(r.get("book") or "").lower() == "max":
            continue
        if not finished:
            t = _parse_ts(r.get("fetched_at"))
            if t is None or now is None or not (-timedelta(minutes=5) <= now - t <= timedelta(hours=FRESH_HOURS)):
                continue
        pool.append((i, r))
    if not pool:
        return None

    def rank(book):
        b = str(book or "").lower()
        if b in BOOK_ORDER:
            return BOOK_ORDER.index(b)
        return len(BOOK_ORDER) + (1 if b == "avg" else 0)

    best_rank = min(rank(r.get("book")) for _, r in pool)
    return max([x for x in pool if rank(x[1].get("book")) == best_rank], key=recency)[1]


def market_state(c: Ctx) -> Optional[dict]:
    raw_rows = [r for r in (c.raw.get("odds") or []) if isinstance(r, dict) and _valid_row(r)]
    row = pick_display_odds(c.raw.get("odds") or [], c.raw.get("status"), c.now)
    if not row:
        return None
    price = {"p1": float(row["p1_odds"]), "p2": float(row["p2_odds"])}
    q1 = no_vig(price["p1"], price["p2"])[0]
    # movement: first vs chosen row of the same book
    same = sorted([r for r in raw_rows if (r.get("source"), r.get("book")) == (row.get("source"), row.get("book"))
                   and str(r.get("fetched_at") or "") <= str(row.get("fetched_at") or "")],
                  key=lambda r: str(r.get("fetched_at") or ""))
    move = None
    if len(same) >= 2:
        move = {"open_p1": no_vig(float(same[0]["p1_odds"]), float(same[0]["p2_odds"]))[0], "latest_p1": q1}
    thin = [s for s in ("p1", "p2") if c.thin(s)]
    edges = {s: c.p[s] * price[s] - 1 for s in ("p1", "p2")}
    return {"q": {"p1": q1, "p2": 1 - q1}, "best": price, "book": row.get("book"), "edges": edges,
            "move": move, "thin": thin}


def value_block(c: Ctx, m: Optional[dict]) -> Optional[dict]:
    if not m or m.get("thin"):
        return None
    side = max(("p1", "p2"), key=lambda s: m["edges"][s])
    edge = m["edges"][side]
    if edge < c.edge_threshold or c.p[side] <= 0:
        return None
    return {"side": side, "edge": round(edge, 3), "fair_odds": round(1 / c.p[side], 2),
            "market_odds": round(m["best"][side], 2)}


def market_bucket(c: Ctx, m: Optional[dict], value: Optional[dict]) -> tuple[dict, list[Comp], str]:
    """Returns (bucket, comps for upsides/downsides, headline)."""
    title = BUCKET_TITLES["market"]
    if not m:
        text = c.choose("nomkt", [
            "No market price is available for this match yet, so there is nothing to benchmark the model against. "
            "Type odds into the dashboard to see where the model and the market disagree.",
            "There is no market price on file for this match, so the model cannot be checked against the bookmakers. "
            "Add odds in the dashboard and the value check will fill in.",
        ])
        b = {"key": "market", "title": title, "favours": "level", "strength": None, "text": text, "facts": []}
        return b, [], "no market price is available"
    q = m["q"]
    gap = abs(q["p1"] - 0.5)
    if gap < 0.03:
        favours, strength = "level", None
    else:
        favours = "p1" if q["p1"] > 0.5 else "p2"
        strength = "slight" if gap < 0.10 else ("moderate" if gap < 0.20 else "strong")
    mf = "p1" if q["p1"] >= 0.5 else "p2"
    ml = other(mf)
    MF, ML = c.name[mf], c.name[ml]
    sents: list[str] = []
    if favours == "level":
        sents.append(c.choose("mktlvl", [
            f"The market has this as a coin flip: {c.name['p1']} {pct(q['p1'])}, {c.name['p2']} {pct(q['p2'])} after removing the margin.",
            f"Bookmakers cannot split them, pricing {c.name['p1']} at {pct(q['p1'])} and {c.name['p2']} at {pct(q['p2'])} once the vig is stripped out.",
        ]))
    else:
        lead = {"slight": "a slight", "moderate": "a clear", "strong": "a heavy"}[strength]
        sents.append(c.choose("mktfav", [
            f"The market makes {MF} {lead} favourite at {pct(q[mf])} (margin removed), with {ML} at {pct(q[ml])}.",
            f"Stripping out the vig, the books rate {MF} at {pct(q[mf])} and {ML} at {pct(q[ml])}.",
        ]))
    gp = c.p[mf] - q[mf]
    diff_pts = abs(c.p["p1"] - q["p1"]) * 100
    if diff_pts >= 3:
        # which side does the model like more than the market?
        liked = "p1" if c.p["p1"] > q["p1"] else "p2"
        sents.append(
            f"The model is {diff_pts:.0f} points higher on {c.name[liked]} ({pct(c.p[liked])} against the market's {pct(q[liked])}); "
            "that gap is either value or information the model does not have.")
    else:
        sents.append(f"Model and market are within {diff_pts:.0f} points of each other, so there is little to exploit on the numbers.")
    mv = m["move"]
    if mv and abs(mv["latest_p1"] - mv["open_p1"]) >= 0.02:
        d = mv["latest_p1"] - mv["open_p1"]
        mover = "p1" if d > 0 else "p2"
        o = mv["open_p1"] if mover == "p1" else 1 - mv["open_p1"]
        l = mv["latest_p1"] if mover == "p1" else 1 - mv["latest_p1"]
        sents.append(f"The price has moved toward {c.name[mover]}, from {pct(o)} to {pct(l)} since the first quote.")
    if value:
        vs = value["side"]
        sents.append(
            f"At {value['market_odds']:.2f} the model sees a {value['edge'] * 100:.0f}% edge on {c.name[vs]} "
            f"(fair price {value['fair_odds']:.2f}).")
    elif m.get("thin"):
        names = " and ".join(f"{c.name[x]} ({int(c.v(x, 'experience'))} matches)" for x in m["thin"])
        sents.append(f"History is too thin on {names} to price a value edge.")
    else:
        best_edge = max(m["edges"].values())
        sents.append(f"No price clears the {c.edge_threshold * 100:.0f}% edge threshold (best available is {best_edge * 100:+.0f}%).")
    sents = sents[:4]
    facts = [
        {"label": "Model win %", "p1": pct1(c.p["p1"]), "p2": pct1(c.p["p2"])},
        {"label": "Market win % (no vig)", "p1": pct1(q["p1"]), "p2": pct1(q["p2"])},
        {"label": "Decimal odds used", "p1": round(m["best"]["p1"], 2), "p2": round(m["best"]["p2"], 2)},
    ]
    if not m.get("thin"):
        facts.append({"label": "Value edge %", "p1": round(m["edges"]["p1"] * 100, 1), "p2": round(m["edges"]["p2"] * 100, 1)})
    if mv:
        facts.insert(2, {"label": "Opening market win %", "p1": pct1(mv["open_p1"]), "p2": pct1(1 - mv["open_p1"])})
    b = {"key": "market", "title": title, "favours": favours, "strength": strength, "text": " ".join(sents), "facts": facts}
    comps: list[Comp] = []
    if favours != "level":
        w = favours
        sign = 1 if w == "p1" else -1
        comps.append(Comp("market_fav", "market", sign * clamp(gap * 8, 0.3, 2.0), "Market win %",
                          up=f"Market favourite at {pct(q[w])} (no vig)",
                          down=f"Market rates at just {pct(q[other(w)])} (no vig)"))
    if value:
        sign = 1 if value["side"] == "p1" else -1
        vs = value["side"]
        comps.append(Comp("value", "market", sign * clamp(value["edge"] * 8, 0.4, 2.5), "Value edge",
                          up=f"Model value edge of {value['edge'] * 100:.0f}% at {value['market_odds']:.2f}",
                          down=None))
        # the other side is priced about right or short: downside tied to the gap
        os_ = other(vs)
        if q[os_] > c.p[os_] + 0.02:
            comps.append(Comp("value_other", "market", sign * clamp(value["edge"] * 6, 0.3, 2.0), "Model vs market",
                              up=None,
                              down=f"Market prices at {pct(q[os_])} but the model only {pct(c.p[os_])}"))
    headline = (f"the market prices {MF} at {pct(q[mf])}" if favours != "level" else "the market sees a coin flip")
    return b, comps, headline


# --------------------------------------------------------------------------- rating / form signal pool


def signal_comps(c: Ctx) -> list[Comp]:
    out: list[Comp] = []

    def add(key, label, a, b, scale, fmt, up, down, cap=2.0, invert=False, minw=0.15):
        if a is None or b is None:
            return
        diff = (b - a) if invert else (a - b)
        pts = clamp(diff / scale, -cap, cap)
        if abs(pts) < minw:
            return
        w = _dir(pts)
        vw, vl = (a, b) if w == "p1" else (b, a)
        out.append(Comp(key, None, pts, label, up=up(fmt(vw), fmt(vl)), down=down(fmt(vl), fmt(vw))))

    e1, e2 = c.pair("elo")
    if e1 is not None and e2 is not None and abs(e1 - e2) >= 5:
        gap = abs(e1 - e2)
        add("elo", "Elo", e1, e2, 60.0, lambda x: f"{x:.0f}",
            lambda w, l: f"Elo {w} vs {l} (+{gap:.0f})",
            lambda l, w: f"Elo {l} vs {w}, {gap:.0f} points adrift")
    se1, se2 = c.pair("surface_elo")
    if se1 is not None and se2 is not None and abs(se1 - se2) >= 5:
        gap = abs(se1 - se2)
        add("surface_elo", "Surface Elo", se1, se2, 60.0, lambda x: f"{x:.0f}",
            lambda w, l: f"{c.surface} Elo {w} vs {l} (+{gap:.0f})",
            lambda l, w: f"{c.surface} Elo {l} vs {w}, {gap:.0f} points adrift")
    r1, r2 = c.pair("rank")
    if r1 and r2 and r1 > 0 and r2 > 0 and r1 != r2:
        pts = clamp(math.log(r2 / r1), -2.0, 2.0)
        if abs(pts) >= 0.15:
            w = _dir(pts)
            rw, rl = (r1, r2) if w == "p1" else (r2, r1)
            out.append(Comp("rank", None, pts, "Ranking",
                            up=f"Ranked No. {int(rw)} vs No. {int(rl)}",
                            down=f"Ranked No. {int(rl)} vs No. {int(rw)}"))
    add("win_rate", "Win rate (1y)", *c.rel_pair("win_rate_1y"), 0.08, pct,
        lambda w, l: f"Won {w} of matches over 12 months vs {l}",
        lambda l, w: f"Won {l} of matches over 12 months vs {w}")
    add("form", "Form (last 10)", *(c.pair("form_10") if c.rates_ok() else (None, None)), 0.12, pct,
        lambda w, l: f"{w} wins in the last 10 matches vs {l}",
        lambda l, w: f"{l} wins in the last 10 matches vs {w}")
    add("tiebreak", "Tiebreak win % (1y)", *c.rel_pair("tiebreak_win_pct_1y"), 0.12, pct,
        lambda w, l: f"Wins {w} of tiebreaks (1y) vs {l}",
        lambda l, w: f"Wins {l} of tiebreaks (1y) vs {w}", cap=1.5)
    add("games_won", "Games won % (1y)", *c.rel_pair("games_won_pct_1y"), 0.03, pct,
        lambda w, l: f"Wins {w} of all games played (1y) vs {l}",
        lambda l, w: f"Wins {l} of all games played (1y) vs {w}", cap=1.5)
    add("quality_form", "Quality-opposition form (30d)", *c.rel_pair("quality_form_30d"), 0.12, pct,
        lambda w, l: f"{w} form against stronger opposition (30d) vs {l}",
        lambda l, w: f"{l} form against stronger opposition (30d) vs {w}", cap=1.5)
    return out


# --------------------------------------------------------------------------- bucket text


FALLBACK = {
    "fitness": [
        "Workloads are broadly comparable, and neither player has an obvious rest or rhythm problem.",
        "Nothing in the recent schedule separates them physically.",
    ],
    "motivation": [
        "Nothing clearly separates them on motivation or pressure, so this one stays level.",
        "Neither player carries a clear edge in stakes, trend or head-to-head here.",
    ],
    "conditions": [
        "Surface and conditions do not split them in a meaningful way.",
        "Neither player has a clear edge in conditions, on the numbers available.",
    ],
}

NO_DATA = {
    "fitness": "There is not enough recent match data to compare workloads.",
    "motivation": "There is not enough history to judge motivation or pressure.",
    "conditions": "There is not enough surface data to separate them on conditions.",
}


def level_fallback(c: Ctx, key: str) -> list[str]:
    n1, n2 = c.name["p1"], c.name["p2"]
    out: list[str] = []
    if key == "fitness":
        g1, g2 = c.pair("games_14d")
        if g1 is not None and g2 is not None:
            if g1 == 0 and g2 == 0:
                dd1, dd2 = c.pair("days_since_last")
                tail = f"; their last matches were {int(dd1)} and {int(dd2)} days ago" if dd1 is not None and dd2 is not None else ""
                out.append(f"Neither has played in the last 14 days{tail}.")
                return out
            else:
                out.append(f"Workloads are close, {int(g1)} games for {n1} against {int(g2)} for {n2} over 14 days, "
                           "and neither shows a rest or rhythm problem.")
        d1, d2 = c.pair("days_since_last")
        if d1 is not None and d2 is not None:
            out.append(f"They last played {int(d1)} and {int(d2)} days ago respectively.")
    elif key == "motivation":
        t1, t2 = c.pair("elo_trend_90d")
        h2h = c.feat.get("h2h") or {}
        if t1 is not None and t2 is not None:
            out.append(f"Their 90-day Elo trends are close ({sgn(t1)} for {n1}, {sgn(t2)} for {n2}).")
        w1, w2 = num(h2h.get("p1_wins")), num(h2h.get("p2_wins"))
        if w1 is not None and w2 is not None:
            out.append("They have not met before." if w1 + w2 == 0 else f"The head-to-head offers no clear lead ({int(w1)}-{int(w2)}).")
        else:
            d1, d2 = c.rel_pair("deciding_set_win_pct_1y")
            if d1 is not None and d2 is not None:
                out.append(f"Deciding-set records are similar ({pct(d1)} and {pct(d2)}).")
    elif key == "conditions":
        s1, s2 = c.pair("surface_win_rate_1y")
        if s1 is not None and s2 is not None:
            out.append(f"Their {c.surface} records are close over 12 months ({pct(s1)} for {n1}, {pct(s2)} for {n2}).")
    return out[:2]


def compose_text(c: Ctx, key: str, favours: str, strength: Optional[str], comps: list[Comp]) -> str:
    real = sorted([x for x in comps if not x.extra and x.sentence], key=lambda x: -x.weight)
    extras = [x for x in comps if x.extra and x.sentence]
    topic = BUCKET_TOPIC[key]
    sents: list[str] = []
    if favours == "level":
        if not real:
            fb = level_fallback(c, key)
            if fb:
                sents.append(c.choose(f"fb{key}", [f"No clear edge on {topic}."]) if key != "fitness" else "Neither player has a fatigue edge.")
                sents.extend(fb)
            else:
                sents.append(FALLBACK[key][int(hashlib.md5((c.seed + key).encode()).hexdigest(), 16) % 2]
                             if (c.f["p1"] or c.f["p2"]) else NO_DATA[key])
        else:
            first = real[0]
            opp = next((x for x in real[1:] if x.fav != first.fav), None)
            if opp:
                sents.append(c.choose(f"lvl{key}", [
                    f"{topic.capitalize()} {'are' if key in PLURAL_TOPIC else 'is'} level, with offsetting factors.",
                    f"No clear edge on {topic}: two factors pull in opposite directions.",
                ]))
                sents.append(first.sentence)
                sents.append(opp.sentence)
            else:
                lean = c.name[first.fav] if first.fav else None
                lead = (c.choose(f"lvl{key}", [
                    f"Nothing decisive on {topic}, though it tilts slightly to {lean}.",
                    f"Not enough to call on {topic}; the small lean is to {lean}.",
                ]) if lean else f"No clear edge on {topic}.")
                sents.append(lead)
                sents.append(first.sentence)
                if len(real) > 1:
                    sents.append(real[1].sentence)
        sents.extend(x.sentence for x in extras[:1])
    else:
        W = c.name[favours]
        lead_opts = {
            "slight": [f"A slight edge to {W} on {topic}.", f"{W} gets a slim nod on {topic}."],
            "moderate": [f"{W} holds a clear advantage on {topic}.", f"{topic.capitalize()} {'point' if key in PLURAL_TOPIC else 'points'} fairly clearly to {W}."],
            "strong": [f"{W} has a decisive advantage on {topic}.", f"This is one-sided on {topic}: {W}."],
        }[strength or "slight"]
        sents.append(c.choose(f"lead{key}", lead_opts))
        sup = [x for x in real if x.fav == favours][:2]
        sents.extend(x.sentence for x in sup)
        sents.extend(x.sentence for x in extras[:1])
        opp = next((x for x in real if x.fav and x.fav != favours and x.weight >= 0.5), None)
        if opp and len(sents) < 4:
            sents.append("Offsetting that, " + _lower_first(opp.sentence, tuple(c.name.values()) + tuple(c.full.values())))
    if key == "conditions" and c.tour.get("surface_inferred") and len(sents) < 4:
        sents.append(f"The {c.surface} label is inferred from the venue rather than confirmed, so treat surface numbers with some care.")
    return " ".join(sents[:4])


# --------------------------------------------------------------------------- players

def _dedupe(items: list[str]) -> list[str]:
    seen, out = set(), []
    for t in items:
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


# --------------------------------------------------------------------------- main entry


def analyze(raw: dict, config: dict | None = None) -> dict:
    if config and "edge_threshold" not in raw:
        thr = (config.get("model") or {}).get("edge_threshold")
        if thr is not None:
            raw = {**raw, "edge_threshold": thr}
    c = Ctx(raw)

    comps_by_bucket = {
        "fitness": fitness_comps(c),
        "motivation": motivation_comps(c),
        "conditions": conditions_comps(c),
    }
    facts_by_bucket = {
        "fitness": fitness_facts(c),
        "motivation": motivation_facts(c),
        "conditions": conditions_facts(c),
    }
    buckets: list[dict] = []
    headlines: dict[str, str] = {}
    scores: dict[str, float] = {}
    all_comps: list[Comp] = []
    for key in ("fitness", "motivation", "conditions"):
        comps = comps_by_bucket[key]
        total = sum(x.pts for x in comps)
        favours, strength = strength_for(total, LEVEL_BELOW[key])
        text = compose_text(c, key, favours, strength, comps)
        buckets.append({"key": key, "title": BUCKET_TITLES[key], "favours": favours, "strength": strength,
                        "text": text, "facts": facts_by_bucket[key]})
        scores[key] = total
        top = sorted([x for x in comps if x.headline and x.fav and x.fav == favours], key=lambda x: -x.weight)
        headlines[key] = top[0].headline if top else ""
        all_comps.extend(comps)
    m = market_state(c)
    value = value_block(c, m)
    mb, mcomps, mhead = market_bucket(c, m, value)
    buckets.append(mb)
    headlines["market"] = mhead
    all_comps.extend(mcomps)
    sig = signal_comps(c)
    if any(x.key in ("wind", "indoor_tb") for x in all_comps):
        sig = [x for x in sig if x.key != "tiebreak"]
    all_comps.extend(sig)

    agreement = compute_agreement(c.pick, buckets)
    players = _players(c, all_comps, m)
    bottom = rules_bottom_line(c, buckets, agreement, value, m, headlines, all_comps)
    return {
        "model_pick": c.pick,
        "model_prob": round(c.p[c.pick], 3),
        "agreement": agreement,
        "buckets": buckets,
        "players": players,
        "value": value,
        "bottom_line": bottom,
        "market": m,
        "headlines": headlines,
    }


def _players(c: Ctx, comps: list[Comp], m: Optional[dict]) -> dict:
    """1-4 upsides/downsides per player from the strongest comps. No padding: if a player
    genuinely has little going for or against them, fewer (even one honest line) is returned."""
    out = {}
    last5 = {s: c.f[s].get("last5") or [] for s in ("p1", "p2")}
    used_keys = {x.key for x in comps}
    for side in ("p1", "p2"):
        opp = other(side)
        ups = sorted([x for x in comps if x.fav == side and x.up], key=lambda x: -x.weight)
        downs = sorted([x for x in comps if x.fav == opp and x.down], key=lambda x: -x.weight)

        def choose(lst, attr):
            picked = [x for x in lst if x.weight >= 0.35][:4]
            if not picked and lst:
                picked = lst[:1]
            return [getattr(x, attr) for x in picked]

        u = _dedupe(choose(ups, "up"))
        d = _dedupe(choose(downs, "down"))
        p = c.p[side]
        stat_up: list[str] = []
        stat_down: list[str] = []
        w5 = [r.get("result") for r in last5[side] if isinstance(r, dict) and r.get("result") in ("W", "L")]
        if len(w5) >= 4:
            wins = w5.count("W")
            if wins >= 4:
                stat_up.append(f"Won {wins} of the last {len(w5)} matches")
            if len(w5) - wins >= 3:
                stat_down.append(f"Lost {len(w5) - wins} of the last {len(w5)} matches")
        dec = c.v(side, "deciding_set_win_pct_1y")
        if dec is not None and not c.thin(side) and 0 < dec < 1 and "deciding" not in used_keys:
            if dec >= 0.6:
                stat_up.append(f"Wins {pct(dec)} of deciding sets (1y)")
            elif dec < 0.5:
                stat_down.append(f"Wins only {pct(dec)} of deciding sets (1y)")
        tb = c.v(side, "tiebreak_win_pct_1y")
        if tb is not None and not c.thin(side) and 0 < tb < 1 and "tiebreak" not in used_keys:
            if tb >= 0.6:
                stat_up.append(f"Wins {pct(tb)} of tiebreaks (1y)")
            elif tb < 0.5:
                stat_down.append(f"Wins only {pct(tb)} of tiebreaks (1y)")
        n = c.v(side, "surface_matches_1y")
        if n is not None:
            if n < 8:
                stat_down.append(f"Only {int(n)} matches on {c.surface} in the past year")
        ex = c.v(side, "experience")
        if ex is not None and ex < 15:
            d.insert(0, "No match history on record (Elo is the 1500 default)" if ex == 0
                     else f"Only {int(ex)} matches on record, so ratings are provisional")
        for bank, cur in ((stat_up, u), (stat_down, d)):
            for t in bank:
                if len(cur) >= 2:
                    break
                if t not in cur:
                    cur.append(t)
        if not u:
            u.append(f"Model still gives a {pct(p)} chance" if p < 0.5 else "Few clear advantages on the numbers")
        if not d:
            d.append(f"Model still leaves a {pct(1 - p)} chance of losing" if p >= 0.5 else "Few clear weaknesses on the numbers")
        out[side] = {"name": c.full[side], "upsides": u[:4], "downsides": d[:4]}
    return out


# --------------------------------------------------------------------------- bottom line


def rules_bottom_line(c: Ctx, buckets: list[dict], agreement: dict, value: Optional[dict],
                      m: Optional[dict], headlines: dict[str, str],
                      comps: Optional[list] = None) -> str:
    pick = c.pick
    P, O = c.name[pick], c.name[other(pick)]
    prob = pct(c.p[pick])
    label = agreement["label"].lower()
    s1 = c.choose("bl1", [
        f"The model leans {P} at {prob}; agreement across the four signals is {agreement['score']}/100 ({label}).",
        f"{P} is the model's pick at {prob}, and the agreement meter reads {agreement['score']}/100 ({label}).",
    ])
    against = [b for b in buckets if b["favours"] not in ("level", pick)]
    against.sort(key=lambda b: -STRENGTH_WEIGHT.get(b["strength"] or "", 0))
    if against:
        b = against[0]
        hl = headlines.get(b["key"]) or f"{b['title'].lower()} leans the other way"
        s2 = f"The biggest risk is {b['title'].lower()}: {hl}."
    else:
        opp_side = other(pick)
        oc = sorted([x for x in (comps or []) if x.fav == opp_side and x.headline and not x.extra],
                    key=lambda x: -x.weight)[:2]
        if oc:
            first = oc[0].headline
            txt = first
            if len(oc) > 1:
                second = oc[1].headline
                for nm_ in (c.name[opp_side], c.full[opp_side]):
                    if second.startswith(nm_ + " ") and first.startswith(nm_ + " "):
                        second = second[len(nm_) + 1:]
                        break
                txt = f"{first} and {second}"
            s2 = f"The main risk: {txt}."
        else:
            s2 = f"The main risk is simply the {pct(1 - c.p[pick])} the model leaves for {O}."
    if not m:
        s3 = "There is no market price yet, so value cannot be assessed."
    elif m.get("thin"):
        s3 = "The history on one of the players is too thin to price a value edge."
    elif value:
        s3 = (f"On value, {c.name[value['side']]} at {value['market_odds']:.2f} carries a {value['edge'] * 100:.0f}% "
              f"edge on the model's numbers.")
    else:
        s3 = f"No price clears the {c.edge_threshold * 100:.0f}% edge threshold, so there is no value flag."
    return " ".join([s1, s2, s3])
