"use client";
// Career table: a player's prior D-I seasons (College Basketball Data) above this season's line.
import Link from "next/link";
import { useMemo } from "react";
import TeamLogo from "@sports/ui/team-logo";
import { useJson } from "@sports/ui/client-data";
import { fmt } from "@sports/ui/format";
import type { CareerRow, TeamDetail, TeamSummary } from "@/lib/types";
import CareerChart from "./career-chart";

// A season is keyed by the year it ends (2027 = 2026–27). The live season is one after the newest
// past season on file, so this never needs a yearly edit; with no history it follows the calendar
// (a new season starts in August).
const calendarSeason = () => { const d = new Date(); return d.getUTCMonth() >= 7 ? d.getUTCFullYear() + 1 : d.getUTCFullYear(); };
const seasonLabel = (s: number) => `${s - 1}–${String(s).slice(2)}`;

/** This season's per-game line, taken from the player table on the profile page. */
export type CareerCurrent = {
  g: number | null; min: number | null; pts: number | null; reb: number | null; ast: number | null;
  fgPct: number | null; tpPct: number | null; ftPct: number | null; ts: number | null;
};

type Line = {
  key: string; season: number; teamId: string | null; team: string | null; g: number | null; mpg: number | null; ppg: number | null;
  rpg: number | null; apg: number | null; fgPct: number | null; tpPct: number | null; ftPct: number | null; ts: number | null;
};

const HI = "color-mix(in srgb, var(--off) 14%, var(--bg))";

export default function Career({ detail, playerId, current }: { detail: TeamDetail; playerId: string; current: CareerCurrent }) {
  const teams = useJson<TeamSummary[]>("teams.json");
  const byId = useMemo(() => new Map((teams.data ?? []).map(t => [t.id, t])), [teams.data]);

  const prior = useMemo<Line[]>(() => {
    const f = detail.careerFields ?? [];
    const rows: CareerRow[] = detail.career?.[playerId] ?? [];
    return rows
      .map((r, i) => {
        const o = Object.fromEntries(f.map((k, j) => [k, r[j]])) as Record<string, string | number | null>;
        return {
          key: `${o.season}-${i}`, season: Number(o.season), teamId: (o.teamId as string) ?? null, team: (o.team as string) ?? null,
          g: o.g as number | null, mpg: o.mpg as number | null, ppg: o.ppg as number | null, rpg: o.rpg as number | null, apg: o.apg as number | null,
          fgPct: o.fgPct as number | null, tpPct: o.tpPct as number | null, ftPct: o.ftPct as number | null, ts: o.ts as number | null,
        };
      })
      .filter(l => Number.isFinite(l.season))
      .sort((a, b) => a.season - b.season);
  }, [detail.careerFields, detail.career, playerId]);

  const now: Line = {
    key: "current", season: calendarSeason(), teamId: detail.id, team: byId.get(detail.id)?.name ?? null,
    g: current.g, mpg: current.min, ppg: current.pts, rpg: current.reb, apg: current.ast,
    fgPct: current.fgPct, tpPct: current.tpPct, ftPct: current.ftPct, ts: current.ts,
  };

  const last = prior[prior.length - 1];
  let trend: string | null = null;
  if (last && (now.g ?? 0) >= 3 && now.ppg !== null && last.ppg !== null) {
    const diff = Math.round((now.ppg - last.ppg) * 10) / 10;
    trend = diff === 0
      ? `Level with ${seasonLabel(last.season)} scoring, ${fmt(now.ppg)} points per game.`
      : `${diff > 0 ? "Up" : "Down"} ${fmt(Math.abs(diff))} points per game from ${seasonLabel(last.season)}.`;
  }

  const cell = (v: number | null, d = 1) => (v === null || v === undefined ? "—" : fmt(v, d));

  return (
    <section className="deck min-w-0 p-5" aria-labelledby="career-h">
      <h2 id="career-h" className="h-section">Career</h2>
      <p className="mb-3 mt-1 text-sm text-mute">Per-game lines by season. Earlier seasons are every college season on record, at this school or others. Shooting % needs 10 attempts.</p>
      <CareerChart seasons={[...prior, now].map(l => ({ season: l.season, ppg: l.ppg, rpg: l.rpg, apg: l.apg, ts: l.ts, current: l.key === "current" }))} />
      <div className="scroll-x rounded-xl border border-line">
        <table className="dt">
          <caption className="sr-only">Career stats by season</caption>
          <thead>
            <tr>
              <th scope="col" className="l sticky-col" style={{ minWidth: 96 }}>Season</th>
              <th scope="col" className="l" style={{ minWidth: 150 }}>Team</th>
              <th scope="col">G</th><th scope="col">MIN</th><th scope="col">PTS</th><th scope="col">REB</th><th scope="col">AST</th>
              <th scope="col">FG%</th><th scope="col">3P%</th><th scope="col">FT%</th><th scope="col" title="True shooting %">TS%</th>
            </tr>
          </thead>
          <tbody>
            {prior.map(l => <CareerLine key={l.key} l={l} label={seasonLabel(l.season)} team={l.teamId ? byId.get(l.teamId) ?? null : null} teamName={l.team} cell={cell} />)}
            <CareerLine l={now} label="This season" team={byId.get(detail.id) ?? null} teamName={now.team} cell={cell} current />
          </tbody>
        </table>
      </div>
      {trend ? (
        <p className="mt-3 text-sm">{trend}</p>
      ) : !prior.length ? (
        <p className="mt-3 text-sm text-mute">No earlier D-I seasons on record (freshman, transfer from outside D-I, or data not loaded yet).</p>
      ) : null}
    </section>
  );
}

function CareerLine({ l, label, team, teamName, cell, current = false }: {
  l: Line; label: string; team: TeamSummary | null; teamName: string | null; cell: (v: number | null, d?: number) => string; current?: boolean;
}) {
  const st = current ? { background: HI } : undefined;
  return (
    <tr className="h-9" aria-current={current ? "true" : undefined}>
      <td className={`l sticky-col ${current ? "font-semibold text-off" : "text-ink"}`} style={{ minWidth: 96, background: current ? HI : "var(--deck)" }}>{label}</td>
      <td className="l" style={st}>
        {team ? (
          <Link href={`/teams/${team.slug}/`} className="link inline-flex items-center gap-1.5">
            <TeamLogo src={team.logo} name={team.name} size={18} />
            <span>{team.short}</span>
          </Link>
        ) : <span className="text-mute">{teamName ?? "—"}</span>}
      </td>
      <td style={st}>{l.g ?? "—"}</td>
      <td style={st}>{cell(l.mpg)}</td>
      <td style={st}>{cell(l.ppg)}</td>
      <td style={st}>{cell(l.rpg)}</td>
      <td style={st}>{cell(l.apg)}</td>
      <td style={st}>{cell(l.fgPct)}</td>
      <td style={st}>{cell(l.tpPct)}</td>
      <td style={st}>{cell(l.ftPct)}</td>
      <td style={st}>{cell(l.ts)}</td>
    </tr>
  );
}
