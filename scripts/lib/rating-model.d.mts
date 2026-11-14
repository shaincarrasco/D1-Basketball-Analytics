// Types for rating-model.mjs (imported by the site for live post-game ratings).
export const NON_D1: "non-d1";
export type FitGame = {
  gameId: string; date: string; homeId: string; awayId: string; homeConf: string | null; awayConf: string | null;
  neutral: boolean; homePts: number; awayPts: number; poss: number; minutes: number; weight?: number;
};
export type Model = {
  mu: number; muT: number; h: number;
  O: Map<string, number>; D: Map<string, number>; T: Map<string, number>;
  conf: Map<string, string>; games: Map<string, number>; iterations: number;
  cfg: Record<string, number>; seasonPrior: Map<string, { O: number; D: number }> | null;
};
export type Rating = { id: string; known: boolean; hasSeasonPrior: boolean; O: number; D: number; T: number; n: number; adjO: number; adjD: number; adjEM: number; adjT: number };
export function fit(
  games: FitGame[],
  options?: { warm?: Pick<Model, "O" | "D" | "T" | "h">; seasonPrior?: Map<string, { O: number; D: number }> } & Record<string, unknown>,
): Model;
export function rating(model: Model, teamId: string, isD1?: boolean): Rating;
export function predict(model: Model, home: Rating, away: Rating, neutral: boolean): { tempo: number; homePts: number; awayPts: number; margin: number; sigma: number; homeWinProb: number };
export function normalCdf(z: number): number;
