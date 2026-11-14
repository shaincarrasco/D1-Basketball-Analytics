"use client";
// Home "Injury wire": the latest changes to who is available, as a swipeable strip of cards.
// Followed teams come first, then Top-50 teams and the changes that matter most (new / worse / back).
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import TeamLogo from "@/components/team-logo";
import InjuryPill from "@/components/injury-pill";
import { useJson } from "@/lib/client-data";
import { useFavorites } from "@/lib/favorites";
import { EVENT_LABEL, timeAgo } from "@/lib/injuries";
import { useInjuries } from "@/lib/injury-hooks";
import type { TeamSummary, WireEvent } from "@/lib/types";

const KIND_W: Partial<Record<WireEvent["kind"], number>> = { new: 3, worse: 3, returned: 3, better: 1, update: 1 };
const MAX = 6;

export default function InjuryWire() {
  const inj = useInjuries();
  const teams = useJson<TeamSummary[]>("teams.json");
  const fav = useFavorites();
  // Relative times only after mount so the static HTML and the client agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, []);

  const logo = useMemo(() => new Map((teams.data ?? []).map(t => [t.slug, t])), [teams.data]);
  const events = useMemo(() => {
    const list = (inj.data?.wire ?? []).filter(e => e.kind !== "cleared");
    const score = (e: WireEvent) => (fav.teams.includes(e.slug) ? 100 : 0) + (e.rank && e.rank <= 50 ? 10 : 0) + (KIND_W[e.kind] ?? 0);
    return [...list].sort((a, b) => score(b) - score(a) || Date.parse(b.t) - Date.parse(a.t)).slice(0, MAX);
  }, [inj.data, fav.teams]);

  if (inj.status === "error") return null; // optional module: stay quiet if the file is missing
  return (
    <section aria-labelledby="wire-h">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 id="wire-h" className="h-section">Injury wire</h2>
        <Link href="/injuries/" className="text-sm font-semibold text-bulb-ink">All injuries</Link>
      </div>
      {!inj.data ? (
        <div className="deck h-[96px] animate-pulse" />
      ) : events.length === 0 ? (
        <p className="deck p-4 text-sm text-mute">No availability changes yet. We check ESPN&apos;s injury list, box scores and injury headlines every hour.</p>
      ) : (
        <ul className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
          {events.map(e => {
            const t = logo.get(e.slug);
            const mine = fav.teams.includes(e.slug);
            const href = e.pid ? `/player/?id=${e.pid}` : `/teams/${e.slug}/`;
            return (
              <li key={e.key + e.t} className="relative w-[250px] shrink-0 snap-start">
                <div className={`deck-flat relative flex h-full flex-col gap-1.5 p-3 transition-colors hover:border-line2 focus-within:border-line2 ${mine ? "!border-[rgb(var(--bulb-rgb)/0.5)]" : ""}`}>
                  <div className="flex items-center gap-2 text-[12px] text-mute">
                    <TeamLogo src={t?.logo ?? null} name={e.team} size={22} />
                    <span className="truncate font-semibold">{t?.short ?? e.team}</span>
                    {mine && <span className="rounded bg-deck2 px-1 text-[10.5px] font-semibold text-bulb-ink">Following</span>}
                    <span className="ml-auto shrink-0 text-dim tnum">{now ? timeAgo(e.t, now) : ""}</span>
                  </div>
                  <Link href={href} className="link truncate font-display text-[19px] font-bold leading-tight after:absolute after:inset-0 after:content-['']">{e.name}</Link>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-mute">{EVENT_LABEL[e.kind]}</span>
                    {e.state ? <InjuryPill state={e.state} label={e.status} size="sm" /> : <span className="truncate text-[12px] text-mute">{e.status}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
