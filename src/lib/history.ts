// Past seasons (public/data/history/<season>.json, written by scripts/fetch-history.mjs).
// Types and pure helpers only, so client components can use them; file reads live in
// src/app/history/load.ts (build time).

/** NCAA / NIT / ... run. `res` is null when the round can't be worked out (e.g. an NIT loss before the final). */
export type HistoryPost = { ev: string; seed: number | null; res: string | null; w: number; l: number };
export type HistoryTeam = {
  /** College Basketball Data team id (same as TeamSummary.id, as a number). */
  id: number; team: string; conf: string | null;
  /** Final record (regular season + postseason) and regular-season conference record. */
  w: number; l: number; cw: number; cl: number;
  /** Final adjusted offense / defense / net (points per 100 possessions) and national ranks. */
  o: number | null; d: number | null; net: number | null; rk: number; ork: number | null; drk: number | null;
  /** Conference finish by regular-season conference win %, e.g. "1" or "T-3", out of `cn` teams. */
  cf: string | null; cn: number | null;
  /** 1 = won the conference tournament. */
  ct: 0 | 1;
  post: HistoryPost | null;
};
export type HistoryConference = { conf: string; teams: number; best: number[]; bestRec: string | null; tourney: number | null };
export type HistorySeason = {
  formatVersion: number; provider: string; season: number; label: string; fetchedAt?: string;
  teamCount: number; gamesCounted: number; ncaaChampion: number | null;
  conferences: HistoryConference[]; notes: string[]; teams: HistoryTeam[];
};
/** What the season picker needs, read at build time. */
export type SeasonInfo = { season: number; label: string; teamCount: number; champion: string | null };
/** One program's line in one season, for the team-page card. */
export type ProgramSeason = { season: number; label: string; teamCount: number; team: HistoryTeam };

export const HISTORY_FIRST = 2017;
export const HISTORY_LAST = 2026;
export const seasonLabel = (s: number) => `${s - 1}–${String(s).slice(2)}`;

export function historyUrl(season: number) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/history/${season}.json`;
}

/** "1st", "T-3rd". */
export function finishLabel(cf: string | null) {
  if (!cf) return null;
  const tied = cf.startsWith("T-"), n = Number(cf.replace("T-", ""));
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${tied ? "T-" : ""}${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** Short postseason line: "NCAA · 5 seed · Sweet 16", "NIT champion", "NIT 1–1". */
export function postLabel(p: HistoryPost | null, short = false) {
  if (!p) return null;
  if (p.ev === "NCAA") {
    const res = p.res ?? `${p.w}–${p.l}`;
    if (short) return `${p.seed ? `${p.seed} seed, ` : ""}${res}`;
    return `NCAA${p.seed ? ` · ${p.seed} seed` : ""} · ${res}`;
  }
  if (p.res === "Champion") return `${p.ev} champion`;
  if (p.res === "Runner-up") return `${p.ev} runner-up`;
  return `${p.ev} ${p.w}–${p.l}`;
}

/** How deep a postseason run went, for sorting (higher = deeper). NCAA always beats other events. */
export function postDepth(p: HistoryPost | null) {
  if (!p) return 0;
  const order = ["First Four", "Round of 64", "Round of 32", "Sweet 16", "Elite Eight", "Final Four", "Runner-up", "Champion"];
  if (p.ev === "NCAA") return 100 + (p.res ? order.indexOf(p.res) * 10 : p.w * 10) + (17 - (p.seed ?? 16)) * 0.01;
  return 1 + p.w + (p.res === "Champion" ? 10 : p.res === "Runner-up" ? 5 : 0);
}

export type Mover = { team: HistoryTeam; prev: HistoryTeam; change: number; netChange: number | null };

/**
 * Biggest rank changes from the previous season, among teams ranked in both.
 * change = previous rank − this rank (positive = climbed). Ties break on the change in net rating.
 */
export function movers(cur: HistoryTeam[], prev: HistoryTeam[] | null, n = 5): { risers: Mover[]; fallers: Mover[]; compared: number } | null {
  if (!prev) return null;
  const before = new Map(prev.map(t => [t.id, t]));
  const both: Mover[] = cur.flatMap(t => {
    const p = before.get(t.id);
    return p ? [{ team: t, prev: p, change: p.rk - t.rk, netChange: t.net !== null && p.net !== null ? Math.round((t.net - p.net) * 10) / 10 : null }] : [];
  });
  const byNet = (a: Mover, b: Mover) => (b.netChange ?? 0) - (a.netChange ?? 0);
  const risers = both.filter(m => m.change > 0).sort((a, b) => b.change - a.change || byNet(a, b)).slice(0, n);
  const fallers = both.filter(m => m.change < 0).sort((a, b) => a.change - b.change || byNet(b, a)).slice(0, n);
  return { risers, fallers, compared: both.length };
}
