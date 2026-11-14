// The "How this projection is built" lines must add up to the site's real projection (g.pred),
// not an approximation of it. Uses the committed season data: the pipeline's fit inputs
// (dhr-input-2027.json), its walk-forward predictions (model-2027.json) and the schedule.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildUp, displayMargin, gameBuild, keysToGame, modelBefore, pubMargin, pubOne, reproduces, summaryBuild, type DhrInput } from "./breakdown";
import { project } from "./predict";
import type { Game, GameSide, Meta, TeamSummary } from "./types";

const read = <T,>(p: string): T => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")) as T;
const input = read<DhrInput>("public/data/dhr-input-2027.json");
const model = read<{ predictions: Record<string, { margin: number; homePts: number; awayPts: number; tempo: number; homeWinProb: number }> }>("public/data/model-2027.json");
type Raw = { id: string; date: string; status: string; neutralSite: boolean; homeTeamId: number | null; awayTeamId: number | null; homeTeam: string; awayTeam: string };
const schedule = read<{ games: Raw[] }>("public/data/games-season-2027.json").games;
const etDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
const r = (v: number) => Math.round(v * 10) / 10; // build-app-data's r()

const side = (id: number | null, name: string): GameSide => ({ id: id == null ? null : String(id), slug: null, name, short: null, logo: null, color: null, conf: null, rank: null, adjEM: null, record: null, score: null, periods: null });
/** The game as build-app-data publishes it (g.pred = model prediction at one decimal). */
const asGame = (g: Raw): Game => {
  const p = model.predictions[g.id];
  return {
    id: g.id, date: g.date, status: g.status, neutral: g.neutralSite === true, confGame: false, venue: null, city: null, state: null, tournament: null,
    home: side(g.homeTeamId, g.homeTeam), away: side(g.awayTeamId, g.awayTeam),
    pred: p ? { wp: p.homeWinProb, margin: r(p.margin), home: r(p.homePts), away: r(p.awayPts), tempo: r(p.tempo) } : null,
    watch: null, upset: null, box: null,
  };
};

function checkDay(day: string) {
  const games = schedule.filter(g => etDay(g.date) === day).map(asGame).filter(g => g.pred);
  const m = modelBefore(input, new Set(schedule.filter(g => etDay(g.date) === day).map(g => g.id)));
  const misses = games.filter(g => !reproduces(gameBuild(m, input, g), g)).map(g => g.id);
  return { games, misses, m };
}

describe("projection build-up", () => {
  // The last day with finals (exercises the walk-forward cut) and the next day with games.
  const days = [...new Set(schedule.map(g => etDay(g.date)))].sort();
  const lastFinalDay = input.through!;
  const nextDay = days.find(d => d > lastFinalDay)!;

  for (const day of [lastFinalDay, nextDay]) {
    it(`reproduces g.pred margin, points and tempo for every game on ${day}`, () => {
      const { games, misses } = checkDay(day);
      expect(games.length).toBeGreaterThan(10);
      expect(misses).toEqual([]);
    });
  }

  it("displayed lines add up to the published margin and total", () => {
    const { games, m } = checkDay(lastFinalDay);
    for (const g of games) {
      const b = gameBuild(m, input, g);
      const d = displayMargin(b, -1);
      expect(d.margin).toBe(g.pred!.margin);
      expect(r(d.neutral + d.home)).toBe(d.margin);
      expect(r(pubOne(b.aPts) + pubOne(b.bPts))).toBe(r(g.pred!.home + g.pred!.away));
      // Neutral site: no home-court line.
      if (g.neutral) expect(d.home).toBe(0);
    }
  });

  it("matches the published app files when they are built", () => {
    const file = new URL(`../../public/data/app/games/${lastFinalDay}.json`, import.meta.url);
    if (!existsSync(file)) return; // built by `npm run build` / `npm run dev`
    const day = JSON.parse(readFileSync(file, "utf8")) as { games: Game[] };
    const m = modelBefore(input, new Set(day.games.map(g => g.id)));
    const withPred = day.games.filter(g => g.pred);
    expect(withPred.filter(g => !reproduces(gameBuild(m, input, g), g)).map(g => g.id)).toEqual([]);
  });

  it("matches lib/predict project() on /matchup/ for every venue", () => {
    const meta = { model: { leagueAverage: 106.173, leagueTempo: 70.879, estimatedHomeEdge: 6.234, seasonPrior: null, priors: { teamGames: 3 } } } as unknown as Meta;
    const t = (adjO: number, adjD: number, adjT: number) => ({ adjO, adjD, adjT, ratedGames: 3 }) as TeamSummary;
    const a = t(118.2, 95.1, 72.4), b = t(104.9, 101.3, 66.8);
    for (const [site, venue] of [["home", 1], ["away", -1], ["neutral", 0]] as const) {
      const p = project(meta, a, b, site)!;
      const bu = summaryBuild(106.173, 70.879, 6.234, a, b, venue)!;
      expect(bu.margin).toBeCloseTo(p.margin, 9);
      expect(bu.aPts).toBeCloseTo(p.homePts, 9);
      expect(bu.tempo).toBeCloseTo(p.tempo, 9);
      expect(bu.neutralMargin + bu.homeCourt).toBeCloseTo(p.margin, 9);
    }
  });

  it("rounds the way the pipeline does (toFixed then one decimal)", () => {
    expect(pubMargin(6.249)).toBe(6.3); // 6.249 → 6.25 → 6.3
    expect(buildUp({ mu: 100, muT: 70, h: 6, a: { O: 0, D: 0, T: 0 }, b: { O: 0, D: 0, T: 0 }, venue: 1 }).homeCourt).toBeCloseTo(4.2, 9);
  });
});

describe("keys to the game", () => {
  const base = { name: "", adjT: 68, adjTRank: 180 } as unknown as TeamSummary;
  it("templates the biggest rank mismatch and skips small gaps", () => {
    const a = { ...base, name: "Alpha", offRanks: { orb: 12, efg: 150 }, off: { orb: 38.2 }, defRanks: {} } as unknown as TeamSummary;
    const b = { ...base, name: "Beta", defRanks: { orb: 210, efg: 170 }, def: {}, offRanks: {} } as unknown as TeamSummary;
    const keys = keysToGame(a, b);
    expect(keys).toHaveLength(1);
    expect(keys[0].team).toBe("a");
    expect(keys[0].text).toContain("No. 12");
    expect(keys[0].text).toContain("No. 210");
  });
  it("returns nothing when every gap is small", () => {
    const a = { ...base, name: "A", offRanks: { orb: 100, tov: 120 }, defRanks: { orb: 90 } } as unknown as TeamSummary;
    const b = { ...base, name: "B", offRanks: { orb: 140 }, defRanks: { orb: 160, tov: 150 } } as unknown as TeamSummary;
    expect(keysToGame(a, b)).toEqual([]);
  });
});
