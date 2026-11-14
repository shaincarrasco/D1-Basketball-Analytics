// Matchup breakdown: how a DHR projection is built, line by line, plus the tale of the tape and
// game-specific keys. Pure functions (no React) so the build-up can be tested against the
// published projections.
//
// The model (scripts/lib/rating-model.mjs) scores each side as
//   points per 100 = league average + own offense + opponent's defense ± half the home edge
//   possessions    = league tempo + own tempo term + opponent's tempo term
// so the margin splits exactly into a neutral-court rating gap plus a home-court term:
//   margin = (EM_a − EM_b) × poss/100 + venue × h × poss/100.
import { fit, rating, NON_D1, type FitGame, type Model } from "../../scripts/lib/rating-model.mjs";
import type { Game, GameSide, ProfileKey, TeamSummary } from "./types";

/** One team's model terms, relative to the league average (O, D in points per 100; D > 0 = worse defense; T in possessions). */
export type Terms = { O: number; D: number; T: number };
export type BuildInput = {
  mu: number; muT: number; /** Home edge, net points per 100 possessions. */ h: number;
  a: Terms; b: Terms;
  /** 1 = team A hosts, −1 = team B hosts, 0 = neutral. */
  venue: 1 | 0 | -1;
};
export type Build = {
  mu: number; muT: number; h: number; venue: 1 | 0 | -1;
  a: Terms; b: Terms;
  /** Possessions per 40 minutes. */
  tempo: number;
  /** Points per 100 possessions for each side, after the opponent and the venue. */
  aEff: number; bEff: number;
  aPts: number; bPts: number;
  /** A − B in points: the rating gap on a neutral floor, the home-court term, and their sum. */
  neutralMargin: number; homeCourt: number; margin: number; total: number;
};

/** Exactly the model's arithmetic (rating-model predict() / lib/predict project()). */
export function buildUp(i: BuildInput): Build {
  const tempo = i.muT + i.a.T + i.b.T;
  const edge = (i.venue * i.h) / 2;
  const aEff = i.mu + i.a.O + i.b.D + edge;
  const bEff = i.mu + i.b.O + i.a.D - edge;
  const aPts = (aEff * tempo) / 100, bPts = (bEff * tempo) / 100;
  const margin = aPts - bPts;
  const homeCourt = (i.venue * i.h * tempo) / 100;
  return { mu: i.mu, muT: i.muT, h: i.h, venue: i.venue, a: i.a, b: i.b, tempo, aEff, bEff, aPts, bPts, neutralMargin: margin - homeCourt, homeCourt, margin, total: aPts + bPts };
}

// ---------- rounding the way the pipeline publishes g.pred ----------
const r1 = (v: number) => Math.round(v * 10) / 10;
/** Model margin → g.pred.margin: toFixed(2) in build-power-ratings, then one decimal in build-app-data. */
export const pubMargin = (v: number) => r1(+v.toFixed(2));
/** Points / tempo → g.pred: toFixed(1), then one decimal. */
export const pubOne = (v: number) => r1(+v.toFixed(1));

/**
 * Displayed lines that add up exactly: the neutral-court gap and home court, rounded so they sum to
 * the published margin. `sign` = orientation of the published margin (games publish home − away,
 * which is B − A in a game build, so −1; /matchup/ shows A − B, so 1).
 */
export function displayMargin(b: Build, sign: 1 | -1 = 1) {
  const margin = pubMargin(sign * b.margin);
  if (b.venue === 0) return { neutral: margin, home: 0, margin };
  const neutral = r1(sign * b.neutralMargin);
  return { neutral, home: r1(margin - neutral), margin };
}

// ---------- the model exactly as it stood the morning of a game ----------
/** dhr-input.json: the pipeline's exact fit inputs and converged ratings (see build-power-ratings). */
export type DhrInput = {
  v: 1; builtAt: string; through: string | null; confs: string[];
  teams: [string, number][];
  seasonPrior: Record<string, [number, number]> | null;
  warm: { h: number; r: Record<string, [number, number, number]> };
  games: [string, string, string, number, number, 0 | 1, number, number, number, number, number][];
};

