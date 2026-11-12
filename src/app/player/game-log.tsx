"use client";
// Game-by-game box score lines for one player, with a points/game-score strip on top.
import Link from "next/link";
import { useMemo, useState } from "react";
import TeamLogo from "@/components/team-logo";
import { fmt } from "@/lib/format";
import type { TeamDetail, TeamSummary } from "@/lib/types";

type Line = {
  day: string; opp: string; oppSlug: string | null; venue: "H" | "A" | "N"; result: "W" | "L" | null; teamPts: number | null; oppPts: number | null;
  starter: number; min: number | null; pts: number | null; fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null;
  ftm: number | null; fta: number | null; orb: number | null; drb: number | null; reb: number | null; ast: number | null; stl: number | null;
  blk: number | null; tov: number | null; pf: number | null; gmsc: number | null;
};

// Hollinger game score: one number for a box-score line (~10 is average, 20+ is a big night).
const gameScore = (l: Line) =>
  l.pts === null ? null :
  l.pts + 0.4 * (l.fgm ?? 0) - 0.7 * (l.fga ?? 0) - 0.4 * ((l.fta ?? 0) - (l.ftm ?? 0)) + 0.7 * (l.orb ?? 0) + 0.3 * (l.drb ?? 0)
  + (l.stl ?? 0) + 0.7 * (l.ast ?? 0) + 0.7 * (l.blk ?? 0) - 0.4 * (l.pf ?? 0) - (l.tov ?? 0);

const pct = (m: number | null, a: number | null) => (a ? `${Math.round(((m ?? 0) / a) * 100)}%` : "—");

