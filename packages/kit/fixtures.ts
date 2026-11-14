// Helpers for deterministic sample rows. Packs use these to build fixtures for tests and
// the /lab/sports/ preview, so every sport can be exercised end to end before it has a
// real data feed. Names are obviously fictional on purpose.

/** Mulberry32: tiny seeded PRNG, same sequence on every machine. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  /** Roughly normal (Irwin–Hall), clamped. */
  const normal = (mean: number, sd: number, lo = -Infinity, hi = Infinity) => Math.min(hi, Math.max(lo, mean + sd * ((next() + next() + next() + next() + next() + next() - 3) / Math.SQRT2)));
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)];
  return { next, normal, int, pick };
}

const FIRST = ["Alex", "Jordan", "Casey", "Riley", "Morgan", "Taylor", "Jamie", "Quinn", "Avery", "Rowan", "Sage", "Drew", "Emery", "Finley", "Harper", "Kai", "Logan", "Parker", "Reese", "Skyler"];
const LAST = ["Sample", "Fixture", "Testwell", "Mockley", "Demoson", "Placeholder", "Stubbs", "Dummond", "Proto", "Draftman", "Mockford", "Samplesby", "Testerson", "Fakeley", "Dryrun",
  "Benchley", "Scaffold", "Pretendo", "Simsworth", "Trialton", "Exampleton", "Loremton", "Ipsumsen", "Shamwell", "Copyman"];

/** "Alex Sample": fictional, unique and readable for the first 500; a number is added after that. */
export const fakeName = (i: number) => {
  const n = FIRST.length * LAST.length;
  return `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}${i >= n ? ` ${Math.floor(i / n) + 1}` : ""}`;
};

/** A handful of made-up teams with colours, spread over made-up groups. */
export function fakeTeams(groups: [string, string][], perGroup = 4) {
  const colors = ["#c8102e", "#003087", "#ffb81c", "#00843d", "#582c83", "#e35205", "#0076b6", "#a6192e", "#00a3ad", "#4b2e83", "#f1be48", "#13294b"];
  const out: { id: string; name: string; short: string; color: string; group: string; groupName: string }[] = [];
  groups.forEach(([slug, gname], gi) => {
    for (let i = 0; i < perGroup; i++) {
      const n = gi * perGroup + i;
      out.push({ id: `t${n}`, name: `${gname.split(" ")[0]} Test ${String.fromCharCode(65 + i)}`, short: `${gname.slice(0, 2).toUpperCase()}${String.fromCharCode(65 + i)}`, color: colors[n % colors.length], group: slug, groupName: gname });
    }
  });
  return out;
}
