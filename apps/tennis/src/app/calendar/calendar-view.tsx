"use client";
// Season calendar: every event by month, with live and upcoming events called out and
// champions for finished ones. Past seasons back to 2023.
import Link from "next/link";
import { useMemo, useState } from "react";
import { useJson } from "@sports/ui/client-data";
import { ErrorState, Loading } from "@sports/ui/states";
import { surfaceColor } from "@/lib/season";
import { fmtDay, isLive, isUpcoming, type CalEvent, type Calendar } from "@/lib/calendar";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BIG = /grand slam|1000|finals/i;

function Row({ e, tour, year }: { e: CalEvent; tour: string; year: number }) {
  const live = isLive(e), next = isUpcoming(e);
  return (
    <li>
      <Link href={`/tournament/?t=${e.id}&y=${year}`} className={`deck press relative flex items-center gap-3 overflow-hidden py-3 pl-5 pr-4 ${live ? "border-bulb/70" : ""}`}>
        <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: surfaceColor(e.surface) }} />
        <span className="w-24 shrink-0 text-[13px] tnum text-mute">{fmtDay(e.start)}{e.end && e.end !== e.start ? <><br />to {fmtDay(e.end)}</> : null}</span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-display ${BIG.test(e.level) ? "text-xl font-black" : "text-lg font-extrabold"}`}>{e.name}</span>
          <span className="block truncate text-[12.5px] text-mute">{[e.level, `${e.surface}${e.indoor ? " (indoor)" : ""}`, e.location].filter(Boolean).join(", ")}</span>
        </span>
        <span className="shrink-0 text-right text-[13px]">
          {live ? <b className="text-bulb">Live now</b> : next ? <b className="text-ink">Up next</b>
            : e.winner ? <><span className="block text-dim">Champion</span><b className="text-ink">{e.winner.name}</b></> : <span className="text-dim">—</span>}
        </span>
      </Link>
    </li>
  );
}

export default function CalendarView() {
  const q = useJson<Calendar>("calendar.json");
  const [tour, setTour] = useState<"men" | "women">("men");
  const [year, setYear] = useState<number | null>(null);
  const seasons = q.data?.tours[tour] ?? [];
  const season = seasons.find(s => s.year === year) ?? seasons[0];
  const months = useMemo(() => {
    const m = new Map<number, CalEvent[]>();
    for (const e of season?.events ?? []) { const k = e.start ? new Date(e.start + "T12:00:00").getMonth() : 0; (m.get(k) ?? m.set(k, []).get(k)!).push(e); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [season]);
  if (q.error) return <ErrorState message={q.error} retry={q.retry} />;
  if (!q.data || !season) return <Loading label="Loading the calendar" />;
  const now = season.events.filter(e => isLive(e) || isUpcoming(e));
  return (
    <section aria-label="Season calendar">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Tour">{(["men", "women"] as const).map(t => <button key={t} aria-pressed={tour === t} onClick={() => setTour(t)}>{t === "men" ? "Men (ATP)" : "Women (WTA)"}</button>)}</div>
        <div className="seg" role="group" aria-label="Season">{seasons.map(s => <button key={s.year} aria-pressed={season.year === s.year} onClick={() => setYear(s.year)}>{s.year}</button>)}</div>
        <Link href="/schedule/" className="btn btn-primary ml-auto">Today&apos;s order of play</Link>
      </div>
      {now.length > 0 && season === seasons[0] && (
        <div className="mb-8">
          <h2 className="h-section font-display mb-2">Happening now</h2>
          <ul className="grid gap-2 lg:grid-cols-2">{now.map(e => <Row key={e.id} e={e} tour={tour} year={season.year} />)}</ul>
        </div>
      )}
      <div className="flex flex-col gap-8">
        {months.map(([mi, evs]) => (
          <div key={mi}>
            <h2 className="h-section font-display mb-2">{MONTHS[mi]}</h2>
            <ul className="grid gap-2 lg:grid-cols-2">{evs.map(e => <Row key={e.id} e={e} tour={tour} year={season.year} />)}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}
