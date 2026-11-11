// Client-side matchup projection. Mirrors predict() in scripts/lib/rating-model.mjs.
import type { Meta, TeamSummary } from "./types";

const erf = (x: number) => {
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
};
export const normalCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

const GAME_SIGMA = 10.5, NET_SIGMA = 15.7;

export type Projection = { tempo: number; homePts: number; awayPts: number; margin: number; sigma: number; homeWinProb: number };

/** `site`: "home" = first team hosts, "away" = second team hosts, "neutral". */
export function project(meta: Meta, a: TeamSummary, b: TeamSummary, site: "home" | "away" | "neutral"): Projection | null {
  if (a.adjO === null || a.adjD === null || a.adjT === null || b.adjO === null || b.adjD === null || b.adjT === null) return null;
  const { leagueAverage: mu, leagueTempo: muT, estimatedHomeEdge: h, priors } = meta.model;
  const tempo = muT + (a.adjT - muT) + (b.adjT - muT);
  const edge = site === "neutral" ? 0 : site === "home" ? h / 2 : -h / 2;
  const aEff = a.adjO + (b.adjD - mu) + edge;
  const bEff = b.adjO + (a.adjD - mu) - edge;
  const homePts = (aEff * tempo) / 100, awayPts = (bEff * tempo) / 100;
  const margin = homePts - awayPts;
  // Matches the model: a previous-season prior carries more weight than the conference prior.
  const prior = meta.model.seasonPrior ? (priors?.seasonPriorWeight ?? 5) : (priors?.teamGames ?? 3);
  const u = (n: number) => (NET_SIGMA / Math.sqrt(n + prior)) * (tempo / 100);
  const sigma = Math.sqrt(GAME_SIGMA ** 2 + u(a.ratedGames) ** 2 + u(b.ratedGames) ** 2);
  return { tempo, homePts, awayPts, margin, sigma, homeWinProb: normalCdf(margin / sigma) };
}
