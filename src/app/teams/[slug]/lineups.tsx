"use client";
// Five-man units from play-by-play. Small samples (< 40 possessions) are dimmed.
import Link from "next/link";
import DataTable, { type Column } from "@/components/data-table";
import { fmt, signed } from "@/lib/format";
import type { TeamDetail } from "@/lib/types";

type Unit = NonNullable<TeamDetail["lineups"]>[number];
const SMALL = 40;

const short = (name: string) => {
  const parts = name.split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name;
};

export default function Lineups({ lineups, names }: { lineups: Unit[]; names: Record<string, string> }) {
  if (!lineups.length) return <p className="text-sm text-mute">No five-man units with play-by-play yet.</p>;
  const dim = (u: Unit, node: React.ReactNode) => <span className={u.poss < SMALL ? "opacity-50" : undefined}>{node}</span>;
  const columns: Column<Unit>[] = [
    {
      key: "unit", label: "Lineup", align: "l", sortable: false, csvLabel: "Lineup",
      value: u => u.pids.map(id => names[id] ?? id).join(" / "),
      render: u => (
        <span className={`flex min-w-[230px] sm:min-w-[300px] flex-wrap gap-x-2.5 gap-y-0.5 whitespace-normal ${u.poss < SMALL ? "opacity-50" : ""}`}>
          {u.pids.map(id => names[id]
            ? <Link key={id} href={`/player/?id=${id}`} className="link font-semibold" title={names[id]}>{short(names[id])}</Link>
            : <span key={id} className="text-mute">Unlisted player</span>)}
        </span>
      ),
    },
    { key: "min", label: "Min", title: "Minutes together", value: u => u.min, render: u => dim(u, fmt(u.min, 1)) },
    { key: "poss", label: "Poss", title: "Offensive possessions together", value: u => u.poss, render: u => dim(u, fmt(u.poss, 0)) },
    { key: "pf", label: "Pts for", value: u => u.pf, render: u => dim(u, u.pf), group: "off" },
    { key: "pa", label: "Pts against", value: u => u.pa, render: u => dim(u, u.pa), group: "def", first: "asc" },
    { key: "pm", label: "+/−", title: "Raw point differential", value: u => u.pf - u.pa, render: u => dim(u, signed(u.pf - u.pa, 0)) },
    {
      key: "net", label: "Net / 100", title: "Point differential per 100 possessions (not adjusted for opponent)", value: u => u.net,
      render: u => dim(u, <b className={`font-semibold ${u.net >= 0 ? "text-win" : "text-loss"}`}>{signed(u.net, 1)}</b>),
    },
  ];
  return (
    <div>
      <DataTable rows={lineups} columns={columns} rowKey={u => u.pids.join("-")} initialSort="min" pageSize={10} caption="Five-man lineups" />
      <p className="mt-2 text-xs text-dim">Units with fewer than {SMALL} possessions are dimmed: net ratings over a few minutes swing wildly and aren&apos;t adjusted for opponent.</p>
    </div>
  );
}
