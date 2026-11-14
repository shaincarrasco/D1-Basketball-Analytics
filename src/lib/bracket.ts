// Types + label helpers for the projected NCAA field (public/data/app/bracket.json,
// written by scripts/build-bracket.mjs). Pure module: safe for server and client code.

export type BidType = "auto" | "at-large" | "out";
export type BubbleGroup = "lastFourByes" | "lastFourIn" | "firstFourOut" | "nextFourOut";
export type OpeningKind = "auto" | "at-large";

export type BracketConfig = {
  season: number; fieldSize: number; autoBids: number; atLargeBids: number;
  openingRound: { autoTeams: number; atLargeTeams: number; games: number };
  regions: string[]; weights: { resume: number; quality: number };
  q1WinBonus: number; q34LossPenalty: number; bubbleRank: number; sims: number;
};

export type BracketTeam = {
  slug: string; name: string; short: string; logo: string | null; color: string | null;
  conf: string; confName: string; confSlug: string;
  seed: number | null; overall: number | null; region: string | null;
  bid: BidType; openingRound: boolean; group: BubbleGroup | null;
  w: number; l: number; quads: [number, number][];
  /** Projected end-of-season record (season simulation average). */
  projW: number; projL: number;
  /** Projected Quad 1 record: played + summed win probability of remaining Quad 1 games. */
  projQ1: [number, number]; q1Left: number; q2Left: number;
  rank: number | null; resumeRank: number; wab: number; score: number;
  /** Share of simulated seasons in which the team makes the projected field. */
  makeField: number;
  /** Regular-season conference title odds (auto-bid teams). */
  autoOdds: number | null;
  notes: string[];
};

export type BracketSlot = { seed: number; teams: string[]; kind: OpeningKind | null };
export type BracketIndexEntry = { s: BidType; seed: number | null; g: BubbleGroup | null; or: boolean; p: number; x?: 1 };

export type BracketFile =
  | {
      ok: true; season: number; updated: string; built: string; config: BracketConfig;
      medianGames: number; early: boolean; remainingGames: number; bubbleRating: number; ineligible: string[];
      regions: { name: string; slots: BracketSlot[] }[];
      /** Region index pairs that meet in the national semifinals. */
      finalFour: [number, number][];
      lines: { seed: number; entries: { teams: string[]; kind: OpeningKind | null; region: string }[] }[];
      openingRound: { kind: OpeningKind; seed: number; region: string; teams: string[] }[];
      bubble: Record<BubbleGroup, string[]>;
      teams: Record<string, BracketTeam>;
      index: Record<string, BracketIndexEntry>;
    }
  | { ok: false; reason: string; config: BracketConfig };

export const BUBBLE_GROUPS: { key: BubbleGroup; label: string; blurb: string }[] = [
  { key: "lastFourByes", label: "Last four byes", blurb: "The last four at-large teams who skip the Opening Round." },
  { key: "lastFourIn", label: "Last four in", blurb: "The final four at-large teams in the field. They play in the Opening Round." },
  { key: "firstFourOut", label: "First four out", blurb: "The next four teams in line if a bid opens up." },
  { key: "nextFourOut", label: "Next four out", blurb: "Close behind. A good week moves them up." },
];
export const groupLabel = (g: BubbleGroup) => BUBBLE_GROUPS.find(x => x.key === g)?.label ?? g;

/** Short status for chips: "Proj. 4 seed", "Last four in", "First four out", "Out". */
export function bracketStatus(e: BracketIndexEntry): { label: string; detail: string | null; tone: "in" | "bubble" | "out" } {
  if (e.x) return { label: "Not eligible", detail: "Reclassifying to Division I; not eligible for the 2027 tournament", tone: "out" };
  if (e.s !== "out" && e.seed) {
    const detail = e.g ? groupLabel(e.g) : e.or ? "Opening Round" : e.s === "auto" ? "Auto bid" : null;
    return { label: `Proj. ${e.seed} seed`, detail, tone: e.g === "lastFourIn" ? "bubble" : "in" };
  }
  if (e.g) return { label: groupLabel(e.g), detail: null, tone: "bubble" };
  return { label: "Out", detail: null, tone: "out" };
}

export const pctLabel = (p: number) => (p >= 0.995 ? ">99%" : p > 0 && p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);
