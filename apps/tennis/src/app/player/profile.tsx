"use client";
// Player page: the season as tournaments (net chart), how points are won and lost (funnels),
// headline numbers for whatever is in focus, where they rank, and every result by tournament.
import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useJson } from "@sports/ui/client-data";
import { ErrorState, Loading } from "@sports/ui/states";
import { heatPct } from "@sports/ui/format";
import { makePool } from "@sports/kit";
import type { TennisRow } from "@sports/packs/tennis/types";
import { events, pct, ratio, rpw, spw, sum, SURFACES, surfaceColor, type Season, type Totals } from "@/lib/season";
import { pack, SiteFrameworkRanks, useSportData } from "@/site";
import NetChart from "./net-chart";
import { ReturnFunnel, ServeFunnel } from "./funnel";

const label = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Season-total versions of the headline numbers, for tour percentiles. */
const rowStat: Record<string, (r: TennisRow) => number | null> = {
  spw: r => ratio(r.servicePointsWon ?? 0, r.servicePoints ?? 0), rpw: r => ratio(r.returnPointsWon ?? 0, r.returnPoints ?? 0),
  hold: r => ratio(r.serviceGamesWon ?? 0, r.serviceGames ?? 0), brk: r => ratio(r.returnGamesWon ?? 0, r.returnGames ?? 0),
  first: r => ratio(r.firstServePointsWon ?? 0, r.firstServesIn ?? 0), second: r => ratio(r.secondServePointsWon ?? 0, (r.servicePoints ?? 0) - (r.firstServesIn ?? 0)),
  bps: r => ratio(r.breakPointsSaved ?? 0, r.breakPointsFaced ?? 0), bpc: r => ratio(r.breakPointsConverted ?? 0, r.breakPointChances ?? 0),
};
const tileStat: [string, string, (t: Totals) => number | null][] = [
  ["spw", "Serve points won", spw], ["rpw", "Return points won", rpw],
  ["hold", "Service games held", t => ratio(t.sgw, t.sg)], ["brk", "Return games broken", t => ratio(t.rgw, t.rg)],
  ["first", "1st serve points won", t => ratio(t.fw, t.fi)], ["second", "2nd serve points won", t => ratio(t.sw, t.sp - t.fi)],
  ["bps", "Break points saved", t => ratio(t.bps, t.bpf)], ["bpc", "Break points won", t => ratio(t.bpv, t.bpc)],
];