const fitRows = (input: DhrInput, rows: DhrInput["games"]): FitGame[] => rows.map(g => ({
  gameId: g[0], date: "", homeId: g[1], awayId: g[2],
  homeConf: g[3] >= 0 && input.confs[g[3]] !== NON_D1 ? input.confs[g[3]] : null,
  awayConf: g[4] >= 0 && input.confs[g[4]] !== NON_D1 ? input.confs[g[4]] : null,
  neutral: g[5] === 1, homePts: g[6], awayPts: g[7], poss: g[8], minutes: g[9], weight: g[10],
}));

/**
 * Walk-forward: the published projection for a game on day D uses only games completed before D.
 * dhr-input lists completed games in date order, so "before D" is the prefix that ends at the
 * first of D's (or any later day's) games. `dayIds` = ids of every game on D.
 */
export function modelBefore(input: DhrInput, dayIds: Set<string>): Model {
  const first = input.games.findIndex(g => dayIds.has(g[0]));
  const rows = first < 0 ? input.games : input.games.slice(0, first);
  const warm = {
    h: input.warm.h,
    O: new Map(Object.entries(input.warm.r).map(([k, v]) => [k, v[0]])),
    D: new Map(Object.entries(input.warm.r).map(([k, v]) => [k, v[1]])),
    T: new Map(Object.entries(input.warm.r).map(([k, v]) => [k, v[2]])),
  };
  const seasonPrior = input.seasonPrior ? new Map(Object.entries(input.seasonPrior).map(([k, [O, D]]) => [k, { O, D }])) : undefined;
  return fit(fitRows(input, rows), { warm, seasonPrior });
}

const nodeOf = (input: DhrInput, side: GameSide) => (side.id && input.teams.some(([id]) => id === side.id) ? side.id : NON_D1);
const termsOf = (model: Model, id: string): Terms => {
  const r = rating(model, id, id !== NON_D1);
  return { O: r.O, D: r.D, T: r.T };
};

/** The build-up behind a game's published projection. A = away, B = home (the sheet's left-to-right order). */
export function gameBuild(model: Model, input: DhrInput, g: Game): Build {
  return buildUp({
    mu: model.mu, muT: model.muT, h: model.h,
    a: termsOf(model, nodeOf(input, g.away)), b: termsOf(model, nodeOf(input, g.home)),
    venue: g.neutral ? 0 : -1,
  });
}

/** Does the build reproduce g.pred to the published decimal? */
export function reproduces(b: Build, g: Game): boolean {
  const p = g.pred;
  if (!p) return false;
  // Build A = away, B = home; g.pred.margin = home − away.
  return pubMargin(-b.margin) === p.margin && pubOne(b.bPts) === p.home && pubOne(b.aPts) === p.away && pubOne(b.tempo) === p.tempo;
}

/** Build from the team table (what /matchup/ projects with lib/predict project()). A hosts when venue = 1. */
export function summaryBuild(mu: number, muT: number, h: number, a: TeamSummary, b: TeamSummary, venue: 1 | 0 | -1): Build | null {
  if (a.adjO === null || a.adjD === null || a.adjT === null || b.adjO === null || b.adjD === null || b.adjT === null) return null;
  const t = (x: TeamSummary): Terms => ({ O: x.adjO! - mu, D: x.adjD! - mu, T: x.adjT! - muT });
  return buildUp({ mu, muT, h, a: t(a), b: t(b), venue });
}

/** Injury what-if (same as the matchup tool): rating lost per 100 × possessions ÷ 100, A − B. */
export const injuryShift = (aLoss: number, bLoss: number, tempo: number) => ((bLoss - aLoss) * tempo) / 100;

