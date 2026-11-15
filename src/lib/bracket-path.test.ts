import { describe, expect, it } from "vitest";
import type { BracketFile } from "./bracket";
import { roundOdds, type WinProbFn } from "./bracket-path";
import type { Meta, TeamSummary } from "./types";

// Seed-based fake: the better seed wins 75% of the time, equal seeds are a coin flip.
const seedOf = (bracket: BracketFile, slug: string) => (bracket.ok ? bracket.teams[slug]?.seed ?? 0 : 0);
const fake = (bracket: BracketFile): WinProbFn => (_meta, a, b) => {
  const sa = seedOf(bracket, a.slug), sb = seedOf(bracket, b.slug);
  return { homeWinProb: sa < sb ? 0.75 : sa > sb ? 0.25 : 0.5 };
};

const REGIONS = ["East", "West", "South", "Midwest"];
const LEAF_SEEDS = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];

/** A full 64-team field (optionally with a First Four pair in East 16). */
function field({ playIn = false }: { playIn?: boolean } = {}) {
  const teams: Record<string, unknown> = {};
  const regions = REGIONS.map((name, ri) => ({
    name,
    slots: Array.from({ length: 16 }, (_, k) => {
      const seed = k + 1;
      if (playIn && ri === 0 && seed === 16) {
        for (const slug of ["pi-a", "pi-b"]) teams[slug] = { slug, name: slug, short: slug, seed, region: name };
        return { seed, teams: ["pi-a", "pi-b"], kind: "auto" as const };
      }
      const slug = `${name.toLowerCase()}-${seed}`;
      teams[slug] = { slug, name: slug, short: slug, seed, region: name };
      return { seed, teams: [slug], kind: null };
    }),
  }));
  // Slots are stored in bracket order; keep them as-is.
  regions.forEach(r => (r.slots = LEAF_SEEDS.map(s => r.slots[s - 1])));
  const bracket = {
    ok: true, season: 2027, updated: "", built: "", config: {}, medianGames: 0, early: false, remainingGames: 0,
    bubbleRating: 0, ineligible: [], regions, finalFour: [[0, 3], [1, 2]], lines: [], openingRound: [], bubble: {},
    teams, index: {},
  } as unknown as BracketFile;
  const teamsBySlug = Object.fromEntries(Object.keys(teams).map(s => [s, { slug: s } as unknown as TeamSummary]));
  const all = Object.keys(teams);
  return { bracket, teamsBySlug, all };
}

const meta = {} as Meta;

describe("roundOdds", () => {
  it("1 seed: plays the 16 seed first, reaches each stage with the expected odds", () => {
    const { bracket, teamsBySlug } = field();
    const path = roundOdds(bracket, teamsBySlug, meta, "east-1", fake(bracket))!;
    expect(path.seed).toBe(1);
    expect(path.region).toBe("East");
    const [r64, r32, s16, e8, f4, title, champ] = path.rounds;
    expect(path.rounds.map(r => r.name)).toEqual(["Round of 64", "Round of 32", "Sweet 16", "Elite 8", "Final Four", "Title game", "Champion"]);
    expect(r64.p).toBe(1);
    expect(r64.likelyOpp).toMatchObject({ slug: "east-16", p: 1 });
    // Beats 16 (0.75), then the 8/9 winner (8 seed with 0.75): reaches the Sweet 16 with 0.75 * 0.75.
    expect(r32.p).toBeCloseTo(0.75, 10);
    expect(r32.likelyOpp).toMatchObject({ slug: "east-8", p: 0.75 });
    expect(s16.p).toBeCloseTo(0.5625, 10);
    expect(e8.p).toBeGreaterThan(0);
    expect(f4.p).toBeLessThan(e8.p);
    expect(title.p).toBeLessThan(f4.p);
    expect(champ.p).toBeLessThan(title.p);
    expect(champ.likelyOpp).toBeNull();
  });

  it("probabilities across the field: the champion odds sum to 1 and each stage sums to its field size", () => {
    const { bracket, teamsBySlug, all } = field();
    const paths = all.map(s => roundOdds(bracket, teamsBySlug, meta, s, fake(bracket))!);
    const sum = (i: number) => paths.reduce((a, p) => a + p.rounds[i].p, 0);
    expect(sum(6)).toBeCloseTo(1, 10); // Champion
    expect(sum(5)).toBeCloseTo(2, 10); // Title game (two finalists)
    expect(sum(4)).toBeCloseTo(4, 10); // Final Four
    expect(sum(3)).toBeCloseTo(8, 10); // Elite 8
    expect(sum(2)).toBeCloseTo(16, 10); // Sweet 16
    expect(sum(1)).toBeCloseTo(32, 10); // Round of 32
  });

  it("a First Four pair resolves by its own win probability and keeps the totals intact", () => {
    const { bracket, teamsBySlug, all } = field({ playIn: true });
    const pa = roundOdds(bracket, teamsBySlug, meta, "pi-a", fake(bracket))!;
    expect(pa.seed).toBe(16);
    expect(pa.rounds[0].p).toBeCloseTo(0.5, 10); // equal seeds
    const oneSeed = roundOdds(bracket, teamsBySlug, meta, "east-1", fake(bracket))!;
    expect(oneSeed.rounds[0].likelyOpp?.p).toBeCloseTo(0.5, 10);
    const paths = all.map(s => roundOdds(bracket, teamsBySlug, meta, s, fake(bracket))!);
    expect(paths.reduce((a, p) => a + p.rounds[6].p, 0)).toBeCloseTo(1, 10);
  });

  it("returns null for a team outside the field or a bracket that is not ok", () => {
    const { bracket, teamsBySlug } = field();
    expect(roundOdds(bracket, teamsBySlug, meta, "nobody-u", fake(bracket))).toBeNull();
    const notOk = { ok: false, reason: "x", config: {} } as unknown as BracketFile;
    expect(roundOdds(notOk, teamsBySlug, meta, "east-1", fake(bracket))).toBeNull();
  });
});