export default function Profile() {
  const id = useSearchParams().get("id");
  const data = useSportData(pack);
  const season = useJson<Season>(id ? `p/${id}.json` : null);
  const [surface, setSurface] = useState<string>("all");
  const [focus, setFocus] = useState<string | null>(null);
  const p = useMemo(() => data.rows.find(r => r.id === id) ?? null, [data.rows, id]);
  const peers = useMemo(() => (p ? data.rows.filter(r => r.tour === p.tour && r.matches >= 10) : []), [data.rows, p]);
  const avg = useMemo(() => {
    if (!peers.length) return null;
    const s = peers.reduce((a, r) => ({ sw: a.sw + (r.servicePointsWon ?? 0), sp: a.sp + (r.servicePoints ?? 0), rw: a.rw + (r.returnPointsWon ?? 0), rp: a.rp + (r.returnPoints ?? 0) }), { sw: 0, sp: 0, rw: 0, rp: 0 });
    return { spw: s.sw / s.sp, rpw: s.rw / s.rp };
  }, [peers]);
  const all = season.data?.matches ?? [];
  const evs = useMemo(() => events(all.filter(m => surface === "all" || m.sf === surface)), [all, surface]);
  const shown = useMemo(() => (focus ? evs.filter(e => e.eid === focus) : evs).flatMap(e => e.matches), [evs, focus]);
  const t = useMemo(() => sum(shown), [shown]);
  const focusEv = evs.find(e => e.eid === focus) ?? null;

  if (!id) return <p className="deck p-5 text-mute">Pick a player from the <Link className="link" href="/rankings/">rankings</Link>.</p>;
  if (data.error) return <ErrorState message={data.error} retry={data.retry} />;
  if (!data.ready || (!season.data && !season.error)) return <Loading label="Loading player" />;
  if (!p) return <p className="deck p-5 text-mute">No main-tour matches this season for this player yet.</p>;
  const whole = !focus && surface === "all";
  const surf = SURFACES.map(s => ({ s, n: all.filter(m => m.sf === s).length, w: all.filter(m => m.sf === s && m.w).length })).filter(x => x.n);
  const titles = events(all).filter(e => e.result === "W");

  return (
    <div className="flex flex-col gap-6">
      <header className="relative overflow-hidden rounded-3xl border border-line bg-deck p-5 sm:p-7">
        {/* the service line and centre mark of a court, behind the name */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[.13]" preserveAspectRatio="none" viewBox="0 0 100 40">
          <path d="M0 8H100M0 32H100M50 8V32M20 8V32M80 8V32" stroke="white" strokeWidth=".25" fill="none" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="relative flex flex-wrap items-center gap-5">
          {p.headshot ? <img src={p.headshot} alt="" className="h-24 w-24 rounded-full border-2 border-bulb bg-deck2 object-cover" /> : <span className="h-24 w-24 rounded-full border-2 border-line2 bg-deck2" />}
          <div className="min-w-0 flex-1">
            <p className="text-mute">{p.country.name}, {p.tour === "men" ? "ATP" : "WTA"}</p>
            <h1 className="font-display text-5xl font-black leading-[.9] sm:text-7xl">{p.name}</h1>
            <p className="mt-2 text-mute"><b className="text-ink">{p.wins}-{p.losses}</b> this season{titles.length ? <>, <b className="text-bulb">{titles.length} title{titles.length > 1 ? "s" : ""}</b> ({titles.map(e => e.name).join(", ")})</> : null}</p>
          </div>
          {p.rank && <div className="text-right"><span className="dots dots-glow block text-6xl leading-none">{p.rank}</span><span className="text-sm text-mute">world ranking, {p.points?.toLocaleString("en-US")} pts</span></div>}
        </div>
        {surf.length > 0 && (
          <div className="relative mt-5 flex h-9 overflow-hidden rounded-lg" aria-label="Record by surface">
            {surf.map(x => (
              <div key={x.s} className="flex items-center justify-between gap-2 px-3 text-[13px] font-bold text-[rgb(var(--bg-rgb))]" style={{ flexGrow: x.n, flexBasis: 0, background: surfaceColor(x.s) }}>
                <span className="truncate">{label(x.s)}</span><span className="tnum">{x.w}-{x.n - x.w}</span>
              </div>
            ))}
          </div>
        )}
      </header>

      <section className="deck p-4 sm:p-6" aria-labelledby="season-h">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 id="season-h" className="h-section font-display mr-auto">Season, tournament by tournament</h2>
          <div className="seg" role="group" aria-label="Surface">
            {["all", ...SURFACES].map(s => <button key={s} aria-pressed={surface === s} onClick={() => { setSurface(s); setFocus(null); }}>{s === "all" ? "All" : label(s)}</button>)}
          </div>
        </div>
        {evs.length ? <NetChart evs={evs} focus={focus} onFocus={setFocus} avg={avg} /> : <p className="text-mute">No matches on {surface} this season.</p>}
        <p className="mt-1 text-[13px] text-mute">
          {focusEv ? <>Showing <b className="text-ink">{focusEv.name}</b> only. <button className="link font-semibold" onClick={() => setFocus(null)}>Show the whole season</button></> : "Tap a tournament to focus the numbers below on it. Letters are how far they went (W = title)."}
        </p>
      </section>

      <section aria-label="How points are won" className="grid gap-4 lg:grid-cols-2">
        <div className="deck p-4 sm:p-6"><ServeFunnel t={t} /></div>
        <div className="deck p-4 sm:p-6"><ReturnFunnel t={t} /></div>
      </section>

      <section className="deck p-4 sm:p-6" aria-labelledby="num-h">
        <h2 id="num-h" className="h-section font-display mb-3">{focusEv ? focusEv.name : surface === "all" ? "Season numbers" : `${label(surface)}-court numbers`} <span className="text-base font-semibold text-mute">({t.wins}-{t.n - t.wins})</span></h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tileStat.map(([k, name, f]) => {
            const v = f(t);
            const pc = whole && v !== null ? makePool(peers.map(rowStat[k]).filter((x): x is number => x !== null)).pct(v) : null;
            return (
              <li key={k} className="deck-flat px-3 py-3" style={{ background: pc !== null ? heatPct(pc) : undefined }}>
                <span className="block text-[13px] font-semibold text-mute">{name}</span>
                <span className="font-display text-3xl font-extrabold tnum">{pct(v, 1)}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-dim">{whole ? `Shading compares the season with ${p.tour === "men" ? "men's" : "women's"} tour players with 10+ matches.` : "Shading shows only for the whole season."} Point totals are estimated from each match's serve and return percentages.</p>
      </section>

      <SiteFrameworkRanks p={p} all={data.rows} />

      <section className="deck p-4 sm:p-6" aria-labelledby="res-h">
        <h2 id="res-h" className="h-section font-display mb-3">Results</h2>
        <div className="flex flex-col gap-5">
          {[...(focus ? evs.filter(e => e.eid === focus) : evs)].reverse().map(e => (
            <div key={e.eid} className="border-l-4 pl-3" style={{ borderColor: surfaceColor(e.surface) }}>
              <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                <b className="font-display text-lg">{e.name}</b>
                <span className="text-xs text-dim">{e.level}, {e.surface}</span>
                <span className={`ml-auto text-sm font-bold ${e.result === "W" ? "text-bulb" : "text-mute"}`}>{e.result === "W" ? "Champion" : e.result}</span>
              </div>
              <ul className="divide-y divide-line">
                {[...e.matches].reverse().map((m, i) => (
                  <li key={i} className="grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-x-3 py-1.5 text-[14px] sm:grid-cols-[1.25rem_1fr_auto_8rem]">
                    <span className={`font-display font-extrabold ${m.w ? "text-good" : "text-bad"}`}>{m.w ? "W" : "L"}</span>
                    <span className="min-w-0 truncate">{m.rd}: <Link className="link font-semibold" href={`/player/?id=${m.oid}`}>{m.opp}</Link>{m.ork ? <span className="text-dim"> (#{m.ork})</span> : null}</span>
                    <span className="font-display font-extrabold tnum">{m.sc}</span>
                    <span className="hidden text-right text-xs text-dim sm:block">serve {pct(spw(m.s))}, return {pct(rpw(m.s))}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
