// Ranking frameworks: each is a weighted blend of percentiles. A player's blend is then
// ranked against the pool, so a standing of 90 means "better blend than 90% of the pool".
import { metricIndex, val } from "./metrics";
import { inPool } from "./pool";
import { makePool } from "./stats";
import type { Pool, SportPack } from "./types";

export type Weights = [string, number][];

/** score = blended percentile ×100 (one decimal); standing = share of the pool this blend beats (1–99), which sets the tier. */
export type Ranked<R> = { r: R; score: number; standing: number; blend: number; pcts: (number | null)[]; coverage: number };

/** A metric needs at least this many qualified players in a pool before its percentiles count. */
export const MIN_POOL = 5;

/**
 * Rank the pool on a set of weights.
 * relative = "pos": percentiles are taken within the player's own position.
 * shrink: pull each blend toward average by exposure (pack.ranking.shrinkK), so a hot
 *   start on a tiny sample can't top the list on its own.
 */
export function rankPool<R>(pack: SportPack<R>, rows: R[], pool: Pool, weights: Weights, relative: "all" | "pos", shrink: boolean): Ranked<R>[] {
  const M = metricIndex(pack);
  const ws = weights.filter(([k, w]) => M[k] && w > 0);
  const total = ws.reduce((a, [, w]) => a + w, 0);
  if (!total) return [];
  const members = rows.filter(r => inPool(pack, pool, r));
  const byPos = relative === "pos" && pack.positions.length > 0;
  const groupOf = (r: R) => (byPos ? pack.entity.pos(r) ?? "?" : "all");
  const pools = new Map<string, ReturnType<typeof makePool>>();
  for (const [k] of ws) {
    const m = M[k];
    const buckets = new Map<string, number[]>();
    for (const r of members) { const v = val(m, r); if (v === null) continue; const g = groupOf(r); (buckets.get(g) ?? buckets.set(g, []).get(g)!).push(v); }
    for (const [g, v] of buckets) pools.set(`${k}|${g}`, makePool(v));
  }
  const { minCoverage, shrinkK } = pack.ranking;
  const out: Ranked<R>[] = [];
  for (const r of members) {
    let sum = 0, wsum = 0;
    const pcts = ws.map(([k, w]) => {
      const m = M[k], v = val(m, r), p = pools.get(`${k}|${groupOf(r)}`);
      const pc = v === null || !p || p.size < MIN_POOL ? null : p.pct(v, m.invert);
      if (pc !== null) { sum += pc * w; wsum += w; }
      return pc;
    });
    const coverage = wsum / total;
    if (!wsum || coverage < minCoverage) continue;
    let blend = sum / wsum;
    if (shrink && shrinkK > 0) { const e = Math.max(0, pack.entity.exposure(r)); blend = 0.5 + (blend - 0.5) * (e / (e + shrinkK)); }
    out.push({ r, blend, pcts, coverage, score: Math.round(blend * 1000) / 10, standing: 0 });
  }
  const scorePool = makePool(out.map(o => o.blend));
  for (const o of out) o.standing = Math.round(Math.min(0.99, Math.max(0.01, scorePool.pct(o.blend) ?? 0)) * 100);
  return out.sort((a, b) => b.blend - a.blend);
}

export const tierOf = <R>(pack: SportPack<R>, standing: number) => (pack.tiers.find(t => standing >= t.min) ?? pack.tiers[pack.tiers.length - 1]).label;

export function encodeWeights(w: Weights) { return w.map(([k, v]) => `${k}:${v}`).join(","); }
export function decodeWeights<R>(pack: SportPack<R>, s: string | null): Weights | null {
  if (!s) return null;
  const M = metricIndex(pack);
  const seen = new Set<string>();
  const w = s.split(",").map(p => p.split(":")).filter(([k, v]) => M[k] && Number.isFinite(Number(v)) && !seen.has(k) && !!seen.add(k)).map(([k, v]) => [k, Math.max(0, Math.min(100, Math.round(Number(v))))] as [string, number]);
  return w.length ? w.slice(0, 12) : null;
}
