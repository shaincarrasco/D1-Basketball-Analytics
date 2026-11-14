"use client";
// Today: live and recent singles matches from both tours, grouped by tournament.
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePolledJson } from "@sports/ui/polling";
import { useJson } from "@sports/ui/client-data";
import { Loading } from "@sports/ui/states";
import type { TennisRow } from "@sports/packs/tennis/types";
import { nameKey, parseScoreboard, SCOREBOARDS, type LiveMatch, type Side } from "@/scores";

const ORDER = { in: 0, pre: 1, post: 2 } as const;

function SideRow({ s, link, live }: { s: Side; link: string | null; live: boolean }) {
  const name = link ? <Link href={link} className="link font-semibold">{s.name}</Link> : <span className="font-semibold">{s.name}</span>;
  return (
    <div className={`flex items-center gap-2 ${s.winner ? "text-ink" : live ? "text-ink" : "text-mute"}`}>
      {s.flag ? <img src={s.flag} alt={s.country ?? ""} className="h-3.5 w-5 rounded-[2px] object-cover" loading="lazy" /> : <span className="h-3.5 w-5" />}
      <span className="min-w-0 flex-1 truncate">{name}{s.winner && <span className="ml-1.5 text-bulb" aria-label="winner">●</span>}</span>
      <span className="flex gap-2 font-display text-[19px] font-extrabold tnum">
        {s.sets.map((x, i) => <span key={i} className={`w-5 text-center ${x.won ? "" : "opacity-50"}`}>{x.g}{x.tb !== undefined && <sup className="text-[10px] font-semibold">{x.tb}</sup>}</span>)}
      </span>
    </div>
  );
}

export default function Today() {
  const men = usePolledJson<unknown>(SCOREBOARDS.men, 30_000);
  const women = usePolledJson<unknown>(SCOREBOARDS.women, 30_000);
  const players = useJson<{ rows: TennisRow[] }>("players.json");
  const [tour, setTour] = useState<"all" | "men" | "women">("all");
  const ids = useMemo(() => new Map((players.data?.rows ?? []).map(r => [nameKey(r.name), r.id])), [players.data]);
  const matches = useMemo(() => [...parseScoreboard("men", men.data as never), ...parseScoreboard("women", women.data as never)]
    .filter(m => tour === "all" || m.tour === tour)
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || (a.state === "post" ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start))), [men.data, women.data, tour]);
  const groups = useMemo(() => {
    const m = new Map<string, LiveMatch[]>();
    for (const x of matches) (m.get(x.event) ?? m.set(x.event, []).get(x.event)!).push(x);
    return [...m.entries()];
  }, [matches]);
  if (!men.at && !women.at) return men.error && women.error ? <p className="deck p-5 text-mute">Scores aren&apos;t reachable right now. Try again in a minute.</p> : <Loading label="Loading scores" />;
  const live = matches.filter(m => m.state === "in").length;
  return (
    <section aria-label="Matches">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Tour">
          {(["all", "men", "women"] as const).map(t => <button key={t} aria-pressed={tour === t} onClick={() => setTour(t)}>{t === "all" ? "Both tours" : t === "men" ? "Men" : "Women"}</button>)}
        </div>
        <span className="text-sm text-mute">{live ? <><b className="text-ink">{live}</b> live now · </> : null}updates every 30 seconds</span>
      </div>
      {groups.length === 0 && <p className="deck p-5 text-mute">No main-tour singles matches on the scoreboard right now.</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map(([event, list]) => (
          <article key={event} className="deck p-4" aria-label={event}>
            <h2 className="font-display mb-3 text-xl font-extrabold uppercase">{event}</h2>
            <ul className="flex flex-col divide-y divide-line">
              {list.slice(0, 24).map(m => (
                <li key={m.id} className="py-2.5">
                  <div className="mb-1 flex justify-between text-[11.5px] font-semibold uppercase tracking-wide text-dim">
                    <span>{m.round}</span>
                    <span className={m.state === "in" ? "text-bad" : ""}>{m.state === "pre" ? new Date(m.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : m.detail}</span>
                  </div>
                  {m.sides.map((s, i) => { const id = ids.get(nameKey(s.name)); return <SideRow key={i} s={s} live={m.state === "in"} link={id ? `/player/?id=${id}` : null} />; })}
                </li>
              ))}
            </ul>
            {list.length > 24 && <p className="mt-2 text-xs text-dim">+{list.length - 24} more matches</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
