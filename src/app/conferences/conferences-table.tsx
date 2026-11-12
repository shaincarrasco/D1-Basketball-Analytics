"use client";
import Link from "next/link";
import DataTable, { type Column } from "@/components/data-table";
import TeamLogo from "@/components/team-logo";
import { fmt, heat, signed } from "@/lib/format";

export type ConfRow = {
  slug: string; name: string; rank: number; size: number;
  avgEM: number | null; avgO: number | null; avgD: number | null; avgT: number | null; ncW: number; ncL: number;
  best: { name: string; slug: string; logo: string | null; rank: number | null; adjEM: number | null } | null;
};

export default function ConferencesTable({ rows }: { rows: ConfRow[] }) {
  const n = rows.length;
  const rankOf = (key: "avgO" | "avgD" | "avgT", asc: boolean) => {
    const sorted = rows.filter(r => r[key] !== null).sort((a, b) => (asc ? a[key]! - b[key]! : b[key]! - a[key]!));
    return new Map(sorted.map((r, i) => [r.slug, i + 1]));
  };
  const oRank = rankOf("avgO", false), dRank = rankOf("avgD", true), tRank = rankOf("avgT", false);
  const pct = (r: ConfRow) => (r.ncW + r.ncL ? r.ncW / (r.ncW + r.ncL) : null);
  const cell = (v: number | null, rank: number | undefined) => (
    <span className="inline-block min-w-[3.4rem] rounded px-1.5 py-0.5" style={{ background: heat(rank, n) }}>{fmt(v)}<span className="sub-rank">{rank ?? ""}</span></span>
  );

  const columns: Column<ConfRow>[] = [
    { key: "rank", label: "Rk", value: r => r.rank, first: "asc", sticky: true, width: 46, render: r => <span className="rank-cell">{r.rank}</span> },
    { key: "name", label: "Conference", align: "l", value: r => r.name, first: "asc", sticky: true, width: 170,
      render: r => <Link href={`/conferences/${r.slug}/`} className="link block truncate font-semibold">{r.name}</Link> },
    { key: "avgEM", label: "Avg AdjEM", title: "Average adjusted efficiency margin of member teams", value: r => r.avgEM, render: r => <b className="text-[15px]">{signed(r.avgEM)}</b> },
    { key: "avgO", label: "AdjO", title: "Average adjusted offense", group: "off", value: r => r.avgO, render: r => cell(r.avgO, oRank.get(r.slug)) },
    { key: "avgD", label: "AdjD", title: "Average adjusted defense (lower is better)", group: "def", first: "asc", value: r => r.avgD, render: r => cell(r.avgD, dRank.get(r.slug)) },
    { key: "avgT", label: "Tempo", title: "Average adjusted possessions per 40 minutes", value: r => r.avgT, render: r => <span>{fmt(r.avgT)}<span className="sub-rank">{tRank.get(r.slug)}</span></span> },
    { key: "best", label: "Best team", align: "l", csvLabel: "Best team", value: r => r.best?.name ?? null, first: "asc",
      render: r => r.best ? (
        <Link href={`/teams/${r.best.slug}/`} className="link flex items-center gap-2">
          <TeamLogo src={r.best.logo} name={r.best.name} size={20} />
          <span className="max-w-[10rem] truncate">{r.best.name}</span>
          <span className="text-xs text-mute">#{r.best.rank ?? "—"}</span>
        </Link>
      ) : "—" },
    { key: "nc", label: "Non-conf", title: "Record against teams outside the conference (non-D-I opponents included)", value: r => pct(r),
      render: r => <span>{r.ncW}–{r.ncL} <span className="sub-rank">{pct(r) === null ? "" : `${(pct(r)! * 100).toFixed(0)}%`}</span></span> },
    { key: "size", label: "Teams", value: r => r.size },
  ];
  return <DataTable rows={rows} columns={columns} rowKey={r => r.slug} initialSort="rank" initialDir="asc" csvName="d1hoops-conferences.csv" caption="Conference strength ranking" />;
}
