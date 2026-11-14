// Player skill projections (built by scripts/build-skills.mjs). Types, loaders and the plain-words
// helpers shared by the player page section, the /players/projections/ leaderboard and methodology.
//
// Words: "Projected" (Proj) = the model's estimate of the skill; "This season" = his real box-score
// number so far; "Starting point" = the prior (what players like him usually do). Same vocabulary as
// the methodology glossary ("Projected, Proj, pregame").
import { useJson } from "@/lib/client-data";

export const SKILL_KEYS = ["ft", "tp", "two", "rim", "mid", "pts", "usg", "ast", "tov", "orb", "drb", "stl", "blk"] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];

/** The lineup-lab contract: { proj, pct, grade, n } (+ raw, this season's real number). */
export type SkillCell = { proj: number; pct: number; grade: string; n: number; raw: number | null };
export type SkillDetailCell = SkillCell & { prior: number; w: number; opp: number | null; made: number | null };

export type SkillValidation = {
  players: number; rmseRaw: number; rmseProj: number; rmseShrinkOnly: number; rmsePriorOnly: number; maeRaw: number; maeProj: number;
  mseCut: number; reducibleCut: number | null; usedOpp: boolean;
  rotation: { players: number; rmseRaw: number; rmseProj: number; mseCut: number };
};
export type SkillStatMeta = {
  key: SkillKey; label: string; short: string; unit: "%" | ""; nUnit: string; invert: boolean; oppAdjusted: boolean; seasonOnly: boolean;
  k: number; kSource: "data" | "outside"; league: number; talentSd: number; talentMeasurable: boolean; nonD1Factor: number | null;
  prior?: Record<string, number>; validation?: SkillValidation;
};
export type SkillsMeta = {
  built: string; season: string; method: string; pool: { minMpg: number; players: number }; scale: string;
  stats: SkillStatMeta[]; classGrowth: string; validationNote: string;
};
export type SkillsFile = { meta: SkillsMeta } & { [playerId: string]: Record<SkillKey, SkillCell> | SkillsMeta };
export type SkillPlayerDetail = { g: number; pos: "G" | "F" | "C" | null; ht: number | null; stars: number | null; year: string | null } & Record<SkillKey, SkillDetailCell>;
export type SkillTeamFile = { meta: { stats: SkillStatMeta[]; pool: { minMpg: number; players: number } }; players: Record<string, SkillPlayerDetail> };

/** One player's projections from skills.json (null if he isn't in it). */
export const skillsOf = (f: SkillsFile | null, id: string) => (f && id !== "meta" ? ((f[id] as Record<SkillKey, SkillCell> | undefined) ?? null) : null);

export const useSkills = () => useJson<SkillsFile>("skills.json");
export const useTeamSkills = (slug: string | null | undefined) => useJson<SkillTeamFile>(slug ? `skills/${slug}.json` : null);

/** Plain names for the player page ("Three-point shooting" reads better than "3-point %"). */
export const SKILL_NAME: Record<SkillKey, string> = {
  ft: "Free throws", tp: "Three-point shooting", two: "Two-point shooting", rim: "Finishing at the rim", mid: "Mid-range jumpers",
  pts: "Scoring volume", usg: "Usage", ast: "Playmaking", tov: "Ball security", orb: "Offensive rebounding", drb: "Defensive rebounding",
  stl: "Steals", blk: "Shot blocking",
};
/** What the number measures, in one line. */
export const SKILL_DESC: Record<SkillKey, string> = {
  ft: "Free-throw percentage.",
  tp: "Three-point percentage.",
  two: "Two-point field-goal percentage.",
  rim: "Field-goal % on dunks, layups and tip-ins.",
  mid: "Field-goal % on two-point jumpers.",
  pts: "Points per 40 minutes on the floor.",
  usg: "Share of his team's possessions he uses (shot, free throws or turnover) while on the floor.",
  ast: "Share of teammates' baskets he assists while on the floor.",
  tov: "Turnovers per 100 possessions he uses (lower is better).",
  orb: "Share of available offensive rebounds he grabs while on the floor.",
  drb: "Share of available defensive rebounds he grabs while on the floor.",
  stl: "Steals per 100 opponent possessions while on the floor.",
  blk: "Blocks per 100 opponent two-point attempts while on the floor.",
};

