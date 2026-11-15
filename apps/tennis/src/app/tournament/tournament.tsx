"use client";
// One tournament: champion and final, past champions, the order of play for upcoming
// matches, and every result by round (loaded live from theScore).
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useJson } from "@sports/ui/client-data";
import { ErrorState, Loading } from "@sports/ui/states";
import { surfaceColor } from "@/lib/season";
import { fmtDay, type CalEvent, type Calendar } from "@/lib/calendar";
import { eventMatches, localDay, localTime, roundRank, scoreLine, type TMatch } from "@/lib/thescore";

const norm = (n: string) => n.toLowerCase().replace(/\b(atp|wta|world tour|presented by .*|\d{4})\b/g, "").replace(/[^a-z]/g, "");

function Player({ id, name, seed, won }: { id: string; name: string; seed: number | null; won: boolean }) {
  return (
    <span className={`min-w-0 truncate ${won ? "font-bold text-ink" : "text-mute"}`}>
      {id && name !== "TBD" ? <Link className="link" href={`/player/?id=${id}`}>{name}</Link> : name}{seed ? <span className="text-dim"> ({seed})</span> : null}
    </span>
  );
}

function MatchRow({ m }: { m: TMatch }) {
  const done = m.status === "final" || m.winner > 0, live = m.status === "in_progress";
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 py-2 text-[14px]">
      <span className="flex min-w-0 flex-col">
        <Player id={m.a.id} name={m.a.name} seed={m.a.seed} won={m.winner === 1} />
        <Player id={m.b.id} name={m.b.name} seed={m.b.seed} won={m.winner === 2} />
      </span>
      <span className="text-right font-display font-extrabold tnum">
        {done && !m.a.games.length && !m.b.games.length ? <span className="text-[12px] font-semibold text-mute">Walkover</span>
          : done || live ? <><span className="block">{m.a.games.join(" ") || "–"}</span><span className="block">{m.b.games.join(" ") || "–"}</span></>
          : <span className="text-[13px] font-semibold text-mute">{localTime(m.date)}</span>}
        {live && <span className="block text-[11px] font-bold text-bad">LIVE</span>}
      </span>
    </li>
  );
}

export default function Tournament() {
  const sp = useSearchParams();
  const id = sp.get("t") ?? "", y = Number(sp.get("y")) || null;
  const cal = useJson<Calendar>("calendar.json");
  const [matches, setMatches] = useState<TMatch[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const found = useMemo(() => {
    for (const tour of ["men", "women"] as const) for (const s of cal.data?.tours[tour] ?? []) {
      if (y && s.year !== y) continue;
      const e = s.events.find(x => x.id === id); if (e) return { tour, year: s.year, e };
    }
    return null;
  }, [cal.data, id, y]);
  useEffect(() => {
    if (!found) return;
    let dead = false;
    setMatches(null); setErr(null);
    eventMatches(found.tour, found.e.sid).then(m => { if (!dead) setMatches(m); }).catch(e => { if (!dead) setErr((e as Error).message); });
    return () => { dead = true; };
  }, [found]);
  if (cal.error) return <ErrorState message={cal.error} retry={cal.retry} />;
  if (!cal.data) return <Loading label="Loading tournament" />;
  if (!found) return <p className="deck p-5 text-mute">Tournament not found. Pick one from the <Link className="link" href="/calendar/">calendar</Link>.</p>;
  const { e, tour, year } = found;
  const past = (cal.data.tours[tour] ?? []).filter(s => s.year !== year).map(s => ({ year: s.year, e: s.events.find(x => norm(x.name) === norm(e.name)) })).filter((x): x is { year: number; e: CalEvent } => !!x.e?.winner);
  const upcoming = (matches ?? []).filter(m => m.status === "pre_game" && m.winner === 0).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const days = [...new Set(upcoming.map(m => localDay(m.date)))];
  const rounds = [...new Set((matches ?? []).filter(m => m.status !== "pre_game" || m.winner).map(m => m.round))].sort((a, b) => roundRank(b) - roundRank(a));
  return (
    <div className="flex flex-col gap-6">
      <header className="relative overflow-hidden rounded-3xl border border-line bg-deck p-5 sm:p-7">
        <span aria-hidden className="absolute inset-x-0 top-0 h-2" style={{ background: surfaceColor(e.surface) }} />
        <p className="text-mute">{tour === "men" ? "ATP" : "WTA"} {year}, {e.level}</p>
        <h1 className="font-display text-5xl font-black leading-[.95] sm:text-6xl">{e.name}</h1>
        <p className="mt-2 text-mute">{fmtDay(e.start)} to {fmtDay(e.end)}, {e.surface}{e.indoor ? " (indoor)" : ""}{e.location ? `, ${e.location}` : ""}{e.purse ? `, ${e.purse}` : ""}</p>
        <div className="mt-5 flex flex-wrap gap-6">
          {e.winner ? (
            <div><span className="block text-sm text-mute">Champion</span><Link href={`/player/?id=${e.winner.id}`} className="link font-display text-3xl font-black text-bulb">{e.winner.name}</Link>
              {e.runnerUp && <span className="block text-sm text-mute">beat {e.runnerUp.name}{e.final ? `, ${e.final}` : ""}</span>}</div>
          ) : <div><span className="block text-sm text-mute">Champion</span><b className="font-display text-3xl">{e.status === "pre_game" ? "Not started" : "To be decided"}</b></div>}
          {e.previous && <div><span className="block text-sm text-mute">Previous champion</span><Link href={`/player/?id=${e.previous.id}`} className="link font-display text-2xl font-extrabold">{e.previous.name}</Link></div>}
        </div>
      </header>

      {upcoming.length > 0 && (
        <section className="deck p-4 sm:p-6" aria-labelledby="oop-h">
          <h2 id="oop-h" className="h-section font-display mb-2">Order of play</h2>
          <p className="mb-3 text-xs text-dim">Times in your time zone.</p>
          {days.map(d => (
            <div key={d} className="mb-4">
              <h3 className="font-display text-lg font-extrabold">{d}</h3>
              <ul className="divide-y divide-line">{upcoming.filter(m => localDay(m.date) === d).map(m => <MatchRow key={m.id} m={m} />)}</ul>
            </div>
          ))}
        </section>
      )}

      <section className="deck p-4 sm:p-6" aria-labelledby="res-h">
        <h2 id="res-h" className="h-section font-display mb-3">Results</h2>
        {err ? <p className="text-mute">{err}. Try again in a minute.</p> : !matches ? <Loading label="Loading results" /> : rounds.length === 0 ? <p className="text-mute">No matches played yet.</p> : (
          <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
            {rounds.map(r => (
              <div key={r}>
                <h3 className="font-display text-lg font-extrabold">{r}</h3>
                <ul className="divide-y divide-line">{matches.filter(m => m.round === r && (m.status !== "pre_game" || m.winner)).map(m => <MatchRow key={m.id} m={m} />)}</ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="deck p-4 sm:p-6" aria-labelledby="past-h">
          <h2 id="past-h" className="h-section font-display mb-3">Past champions</h2>
          <ul className="flex flex-col divide-y divide-line">
            {past.map(p => (
              <li key={p.year} className="flex items-baseline gap-4 py-2">
                <span className="w-12 font-display text-lg font-extrabold tnum">{p.year}</span>
                <Link className="link font-semibold" href={`/player/?id=${p.e.winner!.id}`}>{p.e.winner!.name}</Link>
                <Link className="ml-auto text-sm text-mute hover:text-ink" href={`/tournament/?t=${p.e.id}&y=${p.year}`}>Full results</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
