"use client";
// Home: "Your teams" strip, shown only when this device follows at least one team.
import Link from "next/link";
import { useMemo } from "react";
import { useJson } from "@/lib/client-data";
import { useFavorites } from "@/lib/favorites";
import type { TeamSummary } from "@/lib/types";
import { TeamChip } from "./team-cards";

export default function YourTeamsStrip() {
  const fav = useFavorites();
  const teams = useJson<TeamSummary[]>(fav.teams.length ? "teams.json" : null);
  const list = useMemo(() => {
    const bySlug = new Map((teams.data ?? []).map(t => [t.slug, t]));
    return fav.teams.map(s => bySlug.get(s)).filter((t): t is TeamSummary => !!t);
  }, [teams.data, fav.teams]);
  if (!fav.teams.length || !list.length) return null;
  return (
    <section aria-labelledby="your-teams">
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <h2 id="your-teams" className="h-section">Your teams</h2>
        <Link href="/following/" className="text-sm font-semibold text-mute hover:text-ink">Following</Link>
      </div>
      <ul className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
        {list.map(t => <li key={t.id}><TeamChip t={t} /></li>)}
      </ul>
    </section>
  );
}
