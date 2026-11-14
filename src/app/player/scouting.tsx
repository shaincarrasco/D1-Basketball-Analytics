"use client";
// Scouting report: letter grades from D-I percentiles, one tile per skill. Grades come only
// from percentiles against rotation players (the same pool as the rest of the page); a skill
// with too few attempts shows "Few attempts" instead of a grade.
import { useMemo } from "react";
import { fmt } from "@/lib/format";
import { makePool, MIN_ATT, pctLabel, type PlayerRow } from "../players/player-stats";

type Skill = { key: string; name: string; get: (r: PlayerRow) => number | null; show: (r: PlayerRow) => string; invert?: boolean; ok?: (r: PlayerRow) => boolean };

const SKILLS: Skill[] = [
  { key: "pts", name: "Scoring", get: r => r.pts, show: r => `${fmt(r.pts)} per game` },
  { key: "reb", name: "Rebounding", get: r => r.reb, show: r => `${fmt(r.reb)} per game` },
  { key: "ast", name: "Passing", get: r => r.ast, show: r => `${fmt(r.ast)} assists` },
  { key: "ts", name: "Efficiency", get: r => r.ts, show: r => `${fmt(r.ts)}% true shooting`, ok: r => (r.fga ?? 0) + (r.fta ?? 0) >= MIN_ATT.fg },
  { key: "rim", name: "Finishing", get: r => r.rimPct, show: r => `${fmt(r.rimPct, 0)}% at the rim (${r.rimM}/${r.rimA})`, ok: r => (r.rimA ?? 0) >= MIN_ATT.zone },
  { key: "three", name: "Three-point shooting", get: r => r.tpPct, show: r => `${fmt(r.tpPct)}% on ${r.tpa ?? 0}`, ok: r => (r.tpa ?? 0) >= MIN_ATT.three },
  { key: "ftr", name: "Drawing fouls", get: r => r.ftr, show: r => `${fmt((r.ftr ?? 0) / 100, 2)} FTA per FGA`, ok: r => (r.fga ?? 0) >= MIN_ATT.fg },
  { key: "ft", name: "Free throws", get: r => r.ftPct, show: r => `${fmt(r.ftPct)}% on ${r.fta ?? 0}`, ok: r => (r.fta ?? 0) >= MIN_ATT.ft },
  { key: "blk", name: "Rim protection", get: r => r.blk, show: r => `${fmt(r.blk)} blocks` },
  { key: "stl", name: "Steals", get: r => r.stl, show: r => `${fmt(r.stl)} per game` },
  { key: "tov", name: "Ball security", get: r => r.tov, show: r => `${fmt(r.tov)} turnovers`, invert: true },
  { key: "drtg", name: "Team defense on floor", get: r => r.drtg, show: r => `${fmt(r.drtg, 0)} allowed per 100`, invert: true },
];

/** Percentile (0–1) → letter grade. */
export function grade(p: number) {
  const n = p * 100;
  if (n >= 97) return "A+"; if (n >= 93) return "A"; if (n >= 90) return "A-";
  if (n >= 85) return "B+"; if (n >= 80) return "B"; if (n >= 75) return "B-";
  if (n >= 65) return "C+"; if (n >= 50) return "C"; if (n >= 35) return "C-";
  if (n >= 25) return "D+"; if (n >= 10) return "D"; return "D-";
}
const tone = (g: string) => (g[0] === "A" ? "var(--win)" : g[0] === "B" ? "var(--ink)" : g[0] === "C" ? "var(--mute)" : "var(--loss)");

export default function Scouting({ p, pool }: { p: PlayerRow; pool: PlayerRow[] }) {
  const tiles = useMemo(() => SKILLS.map(s => {
    if (s.ok && !s.ok(p)) return { s, pct: null };
    const vals: number[] = [];
    for (const r of pool) { const v = s.get(r); if (v !== null && (!s.ok || s.ok(r))) vals.push(v); }
    return { s, pct: makePool(vals).pct(s.get(p), s.invert) };
  }), [p, pool]);
  const graded = tiles.filter((t): t is { s: Skill; pct: number } => t.pct !== null);
  const best = [...graded].sort((a, b) => b.pct - a.pct)[0], worst = [...graded].sort((a, b) => a.pct - b.pct)[0];

  return (
    <section aria-labelledby="scout-h">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="scout-h" className="h-section">Scouting report</h2>
        <span className="text-sm text-mute">vs {pool.length.toLocaleString("en-US")} D-I rotation players</span>
      </div>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map(({ s, pct }) => {
          const g = pct === null ? null : grade(pct);
          return (
            <li key={s.key} className="flex flex-col gap-1.5 rounded-2xl bg-deck px-3.5 py-3" title={pct === null ? "Not enough attempts for a grade yet" : `${pctLabel(pct)} percentile`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-semibold leading-tight text-mute">{s.name}</span>
                <span className="font-display text-[30px] font-black leading-[0.9]" style={{ color: g ? tone(g) : "var(--dim)" }}>{g ?? "—"}</span>
              </div>
              <span className="truncate font-display text-[18px] font-bold leading-tight">{pct === null ? "Few attempts" : s.show(p)}</span>
              <div className="flex items-center gap-2" role="meter" aria-label={`${s.name} percentile`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct === null ? undefined : Math.round(pct * 100)}>
                <div className="h-1 flex-1 rounded-full bg-line">{pct !== null && <div className="h-1 rounded-full" style={{ width: `${Math.max(3, pct * 100)}%`, background: tone(g!) }} />}</div>
                <span className="w-6 text-right text-xs text-mute tnum">{pct === null ? "" : Math.min(99, Math.max(1, Math.round(pct * 100)))}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {best && worst && best !== worst && (
        <p className="note mt-4 text-[15px] leading-[1.45]">
          Best at {best.s.name.toLowerCase()}, better than {Math.min(99, Math.round(best.pct * 100))}% of D-I rotation players. Weakest: {worst.s.name.toLowerCase()}, {pctLabel(worst.pct)} percentile.
        </p>
      )}
    </section>
  );
}
