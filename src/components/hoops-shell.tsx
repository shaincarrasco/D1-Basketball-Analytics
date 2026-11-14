"use client";
// D1 Hoops wiring for the shared site shell: brand, nav, footer, search, account and
// followed-team accent colours. Everything visual comes from @sports/ui.
import Link from "next/link";
import { useMemo } from "react";
import { BarChart3, BookOpen, CalendarDays, Layers, LayoutGrid, Newspaper, ScatterChart, Star, Swords, Users } from "lucide-react";
import SiteShell, { type ShellConfig } from "@sports/ui/site-shell";
import ThemePicker, { type AccentSwatch } from "@sports/ui/theme-picker";
import { useJson } from "@sports/ui/client-data";
import { useFavorites } from "@/lib/favorites";
import type { TeamSummary } from "@/lib/types";
import AccountButton from "./account-button";
import CommandSearch from "./command-search";

const NAV: ShellConfig["nav"] = [
  { href: "/", label: "Today", icon: LayoutGrid },
  { href: "/rankings/", label: "Rankings", icon: BarChart3, match: ["/teams"] },
  { href: "/games/", label: "Games", icon: CalendarDays },
  { href: "/news/", label: "News", icon: Newspaper },
  { href: "/players/", label: "Players", icon: Users, match: ["/player/"] },
  { href: "/charts/", label: "Charts", icon: ScatterChart },
  { href: "/matchup/", label: "Matchup", icon: Swords },
  { href: "/conferences/", label: "Conferences", icon: Layers },
  { href: "/methodology/", label: "Method", icon: BookOpen },
  { href: "/following/", label: "Following", icon: Star, compact: true, title: "Teams and players you follow" },
];

const CONFIG: ShellConfig = {
  brand: {
    name: "D1 Hoops",
    mark: <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden><circle cx="12" cy="12" r="11" fill="var(--bulb)" /><path d="M1 12h22M12 1v22M4.2 4.4c3.2 2.6 3.2 12.6 0 15.2M19.8 4.4c-3.2 2.6-3.2 12.6 0 15.2" fill="none" stroke="var(--bg)" strokeWidth="1.3" /></svg>,
  },
  nav: NAV,
  // Phone tab bar, Apple Sports style: the five things people open most.
  mobile: [NAV[0], NAV[1], NAV[2], { ...NAV[9], label: "My teams" }, NAV[4]],
  footer: <>Box scores and schedules from College Basketball Data. Ratings and projections are D1 Hoops originals — see <Link className="underline hover:text-ink" href="/methodology/">methodology</Link>.</>,
};

/** Followed teams' colours as accent swatches (teams.json loads only once the picker opens). */
function useTeamSwatches(open: boolean): AccentSwatch[] {
  const fav = useFavorites();
  const teams = useJson<TeamSummary[]>(open && fav.teams.length ? "teams.json" : null);
  return useMemo(() => {
    const bySlug = new Map((teams.data ?? []).map(t => [t.slug, t]));
    return fav.teams.map(s => bySlug.get(s)).filter((t): t is TeamSummary => !!t?.color).map(t => ({ key: t.slug, label: t.name, color: t.color! }));
  }, [teams.data, fav.teams]);
}

export default function HoopsShell({ children, updated }: { children: React.ReactNode; updated: string }) {
  return (
    <SiteShell config={CONFIG} updated={updated} picker={<ThemePicker useSwatches={useTeamSwatches} />} account={<AccountButton />} search={close => <CommandSearch onClose={close} />}>
      {children}
    </SiteShell>
  );
}
