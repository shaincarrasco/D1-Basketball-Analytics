"use client";
// Every main-tour event this season, newest first, with surface, champion and final score.
import Link from "next/link";
import { useMemo, useState } from "react";
import { useJson } from "@sports/ui/client-data";
import { ErrorState, Loading } from "@sports/ui/states";
import { SURFACES, surfaceColor } from "@/lib/season";

type Ev = { id: string; tour: "men" | "women"; name: string; level: string; surface: string; start: string; end: string; matches: number; final: { winner: { id: string; name: string }; runnerUp: { id: string; name: string }; score: string } | null };
const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function List() {
  const q = useJson<{ events: Ev[] }>("events.json");
  const [tour, setTour] = useState<"men" | "women">("men");
  const [surface, setSurface] = useState("all");
  const list = useMemo(() => (q.data?.events ?? []).filter(e => e.tour === tour && (surface === "all" || e.surface === surface)), [q.data, tour, surface]);
  if (q.error) return <ErrorState message={q.error} retry={q.retry} />;
  if (!q.data) return <Loading label="Loading tournaments" />;
  return (
    <section aria-label="Tournaments">
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="seg" role="group" aria-label="Tour">{(["men", "women"] as const).map(t => <button key={t} aria-pressed={tour === t} onClick={() => setTour(t)}>{t === "men" ? "Men (ATP)" : "Women (WTA)"}</button>)}</div>
        <div className="seg" role="group" aria-label="Surface">{["all", ...SURFACES].map(s => <button key={s} aria-pressed={surface === s} onClick={() => setSurface(s)}>{s === "all" ? "All surfaces" : s[0].toUpperCase() + s.slice(1)}</button>)}</div>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map(e => (
          <li key={e.id} className="deck relative overflow-hidden p-4 pl-5">
            <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: surfaceColor(e.surface) }} />
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display truncate text-xl font-extrabold">{e.name}</h2>
              <span className="shrink-0 text-xs text-dim">{fmt(e.start)}{e.end !== e.start ? `–${fmt(e.end)}` : ""}</span>
            </div>
            <p className="text-[13px] text-mute">{e.level}, {e.surface}</p>
            {e.final ? (
              <p className="mt-2 text-[14px]">
                <span className="text-bulb">●</span> <Link className="link font-semibold" href={`/player/?id=${e.final.winner.id}`}>{e.final.winner.name}</Link>
                <span className="text-mute"> beat </span><Link className="link" href={`/player/?id=${e.final.runnerUp.id}`}>{e.final.runnerUp.name}</Link>
                <span className="block font-display text-lg font-extrabold tnum">{e.final.score}</span>
              </p>
            ) : <p className="mt-2 text-[14px] text-mute">{Date.now() - new Date(e.end + "T12:00:00").getTime() > 3 * 864e5 ? "The final isn't in our data (walkover or no match stats)." : `In progress: ${e.matches} matches so far`}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
