// Pure helpers for the games hub: filters, sorts, day summaries, labels.
import { fmt, timeLabel } from "@/lib/format";
import type { Game, GameIndex, GameSide } from "@/lib/types";

export const FILTERS = [
  { id: "all", label: "All" },
  { id: "top100", label: "Top 100 matchups" },
  { id: "conf", label: "Conference" },
  { id: "close", label: "Close" },
  { id: "upsets", label: "Upsets" },
] as const;
export type FilterId = (typeof FILTERS)[number]["id"];

export const SORTS = [
  { id: "time", label: "Tip time" },
  { id: "watch", label: "Watchability" },
  { id: "close", label: "Closest projection" },
] as const;
export type SortId = (typeof SORTS)[number]["id"];

export const isFinal = (g: Game) => g.status === "final";
export const isLive = (g: Game) => g.status === "in_progress";
export const isTBA = (g: Game) => timeLabel(g.date) === "TBA";

export function matchesFilter(g: Game, f: FilterId): boolean {
  switch (f) {
    case "top100": return g.home.rank != null && g.away.rank != null && g.home.rank <= 100 && g.away.rank <= 100;
    case "conf": return g.confGame;
    case "close": return g.pred != null && Math.abs(g.pred.margin) <= 5;
    case "upsets": return isFinal(g) && g.upset != null;
    default: return true;
  }
}

const tipKey = (g: Game) => (isTBA(g) ? Number.MAX_SAFE_INTEGER : new Date(g.date).getTime());
export function sortGames(games: Game[], s: SortId): Game[] {
  const out = [...games];
  const byWatch = (a: Game, b: Game) => (b.watch ?? -1) - (a.watch ?? -1);
  if (s === "watch") out.sort((a, b) => byWatch(a, b) || tipKey(a) - tipKey(b));
  else if (s === "close") out.sort((a, b) => (a.pred ? Math.abs(a.pred.margin) : 999) - (b.pred ? Math.abs(b.pred.margin) : 999) || byWatch(a, b));
  else out.sort((a, b) => tipKey(a) - tipKey(b) || byWatch(a, b));
  return out;
}

export type Winner = "home" | "away" | null;
export function winner(g: Game): Winner {
  if (!isFinal(g) || g.home.score == null || g.away.score == null || g.home.score === g.away.score) return null;
  return g.home.score > g.away.score ? "home" : "away";
}
/** Did the pregame favourite (home when wp ≥ .5) win? null when not decidable. */
export function favoriteWon(g: Game): boolean | null {
  const w = winner(g);
  if (!w || !g.pred) return null;
  return (g.pred.wp >= 0.5 ? "home" : "away") === w;
}

/** "UCLA by 12.4" from the home-side margin. */
export function marginText(g: Game, digits = 1): string {
  if (!g.pred) return "No projection";
  const m = g.pred.margin;
  if (Math.abs(m) < 0.05) return "Pick'em";
  return `${(m > 0 ? g.home : g.away).name} by ${fmt(Math.abs(m), digits)}`;
}
export function actualMarginText(g: Game): string {
  const w = winner(g);
  if (!w) return "—";
  return `${g[w].name} by ${Math.abs((g.home.score ?? 0) - (g.away.score ?? 0))}`;
}

export const periodLabel = (i: number) => (i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "OT" : `${i - 1}OT`);
export function statusLabel(g: Game): string {
  if (isFinal(g)) {
    const n = Math.max(g.home.periods?.length ?? 0, g.away.periods?.length ?? 0);
    return n > 2 ? `Final · ${n === 3 ? "OT" : `${n - 2}OT`}` : "Final";
  }
  if (isLive(g)) return "Live";
  if (g.status !== "scheduled") return g.status.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
  return timeLabel(g.date);
}

export const teamHref = (s: GameSide) => (s.slug ? `/teams/${s.slug}/` : null);
export const matchupHref = (g: Game) =>
  g.home.slug && g.away.slug ? `/matchup/?a=${g.away.slug}&b=${g.home.slug}&site=${g.neutral ? "n" : "b"}` : null;

export type DaySummary = { games: number; finals: number; live: number; correct: number; graded: number; biggest: Game | null };
export function summarize(games: Game[]): DaySummary {
  let finals = 0, live = 0, correct = 0, graded = 0;
  let biggest: Game | null = null;
  for (const g of games) {
    if (isFinal(g)) finals++;
    if (isLive(g)) live++;
    const fw = favoriteWon(g);
    if (fw != null) { graded++; if (fw) correct++; }
    if (isFinal(g) && g.upset != null && (!biggest || g.upset < (biggest.upset ?? 1))) biggest = g;
  }
  return { games: games.length, finals, live, correct, graded, biggest };
}

/** Today if it has games, else the closest day with games (ties go forward). */
export function defaultDay(index: GameIndex, today: string): string | null {
  const days = index.days.filter(d => d.games > 0).map(d => d.day);
  if (!days.length) return null;
  if (days.includes(today)) return today;
  const t = Date.parse(`${today}T12:00:00Z`);
  let best = days[0], bestD = Infinity;
  for (const d of days) {
    const diff = Math.abs(Date.parse(`${d}T12:00:00Z`) - t);
    if (diff < bestD || (diff === bestD && d > best)) { best = d; bestD = diff; }
  }
  return best;
}

export const isDay = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
