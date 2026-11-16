// Marcel-style "last season counts at a discount" for the skill projections (build-skills.mjs).
// projection = (count + d·lastCount + k·prior) / (opps + d·lastOpps + k)
export const D_GRID = [0, 0.25, 0.5, 0.75, 1];

/** Blend this season's (adjusted) count/opportunities and last season's discounted ones with the prior. */
export function blend({ count, opps, lastCount = 0, lastOpps = 0, prior, k, d = 0 }) {
  const lo = lastOpps > 0 ? lastOpps : 0, lc = lastOpps > 0 ? lastCount : 0;
  return (count + d * lc + k * prior) / (opps + d * lo + k);
}
/** Weight the evidence (this season + discounted last season) gets against the prior. */
export function evidenceWeight({ opps, lastOpps = 0, k, d = 0 }) {
  const e = opps + d * (lastOpps > 0 ? lastOpps : 0);
  return e / (e + k);
}

/** Stats that map honestly from season totals: [count, opportunities] (same definitions as the per-game lines). */
export const LAST_LINE = {
  ft: t => [t.ftm, t.fta],
  tp: t => [t.tpm, t.tpa],
  two: t => [t.fgm - t.tpm, t.fga - t.tpa],
  pts: t => [t.pts, t.min],
  tov: t => [t.tov, t.fga + 0.44 * t.fta + t.tov],
};
const SUM = ["min", "pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "tov"];

/** Reads a player-seasons file ({fields, rows}) into Map(id -> summed totals); two team rows are added up. */
export function totalsById(file) {
  const out = new Map();
  if (!file?.rows) return out;
  const ix = Object.fromEntries(file.fields.map((f, i) => [f, i]));
  for (const r of file.rows) {
    const id = String(r[ix.id]);
    const t = out.get(id) ?? Object.fromEntries(SUM.map(k => [k, 0]));
    for (const k of SUM) t[k] += Number(r[ix[k]]) || 0;
    out.set(id, t);
  }
  return out;
}
/** Last-season [count, opps] per mapped stat for one player (null when he has no opportunities). */
export function lastLines(t) {
  const out = {};
  if (!t) return out;
  for (const [key, f] of Object.entries(LAST_LINE)) { const [n, d] = f(t); if (d > 0 && n >= 0) out[key] = { n, d }; }
  return out;
}
/** Picks the grid value with the lowest error; ties and no-gain go to 0 (no last season). errs: {d: sse}. */
/**
 * Best discount on the grid, but only if it beats "no last season" by at least MIN_GAIN (relative
 * squared error). d is chosen on the same holdout it's scored on, so tiny wins are noise: they don't count.
 */
export const MIN_GAIN = 0.01;
export function pickD(errs) {
  let best = 0;
  for (const d of D_GRID) if (errs[d] < errs[best] - 1e-12) best = d;
  return best !== 0 && errs[best] <= errs[0] * (1 - MIN_GAIN) ? best : 0;
}
