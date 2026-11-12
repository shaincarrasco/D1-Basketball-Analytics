// Pure helpers for the games hub: filters, sorts, day summaries, labels.
import { fmt, timeLabel } from "@/lib/format";
import type { LiveGame } from "@/lib/live";
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
export function statusLabel(g: Game, live?: LiveGame): string {
  if (live && live.state !== "pre" && g.status !== "final" && live.label) return live.label;
  if (live?.state === "pre" && live.label && /Delayed|Postponed/.test(live.label)) return live.label;
  if (isFinal(g)) {
    const n = Math.max(g.home.periods?.length ?? 0, g.away.periods?.length ?? 0);
    return n > 2 ? `Final · ${n === 3 ? "OT" : `${n - 2}OT`}` : "Final";
  }
  if (isLive(g)) return "In progress";
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

// ---------- pregame line (spread ESPN shows, home perspective: negative = home favoured) ----------

const shortName = (s: GameSide) => s.short ?? s.name;
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
/** "+8.5" / "−3" / "PK" for a spread from one side's perspective. */
export const spreadNum = (v: number) => (v === 0 ? "PK" : `${v > 0 ? "+" : "−"}${num(Math.abs(v))}`);

export type LineInfo = {
  /** "UF −8.5" (favourite and spread) or "Pick'em". */
  market: string;
  /** DHR projection in the same form: "UF −6.2". */
  model: string | null;
  total: number | null;
  provider: string | null;
  /** DHR's side against the line, when the model and line differ by at least half a point (same rule as the methodology record). */
  pick: { side: "home" | "away"; text: string } | null;
  /** How the DHR pick fared on a final: W covered, L didn't, P push. */
  result: "W" | "L" | "P" | null;
  /** Which side covered the line on a final (null = push or not final). */
  covered: "home" | "away" | null;
};

export function lineInfo(g: Game): LineInfo | null {
  const l = g.line;
  if (!l || typeof l.spread !== "number") return null;
  const s = l.spread;
  const market = s === 0 ? "Pick'em" : `${shortName(s < 0 ? g.home : g.away)} −${num(Math.abs(s))}`;
  let model: string | null = null, pick: LineInfo["pick"] = null;
  if (g.pred) {
    const m = g.pred.margin;
    model = Math.abs(m) < 0.05 ? "Pick'em" : `${shortName(m > 0 ? g.home : g.away)} −${Math.abs(m).toFixed(1)}`;
    const lineMargin = -s;
    if (Math.abs(m - lineMargin) >= 0.5) {
      const side = m > lineMargin ? "home" : "away";
      pick = { side, text: `${shortName(g[side])} ${spreadNum(side === "home" ? s : -s)}` };
    }
  }
  let result: LineInfo["result"] = null, covered: LineInfo["covered"] = null;
  if (isFinal(g) && g.home.score != null && g.away.score != null) {
    const cover = g.home.score - g.away.score + s;
    covered = cover > 0 ? "home" : cover < 0 ? "away" : null;
    if (pick) result = cover === 0 ? "P" : (cover > 0) === (pick.side === "home") ? "W" : "L";
  }
  return { market, model, total: l.total, provider: l.provider, pick, result, covered };
}