// ---------- tale of the tape ----------
export type TapeRow = { key: string; label: string; hint: string; unit?: "%" | "";
  av: number | null; bv: number | null; ar: number | null; br: number | null;
  /** Who holds the edge (lower rank = better for that side of the ball). null = style stat or close. */
  edge: "a" | "b" | null };

/** Each side's offense against the other's defense, by stat. `diff` > 0 = the offense ranks better. */
export type Clash = { k: ProfileKey; label: string; offRank: number; defRank: number; offVal: number | null; defVal: number | null; diff: number };

export const TAPE_FACTORS: { k: ProfileKey; label: string; hint: string; style?: boolean }[] = [
  { k: "efg", label: "Effective FG%", hint: "Field-goal % with threes worth 1.5 twos" },
  { k: "tov", label: "Turnover rate", hint: "Turnovers per 100 possessions (offense wants few, defense wants many)" },
  { k: "orb", label: "Offensive rebounding", hint: "Share of missed shots the offense gets back" },
  { k: "ftr", label: "Free-throw rate", hint: "Free-throw attempts per field-goal attempt" },
  { k: "threeRate", label: "3-point attempt rate", hint: "Share of shots taken from three — style, not quality", style: true },
  { k: "threePct", label: "3-point %", hint: "Three-point percentage" },
  { k: "twoPct", label: "2-point %", hint: "Two-point percentage" },
  { k: "paintShare", label: "Paint scoring share", hint: "Share of points scored in the paint — style, not quality", style: true },
];

export function clashes(off: TeamSummary, def: TeamSummary): Clash[] {
  const out: Clash[] = [];
  for (const f of TAPE_FACTORS) {
    const o = off.offRanks?.[f.k], d = def.defRanks?.[f.k];
    if (!o || !d) continue;
    out.push({ k: f.k, label: f.label, offRank: o, defRank: d, offVal: off.off?.[f.k] ?? null, defVal: def.def?.[f.k] ?? null, diff: d - o });
  }
  return out;
}

// ---------- keys to the game ----------
export type Key = { text: string; team: "a" | "b"; gap: number };

/** A key needs a real mismatch: ranks this far apart, and the stronger unit in the top part of D-I. */
export const KEY_MIN_GAP = 170, KEY_MAX_STRONG = 90, KEY_MIN_TEMPO_GAP = 170;

const no = (r: number) => `No. ${r}`;

/** Plain-words templates: offense edge (the offense is strong where this defense is weak) and defense edge. */
function keyText(c: Clash, off: string, def: string): string | null {
  const offEdge = c.diff > 0;
  const v = (x: number | null) => (x == null ? "" : `, ${x.toFixed(1)}%`);
  switch (c.k) {
    case "orb": return offEdge
      ? `${off} crashes the offensive glass (${no(c.offRank)} in offensive rebounding${v(c.offVal)}), and ${def} ranks ${no(c.defRank)} at keeping teams off it. Second chances are ${off}'s path.`
      : `${def} finishes defensive possessions (${no(c.defRank)} at limiting offensive rebounds), and ${off} rarely gets second chances (${no(c.offRank)}). ${off} needs to make it the first time.`;
    case "tov": return offEdge
      ? `${off} takes care of the ball (${no(c.offRank)} in turnover rate${v(c.offVal)}), and ${def} ranks ${no(c.defRank)} at forcing turnovers. Expect ${off} to get a shot up most trips.`
      : `${def} forces turnovers (${no(c.defRank)} in turnover rate forced${v(c.defVal)}), and ${off} is loose with the ball (${no(c.offRank)}). Turnovers are ${def}'s path to easy points.`;
    case "efg": return offEdge
      ? `${off} shoots it well (${no(c.offRank)} in effective FG%${v(c.offVal)}), and ${def} ranks ${no(c.defRank)} at defending shots. ${off}'s shot-making is the edge.`
      : `${def} defends shots well (${no(c.defRank)} in effective FG% allowed${v(c.defVal)}), and ${off} ranks ${no(c.offRank)} in shooting. Scoring efficiently is ${off}'s problem to solve.`;
    case "ftr": return offEdge
      ? `${off} gets to the line (${no(c.offRank)} in free-throw rate), and ${def} fouls a lot (${no(c.defRank)}). Watch the whistle and foul trouble.`
      : `${def} defends without fouling (${no(c.defRank)} in free-throw rate allowed), and ${off} rarely gets to the line (${no(c.offRank)}). Few free points for ${off}.`;
    case "threePct": return offEdge
      ? `${off} makes threes (${no(c.offRank)} in 3-point %${v(c.offVal)}), and ${def} ranks ${no(c.defRank)} at defending the arc.`
      : `${def} guards the arc (${no(c.defRank)} in 3-point % allowed${v(c.defVal)}), and ${off} ranks ${no(c.offRank)} from three. ${off} needs points inside.`;
    case "twoPct": return offEdge
      ? `${off} scores inside the arc (${no(c.offRank)} in 2-point %${v(c.offVal)}), and ${def} ranks ${no(c.defRank)} at defending twos. The paint should be open for ${off}.`
      : `${def} protects the inside (${no(c.defRank)} in 2-point % allowed${v(c.defVal)}), and ${off} ranks ${no(c.offRank)} inside the arc.`;
    case "threeRate": return offEdge
      ? `${off} lives behind the arc (${no(c.offRank)} in 3-point attempt rate), and ${def} gives up plenty of threes (${no(c.defRank)} at limiting them). Expect a high-volume shooting night from ${off}.`
      : null; // "takes few threes against a team that allows few" is not a key
    default: return null;
  }
}

