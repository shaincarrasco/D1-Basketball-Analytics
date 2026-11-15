// "Path to the Final Four": for one team in the projected field, the chance it reaches each stage and the most
// likely opponent at that stage. Pure module (no fs): win probabilities come from an injected projectFn.
import type { BracketFile, BracketSlot } from "./bracket";
import type { Meta, TeamSummary } from "./types";

export const ROUND_NAMES = ["Round of 64", "Round of 32", "Sweet 16", "Elite 8", "Final Four", "Title game", "Champion"] as const;
export type RoundName = (typeof ROUND_NAMES)[number];

/** Neutral-site win probability for `a` over `b` (matches project(...).homeWinProb). */
export type WinProbFn = (meta: Meta, a: TeamSummary, b: TeamSummary, site: "neutral") => { homeWinProb: number } | null;

export type OpponentOdds = { slug: string; name: string; short: string; p: number };
/**
 * `p` is the probability the team reaches the stage named by the row (for "Champion", the probability it wins the title).
 * `likelyOpp` is the most probable opponent in that stage's game, given the team reaches it.
 */
export type RoundOdds = { name: RoundName; p: number; likelyOpp: OpponentOdds | null };
export type BracketPath = { seed: number; region: string; rounds: RoundOdds[] };

/** Seed order of the 16 lines in a region, so that adjacent pairs meet in Round of 64 and quarters/halves line up. */
const LEAF_SEEDS = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];

type Dist = Map<string, number>;

/** Probability of each team winning a subtree. Keys are team slugs. */
function combine(L: Dist, R: Dist, wp: (a: string, b: string) => number): Dist {
  const out: Dist = new Map();
  for (const [a, pa] of L) {
    let s = 0;
    for (const [b, pb] of R) s += pb * wp(a, b);
    out.set(a, pa * s);
  }
  for (const [b, pb] of R) {
    let s = 0;
    for (const [a, pa] of L) s += pa * wp(b, a);
    out.set(b, pb * s);
  }
  return out;
}

function best(d: Dist): { slug: string; p: number } | null {
  let slug: string | null = null, p = -1;
  for (const [s, v] of d) if (v > p) { slug = s; p = v; }
  return slug === null ? null : { slug, p };
}

export function roundOdds(
  bracket: BracketFile,
  teamsBySlug: Record<string, TeamSummary>,
  meta: Meta,
  slug: string,
  projectFn: WinProbFn,
): BracketPath | null {
  if (!bracket.ok) return null;
  if (bracket.regions.length !== 4 || bracket.finalFour.length !== 2) return null;

  // Canonical order so that wp(a, b) + wp(b, a) = 1 exactly. A missing summary or an unprojectable team counts as a coin flip.
  const cache = new Map<string, number>();
  const wp = (a: string, b: string): number => {
    if (a > b) return 1 - wp(b, a);
    const key = `${a}|${b}`;
    let v = cache.get(key);
    if (v === undefined) {
      const A = teamsBySlug[a], B = teamsBySlug[b];
      const r = A && B ? projectFn(meta, A, B, "neutral") : null;
      v = r && Number.isFinite(r.homeWinProb) ? r.homeWinProb : 0.5;
      cache.set(key, v);
    }
    return v;
  };

  const slotDist = (teams: string[]): Dist | null => {
    if (teams.length === 1) return new Map([[teams[0], 1]]);
    if (teams.length === 2) return new Map([[teams[0], wp(teams[0], teams[1])], [teams[1], wp(teams[1], teams[0])]]);
    return null; // only First Four pairs are supported
  };

  // Leaves in bracket order for each region, plus the team's own location.
  let found: { ri: number; li: number } | null = null;
  const levelsByRegion: Dist[][][] = [];
  for (let ri = 0; ri < bracket.regions.length; ri++) {
    const slots: (BracketSlot | undefined)[] = LEAF_SEEDS.map(seed => bracket.regions[ri].slots.find(s => s.seed === seed));
    if (slots.some(s => !s)) return null;
    const leaves: Dist[] = [];
    for (let li = 0; li < 16; li++) {
      const s = slots[li] as BracketSlot;
      const d = slotDist(s.teams);
      if (!d) return null;
      leaves.push(d);
      if (s.teams.includes(slug)) found = { ri, li };
    }
    const levels: Dist[][] = [leaves];
    for (let j = 1; j <= 4; j++) {
      const prev = levels[j - 1], cur: Dist[] = [];
      for (let k = 0; k < prev.length; k += 2) cur.push(combine(prev[k], prev[k + 1], wp));
      levels.push(cur);
    }
    levelsByRegion.push(levels);
  }
  if (!found) return null;
  const { ri, li } = found;
  const levels = levelsByRegion[ri];
  const regionWinner = levelsByRegion.map(l => l[4][0]);

  // Region path: W[j] = P(team wins its level-j node), i.e. reaches the game at level j+1.
  // The game at level j+1 is against the winner of the sibling level-j node.
  const W: number[] = [levels[0][li].get(slug) ?? 0];
  const sib: Dist[] = [];
  for (let j = 1; j <= 4; j++) {
    const sd = levels[j - 1][(li >> (j - 1)) ^ 1];
    sib[j - 1] = sd;
    let s = 0;
    for (const [u, p] of sd) s += p * wp(slug, u);
    W[j] = W[j - 1] * s;
  }

  // National semifinals: region ri meets the region paired with it; the other pair forms the other semifinal.
  const pair = bracket.finalFour.find(p => p.includes(ri));
  const otherPair = bracket.finalFour.find(p => !p.includes(ri));
  if (!pair || !otherPair) return null;
  const semiRegion = pair[0] === ri ? pair[1] : pair[0];
  const semiOpp = regionWinner[semiRegion];
  let semiWin = 0;
  for (const [u, p] of semiOpp) semiWin += p * wp(slug, u);
  const S = W[4] * semiWin;

  const otherSemi = combine(regionWinner[otherPair[0]], regionWinner[otherPair[1]], wp);
  let titleWin = 0;
  for (const [u, p] of otherSemi) titleWin += p * wp(slug, u);
  const C = S * titleWin;

  const info = bracket.teams[slug];
  const nameOf = (s: string) => ({ name: bracket.teams[s]?.name ?? teamsBySlug[s]?.name ?? s, short: bracket.teams[s]?.short ?? s });
  const oppOf = (d: Dist | null): OpponentOdds | null => {
    const b = d && best(d);
    return b ? { slug: b.slug, p: b.p, ...nameOf(b.slug) } : null;
  };
  const seed = bracket.regions[ri].slots.find(s => s.teams.includes(slug))?.seed ?? info?.seed ?? null;
  if (seed === null) return null;

  const rounds: RoundOdds[] = [
    { name: "Round of 64", p: W[0], likelyOpp: oppOf(sib[0]) },
    { name: "Round of 32", p: W[1], likelyOpp: oppOf(sib[1]) },
    { name: "Sweet 16", p: W[2], likelyOpp: oppOf(sib[2]) },
    { name: "Elite 8", p: W[3], likelyOpp: oppOf(sib[3]) },
    { name: "Final Four", p: W[4], likelyOpp: oppOf(semiOpp) },
    { name: "Title game", p: S, likelyOpp: oppOf(otherSemi) },
    { name: "Champion", p: C, likelyOpp: null },
  ];

  return { seed, region: bracket.regions[ri].name, rounds };
}
