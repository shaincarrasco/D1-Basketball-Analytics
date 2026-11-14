"use client";
// Season injury timeline for a team (all players) or one player: past stints and recent events.
import Link from "next/link";
import type { InjuryLogEntry } from "@/lib/types";
import InjuryPill from "./injury-pill";
import { EVENT_LABEL, STATE_SHORT, shortDate } from "@/lib/injuries";

export default function InjuryHistory({ log, showNames = true, slug }: { log: InjuryLogEntry[] | null | undefined; showNames?: boolean; slug?: string }) {
  if (!log?.length) return <p className="text-sm text-mute">No injury history this season.</p>;
  return (
    <ul className="space-y-4">
      {log.map(e => {
        const href = e.pid ? `/player/?id=${e.pid}` : slug ? `/teams/${slug}/` : null;
        const events = [...e.events].sort((a, b) => b.t.localeCompare(a.t)).slice(0, 6);
        return (
          <li key={e.key}>
            {showNames && <p className="mb-1.5 font-display text-[17px] font-extrabold">{href ? <Link href={href} className="link">{e.name}</Link> : e.name}{e.open && <span className="ml-2 text-xs font-semibold text-loss">currently out</span>}</p>}
            {e.stints.length > 0 && (
              <ol className="space-y-1.5 border-l border-line2 pl-3.5">
                {[...e.stints].reverse().map((s, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                    <span className="tnum text-ink">{shortDate(s.from)} → {s.to ? shortDate(s.to) : "present"}</span>
                    <InjuryPill state={s.state} label={STATE_SHORT[s.state]} size="sm" />
                    {s.body && <span className="text-mute">{s.body}</span>}
                    <span className="text-dim tnum">{s.missed} {s.missed === 1 ? "game" : "games"} missed</span>
                  </li>
                ))}
              </ol>
            )}
            {events.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-mute">
                {events.map((ev, i) => (
                  <li key={i}>
                    <span className="tnum text-dim">{shortDate(ev.t)}</span> <b className="font-semibold text-ink">{EVENT_LABEL[ev.kind]}</b>{ev.status ? `: ${ev.status}` : ""}{ev.body ? `, ${ev.body}` : ""}
                    {ev.url && <> <a href={ev.url} target="_blank" rel="noopener noreferrer" className="underline decoration-line2 underline-offset-2 hover:text-ink">source</a></>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
