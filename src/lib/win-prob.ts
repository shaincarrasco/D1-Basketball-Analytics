// In-game win probability and game-flow summaries from Game.flow ([elapsedSec, home, away]
// after each scoring play) and the pregame projection.
//
// WP(t) = Φ( (margin_t + pregameMargin · r) / (σ · √r + ε) ),  r = remaining / 2400
//
// - margin_t is home − away at elapsed time t; pregameMargin is Game.pred.margin (home − away).
//   The pregame edge is assumed to be earned evenly over 40 minutes, so only the unplayed share counts.
// - σ = 11 points: the spread of a full 40-minute final margin around its expectation. DHR's own
//   single-game noise is 10.5 points; 11 adds a little for rating uncertainty early in the season.
//   The remaining-margin spread shrinks with √(time left), as for a random walk.
// - ε = 0.5 points keeps the denominator positive at the horn, so a tie with no time left is 50%.
// - remaining = max(0, 2400 − t) in regulation; in overtime it is the time left in the current
//   5-minute (300 s) period.
import type { Game } from "./types";

export const WP_SIGMA = 11;
export const WP_EPS = 0.5;
export const REG_SECONDS = 2400;
export const HALF_SECONDS = 1200;
export const OT_SECONDS = 300;

export type FlowPoint = [t: number, home: number, away: number];

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function phi(z: number): number {
  const s = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + s * y);
}

/** Seconds left in the current period structure at elapsed time t (regulation, then 300 s OTs). */
export function remainingAt(t: number): number {
  if (t < REG_SECONDS) return REG_SECONDS - t;
  const into = t - REG_SECONDS;
  const end = REG_SECONDS + Math.max(1, Math.ceil(into / OT_SECONDS)) * OT_SECONDS;
  return Math.max(0, end - t);
}

/** Home win probability with `margin` (home − away) and `remaining` seconds left. */
export function winProb(margin: number, remaining: number, pregameMargin = 0): number {
  const r = Math.max(0, remaining) / REG_SECONDS;
  return phi((margin + pregameMargin * r) / (WP_SIGMA * Math.sqrt(r) + WP_EPS));
}

/** Elapsed seconds from a period number (1, 2 = halves; 3+ = OTs) and the seconds left on its clock. */
export function elapsedFrom(period: number, clockSec: number): number {
  if (period <= 2) return (Math.max(1, period) - 1) * HALF_SECONDS + (HALF_SECONDS - clockSec);
  return REG_SECONDS + (period - 3) * OT_SECONDS + (OT_SECONDS - clockSec);
}

