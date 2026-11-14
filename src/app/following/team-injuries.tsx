"use client";
// "Your teams' injuries": absences for followed teams and players, plus recent wire events with a "new" marker.
import Link from "next/link";
import { useMemo } from "react";
import { AvailabilityRow } from "@/components/availability-list";
import InjuryPill from "@/components/injury-pill";
import { EVENT_LABEL, timeAgo } from "@/lib/injuries";
import { useInjuries, useLastSeen } from "@/lib/injury-hooks";
import type { InjuryRow } from "@/lib/types";

export default function TeamInjuries({ teamSlugs, playerIds }: { teamSlugs: string[]; playerIds: string[] }) {
  const inj = useInjuries();
  const seen = useLastSeen();
  const teams = useMemo(() => new Set(teamSlugs), [teamSlugs]);
  const players = useMemo(() => new Set(playerIds), [playerIds]);
  const groups = useMemo(() => {
    const m = new Map<string, { team: string; rows: InjuryRow[] }>();
    for (const r of inj.data?.rows ?? []) {
      if (!teams.has(r.slug) && !(r.pid && players.has(r.pid))) continue;
      (m.get(r.slug) ?? m.set(r.slug, { team: r.team, rows: [] }).get(r.slug)!).rows.push(r);
    }
    return [...m.entries()];
  }, [inj.data, teams, players]);
  const wire = useMemo(() => (inj.data?.wire ?? []).filter(w => teams.has(w.slug) || (w.pid && players.has(w.pid))).slice(0, 8), [inj.data, teams, players]);
  const isNew = (t: string) => !!seen && Date.parse(t) > Date.parse(seen);

  return (
    <section aria-labelledby="inj-h">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="inj-h" className="h-section">Your teams&apos; injuries</h2>
        <Link href="/injuries/" className="text-sm font-semibold text-mute hover:text-ink">League-wide injuries →</Link>
      </div>
      {!teamSlugs.length && !playerIds.length ? (
        <p className="deck-flat px-4 py-3 text-sm text-mute">Follow a team or player to see who is hurt, and when they are expected back, right here.</p>
      ) : inj.status === "error" ? (
        <p className="deck-flat px-4 py-3 text-sm text-mute">Could not load injuries. Try again in a moment.</p>
      ) : !inj.data ? (
        <p className="text-sm text-mute" aria-live="polite">Loading injuries…</p>
      ) : (
        <div className="space-y-4">
          {groups.length === 0 ? (
            <p className="deck-flat px-4 py-3 text-sm text-mute">No absences flagged for anyone you follow. We check ESPN&apos;s injury list, box scores and injury headlines every hour.</p>
          ) : groups.map(([slug, g]) => (
            <div key={slug} className="deck p-5">
              <h3 className="mb-1 font-display text-[20px] font-extrabold"><Link href={`/teams/${slug}/`} className="link">{g.team}</Link></h3>
              <ul className="divide-y divide-line">
                {g.rows.map(a => <li key={a.key} className="py-3 last:pb-0"><AvailabilityRow a={a} slug={slug} /></li>)}
              </ul>
            </div>
          ))}
          {wire.length > 0 && (
            <div className="deck-flat p-4">
              <h3 className="mb-2 text-sm font-semibold">Recent changes</h3>
              <ul className="space-y-2">
                {wire.map((w, i) => (
                  <li key={w.key + w.t + i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                    {isNew(w.t) && <span className="rounded-full bg-hot/15 px-2 py-px text-[11px] font-bold text-hot">New since your last visit</span>}
                    {w.state && <InjuryPill state={w.state} label={w.status || EVENT_LABEL[w.kind]} size="sm" />}
                    <b className="font-semibold">{w.pid ? <Link href={`/player/?id=${w.pid}`} className="link">{w.name}</Link> : w.name}</b>
                    <span className="text-mute">{w.team} · {EVENT_LABEL[w.kind]}{w.body ? `, ${w.body}` : ""}</span>
                    <span className="text-dim">{timeAgo(w.t)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
