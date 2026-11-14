// Player ranking frameworks: each is a weighted blend of percentiles. A player's blend is
// then ranked against the pool, so a score of 90 means "better blend than 90% of the pool".
import { makePool, type PlayerRow } from "@/app/players/player-stats";
import { inPool, METRIC, val, type PoolFilter } from "@/lib/player-metrics";

export type Weights = [string, number][];
export type Framework = { key: string; label: string; blurb: string; weights: Weights };

export const FRAMEWORKS: Framework[] = [
  { key: "overall", label: "Overall", blurb: "Our all-in-one view: lineup impact first, then efficient production across the box score.",
    weights: [["dpr", 30], ["porpag", 15], ["ts", 10], ["usg", 10], ["ws40", 10], ["ast40", 7], ["reb40", 6], ["stocks40", 6], ["astTov", 6]] },
  { key: "scorer", label: "Scorer", blurb: "Volume and efficiency: points per 40, true shooting, usage, getting to the line and making his own shot.",
    weights: [["pts40", 35], ["ts", 30], ["usg", 15], ["ftr", 10], ["selfCreate", 10]] },
  { key: "shooter", label: "Shooter", blurb: "Three-point accuracy and volume, with free-throw % as the touch check.",
    weights: [["tpPct", 35], ["tpa40", 25], ["ftPct", 25], ["efg", 15]] },
  { key: "playmaker", label: "Playmaker", blurb: "Assist rate and ball security, with offensive rating so empty assists don't win.",
    weights: [["ast40", 40], ["astTov", 35], ["ortg", 15], ["usg", 10]] },
  { key: "defender", label: "Defender", blurb: "Defensive lineup impact, steals and blocks, on-court defensive rating, and staying out of foul trouble.",
    weights: [["dprD", 40], ["stocks40", 30], ["drtg", 20], ["pf40", 10]] },
  { key: "rim", label: "Rim protector", blurb: "Blocks, defensive boards and finishing at the rim.",
    weights: [["blk40", 40], ["drb40", 25], ["rimPct", 20], ["dprD", 15]] },
  { key: "rebounder", label: "Rebounder", blurb: "Rebounding rate on both ends of the floor.",
    weights: [["reb40", 40], ["orbPct", 35], ["drb40", 25]] },
  { key: "twoway", label: "Two-way", blurb: "Equal parts offensive and defensive lineup impact, backed by box-score activity.",
    weights: [["dprO", 35], ["dprD", 35], ["ts", 10], ["stocks40", 10], ["ast40", 10]] },
  { key: "3andD", label: "3-and-D", blurb: "Spaces the floor and guards: three-point shooting plus defensive impact and activity.",
    weights: [["tpPct", 25], ["tpa40", 20], ["dprD", 30], ["stocks40", 25]] },
  { key: "glue", label: "Glue guy", blurb: "Wins without the ball: efficient, safe, active on defense and the glass, and lineups are better with him.",
    weights: [["dpr", 30], ["ts", 15], ["astTov", 15], ["stocks40", 15], ["reb40", 15], ["tov40", 10]] },
];
export const FW = Object.fromEntries(FRAMEWORKS.map(f => [f.key, f])) as Record<string, Framework>;

/** score = blended percentile ×100 (one decimal); standing = share of the pool this blend beats (1–99), which sets the tier. */
export type Ranked = { r: PlayerRow; score: number; standing: number; blend: number; pcts: (number | null)[]; coverage: number };

/** Need this share of the framework's weight covered by real (big-enough-sample) stats to be ranked. */
export const MIN_COVERAGE = 0.6;

/**
 * Rank the pool on a framework.
 * relative = "pos": percentiles are taken within the player's own position.
 * shrink: pull each blend toward average by minutes played (k = 60 minutes), so a
 *   hot two-game start can't top the list on its own.
 */
export function rankPool(rows: PlayerRow[], pool: PoolFilter, weights: Weights, relative: "all" | "pos", shrink: boolean): Ranked[] {
  const ws = weights.filter(([k, w]) => METRIC[k] && w > 0);
  const total = ws.reduce((a, [, w]) => a + w, 0);
  if (!total) return [];
  const members = rows.filter(r => inPool(pool, r));
  // Percentile pools: one per metric (and per position when relative).
  const groupOf = (r: PlayerRow) => (relative === "pos" ? r.posN ?? "?" : "all");
  const pools = new Map<string, ReturnType<typeof makePool>>();
  for (const [k] of ws) {
    const m = METRIC[k];
    const buckets = new Map<string, number[]>();
    for (const r of members) { const v = val(m, r); if (v === null) continue; const g = groupOf(r); (buckets.get(g) ?? buckets.set(g, []).get(g)!).push(v); }
    for (const [g, v] of buckets) pools.set(`${k}|${g}`, makePool(v));
  }
  const out: Ranked[] = [];
  for (const r of members) {
    let sum = 0, wsum = 0;
    const pcts = ws.map(([k, w]) => {
      const m = METRIC[k], v = val(m, r), p = pools.get(`${k}|${groupOf(r)}`);
      const pc = v === null || !p || p.size < 5 ? null : p.pct(v, m.invert);
      if (pc !== null) { sum += pc * w; wsum += w; }
      return pc;
    });
    const coverage = wsum / total;
    if (coverage < MIN_COVERAGE) continue;
    let blend = sum / wsum;
    if (shrink) { const mins = (r.min ?? 0) * (r.g ?? 0); blend = 0.5 + (blend - 0.5) * (mins / (mins + 60)); }
    out.push({ r, blend, pcts, coverage, score: Math.round(blend * 1000) / 10, standing: 0 });
  }
  const scorePool = makePool(out.map(o => o.blend));
  for (const o of out) o.standing = Math.round(Math.min(0.99, Math.max(0.01, scorePool.pct(o.blend) ?? 0)) * 100);
  return out.sort((a, b) => b.blend - a.blend);
}

export const TIERS: { min: number; label: string }[] = [
  { min: 97, label: "Elite" }, { min: 90, label: "Excellent" }, { min: 75, label: "Very good" }, { min: 50, label: "Solid" }, { min: 0, label: "Developing" },
];
export const tierOf = (score: number) => TIERS.find(t => score >= t.min)!.label;

export function encodeWeights(w: Weights) { return w.map(([k, v]) => `${k}:${v}`).join(","); }
export function decodeWeights(s: string | null): Weights | null {
  if (!s) return null;
  const w = s.split(",").map(p => p.split(":")).filter(([k, v]) => METRIC[k] && Number.isFinite(Number(v))).map(([k, v]) => [k, Math.max(0, Math.min(100, Math.round(Number(v))))] as [string, number]);
  return w.length ? w.slice(0, 12) : null;
}
