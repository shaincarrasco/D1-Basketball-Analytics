// Moment engine: turns a live game's state into ranked candidate "moments" (an upset brewing,
// a 12–0 run, a 30-point night) with an interest score, so a card can show the coolest thing
// that has happened so far in one plain-words line.
//
// Pure: no React, no fetching. Inputs are our Game (names, pregame projection), ESPN's
// scoreboard state (LiveGame, already in our home/away orientation) and, when it has been
// fetched, ESPN's game summary (LiveSummary: plays, score flow and player box, also oriented).
//
// Scores are 0–100 and only order candidates against each other; they mean nothing on their own.
// Rough bands: 80+ = can't miss (overtime, a one-possession finish, a buzzer-beater that tied it),
// 50–80 = genuinely notable (big upset brewing, big comeback, long run), under 40 = colour
// (a 20-point night, a blowout, lots of lead changes).
import type { LiveGame } from "./live";
import type { LiveSummary, PlayerLine } from "./live-game";
import type { Game } from "./types";
import { REG_SECONDS, HALF_SECONDS, OT_SECONDS, clockLabel, remainingAt, winProb, type FlowPoint } from "./win-prob";

export type MomentKind =
  | "upset" | "comeback" | "overtime" | "close" | "blowout" | "swing"
  | "run" | "lead-changes" | "player" | "dunks" | "buzzer" | "chance";

export type Moment = {
  kind: MomentKind;
  /** 0–100, for ranking candidates. */
  score: number;
  /** Short label before the sentence ("12–0 run"), or null when the sentence stands alone. */
  lead: string | null;
  /** The plain-words sentence, with numbers. */
  body: string;
  /** lead + ": " + body. */
  text: string;
  /** Team the moment is about, in our orientation. */
  side: "home" | "away" | null;
  /** True when the line quotes a win probability (pregame or live). */
  model: boolean;
  /** The same sentence with the win probability left out, for readers who haven't asked for projections. Absent when nothing is left to say. */
  plain?: string;
  /** Elapsed game seconds when it happened; null = the current state of the game. */
  t: number | null;
  source: "scoreboard" | "plays";
};

/** The live state a moment is computed from (LiveGame and LiveSummary both fit). */
export type MomentClock = {
  state: LiveGame["state"]; statusName?: string; period: number; clock: number; elapsed: number | null;
  home: number | null; away: number | null; homePeriods?: number[] | null; awayPeriods?: number[] | null;
};

type Side = "home" | "away";
const other = (s: Side): Side => (s === "home" ? "away" : "home");
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const nameOf = (g: Game, s: Side) => g[s].name;
const sideOf = (homeMargin: number): Side => (homeMargin > 0 ? "home" : "away");

/** "14%", "under 1%", "over 99%". */
export function pctText(p: number): string {
  if (p < 0.005) return "under 1%";
  if (p > 0.995) return "over 99%";
  return `${Math.round(p * 100)}%`;
}

/** "a 96%", "an 81%", "an 8%", "an 11%", "an under 1%"… kept simple: "an" before 8, 11, 18 and the 80s. */
const aPct = (p: number) => { const t = pctText(p); const n = Math.round(p * 100); return `${n === 8 || n === 11 || n === 18 || (n >= 80 && n <= 89) ? "an" : "a"} ${t}`; };

export const otName = (period: number) => (period <= 3 ? "overtime" : period === 4 ? "double overtime" : period === 5 ? "triple overtime" : `${period - 2} overtimes`);
const otLabel = (period: number) => { const n = otName(period); return n[0].toUpperCase() + n.slice(1); };

/** End of a period in elapsed seconds (1, 2 = halves; 3+ = 5-minute overtimes). */
export const periodEnd = (period: number) => (period <= 2 ? Math.max(1, period) * HALF_SECONDS : REG_SECONDS + (period - 2) * OT_SECONDS);

/**
 * When in the game, in words: "in the first half", "at halftime", "with 9 minutes left",
 * "with 48 seconds left", "with 2 minutes left in overtime". `inOT: false` drops "in overtime".
 */
