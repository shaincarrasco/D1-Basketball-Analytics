"use client";
// Baseline: brand, nav and the sport pack wiring. This file plus the pack is what makes the
// site tennis; everything else comes from @sports/ui and @sports/kit.
import { BarChart3, LayoutGrid, ListOrdered, ScatterChart, SlidersHorizontal } from "lucide-react";
import SiteShell, { type ShellConfig } from "@sports/ui/site-shell";
import ThemePicker from "@sports/ui/theme-picker";
import Builder from "@sports/kit/ui/builder";
import Gallery from "@sports/kit/ui/gallery";
import RankingsBoard from "@sports/kit/ui/rankings-board";
import { useSportData } from "@sports/kit/ui/data";
import { withEntity } from "@sports/kit";
import FrameworkRanks from "@sports/kit/ui/framework-ranks";
import { pack as tennisPack } from "@sports/packs/tennis";
import type { TennisRow } from "@sports/packs/tennis/types";

/** The shared tennis pack, plus Baseline's player-page links. */
export const pack = withEntity(tennisPack, { href: r => `/player/?id=${r.id}` });

export const routes = { builder: "/charts/build/", rankings: "/players/" };

const NAV: ShellConfig["nav"] = [
  { href: "/", label: "Today", icon: LayoutGrid },
  { href: "/rankings/", label: "Rankings", icon: ListOrdered },
  { href: "/players/", label: "Players", icon: BarChart3, match: ["/player/"] },
  { href: "/charts/", label: "Charts", icon: ScatterChart },
  { href: "/charts/build/", label: "Make a chart", icon: SlidersHorizontal },
];
const CONFIG: ShellConfig = {
  brand: { name: "Baseline", mark: <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden><circle cx="12" cy="12" r="11" fill="var(--bulb)" /><path d="M4.5 4.8c4 3.6 4 10.8 0 14.4M19.5 4.8c-4 3.6-4 10.8 0 14.4" fill="none" stroke="var(--bg)" strokeWidth="1.4" /></svg> },
  nav: NAV,
  mobile: NAV.slice(0, 4),
  footer: <>Scores from ESPN; rankings and match stats from theScore. Season stats are estimated from per-match serve and return percentages.</>,
};

export function Shell({ children, updated }: { children: React.ReactNode; updated?: string }) {
  return <SiteShell config={CONFIG} updated={updated} picker={<ThemePicker />}>{children}</SiteShell>;
}
export function SiteGallery() { return <Gallery pack={pack} data={useSportData(pack)} routes={routes} />; }
export function SiteBuilder() { return <Builder pack={pack} data={useSportData(pack)} />; }
export function SiteRankings() { return <RankingsBoard pack={pack} data={useSportData(pack)} routes={routes} />; }
export function SiteFrameworkRanks({ p, all }: { p: TennisRow; all: TennisRow[] }) { return <FrameworkRanks pack={pack} p={p} all={all} routes={routes} />; }
export { useSportData };
