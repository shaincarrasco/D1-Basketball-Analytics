"use client";
// World rankings (top 500 per tour) with season record and a link to each player page.
import Link from "next/link";
import { useMemo, useState } from "react";
import DataTable, { type Column } from "@sports/ui/data-table";
import { useJson } from "@sports/ui/client-data";
import { ErrorState, Loading } from "@sports/ui/states";

type Rank = { place: number; points: number; id: string; name: string; country: { name: string; short: string }; headshot: string | null; matches: number; wins: number };
type Rankings = { updated: string; men: Rank[]; women: Rank[] };

export default function Board() {
  const q = useJson<Rankings>("rankings.json");
  const [tour, setTour] = useState<"men" | "women">("men");
  const [find, setFind] = useState("");
  const rows = useMemo(() => {
    const all = q.data?.[tour] ?? [], n = find.trim().toLowerCase();
    return n ? all.filter(r => r.name.toLowerCase().includes(n) || r.country.name.toLowerCase().includes(n) || r.country.short.toLowerCase() === n) : all;
  }, [q.data, tour, find]);
  const columns = useMemo<Column<Rank>[]>(() => [
    { key: "rk", label: "#", value: r => r.place, first: "asc", sticky: true, width: 52, render: r => <span className="rank-cell">{r.place}</span> },
    {
      key: "name", label: "Player", csvLabel: "Player", align: "l", value: r => r.name, first: "asc", sticky: true, width: 220,
      render: r => (
        <div className="flex items-center gap-2.5">
          {r.headshot ? <img src={r.headshot} alt="" className="h-7 w-7 rounded-full bg-deck2 object-cover" loading="lazy" /> : <span className="h-7 w-7 rounded-full bg-deck2" />}
          <span className="min-w-0">
            {r.matches ? <Link data-row-link href={`/player/?id=${r.id}`} className="link block truncate font-semibold">{r.name}</Link> : <span className="block truncate font-semibold">{r.name}</span>}
            <span className="block truncate text-[11.5px] text-mute">{r.country.name}</span>
          </span>
        </div>
      ),
    },
    { key: "pts", label: "Points", csvLabel: "Points", value: r => r.points, first: "desc", render: r => <span className="tnum">{r.points.toLocaleString("en-US")}</span> },
    { key: "rec", label: "Tour W-L", csvLabel: "Main-tour record", title: "Main-tour singles record this season, qualifying included", value: r => r.wins, first: "desc", render: r => <span className="tnum text-mute">{r.matches ? `${r.wins}-${r.matches - r.wins}` : "—"}</span> },
    { key: "pct", label: "Win %", csvLabel: "Win %", value: r => (r.matches >= 5 ? r.wins / r.matches : null), first: "desc", render: r => <span className="tnum">{r.matches >= 5 ? `${Math.round((r.wins / r.matches) * 100)}%` : "—"}</span> },
  ], []);
  if (q.error) return <ErrorState message={q.error} retry={q.retry} />;
  if (!q.data) return <Loading label="Loading rankings" />;
  return (
    <section aria-label="World rankings">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Tour">
          {(["men", "women"] as const).map(t => <button key={t} aria-pressed={tour === t} onClick={() => setTour(t)}>{t === "men" ? "Men (ATP)" : "Women (WTA)"}</button>)}
        </div>
        <input className="field w-full sm:w-64" placeholder="Find a player or country" value={find} onChange={e => setFind(e.target.value)} aria-label="Find a player or country" />
        <span className="text-xs text-dim">Top {q.data[tour].length} · updated {new Date(q.data.updated).toLocaleDateString()}</span>
      </div>
      <DataTable key={tour} rows={rows} columns={columns} rowKey={r => r.id} initialSort="rk" initialDir="asc" pageSize={100} csvName={`baseline-rankings-${tour}.csv`} caption={`${tour === "men" ? "Men's" : "Women's"} world rankings`} maxHeight="78vh" />
    </section>
  );
}
