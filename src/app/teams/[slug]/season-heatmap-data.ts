// Adapted from Componentry's GitHub Calendar (MIT, Harsh Jadhav, https://componentry.dev).
// Pure data for the team season heatmap: lays a team's games on a Monday-first week grid
// (columns = weeks, rows = days) and works out the one-line season summary.
import type { TeamGame } from "@/lib/types";
import type { LiveFinal } from "@/lib/live-ratings";

export type CellKind = "none" | "win" | "loss" | "upcoming" | "live" | "off";
export type CalCell = {
  day: string; col: number; row: number; kind: CellKind;
  /** Margin step for finished games: 1 = 1–5, 2 = 6–12, 3 = 13+. 0 otherwise. */
  level: 0 | 1 | 2 | 3;
  game: TeamGame | null;
  /** Position in `SeasonCalendar.games` (chronological), or -1 for days without a game. */
  gi: number;
};
export type SeasonSummary = { w: number; l: number; closeW: number; closeL: number; longestWin: number };
export type SeasonCalendar = {
  weeks: CalCell[][];
  months: { col: number; label: string }[];
  /** Cells with a game, in date order (the keyboard walks this list). */
  games: CalCell[];
  /** Column of the latest finished (or live) game; the first column before the season starts. */
  recentCol: number;
  summary: SeasonSummary;
};

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** 0 = Monday … 6 = Sunday. */
export const weekdayMon = (day: string) => (new Date(toMs(day)).getUTCDay() + 6) % 7;

export const isOff = (g: TeamGame) => g.status === "postponed" || g.status === "cancelled" || g.status === "canceled";
const margin = (g: TeamGame) => (g.pts != null && g.oppPts != null ? Math.abs(g.pts - g.oppPts) : null);

export function marginLevel(m: number): 1 | 2 | 3 {
  return m <= 5 ? 1 : m <= 12 ? 2 : 3;
}

export function cellKind(g: TeamGame): CellKind {
  if (g.result === "W") return "win";
  if (g.result === "L") return "loss";
  if (isOff(g)) return "off";
  if (g.status === "in_progress") return "live";
  return "upcoming";
}

export function seasonSummary(games: TeamGame[]): SeasonSummary {
  const s: SeasonSummary = { w: 0, l: 0, closeW: 0, closeL: 0, longestWin: 0 };
  let run = 0;
  for (const g of [...games].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!g.result) continue;
    const m = margin(g);
    if (g.result === "W") { s.w++; run++; s.longestWin = Math.max(s.longestWin, run); } else { s.l++; run = 0; }
    if (m !== null && m <= 5) { if (g.result === "W") s.closeW++; else s.closeL++; }
  }
  return s;
}

export function summaryText(s: SeasonSummary): string {
  if (s.w + s.l === 0) return "No games played yet";
  const parts = [`${s.w}–${s.l}`];
  if (s.closeW + s.closeL > 0) parts.push(`${s.closeW}–${s.closeL} in games decided by 5 or fewer`);
  if (s.longestWin >= 2) parts.push(`longest win streak ${s.longestWin}`);
  return parts.join(" · ");
}

/** Lays the season on a grid from the Monday of the first game's week to the Sunday of the last game's week. */
export function buildSeasonCalendar(input: TeamGame[]): SeasonCalendar | null {
  const sorted = input.filter(g => /^\d{4}-\d{2}-\d{2}$/.test(g.day)).sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return null;
  // One square per day: if a day somehow has two games, the later one wins.
  const byDay = new Map<string, TeamGame>();
  for (const g of sorted) byDay.set(g.day, g);
  const days = [...byDay.keys()].sort();
  const start = toMs(days[0]) - weekdayMon(days[0]) * DAY_MS;
  const lastDay = days[days.length - 1];
  const end = toMs(lastDay) + (6 - weekdayMon(lastDay)) * DAY_MS;
  const nWeeks = Math.round((end - start + DAY_MS) / DAY_MS / 7);

  const weeks: CalCell[][] = [];
  const games: CalCell[] = [];
  for (let col = 0; col < nWeeks; col++) {
    const week: CalCell[] = [];
    for (let row = 0; row < 7; row++) {
      const day = toDay(start + (col * 7 + row) * DAY_MS);
      const game = byDay.get(day) ?? null;
      const cell: CalCell = { day, col, row, kind: "none", level: 0, game: null, gi: -1 };
      if (game) {
        const m = margin(game);
        cell.game = game;
        cell.kind = cellKind(game);
        cell.level = (cell.kind === "win" || cell.kind === "loss") && m !== null ? marginLevel(m) : 0;
        cell.gi = games.length;
        games.push(cell);
      }
      week.push(cell);
    }
    weeks.push(week);
  }

  // Month label over the first week that starts in that month (the first week always gets one,
  // unless the next label would sit on top of it).
  const months: { col: number; label: string }[] = [];
  let prev = -1;
  weeks.forEach((w, col) => {
    const mo = Number(w[0].day.slice(5, 7)) - 1;
    if (mo !== prev) { months.push({ col, label: MONTHS[mo] }); prev = mo; }
  });
  if (months.length > 1 && months[1].col - months[0].col < 2) months.shift();

  const recent = [...games].reverse().find(c => c.kind === "win" || c.kind === "loss" || c.kind === "live");
  return { weeks, months, games, recentCol: recent?.col ?? 0, summary: seasonSummary(sorted) };
}

/** Lays results that finished after the last data refresh (live ratings store) over the published games. */
export function withLiveFinals(games: TeamGame[], finals: LiveFinal[] | null | undefined, slug: string): TeamGame[] {
  if (!finals?.length) return games;
  const byId = new Map(finals.map(f => [f.id, f]));
  return games.map(g => {
    const f = byId.get(g.id);
    if (!f || g.result) return g;
    const home = f.game.home.slug === slug;
    const pts = home ? f.homePts : f.awayPts, oppPts = home ? f.awayPts : f.homePts;
    return { ...g, status: "final", pts, oppPts, result: pts > oppPts ? ("W" as const) : ("L" as const) };
  });
}
