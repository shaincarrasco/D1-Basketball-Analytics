"use client";
import Link from "next/link";
import DataTable, { type Column } from "@/components/data-table";
import PerfBars from "@/components/perf-bars";
import TeamLogo from "@/components/team-logo";
import { fmt, heat, pctFmt, signed } from "@/lib/format";
import type { TeamSummary } from "@/lib/types";

export type StandingRow = TeamSummary & { pos: number };

export default function StandingsTable({ rows, total, csvName }: { rows: StandingRow[]; total: number; csvName: string }) {
  const cell = (v: number | null, rank: number | null) => (
    <span className="inline-block min-w-[3.4rem] rounded px-1.5 py-0.5" style={{ background: heat(rank, total) }}>{fmt(v)}<span className="sub-rank">{rank ?? ""}</span></span>
  );
  const pct = (w: number, l: number) => (w + l ? w / (w + l) : null);
  const columns: Column<StandingRow>[] = [
    { key: "pos", label: "#", value: r => r.pos, first: "asc", sticky: true, width: 40, render: r => <span className="rank-cell">{r.pos}</span> },
    { key: "name", label: "Team", align: "l", value: r => r.name, first: "asc", sticky: true, width: 190,
      render: r => (
        <Link href={`/teams/${r.slug}/`} className="link flex items-center gap-2.5">
          <TeamLogo src={r.logo} name={r.name} size={24} />
          <span className="min-w-0 truncate font-semibold group-hover/row:text-off">{r.name}</span>
        </Link>
      ) },
    { key: "conf", label: "Conf", title: "Conference record", value: r => pct(r.cw, r.cl), render: r => <b>{r.cw}–{r.cl}</b> },
    { key: "overall", label: "Overall", title: "Overall record", value: r => pct(r.w, r.l), render: r => `${r.w}–${r.l}` },
    { key: "projc", label: "Proj conf", title: "Projected final conference record", value: r => r.projCW, render: r => <span className="font-semibold">{fmt(r.projCW)}–{fmt(r.projCL)}</span> },
    { key: "simConfW", label: "Exp. conf W", csvLabel: "Expected conference wins", title: "Average conference wins across 10,000 season simulations", value: r => r.sim?.confWins ?? null, render: r => fmt(r.sim?.confWins, 1) },
    { key: "simTitle", label: "Title odds", csvLabel: "Conference title odds", title: "Share of 10,000 season simulations in which the team wins or shares the regular-season title (outright share in the tooltip)", value: r => r.sim?.title ?? null,
      render: r => r.sim ? (
        <span className="inline-flex items-center justify-end gap-2" title={`Wins or shares the title in ${pctFmt(r.sim.title, 1)} of simulations; outright in ${pctFmt(r.sim.outright, 1)}`}>
          <span className="relative hidden h-1.5 w-14 rounded-full bg-line sm:inline-block" aria-hidden>
            <span className="absolute inset-y-0 left-0 rounded-full bg-ink/70" style={{ width: `${Math.max(r.sim.title > 0 ? 3 : 0, r.sim.title * 100)}%` }} />
          </span>
          <b className="w-11">{pctFmt(r.sim.title, r.sim.title < 0.1 && r.sim.title >= 0.005 ? 1 : 0)}</b>
        </span>
      ) : "—" },
    { key: "rank", label: "DHR", title: "National DHR rank", value: r => r.rank, first: "asc", render: r => <span className="inline-block min-w-[2.4rem] rounded px-1.5 py-0.5 font-semibold" style={{ background: heat(r.rank, total) }}>{r.rank ?? "—"}</span> },
    { key: "adjEM", label: "AdjEM", title: "Adjusted efficiency margin", value: r => r.adjEM, render: r => <b className="text-[15px]">{signed(r.adjEM)}</b> },
    { key: "adjO", label: "AdjO", title: "Adjusted offense", group: "off", value: r => r.adjO, render: r => cell(r.adjO, r.adjORank) },
    { key: "adjD", label: "AdjD", title: "Adjusted defense (lower is better)", group: "def", first: "asc", value: r => r.adjD, render: r => cell(r.adjD, r.adjDRank) },
    { key: "streak", label: "Streak", value: r => r.streak, render: r => <span className={r.streak?.startsWith("W") ? "text-win" : r.streak ? "text-loss" : "text-dim"}>{r.streak ?? "—"}</span> },
    { key: "perf", label: "Game form", title: "Adjusted efficiency margin in each game (opponent + venue adjusted)", sortable: false, value: r => (r.perf.length ? r.perf.reduce((a, b) => a + b, 0) / r.perf.length : null), render: r => <PerfBars values={r.perf} /> },
    { key: "proj", label: "Proj W–L", title: "Projected final overall record", value: r => r.projW, render: r => `${fmt(r.projW)}–${fmt(r.projL)}` },
  ];
  return <DataTable rows={rows} columns={columns} rowKey={r => r.id} initialSort="pos" initialDir="asc" csvName={csvName} rowHref={r => `/teams/${r.slug}/`} caption="Conference standings" />;
}