export function timePhrase(c: Pick<MomentClock, "period" | "clock" | "statusName">, inOT = true): string {
  const p = c.period, left = Math.max(0, c.clock);
  if (c.statusName === "STATUS_HALFTIME" || (p === 1 && c.statusName === "STATUS_END_PERIOD")) return "at halftime";
  if (c.statusName === "STATUS_END_PERIOD") return p === 2 ? "at the end of regulation" : `at the end of ${otName(p)}`;
  if (p <= 1) return left <= 0 ? "at halftime" : "in the first half";
  if (left <= 0) return p === 2 ? "at the end of regulation" : `at the end of ${otName(p)}`;
  const amount = left >= 60 ? plural(Math.floor(left / 60), "minute") : plural(Math.max(1, Math.ceil(left)), "second");
  return p === 2 || !inOT ? `with ${amount} left` : `with ${amount} left in ${otName(p)}`;
}

/** "Wake Forest leads by 8" / "tied at 60". */
function standing(g: Game, h: number, a: number): string {
  const m = h - a;
  return m === 0 ? `tied at ${h}` : `${nameOf(g, sideOf(m))} leads by ${Math.abs(m)}`;
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
/** "a 4-point", "an 8-point", "an 11-point". */
const aN = (n: number) => (n === 8 || n === 11 || n === 18 || (n >= 80 && n <= 89) ? `an ${n}` : `a ${n}`);

function make(kind: MomentKind, score: number, lead: string | null, body: string, extra: Partial<Moment> = {}): Moment {
  return { kind, score: round1(clamp(score)), lead, body, text: lead ? `${lead}: ${body}` : body, side: null, model: false, t: null, source: "scoreboard", ...extra };
}

/** A usable in-progress clock, or null (not live, no score yet, unknown period). */
function usable(c: MomentClock | null | undefined): (MomentClock & { home: number; away: number; elapsed: number }) | null {
  if (!c || c.state !== "in" || c.home == null || c.away == null || c.period < 1) return null;
  const elapsed = c.elapsed ?? null;
  if (elapsed == null) return null;
  return { ...c, home: c.home, away: c.away, elapsed };
}

// ---- scoreboard moments (always available) ------------------------------------------------------

/** Candidates from the scoreboard alone: upset brewing, comeback (line score), overtime, a one-possession finish, a blowout, a big swing in our win chance. */
export function scoreboardMoments(g: Game, live: MomentClock | null | undefined): Moment[] {
  const c = usable(live);
  if (!c) return [];
  const out: Moment[] = [];
  const { home: h, away: a, elapsed, period } = c;
  const m = h - a, am = Math.abs(m);
  const progress = Math.min(1, elapsed / REG_SECONDS);
  const when = timePhrase(c);
  const pre = g.pred;
  const liveHome = pre ? winProb(m, remainingAt(elapsed), pre.margin) : null;

  // Upset brewing: the pregame underdog (our model) leads, five minutes or more in.
  let upsetSide: Side | null = null;
  if (pre && elapsed >= 300) {
    const dog: Side = pre.wp < 0.5 ? "home" : "away";
    const p0 = dog === "home" ? pre.wp : 1 - pre.wp;
    const dogLead = dog === "home" ? m : -m;
    if (p0 <= 0.4 && dogLead >= 1) {
      upsetSide = dog;
      const score = 35 + 40 * ((0.4 - p0) / 0.4) + 20 * progress + Math.min(dogLead, 10);
      out.push(make("upset", score, "Upset brewing", `${nameOf(g, dog)} (${pctText(p0)} pregame chance) leads by ${dogLead} ${when}`, { side: dog, model: true, plain: `${nameOf(g, dog)} leads by ${dogLead} ${when}` }));
    }
  }

  // Comeback from the line score: down 8+ at the half, now level or ahead.
  const hp = c.homePeriods, ap = c.awayPeriods;
  if (period >= 2 && c.statusName !== "STATUS_HALFTIME" && hp?.length && ap?.length) {
    const half = hp[0] - ap[0];
    if (Math.abs(half) >= 8) {
      const t: Side = half < 0 ? "home" : "away";
      const deficit = Math.abs(half);
      const now = t === "home" ? m : -m;
      if (now >= 0) {
        const body = now > 0
          ? `${nameOf(g, t)} trailed by ${deficit} at the half and now leads by ${now}`
          : `${nameOf(g, t)} trailed by ${deficit} at the half and has tied it at ${h}`;
        out.push(make("comeback", 40 + 2.5 * deficit + (now > 0 ? 8 : 0), "Comeback", body, { side: t }));
      }
    }
  }

  // Overtime.
  if (period >= 3) {
    const ots = period - 2;
    const reg = hp && ap && hp.length >= 2 && ap.length >= 2 ? hp[0] + hp[1] : null;
    const tied = reg != null && ap && reg === ap[0] + ap[1] ? reg : null;
    const now = m === 0 ? `tied at ${h}` : `${nameOf(g, sideOf(m))} leads by ${am}`;
    const body = tied != null ? `Tied at ${tied} after regulation; now ${now} ${timePhrase(c, false)}` : `${cap(now)} ${timePhrase(c, false)}`;
    out.push(make("overtime", 82 + 4 * (ots - 1) + (am <= 3 ? 5 : 0), otLabel(period), body, { side: m === 0 ? null : sideOf(m) }));
  }

  // One-possession game in the last five minutes of regulation.
  if (period === 2 && c.clock <= 300 && am <= 3) {
    const body = m === 0 ? `Tied at ${h} ${when}` : `${nameOf(g, sideOf(m))} leads by ${am} ${when}`;
    out.push(make("close", 58 + 30 * ((300 - c.clock) / 300) + (3 - am) * 2, "One-possession game", body, { side: m === 0 ? null : sideOf(m) }));
  }

  // Blowout in progress (only worth a line when nothing else is going on).
  if (am >= 20 && upsetSide == null) {
    const w = sideOf(m);
    out.push(make("blowout", 12 + Math.min(18, (am - 20) * 0.8), "Blowout", `${nameOf(g, w)} leads ${nameOf(g, other(w))} by ${am} ${when}`, { side: w }));
  }

  // Biggest swing in our win chance since tip-off.
  if (pre && liveHome != null && elapsed >= 300) {
    const d = liveHome - pre.wp;
    const s: Side = d > 0 ? "home" : "away";
    if (Math.abs(d) >= 0.25 && s !== upsetSide) {
      const before = s === "home" ? pre.wp : 1 - pre.wp, now = s === "home" ? liveHome : 1 - liveHome;
      const flipped = before < 0.5 && now >= 0.5;
      out.push(make("swing", 20 + 60 * ((Math.abs(d) - 0.25) / 0.75) + (flipped ? 15 : 0), "Big swing",
        `${nameOf(g, s)} is now ${pctText(now)} to win, up from ${pctText(before)} before tip`, { side: s, model: true }));
    }
  }
  // Fallback so every live card says something: our live win chance from here (ranks below everything).
  if (pre && liveHome != null && !out.length) {
    const s: Side = liveHome >= 0.5 ? "home" : "away";
    const p = s === "home" ? liveHome : 1 - liveHome;
    out.push(make("chance", 3, null, `${nameOf(g, s)} has ${aPct(p)} chance to win from here`, { side: s, model: true }));
  }
  return out;
}

// ---- play-by-play moments -------------------------------------------------------------------

type ScoreEvent = { t: number; side: Side; pts: number; h: number; a: number };

/** Scoring events from a flow ([t, home, away] after each score), split per team. */
export function scoreEvents(flow: FlowPoint[]): ScoreEvent[] {
  const out: ScoreEvent[] = [];
  let ph = 0, pa = 0;
  for (const [t, h, a] of [...flow].sort((x, y) => x[0] - y[0])) {
    const dh = h - ph, da = a - pa;
    // A corrected score (negative change) resets the baseline without counting as points.
    if (dh > 0) out.push({ t, side: "home", pts: dh, h, a: da > 0 ? pa : a });
    if (da > 0) out.push({ t, side: "away", pts: da, h, a });
    ph = h; pa = a;
  }
  return out;
}

export type Run = { side: Side; for: number; against: number; start: number; end: number; before: number; after: number; preH: number; preA: number; h: number; a: number; ongoing: boolean };

/**
 * The biggest scoring run: a stretch that starts and ends with baskets by one team, in which it
 * scores 10+ and the other team no more than a fifth as much (10–0, 12–2, 15–3, 20–4).
 * Ranked by points for minus against; ties go to the later run. `before`/`after` are that team's
 * margin just before the run and at its end.
 */
export function biggestRun(flow: FlowPoint[]): Run | null {
  const ev = scoreEvents(flow);
  let best: Run | null = null;
  for (let i = 0; i < ev.length; i++) {
    const s = ev[i].side;
    let f = 0, ag = 0;
    for (let j = i; j < ev.length; j++) {
      if (ev[j].side === s) f += ev[j].pts; else ag += ev[j].pts;
      if (ag > 4) break;
      if (ev[j].side !== s || f < 10 || ag > Math.floor(f / 5)) continue;
      const value = f - ag;
      const bestValue = best ? best.for - best.against : -1;
      if (value > bestValue || (value === bestValue && best && ev[j].t >= best.end)) {
        const preH = ev[i].h - (s === "home" ? ev[i].pts : 0), preA = ev[i].a - (s === "away" ? ev[i].pts : 0);
        const sign = s === "home" ? 1 : -1;
        let ongoing = true;
        for (let k = j + 1; k < ev.length; k++) if (ev[k].side !== s) { ongoing = false; break; }
        // Points the same team scored after j still belong to the run when it is ongoing; count them.
        let fAll = f, hEnd = ev[j].h, aEnd = ev[j].a;
        if (ongoing) for (let k = j + 1; k < ev.length; k++) { fAll += ev[k].pts; hEnd = ev[k].h; aEnd = ev[k].a; }
        best = {
          side: s, for: fAll, against: ag, start: ev[i].t, end: ongoing && ev.length ? ev[ev.length - 1].t : ev[j].t,
          before: sign * (preH - preA), after: sign * (hEnd - aEnd), preH, preA, h: hEnd, a: aEnd, ongoing,
        };
      }
    }
  }
  return best;
}

function runBody(g: Game, r: Run): string {
  const n = nameOf(g, r.side), has = r.ongoing ? "has " : "";
  const v = (past: string, perfect: string) => `${n} ${r.ongoing ? has + perfect : past}`;
  if (r.preH === 0 && r.preA === 0) return `${v("opened the game with it", "opened the game with it")} to lead by ${r.after}`;
  if (r.before < 0 && r.after > 0) return `${v("turned", "turned")} ${aN(-r.before)}-point deficit into ${aN(r.after)}-point lead`;
  if (r.before < 0 && r.after === 0) return `${v("erased", "erased")} ${aN(-r.before)}-point deficit to tie it at ${r.h}`;
  if (r.before < 0) return `${v("cut", "cut")} ${aN(-r.before)}-point deficit to ${-r.after}`;
  if (r.before === 0) return `${v("broke", "broken")} a tie at ${r.preH} to lead by ${r.after}`;
  return `${v("stretched", "stretched")} ${aN(r.before)}-point lead to ${r.after}`;
}

export type FlowStats = { leadChanges: number; ties: number; maxDeficit: Record<Side, number> };

/** Lead changes, ties (after 0–0) and the largest deficit each team has faced, from the flow. */
export function flowStats(flow: FlowPoint[]): FlowStats {
  let leader = 0, prev = 0, leadChanges = 0, ties = 0;
  const maxDeficit = { home: 0, away: 0 };
  for (const [, h, a] of [...flow].sort((x, y) => x[0] - y[0])) {
    const m = h - a, s = Math.sign(m);
    if (s !== 0 && leader !== 0 && s !== leader) leadChanges++;
    if (s === 0 && prev !== 0) ties++;
    if (s !== 0) leader = s;
    prev = m;
    if (m < 0) maxDeficit.home = Math.max(maxDeficit.home, -m);
    if (m > 0) maxDeficit.away = Math.max(maxDeficit.away, m);
  }
  return { leadChanges, ties, maxDeficit };
}

const DUNK = /\b(dunk|alley[\s-]?oop)\b/i;
const OOP = /\balley[\s-]?oop\b/i;
const FREE_THROW = /free throw/i;

/** "Marcus Holloway made Three Point Jumper. Assisted by …" → "Marcus Holloway". */
export function shooterName(text: string): string | null {
  const m = /^(.+?)\s+made\b/i.exec(text.trim());
  return m ? m[1].trim() : null;
}

function shotWord(text: string, value: number): string {
  if (DUNK.test(text)) return OOP.test(text) ? "alley-oop" : "dunk";
  if (value === 3 || /three point/i.test(text)) return "three";
  if (/layup/i.test(text)) return "layup";
  if (/tip/i.test(text)) return "tip-in";
  return "jumper";
}

function playerMoment(g: Game, side: Side, p: PlayerLine, c: MomentClock & { elapsed: number }): Moment | null {
  if (p.dnp) return null;
  const pts = p.pts ?? 0, reb = p.reb ?? 0, ast = p.ast ?? 0, blk = p.blk ?? 0, stl = p.stl ?? 0, tpm = p.tpm ?? 0;
  const tens = [pts, reb, ast, blk, stl].filter(v => v >= 10).length;
  const items: { kind: string; score: number }[] = [];
  const frac = Math.max(0.25, Math.min(1, c.elapsed / REG_SECONDS));
  if (pts >= 20 || (c.period <= 1 && pts >= 14)) items.push({ kind: "pts", score: 22 + (pts - 18) * 2.2 + clamp((pts / frac - 30) * 0.8, 0, 15) });
  if (tpm >= 5) items.push({ kind: "threes", score: 28 + (tpm - 5) * 7 });
  if (tens >= 3) items.push({ kind: "triple", score: 80 });
  else if (tens === 2) items.push({ kind: "double", score: 28 + (Math.max(pts, reb, ast) >= 15 ? 4 : 0) });
  if (blk >= 4) items.push({ kind: "blocks", score: 26 + (blk - 4) * 7 });
  if (!items.length) return null;
  items.sort((x, y) => y.score - x.score);
  const top = items[0].kind;
  const score = items[0].score + 5 * (items.length - 1);
  const n = p.name;
  const shooting = p.fgm != null && p.fga ? ` on ${p.fgm}-of-${p.fga} shooting` : "";
  const stats = [pts >= 10 ? `${pts} points` : null, reb >= 10 ? `${reb} rebounds` : null, ast >= 10 ? `${ast} assists` : null, blk >= 10 ? `${blk} blocks` : null, stl >= 10 ? `${stl} steals` : null].filter(Boolean) as string[];
  const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  let body: string;
  if (top === "triple") body = `${n} has a triple-double: ${list(stats)}`;
  else if (top === "double") body = `${n} has a double-double: ${list(stats)}`;
  else if (top === "threes") body = `${n} has made ${tpm} threes${p.tpa ? ` (${tpm} of ${p.tpa})` : ""} for ${pts} points`;
  else if (top === "blocks") body = `${n} has ${blk} blocks${pts >= 10 ? ` and ${pts} points` : ""}`;
  else {
    const extra = [reb >= 10 ? `${reb} rebounds` : null, ast >= 10 ? `${ast} assists` : null].filter(Boolean) as string[];
    body = extra.length ? `${n} has ${pts} points and ${list(extra)} ${timePhrase(c)}`
      : `${n} has ${pts} points${shooting}${tpm >= 5 ? `, including ${tpm} threes` : ""} ${timePhrase(c)}`;
  }
  return make("player", score, null, body, { side, source: "plays" });
}

/**
 * Candidates from ESPN's play-by-play and box score: the biggest scoring run, lead changes and
 * ties, the largest comeback so far, big individual games, a dunk streak and buzzer-beaters.
 * `now` is the scoreboard state when it is fresher than the summary (keeps "now leads by" in step
 * with the score on the card).
 */
export function playMoments(g: Game, s: LiveSummary | null | undefined, now?: MomentClock | null): Moment[] {
  const sc = usable(s);
  if (!s || !sc) return [];
  const cur = usable(now) && (now!.elapsed ?? 0) >= sc.elapsed ? usable(now)! : sc;
  const out: Moment[] = [];
  const flow = s.flow?.length ? s.flow : [[0, 0, 0] as FlowPoint];
  const m = cur.home - cur.away;
  const progress = Math.min(1, cur.elapsed / REG_SECONDS);

  // Scoring run.
  const run = biggestRun(flow);
  if (run) {
    // Ongoing only if the other team hasn't scored since, per the fresher scoreboard too.
    const oppNow = run.side === "home" ? cur.away : cur.home;
    const ongoing = run.ongoing && oppNow === (run.side === "home" ? run.a : run.h);
    const r = { ...run, ongoing };
    const value = r.for - r.against;
    const recent = cur.elapsed - r.end <= 240;
    const score = 30 + (value - 8) * 3.5 + (ongoing ? 14 : 0) + (r.before < 0 && r.after > 0 ? 10 : 0) + (recent ? 6 : 0);
    out.push(make("run", Math.min(90, score), `${r.for}–${r.against} run`, runBody(g, r), { side: r.side, t: r.end, source: "plays" }));
  }

  const fs = flowStats(flow);

  // Back and forth.
  if (fs.leadChanges >= 6) {
    const body = `${plural(fs.leadChanges, "lead change")}${fs.ties ? ` and ${plural(fs.ties, "tie")}` : ""} so far`;
    out.push(make("lead-changes", Math.min(70, 25 + 3 * fs.leadChanges + (Math.abs(m) <= 5 && cur.period >= 2 ? 10 : 0)), "Back and forth", body, { source: "plays" }));
  }

  // Largest comeback so far: the side now level or ahead was down 10+.
  for (const side of ["home", "away"] as Side[]) {
    const d = fs.maxDeficit[side];
    const lead = side === "home" ? m : -m;
    if (d < 10 || lead < 0 || (lead === 0 && fs.maxDeficit[other(side)] > d)) continue;
    const body = lead > 0 ? `${nameOf(g, side)} was down ${d} and now leads by ${lead}` : `${nameOf(g, side)} was down ${d} and has tied it at ${cur.home}`;
    out.push(make("comeback", Math.min(92, 41 + 2.4 * d + 10 * progress + (lead > 0 ? 5 : 0)), "Comeback", body, { side, source: "plays" }));
  }

  // Big individual games.
  for (const side of ["home", "away"] as Side[]) {
    for (const p of s.box?.[side]?.players ?? []) {
      const pm = playerMoment(g, side, p, sc);
      if (pm) out.push(pm);
    }
  }

  // Dunks: three or more by one team inside three minutes, or six or more so far.
  for (const side of ["home", "away"] as Side[]) {
    const dunks = s.plays.filter(p => p.side === side && p.scoring && p.value >= 2 && DUNK.test(p.text));
    if (!dunks.length) continue;
    let bestN = 0, bestI = 0, bestJ = 0;
    for (let i = 0, j = 0; j < dunks.length; j++) {
      while (dunks[j].t - dunks[i].t > 180) i++;
      if (j - i + 1 >= bestN) { bestN = j - i + 1; bestI = i; bestJ = j; }
    }
    if (bestN >= 3) {
      const span = Math.max(1, Math.ceil((dunks[bestJ].t - dunks[bestI].t) / 60));
      const oops = dunks.slice(bestI, bestJ + 1).filter(p => OOP.test(p.text)).length;
      const recent = cur.elapsed - dunks[bestJ].t <= 240;
      out.push(make("dunks", 30 + 6 * (bestN - 3) + (recent ? 8 : 0), "Dunk streak",
        `${nameOf(g, side)} has ${bestN} dunks in ${plural(span, "minute")}${oops ? `, including ${oops === 1 ? "an alley-oop" : `${oops} alley-oops`}` : ""}`,
        { side, t: dunks[bestJ].t, source: "plays" }));
    } else if (dunks.length >= 6) {
      out.push(make("dunks", 22 + 2 * (dunks.length - 6), "Dunks", `${nameOf(g, side)} has ${dunks.length} dunks so far`, { side, source: "plays" }));
    }
  }

  // Buzzer-beaters at the end of a half or overtime.
  for (let i = 0; i < s.plays.length; i++) {
    const p = s.plays[i];
    if (!p.scoring || !p.side || FREE_THROW.test(p.text) || p.t < periodEnd(p.period) - 1) continue;
    const prev = s.plays.slice(0, i).reverse().find(x => x.home !== p.home || x.away !== p.away) ?? null;
    const ph = prev ? prev.home : 0, pa = prev ? prev.away : 0;
    const pts = p.side === "home" ? p.home - ph : p.away - pa;
    const value = p.value || pts;
    if (value < 2) continue;
    const sign = p.side === "home" ? 1 : -1;
    const before = sign * (ph - pa), after = sign * (p.home - p.away);
    const team = nameOf(g, p.side);
    const effect = after === 0 ? `tied the game at ${p.home}`
      : after > 0 && before <= 0 ? `put ${team} ahead by ${after}`
      : after > 0 ? `gave ${team} a ${after}-point lead`
      : `cut ${team}'s deficit to ${-after}`;
    const end = p.period === 1 ? "the first half" : p.period === 2 ? "regulation" : otName(p.period);
    const who = shooterName(p.text);
    const word = shotWord(p.text, value);
    const body = `${who ? `${who}'s` : `${team}'s`} ${word} at the end of ${end} ${effect}`;
    const big = after === 0 || (after > 0 && before <= 0);
    out.push(make("buzzer", 52 + (value === 3 ? 6 : 0) + (big ? 14 : 0) + (p.period >= 2 ? 15 : 0), "Buzzer-beater", body, { side: p.side, t: p.t, source: "plays" }));
  }
  return out;
}

// ---- ranking ------------------------------------------------------------------------------

const KIND_ORDER: MomentKind[] = ["overtime", "buzzer", "close", "upset", "comeback", "run", "player", "swing", "dunks", "lead-changes", "blowout", "chance"];

/**
 * All candidates for a live game, best first. Play-by-play candidates join when a summary is
 * given; one moment per kind except players, runs and buzzer-beaters (one per player / the best run).
 */
export function gameMoments(g: Game, live: MomentClock | null | undefined, summary?: LiveSummary | null, opts: { projections?: boolean } = {}): Moment[] {
  const plays = summary ? playMoments(g, summary, live) : [];
  const all = [...scoreboardMoments(g, live).filter(m => m.kind !== "chance" || !plays.length), ...plays].flatMap(m => (opts.projections === false ? withoutProjection(m) : [m]));
  const byKind = new Map<string, Moment>();
  for (const mo of all) {
    const key = mo.kind === "player" ? `player:${mo.body.split(" has ")[0]}` : mo.kind === "buzzer" ? `buzzer:${mo.t}` : mo.kind;
    const have = byKind.get(key);
    // Same score: the play-by-play version is the more precise one.
    if (!have || mo.score > have.score || (mo.score === have.score && mo.source === "plays")) byKind.set(key, mo);
  }
  return [...byKind.values()].sort((x, y) => y.score - x.score || KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind) || (y.t ?? 1e9) - (x.t ?? 1e9));
}

