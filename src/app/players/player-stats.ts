// Player helpers shared by /players/ and /player/: position normalising,
// derived rates, sample-size guards and fast percentile lookups.
import { pct } from "@/lib/players";
import type { Player, TeamSummary } from "@/lib/types";

export type Pos = "G" | "F" | "C";
export const POS_WORD: Record<Pos, string> = { G: "Guard", F: "Forward", C: "Center" };

/** Provider positions include PG/SG/SF/PF/ATH/NA; fold them into G/F/C or null. */
export function normPos(pos: string | null): Pos | null {
  if (!pos) return null;
  const p = pos.toUpperCase();
  if (p === "G" || p === "PG" || p === "SG") return "G";
  if (p === "F" || p === "SF" || p === "PF") return "F";
  if (p === "C") return "C";
  return null;
}

/** Minimum attempts before a shooting percentage is treated as meaningful. */
export const MIN_ATT = { fg: 10, three: 5, ft: 5, zone: 5 } as const;

export type PlayerRow = Player & {
  team: TeamSummary | null;
  posN: Pos | null;
  fgPct: number | null; tpPct: number | null; ftPct: number | null;
  pts40: number | null; reb40: number | null; ast40: number | null; stocks40: number | null;
  astTov: number | null; fgaG: number | null; tpaRate: number | null;
  shots: number | null; rimShare: number | null; midShare: number | null; thrShare: number | null;
  rimPct: number | null; midPct: number | null; thrPct: number | null;
};

const per40 = (v: number | null, min: number | null) => (v !== null && min ? (v / min) * 40 : null);

export function derive(p: Player, team: TeamSummary | null): PlayerRow {
  const shots = p.rimA !== null && p.midA !== null && p.thrA !== null ? p.rimA + p.midA + p.thrA : null;
  const share = (a: number | null) => (a !== null && shots ? (a / shots) * 100 : null);
  return {
    ...p, team, posN: normPos(p.pos),
    fgPct: pct(p.fgm, p.fga), tpPct: pct(p.tpm, p.tpa), ftPct: pct(p.ftm, p.fta),
    pts40: per40(p.pts, p.min), reb40: per40(p.reb, p.min), ast40: per40(p.ast, p.min),
    stocks40: p.stl !== null && p.blk !== null ? per40(p.stl + p.blk, p.min) : null,
    astTov: p.ast !== null && p.tov ? p.ast / p.tov : null,
    fgaG: p.fga !== null && p.g ? p.fga / p.g : null,
    tpaRate: p.tpa !== null && p.fga ? (p.tpa / p.fga) * 100 : null,
    shots, rimShare: share(p.rimA), midShare: share(p.midA), thrShare: share(p.thrA),
    rimPct: pct(p.rimM, p.rimA), midPct: pct(p.midM, p.midA), thrPct: pct(p.thrM, p.thrA),
  };
}

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
