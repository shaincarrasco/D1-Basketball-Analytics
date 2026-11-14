"use client";
// Player page: headline stats (with percentiles against the tour), where they rank in
// every ranking lens, and recent results.
import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useJson } from "@sports/ui/client-data";
import { ErrorState, Loading } from "@sports/ui/states";
import { heatPct } from "@sports/ui/format";
import { fmtMetric, inPool, makePool, metricIndex, pctLabel, val, withDefaults } from "@sports/kit";
import { pack, SiteFrameworkRanks, useSportData } from "@/site";

type Result = { date: string; event: string; level: string; surface: string; round: string; oppId: string; opp: string; oppRank: number | null; won: boolean; score: string };
const KEYS = ["winPct", "spw", "rpw", "holdPct", "breakPct", "dominance", "aceRate", "bpSaved", "tbWin", "decWin"];

export default function Profile() {
  const id = useSearchParams().get("id");
  const data = useSportData(pack);
  const results = useJson<Record<string, Result[]>>(id ? "results.json" : null);
  const p = useMemo(() => data.rows.find(r => r.id === id) ?? null, [data.rows, id]);
  const tiles = useMemo(() => {
    if (!p) return [];
    const M = metricIndex(pack), pool = withDefaults(pack, { tour: p.tour, mp: "5" });
    const peers = data.rows.filter(r => inPool(pack, pool, r));
    return KEYS.map(k => M[k]).filter(Boolean).map(m => {
      const v = val(m, p), pc = v === null ? null : makePool(peers.map(r => val(m, r)).filter((x): x is number => x !== null)).pct(v, m.invert);
      return { m, v, pc };
    });
  }, [p, data.rows]);
  if (!id) return <p className="deck p-5 text-mute">Pick a player from the <Link className="link" href="/rankings/">rankings</Link>.</p>;
  if (data.error) return <ErrorState message={data.error} retry={data.retry} />;
  if (!data.ready) return <Loading label="Loading player" />;
  if (!p) return <p className="deck p-5 text-mute">No main-tour matches this season for this player yet.</p>;
  const recent = results.data?.[p.id] ?? [];
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-4">
        {p.headshot ? <img src={p.headshot} alt="" className="h-20 w-20 rounded-full bg-deck2 object-cover" /> : <span className="h-20 w-20 rounded-full bg-deck2" />}
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-black uppercase leading-none sm:text-5xl">{p.name}</h1>
          <p className="mt-1 text-mute">{p.country.name} · {p.tour === "men" ? "ATP" : "WTA"}{p.rank ? <> · World <b className="text-ink">#{p.rank}</b> ({p.points?.toLocaleString("en-US")} pts)</> : null}</p>
          <p className="text-sm text-dim">{p.wins}-{p.losses} in main-tour singles this season</p>
        </div>
      </header>
      <section className="deck p-5" aria-labelledby="st-h">
        <h2 id="st-h" className="h-section font-display mb-3 uppercase">Season stats</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {tiles.map(({ m, v, pc }) => (
            <li key={m.key} className="deck-flat px-3 py-2.5" style={{ background: pc !== null ? heatPct(pc) : undefined }} title={m.desc}>
              <span className="block text-[12.5px] font-semibold text-mute">{m.label}</span>
              <span className="font-display text-2xl font-extrabold tnum">{fmtMetric(m, v)}</span>
              {pc !== null && <span className="ml-1.5 text-[11.5px] text-dim">{pctLabel(pc)} pct.</span>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-dim">Percentiles against {p.tour === "men" ? "men's" : "women's"} tour players with 5+ matches. Serve and return totals are estimated from per-match percentages.</p>
      </section>
      <SiteFrameworkRanks p={p} all={data.rows} />
      <section className="deck p-5" aria-labelledby="rs-h">
        <h2 id="rs-h" className="h-section font-display mb-3 uppercase">Recent results</h2>
        {recent.length === 0 ? <p className="text-mute">No results loaded.</p> : (
          <ul className="divide-y divide-line">
            {recent.map((r, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-[14px]">
                <span className={`w-5 font-display text-lg font-extrabold ${r.won ? "text-good" : "text-bad"}`}>{r.won ? "W" : "L"}</span>
                <span className="min-w-0 flex-1">vs <Link className="link font-semibold" href={`/player/?id=${r.oppId}`}>{r.opp}</Link>{r.oppRank ? <span className="text-dim"> (#{r.oppRank})</span> : null}<span className="block text-xs text-dim">{[r.event, r.round, r.surface].filter(Boolean).join(" · ")}</span></span>
                <span className="font-display text-lg font-extrabold tnum">{r.score}</span>
                <span className="w-20 text-right text-xs text-dim">{r.date}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
