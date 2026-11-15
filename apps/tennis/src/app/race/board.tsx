"use client";
// Race to the year-end finals: this season's points, the qualification line, and how each
// player's points were earned. Calculated from main-tour results (see the note).
import Link from "next/link";
import { useState } from "react";
import { useJson } from "@sports/ui/client-data";
import { ErrorState, Loading } from "@sports/ui/states";
import { surfaceColor } from "@/lib/season";

type Res = { event: string; level: string; surface: string; result: string; pts: number };
type Row = { place: number; id: string; name: string; country: string; rank: number | null; points: number; events: number; titles: string[]; slamTitles: string[]; results: Res[]; qualified: boolean };
type Tour = { name: string; city: string; race: string; slots: number; slamRule: boolean; closed: string | null; rows: Row[] };
type Race = { updated: string; note: string; men: Tour; women: Tour };
const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });

export default function Board() {
  const q = useJson<Race>("race.json");
  const [tour, setTour] = useState<"men" | "women">("men");
  const [open, setOpen] = useState<string | null>(null);
  if (q.error) return <ErrorState message={q.error} retry={q.retry} />;
  if (!q.data) return <Loading label="Loading the race" />;
  const t = q.data[tour], top = t.rows[0]?.points || 1;
  const cutPts = t.rows[t.slots - 1]?.points ?? 0;
  const lastIn = Math.max(...t.rows.filter(r => r.qualified).map(r => r.place));
  return (
    <section aria-label={t.race}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Tour">
          {(["men", "women"] as const).map(k => <button key={k} aria-pressed={tour === k} onClick={() => { setTour(k); setOpen(null); }}>{q.data![k].race}</button>)}
        </div>
        <span className="text-sm text-mute">{t.closed ? <>Race closed {fmt(t.closed)}. These {t.slots} play the {t.name} in {t.city}.</> : `Top ${t.slots} qualify for the ${t.name} in ${t.city}.`}</span>
      </div>
      <ol className="flex flex-col gap-1.5">
        {t.rows.slice(0, 30).map(r => (
          <li key={r.id}>
            {r.place === lastIn + 1 && (
              <div className="my-3 flex items-center gap-3" role="separator" aria-label={`Qualification line for ${t.city}`}>
                <span className="h-[3px] flex-1 rounded bg-bulb" /><span className="font-display text-sm font-extrabold text-bulb">{t.city} line</span><span className="h-[3px] flex-1 rounded bg-bulb" />
              </div>
            )}
            <button className={`deck w-full p-3 text-left ${r.qualified ? "border-bulb/60" : ""}`} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
              <div className="flex items-center gap-3">
                <span className={`dots w-9 text-right text-2xl ${r.qualified ? "dots-glow" : "opacity-70"}`}>{r.place}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <Link href={`/player/?id=${r.id}`} className="link truncate font-display text-xl font-extrabold" onClick={e => e.stopPropagation()}>{r.name}</Link>
                    {r.qualified && <span className="rounded bg-bulb px-1.5 text-[11px] font-bold text-[rgb(var(--bg-rgb))]">{r.slamTitles.length && r.place > t.slots ? "In as Slam champion" : "Qualified"}</span>}
                  </span>
                  <span className="block truncate text-[12.5px] text-mute">{r.country}{r.titles.length ? `, ${r.titles.length} title${r.titles.length > 1 ? "s" : ""}` : ""}{r.rank ? `, world #${r.rank}` : ""}</span>
                  <span className="mt-1.5 flex h-2.5 overflow-hidden rounded bg-deck2" aria-hidden>
                    {r.results.map((x, i) => <span key={i} style={{ width: `${(x.pts / top) * 100}%`, background: surfaceColor(x.surface) }} className="border-r border-[rgb(var(--deck-rgb))]" />)}
                  </span>
                </span>
                <span className="text-right">
                  <b className="font-display block text-2xl font-extrabold tnum">{r.points.toLocaleString("en-US")}</b>
                  <span className="text-[11.5px] text-dim">{r.place > t.slots ? `${(cutPts - r.points).toLocaleString("en-US")} behind #${t.slots}` : `${r.events} events`}</span>
                </span>
              </div>
              {open === r.id && (
                <ul className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  {r.results.map((x, i) => (
                    <li key={i} className="rounded-md border-l-4 bg-deck2 px-2 py-1 text-[12.5px]" style={{ borderColor: surfaceColor(x.surface) }}>
                      <b className="tnum">{x.pts}</b> <span className="text-mute">{x.event}, {x.result === "W" ? "title" : x.result}</span>
                    </li>
                  ))}
                </ul>
              )}
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-dim">
        Calculated by Baseline: each main-draw result times the official points for that round, best {18} results. Challenger/WTA 125/ITF events, qualifying and team events aren&apos;t in our data, so totals can sit slightly below the official race.
        {t.slamRule ? ` A ${new Date().getFullYear()} Grand Slam champion ranked 8th–20th takes the last spot instead of #8.` : ""} Bars are coloured by surface.
      </p>
    </section>
  );
}