const SHOOTING = new Set<ProfileKey>(["efg", "twoPct", "threePct"]);

/**
 * 2–4 game-specific keys from the biggest rank mismatches, over real fields only.
 * Returns fewer (or none) when the gaps are small: a key is never padded.
 */
export function keysToGame(a: TeamSummary, b: TeamSummary, max = 4): Key[] {
  const cands: Key[] = [];
  for (const [off, def, offSide] of [[a, b, "a"], [b, a, "b"]] as const) {
    // eFG%, 2P% and 3P% overlap: keep only the biggest shooting mismatch per direction and side.
    const seenShooting = new Set<string>();
    const list = clashes(off, def).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
    for (const c of list) {
      const gap = Math.abs(c.diff);
      const strong = Math.min(c.offRank, c.defRank);
      if (gap < KEY_MIN_GAP || strong > KEY_MAX_STRONG) continue;
      if (SHOOTING.has(c.k)) {
        const tag = c.diff > 0 ? "off" : "def";
        if (seenShooting.has(tag)) continue;
        seenShooting.add(tag);
      }
      const text = keyText(c, off.name, def.name);
      if (!text) continue;
      // An offense edge is a key for the team with the ball; a defense edge is a key for the defending team.
      cands.push({ text, team: c.diff > 0 ? offSide : offSide === "a" ? "b" : "a", gap });
    }
  }
  // Pace: when one team plays fast and the other slow, the projected possessions land in between.
  if (a.adjTRank && b.adjTRank && a.adjT != null && b.adjT != null && Math.abs(a.adjTRank - b.adjTRank) >= KEY_MIN_TEMPO_GAP) {
    const [fast, slow] = a.adjTRank < b.adjTRank ? [a, b] : [b, a];
    cands.push({
      text: `Tempo tug-of-war: ${fast.name} plays fast (${no(fast.adjTRank!)} in adjusted tempo, ${fast.adjT!.toFixed(1)} possessions) and ${slow.name} plays slow (${no(slow.adjTRank!)}, ${slow.adjT!.toFixed(1)}). More possessions favor the better team; fewer keep an underdog close.`,
      team: fast === a ? "a" : "b", gap: Math.abs(a.adjTRank - b.adjTRank) - 1,
    });
  }
  cands.sort((x, y) => y.gap - x.gap);
  return cands.slice(0, max);
}
