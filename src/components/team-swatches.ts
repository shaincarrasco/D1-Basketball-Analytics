"use client";
// Followed teams' colours as accent swatches for the shared colour picker
// (teams.json loads only once the picker opens).
import { useMemo } from "react";
import type { AccentSwatch } from "@sports/ui/theme-picker";
import { useJson } from "@sports/ui/client-data";
import { useFavorites } from "@/lib/favorites";
import type { TeamSummary } from "@/lib/types";

/** Followed teams' colours as accent swatches (teams.json loads only once the picker opens). */
export function useTeamSwatches(open: boolean): AccentSwatch[] {
  const fav = useFavorites();
  const teams = useJson<TeamSummary[]>(open && fav.teams.length ? "teams.json" : null);
  return useMemo(() => {
    const bySlug = new Map((teams.data ?? []).map(t => [t.slug, t]));
    return fav.teams.map(s => bySlug.get(s)).filter((t): t is TeamSummary => !!t?.color).map(t => ({ key: t.slug, label: t.name, color: t.color! }));
  }, [teams.data, fav.teams]);
}