export default function GameLog({ playerId, detail, teams }: { playerId: string; detail: TeamDetail; teams: TeamSummary[] }) {
  const [metric, setMetric] = useState<"pts" | "gmsc" | "reb" | "ast">("pts");
  const logos = useMemo(() => new Map(teams.map(t => [t.slug, t.logo])), [teams]);
  const lines = useMemo<Line[]>(() => {
    const f = detail.logFields ?? [], rows = detail.logs?.[playerId] ?? [];
    return rows.map(r => {
      const o = Object.fromEntries(f.map((k, i) => [k, r[i]])) as unknown as Line;
      return { ...o, gmsc: gameScore(o) };
    });
  }, [detail, playerId]);

  if (!lines.length) return <p className="text-sm text-mute">No game box scores for this player yet. They appear the morning after each game.</p>;

  const sum = (k: keyof Line) => lines.reduce((s, l) => s + (typeof l[k] === "number" ? (l[k] as number) : 0), 0);
  const n = lines.length;
  const avg = (k: keyof Line) => sum(k) / n;
  const values = lines.map(l => (l[metric] as number | null) ?? 0);
  const max = Math.max(1, ...values);
  const best = lines.reduce((b, l) => ((l.gmsc ?? -99) > (b.gmsc ?? -99) ? l : b), lines[0]);
  const dateLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const METRICS = { pts: "Points", gmsc: "Game score", reb: "Rebounds", ast: "Assists" } as const;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5" role="group" aria-label="Chart metric">
          {(Object.keys(METRICS) as (keyof typeof METRICS)[]).map(k => (
            <button key={k} className="chip" aria-pressed={metric === k} onClick={() => setMetric(k)}>{METRICS[k]}</button>
          ))}
        </div>
        <p className="text-xs text-mute">Best game: <b className="text-ink">{fmt(best.pts, 0)} pts</b> {best.venue === "A" ? "at" : "vs"} {best.opp}, {dateLabel(best.day)}</p>
      </div>

      {/* Strip chart: one bar per game */}
      <div className="mb-4 flex h-24 items-end gap-1 border-b border-line" role="img" aria-label={`${METRICS[metric]} by game: ${values.join(", ")}`}>
        {lines.map((l, i) => (
          <div key={l.day + i} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${dateLabel(l.day)} ${l.venue === "A" ? "at" : "vs"} ${l.opp}: ${fmt(values[i], metric === "gmsc" ? 1 : 0)}`}>
            <span className="mb-0.5 text-center text-[10px] text-mute tnum">{fmt(values[i], metric === "gmsc" ? 1 : 0)}</span>
            <div className="mx-auto w-full max-w-[28px] rounded-t-sm" style={{ height: `${Math.max(2, (Math.max(0, values[i]) / max) * 72)}%`, background: l.result === "L" ? "var(--line-2)" : "var(--off)" }} />
          </div>
        ))}
      </div>

      <div className="scroll-x rounded-lg border border-line">
        <table className="dt">
          <caption className="sr-only">Game log</caption>
          <thead>
            <tr>
              <th className="l sticky-col" style={{ minWidth: 64 }}>Date</th><th className="l">Opponent</th><th className="l">Result</th>
              <th title="Started">GS</th><th>Min</th><th>Pts</th><th>FG</th><th>3P</th><th>FT</th>
              <th title="Offensive / defensive rebounds">Reb (O-D)</th><th>Ast</th><th>Stl</th><th>Blk</th><th>TO</th><th>PF</th>
              <th title="Hollinger game score: about 10 is an average night, 20+ is a big one">GmSc</th>
            </tr>
          </thead>
          <tbody>
            {[...lines].reverse().map((l, i) => (
              <tr key={l.day + i}>
                <td className="l sticky-col text-mute"><Link className="link" href={`/games/?d=${l.day}`}>{dateLabel(l.day)}</Link></td>
                <td className="l">
                  <span className="flex items-center gap-2">
                    <span className="w-4 text-xs text-dim">{l.venue === "A" ? "at" : "vs"}</span>
                    <TeamLogo src={l.oppSlug ? logos.get(l.oppSlug) ?? null : null} name={l.opp} size={18} />
                    {l.oppSlug ? <Link className="link" href={`/teams/${l.oppSlug}/`}>{l.opp}</Link> : <span className="text-mute">{l.opp}</span>}
                  </span>
                </td>
                <td className="l">{l.result ? <span><span className={l.result === "W" ? "text-win" : "text-loss"}>{l.result}</span> {l.teamPts}–{l.oppPts}</span> : "—"}</td>
                <td className="text-mute">{l.starter ? "✓" : ""}</td>
                <td>{fmt(l.min, 0)}</td>
                <td className="font-semibold">{fmt(l.pts, 0)}</td>
                <td><span>{l.fgm ?? 0}-{l.fga ?? 0}</span> <span className="text-[11px] text-dim">{pct(l.fgm, l.fga)}</span></td>
                <td>{l.tpm ?? 0}-{l.tpa ?? 0}</td>
                <td>{l.ftm ?? 0}-{l.fta ?? 0}</td>
                <td>{fmt(l.reb, 0)} <span className="text-[11px] text-dim">{l.orb ?? 0}-{l.drb ?? 0}</span></td>
                <td>{fmt(l.ast, 0)}</td><td>{fmt(l.stl, 0)}</td><td>{fmt(l.blk, 0)}</td><td>{fmt(l.tov, 0)}</td><td>{fmt(l.pf, 0)}</td>
                <td style={{ color: (l.gmsc ?? 0) >= 20 ? "var(--win)" : (l.gmsc ?? 0) < 0 ? "var(--loss)" : undefined }}>{fmt(l.gmsc, 1)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="l sticky-col">Average</td><td className="l text-mute">{n} games</td><td className="l text-mute">{lines.filter(l => l.result === "W").length}–{lines.filter(l => l.result === "L").length}</td>
              <td className="text-mute">{lines.filter(l => l.starter).length}</td>
              <td>{fmt(avg("min"))}</td><td>{fmt(avg("pts"))}</td>
              <td>{fmt(avg("fgm"))}-{fmt(avg("fga"))}</td><td>{fmt(avg("tpm"))}-{fmt(avg("tpa"))}</td><td>{fmt(avg("ftm"))}-{fmt(avg("fta"))}</td>
              <td>{fmt(avg("reb"))}</td><td>{fmt(avg("ast"))}</td><td>{fmt(avg("stl"))}</td><td>{fmt(avg("blk"))}</td><td>{fmt(avg("tov"))}</td><td>{fmt(avg("pf"))}</td>
              <td>{fmt(avg("gmsc"))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-xs text-dim">Game lines from ESPN box scores; they can include a game or two that the season averages above don’t have yet.</p>
    </div>
  );
}
