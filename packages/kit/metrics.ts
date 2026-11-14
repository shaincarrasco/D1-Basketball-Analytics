import type { Metric, SportPack } from "./types";

/** The metric's value if its sample is big enough, else null. */
export const val = <R>(m: Metric<R>, r: R) => {
  if (m.ok && !m.ok(r)) return null;
  const v = m.get(r);
  return v === null || v === undefined || !Number.isFinite(v) ? null : v;
};

export function fmtMetric<R>(m: Metric<R>, v: number | null) {
  if (v === null || !Number.isFinite(v)) return "—";
  const d = m.digits ?? 1;
  const s = Math.abs(v).toFixed(d);
  return (m.sign ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : "") + s + (m.unit === "%" ? "%" : "");
}

const cache = new WeakMap<object, Record<string, Metric<unknown>>>();
/** Metric lookup by key (cached per pack). */
export function metricIndex<R>(pack: SportPack<R>): Record<string, Metric<R>> {
  let idx = cache.get(pack);
  // Null-prototype object: URL values like "constructor" or "__proto__" must not look like metrics.
  if (!idx) { idx = Object.assign(Object.create(null), Object.fromEntries(pack.metrics.map(m => [m.key, m]))) as Record<string, Metric<unknown>>; cache.set(pack, idx); }
  return idx as Record<string, Metric<R>>;
}
