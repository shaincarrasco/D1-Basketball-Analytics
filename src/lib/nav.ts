// One map of the site: five hubs, each with its sections. The desktop menu panels, the
// section bar under the header, the phone tab bar and the command search all read this,
// so a new page is added in one place.
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight, BadgeDollarSign, GitCompare, GraduationCap, TrendingUp, Receipt, BarChart3, BookOpen, CalendarDays, HeartPulse, History, Layers, LayoutGrid,
  LineChart, Newspaper, PenTool, ScatterChart, ShieldAlert, Sparkles, Swords, Trophy, Users, UsersRound,
} from "lucide-react";

export type Section = { href: string; label: string; desc: string; icon: LucideIcon };
export type HubKey = "today" | "games" | "teams" | "players" | "tools";
export type Quick = { href: string; label: string };
export type Hub = { key: HubKey; label: string; href: string; icon: LucideIcon; blurb: string; sections: Section[]; quickLabel?: string; quick?: Quick[] };

export const HUBS: Hub[] = [
  { key: "today", label: "Today", href: "/", icon: LayoutGrid, blurb: "Today's games and your teams", sections: [] },
  {
    key: "games", label: "Games", href: "/games/", icon: CalendarDays, blurb: "Scores, the bracket and who's out",
    quickLabel: "Jump to",
    quick: [{ href: "/bracket/?tab=bubble", label: "Bubble watch" }, { href: "/bracket/?tab=seeds", label: "Seed list" }, { href: "/injuries/", label: "Biggest absences" }, { href: "/games/", label: "Today's games" }],
    sections: [
      { href: "/games/", label: "Scoreboard", desc: "Every D-I game by day, live scores and pregame odds", icon: CalendarDays },
      { href: "/bracket/", label: "Bracket", desc: "Our projected 76-team field and the bubble", icon: Trophy },
      { href: "/injuries/", label: "Injury report", desc: "Who's out, how sure we are and what it costs", icon: HeartPulse },
      { href: "/news/", label: "News", desc: "Previews, recaps and headlines by team", icon: Newspaper },
    ],
  },
  {
    key: "teams", label: "Teams", href: "/rankings/", icon: BarChart3, blurb: "Ratings, form and program history",
    quickLabel: "Conferences",
    quick: [{ href: "/conferences/acc/", label: "ACC" }, { href: "/conferences/big-ten/", label: "Big Ten" }, { href: "/conferences/big-12/", label: "Big 12" }, { href: "/conferences/sec/", label: "SEC" }, { href: "/conferences/big-east/", label: "Big East" }, { href: "/rankings/?view=form", label: "Form and movers" }],
    sections: [
      { href: "/rankings/", label: "Rankings", desc: "All 365 teams by DHR, with form and résumé views", icon: BarChart3 },
      { href: "/conferences/", label: "Conferences", desc: "Standings, title odds and league strength", icon: Layers },
      { href: "/history/", label: "Past seasons", desc: "Ten years of final ratings and champions", icon: History },
      { href: "/transfers/", label: "Transfer portal", desc: "Who left, who arrived and what it's worth", icon: ArrowLeftRight },
    ],
  },
  {
    key: "players", label: "Players", href: "/players/", icon: Users, blurb: "Leaders, projections and who matters most",
    quickLabel: "Rank players as a",
    quick: [{ href: "/players/rankings/?fw=scorer", label: "Scorer" }, { href: "/players/rankings/?fw=shooter", label: "Shooter" }, { href: "/players/rankings/?fw=playmaker", label: "Playmaker" }, { href: "/players/rankings/?fw=defender", label: "Defender" }, { href: "/players/rankings/?fw=rim", label: "Rim protector" }],
    sections: [
      { href: "/players/", label: "Leaderboards", desc: "Every D-I player, sortable by any stat", icon: Users },
      { href: "/players/rankings/", label: "Rankings", desc: "Ten ways to rank players, or set your own weights", icon: Sparkles },
      { href: "/players/projections/", label: "Skill projections", desc: "Projected shooting, passing and defense with grades", icon: LineChart },
      { href: "/players/risers/", label: "Risers", desc: "Biggest DPR moves over the last 30 days", icon: TrendingUp },
      { href: "/players/indispensable/", label: "Most indispensable", desc: "How far each team would fall without him", icon: ShieldAlert },
      { href: "/players/nil/", label: "NIL value", desc: "Our estimated market value for every player, with reported figures", icon: BadgeDollarSign },
      { href: "/players/prospects/", label: "Prospects", desc: "High-school classes, commitments and team classes", icon: GraduationCap },
      { href: "/players/compare/", label: "Compare", desc: "Any two players head to head, stat by stat", icon: GitCompare },
      { href: "/charts/", label: "Charts", desc: "Who stands out, in 21 curated charts", icon: ScatterChart },
    ],
  },
  {
    key: "tools", label: "Tools", href: "/matchup/", icon: Swords, blurb: "Simulate games and build lineups",
    quickLabel: "Try",
    quick: [{ href: "/matchup/?a=duke&b=illinois&site=n", label: "Duke vs Illinois, neutral" }, { href: "/charts/build/", label: "A scatter of any two stats" }, { href: "/methodology/#dpr", label: "How DPR works" }],
    sections: [
      { href: "/matchup/", label: "Matchup simulator", desc: "Any two teams, any site, with injuries", icon: Swords },
      { href: "/lineups/", label: "Lineup lab", desc: "Put any five players on the floor and grade the fit", icon: UsersRound },
      { href: "/charts/build/", label: "Make a chart", desc: "Build, share and download your own chart", icon: PenTool },
      { href: "/receipts/", label: "Receipts", desc: "Our track record, game by game, graded after the buzzer", icon: Receipt },
      { href: "/methodology/", label: "How it works", desc: "Every rating and projection, explained", icon: BookOpen },
    ],
  },
];

const norm = (p: string) => (p.endsWith("/") ? p : `${p}/`);

/** The section a path belongs to: exact match first, then the longest prefix. */
export function sectionFor(path: string): { hub: Hub; section: Section } | null {
  const p = norm(path);
  let best: { hub: Hub; section: Section } | null = null;
  for (const hub of HUBS) for (const section of hub.sections) {
    if (p === section.href) return { hub, section };
    if (section.href !== "/" && p.startsWith(section.href) && (!best || section.href.length > best.section.href.length)) best = { hub, section };
  }
  return best;
}

/** The hub a path belongs to, including detail pages (a team page is in Teams). */
export function hubFor(path: string): Hub | null {
  const p = norm(path);
  if (p === "/") return HUBS[0];
  if (p.startsWith("/teams/")) return HUBS.find(h => h.key === "teams")!;
  if (p.startsWith("/player/")) return HUBS.find(h => h.key === "players")!;
  return sectionFor(p)?.hub ?? null;
}
