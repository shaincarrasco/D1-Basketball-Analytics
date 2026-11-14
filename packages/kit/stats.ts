// Small, sport-free statistics helpers.

/** Sorted-pool percentile: share of the pool this value beats (0–1, 1 = best). */
export function makePool(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const lower = (v: number) => { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; } return lo; };
  const upper = (v: number) => { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] <= v) lo = m + 1; else hi = m; } return lo; };
  return {
    size: s.length,
    pct(v: number | null, invert = false): number | null {
      if (v === null || !s.length) return null;
      return invert ? (s.length - upper(v)) / s.length : lower(v) / s.length;
    },
  };
}

/** Percentile (0–1) → "87th". Never shows 100th. */
export const pctLabel = (p: number) => {
  const n = Math.min(99, Math.max(1, Math.round(p * 100)));
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const median = (v: number[]) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const sd = (v: number[]) => { const m = v.reduce((a, b) => a + b, 0) / (v.length || 1); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length || 1)) || 1; };