/** "1st 8:41", "2nd 0:12", "OT 2:03", "2OT 4:59" for an elapsed time. */
export function clockLabel(t: number): string {
  let period: string, left: number;
  if (t < HALF_SECONDS) { period = "1st"; left = HALF_SECONDS - t; }
  else if (t < REG_SECONDS) { period = "2nd"; left = REG_SECONDS - t; }
  else {
    const k = Math.max(1, Math.ceil((t - REG_SECONDS) / OT_SECONDS) || 1);
    period = k === 1 ? "OT" : `${k}OT`;
    left = REG_SECONDS + k * OT_SECONDS - t;
  }
  left = Math.max(0, Math.round(left));
  return `${period} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

/**
 * The game's flow in home/away orientation, starting at 0–0. A few feeds arrive with the teams
 * swapped; when the final flow score matches the box score only after swapping, swap it back.
 */
export function normalizedFlow(g: Game): FlowPoint[] | null {
  const raw = g.flow;
  if (!raw || raw.length < 2) return null;
  let flow = [...raw].sort((a, b) => a[0] - b[0]) as FlowPoint[];
  const last = flow[flow.length - 1];
  const hs = g.home.score, as = g.away.score;
  if (hs != null && as != null && (last[1] !== hs || last[2] !== as) && last[1] === as && last[2] === hs) {
    flow = flow.map(([t, h, a]) => [t, a, h]);
  }
  if (flow[0][0] > 0 || flow[0][1] !== 0 || flow[0][2] !== 0) flow = [[0, 0, 0], ...flow];
  return flow;
}

/** Number of overtime periods implied by the flow and the line score. */
export function overtimes(g: Game, flow: FlowPoint[] | null): number {
  const fromPeriods = Math.max(g.home.periods?.length ?? 0, g.away.periods?.length ?? 0) - 2;
  const lastT = flow?.length ? flow[flow.length - 1][0] : 0;
  const fromFlow = lastT > REG_SECONDS ? Math.ceil((lastT - REG_SECONDS) / OT_SECONDS) : 0;
  return Math.max(0, fromPeriods, fromFlow);
}

export type WPPoint = { t: number; wp: number; margin: number; home: number; away: number };
export type Lead = { side: "home" | "away"; size: number; t: number; home: number; away: number } | null;
export type FlowSummary = {
  points: WPPoint[];
  /** Scoring plays (after each one) — for keyboard stepping and the margin line. */
  events: WPPoint[];
  end: number;
  ots: number;
  leadChanges: number;
  ties: number;
  biggest: { home: Lead; away: Lead };
  /** Largest swing in home win probability from a single scoring play. */
  bigSwing: { t: number; delta: number; home: number; away: number } | null;
  final: boolean;
};

/**
 * Win-probability curve for a final or in-progress game. Sampled every `step` seconds (so the
 * curve drifts toward the leader between baskets) plus a before/after point at every score.
 * `now` (elapsed seconds) extends an in-progress game to the live clock.
 */
export function flowSummary(g: Game, opts: { now?: number | null; step?: number } = {}): FlowSummary | null {
  const flow = normalizedFlow(g);
  if (!flow) return null;
  const final = g.status === "final";
  const pre = g.pred?.margin ?? 0;
  const ots = overtimes(g, flow);
  const lastT = flow[flow.length - 1][0];
  const end = final ? REG_SECONDS + ots * OT_SECONDS : Math.max(lastT, opts.now ?? lastT);
  const step = opts.step ?? 15;

  const at = (t: number, h: number, a: number): WPPoint => ({ t, wp: winProb(h - a, remainingAt(t), pre), margin: h - a, home: h, away: a });
  const points: WPPoint[] = [];
  const events: WPPoint[] = [];
  let i = 0, h = 0, a = 0;
  for (let t = 0; t <= end; t += step) {
    while (i < flow.length && flow[i][0] <= t) {
      const [ft, fh, fa] = flow[i];
      if (fh !== h || fa !== a) {
        points.push(at(ft, h, a));
        h = fh; a = fa;
        const p = at(ft, h, a);
        points.push(p);
        events.push(p);
      }
      i++;
    }
    points.push(at(t, h, a));
  }
  while (i < flow.length) {
    const [ft, fh, fa] = flow[i++];
    if (fh === h && fa === a) continue;
    points.push(at(ft, h, a));
    h = fh; a = fa;
    const p = at(ft, h, a);
    points.push(p); events.push(p);
  }
  if (points[points.length - 1].t < end) points.push(at(end, h, a));
  // A final is decided: pin the last point to 0 or 1.
  if (final && h !== a) points.push({ t: end, wp: h > a ? 1 : 0, margin: h - a, home: h, away: a });

  let leadChanges = 0, ties = 0, leader = 0;
  const biggest: FlowSummary["biggest"] = { home: null, away: null };
  let bigSwing: FlowSummary["bigSwing"] = null;
  let prevMargin = 0;
  for (const e of events) {
    const s = Math.sign(e.margin);
    if (s !== 0 && leader !== 0 && s !== leader) leadChanges++;
    if (s === 0 && prevMargin !== 0) ties++;
    if (s !== 0) leader = s;
    prevMargin = e.margin;
    if (e.margin > 0 && (!biggest.home || e.margin > biggest.home.size)) biggest.home = { side: "home", size: e.margin, t: e.t, home: e.home, away: e.away };
    if (e.margin < 0 && (!biggest.away || -e.margin > biggest.away.size)) biggest.away = { side: "away", size: -e.margin, t: e.t, home: e.home, away: e.away };
  }
  // Swing per scoring play: compare the WP just before and just after each score.
  for (let k = 1; k < points.length; k++) {
    const p = points[k], q = points[k - 1];
    if (p.t === q.t && (p.home !== q.home || p.away !== q.away)) {
      const d = p.wp - q.wp;
      if (!bigSwing || Math.abs(d) > Math.abs(bigSwing.delta)) bigSwing = { t: p.t, delta: d, home: p.home, away: p.away };
    }
  }
  return { points, events, end, ots, leadChanges, ties, biggest, bigSwing, final };
}
