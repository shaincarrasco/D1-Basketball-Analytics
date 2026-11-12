"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { InjuryRow } from "@/lib/types";

const SRC = { espn: "ESPN injury report", box: "Box scores", news: "Headline" } as const;
export default function InjuryTable({ rows }: { rows: InjuryRow[] }) {
  const [src, setSrc] = useState<"all" | InjuryRow["source"]>("all");
  const [top, setTop] = useState(false);
  const [limit, setLimit] = useState(40);
  const list = useMemo(() => rows.filter(r => (src === "all" || r.source === src) && (!top || (r.rank ?? 999) <= 100)).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)), [rows, src, top]);
  if (!rows.length) return <p className="text-sm text-mute">No players flagged right now.</p>;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter">
        {(["all", "espn", "box", "news"] as const).map(k => <button key={k} className="chip" aria-pressed={src === k} onClick={() => setSrc(k)}>{k === "all" ? `All ${rows.length}` : SRC[k]}</button>)}
        <button className="chip" aria-pressed={top} onClick={() => setTop(v => !v)}>Top 100 teams</button>
      </div>
      <div className="scroll-x rounded-xl border border-line">
        <table className="dt">
          <thead><tr><th className="l">Player</th><th className="l">Team</th><th className="l">Status</th><th className="l">Detail</th><th className="l">Source</th></tr></thead>
          <tbody>
            {list.slice(0, limit).map(r => (
              <tr key={r.slug + r.pid + r.status}>
                <td className="l"><Link className="link font-semibold" href={`/player/?id=${r.pid}`}>{r.name}</Link></td>
                <td className="l"><Link className="link" href={`/teams/${r.slug}/`}>{r.team}</Link>{r.rank ? <span className="ml-1.5 text-xs text-dim">{r.rank}</span> : null}</td>
                <td className="l">{r.status}</td>
                <td className="l max-w-[360px] truncate text-mute" title={r.detail ?? ""}>{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline decoration-line2 underline-offset-2 hover:text-ink">{r.detail}</a> : r.detail}</td>
                <td className="l text-mute">{SRC[r.source]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length > limit && <button className="btn mt-3" onClick={() => setLimit(l => l + 60)}>Show {Math.min(60, list.length - limit)} more of {list.length - limit}</button>}
    </div>
  );
}
