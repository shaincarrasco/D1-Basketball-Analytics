"use client";
// Order of play across both tours: every scheduled and live singles match at current and
// upcoming events, by day, in the viewer's time zone.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useJson } from "@sports/ui/client-data";
import { ErrorState, Loading } from "@sports/ui/states";
import { surfaceColor } from "@/lib/season";
import type { CalEvent, Calendar } from "@/lib/calendar";
import { eventMatches, localDay, localTime, type TMatch } from "@/lib/thescore";

type Row = TMatch & { ev: CalEvent; tour: "men" | "women"; year: number };

export default function Schedule() {
  const cal = useJson<Calendar>("calendar.json");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const events = useMemo(() => {
    if (!cal.data) return [];
    const soon = Date.now() + 10 * 864e5;
    return (["men", "women"] as const).flatMap(tour => {
      const s = cal.data!.tours[tour][0];
      return s.events.filter(e => e.status === "in_progress" || (e.status === "pre_game" && e.start && new Date(e.start).getTime() < soon)).map(ev => ({ ev, tour, year: s.year }));
    });
  }, [cal.data]);
  useEffect(() => {
    if (!cal.data) return;
    let dead = false;
    Promise.all(events.map(({ ev, tour, year }) => eventMatches(tour, ev.sid).then(ms => ms.map(m => ({ ...m, ev, tour, year }))).catch(() => [] as Row[])))
      .then(all => { if (!dead) setRows(all.flat().filter(m => (m.status === "pre_game" || m.status === "in_progress") && m.winner === 0).sort((a, b) => Date.parse(a.date) - Date.parse(b.date))); });
    return () => { dead = true; };
  }, [cal.data, events]);
  const days = useMemo(() => [...new Set((rows ?? []).map(m => localDay(m.date)))], [rows]);
  if (cal.error) return <ErrorState message={cal.error} retry={cal.retry} />;
  if (!cal.data || !rows) return <Loading label="Loading the schedule" />;
  const active = day && days.includes(day) ? day : days[0];
  const list = rows.filter(m => localDay(m.date) === active);
  return (
    <section aria-label="Order of play">
      {days.length === 0 ? <p className="deck p-5 text-mute">No singles matches are scheduled in the next 10 days. See the <Link className="link" href="/calendar/">calendar</Link> for what&apos;s next.</p> : <>
        <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Day">
          {days.map(d => <button key={d} className="chip" aria-pressed={d === active} onClick={() => setDay(d)}>{d}</button>)}
        </div>
        <ul className="flex flex-col gap-2">
          {list.map(m => (
            <li key={`${m.tour}-${m.id}`} className="deck relative grid grid-cols-[4.5rem_1fr] items-center gap-x-4 overflow-hidden py-3 pl-5 pr-4 sm:grid-cols-[4.5rem_1fr_14rem]">
              <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: surfaceColor(m.ev.surface) }} />
              <span className="font-display text-xl font-extrabold tnum">{m.status === "in_progress" ? <span className="text-bad">LIVE</span> : localTime(m.date)}</span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{[m.a, m.b].map((s, i) => <span key={i}>{i ? <span className="text-dim"> vs </span> : null}{s.id && s.name !== "TBD" ? <Link className="link" href={`/player/?id=${s.id}`}>{s.name}</Link> : s.name}{s.seed ? <span className="text-dim"> ({s.seed})</span> : null}</span>)}</span>
                <span className="block truncate text-[12.5px] text-mute sm:hidden">{m.ev.name}, {m.round}</span>
              </span>
              <Link href={`/tournament/?t=${m.ev.id}&y=${m.year}`} className="hidden truncate text-right text-[13px] text-mute hover:text-ink sm:block">{m.ev.name}<span className="block text-dim">{m.round}</span></Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-dim">Times in your time zone. Schedules change with weather and late finishes.</p>
      </>}
    </section>
  );
}
