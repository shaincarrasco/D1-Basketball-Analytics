"use client";
// Gridiron: brand, nav and the sport pack wiring. This file plus the pack is what makes the
// site football; everything else comes from @sports/ui and @sports/kit.
import { BarChart3, CalendarDays, LayoutGrid, ListOrdered, ScatterChart, Shield, SlidersHorizontal } from "lucide-react";
import { withEntity } from "@sports/kit";
import FrameworkRanks from "@sports/kit/ui/framework-ranks";
import type { FootballRow } from "@sports/packs/football/types";
import SiteShell, { type ShellConfig } from "@sports/ui/site-shell";
import ThemePicker from "@sports/ui/theme-picker";
import Builder from "@sports/kit/ui/builder";
import Gallery from "@sports/kit/ui/gallery";
import RankingsBoard from "@sports/kit/ui/rankings-board";
import { useSportData } from "@sports/kit/ui/data";
import { pack as footballPack } from "@sports/packs/football";

/** The shared football pack, plus Gridiron's player-page links. */
export const pack = withEntity(footballPack, { href: r => `/player/?id=${r.id}` });

export const routes = { builder: "/charts/build/", rankings: "/players/" };

const NAV: ShellConfig["nav"] = [
  { href: "/", label: "Scores", icon: LayoutGrid, match: ["/game/"] },
  { href: "/rankings/", label: "Rankings", icon: ListOrdered },
  { href: "/schedule/", label: "Schedule", icon: CalendarDays },
  { href: "/teams/", label: "Teams", icon: Shield, match: ["/team/"] },
  { href: "/players/", label: "Players", icon: BarChart3, match: ["/player/"] },
  { href: "/charts/", label: "Charts", icon: ScatterChart },
  { href: "/charts/build/", label: "Make a chart", icon: SlidersHorizontal, more: true },
];
const CONFIG: ShellConfig = {
  brand: {
    name: "Gridiron",
    // a football: pylon-orange oval with laces
    mark: <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden><ellipse cx="12" cy="12" rx="11" ry="7" transform="rotate(-35 12 12)" fill="var(--bulb)" /><path d="M8.6 15.4l6.8-6.8M10 11.8l1.3 1.3M11.4 10.4l1.3 1.3M12.8 9l1.3 1.3" stroke="var(--bg)" strokeWidth="1.3" strokeLinecap="round" /></svg>,
  },
  nav: NAV,
  mobile: ["/", "/rankings/", "/schedule/", "/teams/", "/players/"].map(h => NAV.find(n => n.href === h)!),
  footer: <>Scores, box scores and play-by-play from ESPN. Target depth, direction and air yards are read from ESPN&apos;s play-by-play descriptions.</>,
};

export function Shell({ children, updated }: { children: React.ReactNode; updated?: string }) {
  return <SiteShell config={CONFIG} updated={updated} picker={<ThemePicker />}>{children}</SiteShell>;
}
export function SiteGallery() { return <Gallery pack={pack} data={useSportData(pack)} routes={routes} />; }
export function SiteBuilder() { return <Builder pack={pack} data={useSportData(pack)} />; }
export function SiteRankings() { return <RankingsBoard pack={pack} data={useSportData(pack)} routes={routes} />; }
export function SiteFrameworkRanks({ p, all }: { p: FootballRow; all: FootballRow[] }) { return <FrameworkRanks pack={pack} p={p} all={all} routes={routes} />; }
export { useSportData };
