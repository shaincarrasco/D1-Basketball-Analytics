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

// Percentile helpers live in the sport kit; re-exported so existing imports keep working.
export { makePool, pctLabel } from "@/sport-kit/stats";

/** DPR ranks only count players with this many on-court possessions. */
export const DPR_MIN_POSS = 150;

/** Recruiting stars as glyphs ("★★★★★"), or "" when unranked. */
export const starGlyphs = (n: number | null) => (n ? "★".repeat(Math.max(0, Math.min(5, n))) : "");

/** "No. 12 in the 2025 class" from whatever recruiting fields exist; null when none do. */
export function recruitText(p: Pick<Player, "stars" | "recRank" | "recYear">): string | null {
  if (!p.stars && !p.recRank && !p.recYear) return null;
  if (p.recRank && p.recYear) return `No. ${p.recRank} in the ${p.recYear} class`;
  if (p.recRank) return `No. ${p.recRank} nationally`;
  if (p.recYear) return `${p.recYear} class`;
  return `${p.stars}-star recruit`;
}

/** Similar players: z-scored per-40 box score, usage, TS%, 3PA rate and DPR (Euclidean distance). */
const SIM_DIMS: ((r: PlayerRow) => number | null)[] = [r => r.pts40, r => r.reb40, r => r.ast40, r => r.usg, r => r.ts, r => r.tpaRate, r => r.dpr];
export const SIM_MIN_MPG = 10;
export function similarPlayers(p: PlayerRow, all: PlayerRow[], n = 5): { r: PlayerRow; d: number }[] {
  const pool = all.filter(r => (r.min ?? 0) >= SIM_MIN_MPG && SIM_DIMS.every(g => g(r) !== null));
  if (pool.length < 2) return [];
  const norm = SIM_DIMS.map(g => {
    const v = pool.map(r => g(r) as number);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length) || 1;
    return { mean, sd };
  });
  const dims = SIM_DIMS.map((g, i) => ({ g, i, v: g(p) })).filter(d => d.v !== null);
  if (dims.length < 3) return [];
  const zp = dims.map(d => ((d.v as number) - norm[d.i].mean) / norm[d.i].sd);
  return pool
    .filter(r => r.id !== p.id)
    .map(r => ({ r, d: Math.sqrt(dims.reduce((s, d, k) => s + (((d.g(r) as number) - norm[d.i].mean) / norm[d.i].sd - zp[k]) ** 2, 0) / dims.length) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
}