/** A moment as shown to a reader who hasn't asked for projections: the win probability is dropped, and so is a line that says nothing else. */
function withoutProjection(m: Moment): Moment[] {
  if (!m.model) return [m];
  if (!m.plain) return [];
  return [{ ...m, body: m.plain, text: m.lead ? `${m.lead}: ${m.plain}` : m.plain, model: false }];
}

/** The single best moment so far, or null. */
export function bestMoment(g: Game, live: MomentClock | null | undefined, summary?: LiveSummary | null, opts: { projections?: boolean } = {}): Moment | null {
  return gameMoments(g, live, summary, opts)[0] ?? null;
}

/** "2nd 8:41" for a moment with a time, "Now" for the current state. */
export const momentWhen = (mo: Pick<Moment, "t">) => (mo.t == null ? "Now" : clockLabel(mo.t));

/**
 * How exciting a live game is right now, for sorting the Live view (scoreboard only, so the
 * order doesn't jump when play-by-play arrives): close and late (our live win chance near 50%,
 * weighted toward the end), overtime, an underdog ahead, and how far our win chance has moved
 * since tip. 0 for a game that isn't in progress.
 */
export function excitement(g: Game, live: MomentClock | null | undefined): number {
  const c = usable(live);
  if (!c) return 0;
  const m = c.home - c.away;
  const progress = Math.min(1, c.elapsed / REG_SECONDS);
  const pre = g.pred;
  const wp = winProb(m, remainingAt(c.elapsed), pre?.margin ?? 0);
  const tension = 1 - Math.abs(2 * wp - 1);
  const rem = remainingAt(c.elapsed), am = Math.abs(m);
  let x = 50 * tension * (0.3 + 0.7 * progress);
  if (c.period >= 2 && rem <= 300 && am <= 5) x += 35 * (1 - rem / 300) * (1 - am / 6);
  if (c.period >= 3) x += 25 + 3 * (c.period - 3);
  if (pre) {
    const dog: Side = pre.wp < 0.5 ? "home" : "away";
    const p0 = dog === "home" ? pre.wp : 1 - pre.wp;
    const p1 = dog === "home" ? wp : 1 - wp;
    if ((dog === "home" ? m : -m) > 0) x += 25 * Math.max(0, p1 - p0);
    x += 15 * Math.abs(wp - pre.wp);
  }
  return round1(x);
}