export const fmtSkill = (s: Pick<SkillStatMeta, "unit">, v: number | null | undefined, d = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v.toFixed(d)}${s.unit === "%" ? "%" : ""}`;

/** Percentile 0–1 → 1..99 (never claims 0th or 100th). */
export const pct99 = (p: number) => Math.min(99, Math.max(1, Math.round(p * 100)));

/** Grade → colour (same tones as the scouting report). */
export const gradeTone = (g: string) => (g[0] === "A" ? "var(--win)" : g[0] === "B" ? "var(--ink)" : g[0] === "C" ? "var(--mute)" : "var(--loss)");

/** Share of the projection that comes from his own games: n / (n + k). */
export const ownShare = (n: number, k: number) => (n > 0 ? n / (n + k) : 0);

const YEAR_WORD: Record<string, string> = { FR: "freshman", SO: "sophomore", JR: "junior", SR: "senior" };
const POS_WORD: Record<string, string> = { G: "guard", F: "forward", C: "center" };
export const heightText = (inches: number | null) => (inches ? `${Math.floor(inches / 12)}′${inches % 12}″` : null);

/** "recruiting profile" when he was a ranked recruit, else what the prior leans on instead. */
export const profileWord = (d: Pick<SkillPlayerDetail, "stars">) => (d.stars ? "recruiting profile" : "position, height and class profile");

/** "Based on 3 games + recruiting profile" — the headline of how much is his and how much is prior. */
export function basisLine(d: Pick<SkillPlayerDetail, "g" | "stars">) {
  const g = d.g ?? 0;
  return `Based on ${g} ${g === 1 ? "game" : "games"} + ${profileWord(d)}`;
}

/** "a 4-star senior guard, 6′4″" — who the starting point describes. */
export function lookalike(d: Pick<SkillPlayerDetail, "pos" | "ht" | "stars" | "year">) {
  const bits = [d.stars ? `${d.stars}-star` : "unranked", d.year ? YEAR_WORD[d.year] : null, d.pos ? POS_WORD[d.pos] : "player"].filter(Boolean).join(" ");
  const ht = heightText(d.ht);
  return `${/^[aeiou]/i.test(bits) ? "an" : "a"} ${bits}${ht ? `, ${ht}` : ""}`;
}

/** Sample words: "11 of 28 three-point attempts", "82 minutes". */
export function sampleText(s: SkillStatMeta, c: Pick<SkillDetailCell, "n" | "made">) {
  if (!c.n) return `no ${s.nUnit} yet`;
  if (c.made !== null && s.unit === "%" && ["ft", "tp", "two", "rim", "mid"].includes(s.key)) return `${c.made} of ${c.n.toLocaleString("en-US")} ${s.nUnit}`;
  return `${c.n.toLocaleString("en-US")} ${s.nUnit}`;
}

/** Opponent note: factor = raw / adjusted. > 1 means his opponents gave up more of this than average. */
const OPP_NOUN: Partial<Record<SkillKey, string>> = {
  two: "two-point makes per try", pts: "points per minute", ast: "assisted baskets", tov: "turnovers", orb: "offensive rebounds",
  drb: "defensive rebounds", stl: "steals", blk: "blocks",
};
export function oppText(key: SkillKey, c: Pick<SkillDetailCell, "opp">) {
  if (c.opp === null || Math.abs(c.opp - 1) < 0.03 || !OPP_NOUN[key]) return null;
  const d = Math.round(Math.abs(c.opp - 1) * 100);
  const verb = key === "tov" ? "force" : "allow";
  return c.opp > 1
    ? `His opponents so far ${verb} about ${d}% more ${OPP_NOUN[key]} than an average D-I team, so the projection discounts those games.`
    : `His opponents so far ${verb} about ${d}% fewer ${OPP_NOUN[key]} than an average D-I team, so the projection gives those games extra credit.`;
}
