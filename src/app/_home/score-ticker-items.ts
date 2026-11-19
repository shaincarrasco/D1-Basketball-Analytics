// Pure logic for the home scores ticker: which of today's games show, in what order, with what status text.
import { withLive, type LiveGame } from "@/lib/live";
import type { Game, GameSide } from "@/lib/types";

export type TickerSide = { name: string; short: string; logo: string | null; score: number };
export type TickerItem = { id: string; live: boolean; status: string; away: TickerSide; home: TickerSide; awayWon: boolean };

const side = (s: GameSide): TickerSide => ({ name: s.name, short: s.short || s.name, logo: s.logo, score: s.score ?? 0 });

/**
 * Today's live games and finals, with ESPN's live overlay applied. Live games first (best
 * matchup first), then finals by the same watch score. Scheduled, postponed and canceled games
 * and anything without both scores are left out.
 */
export function tickerItems(games: Game[], liveBy: Map<string, LiveGame>): TickerItem[] {
  const out: (TickerItem & { watch: number })[] = [];
  for (const raw of games) {
    const l = liveBy.get(raw.id);
    const g = withLive(raw, l);
    const live = g.status === "in_progress";
    if (!live && g.status !== "final") continue;
    if (g.home.score === null || g.away.score === null) continue;
    out.push({
      id: g.id, live,
      status: live ? l?.label || "Live" : l?.label || "Final",
      away: side(g.away), home: side(g.home),
      awayWon: g.away.score > g.home.score,
      watch: g.watch ?? 0,
    });
  }
  return out
    .sort((a, b) => Number(b.live) - Number(a.live) || b.watch - a.watch)
    .map(({ watch: _w, ...item }) => item);
}

/** How many extra copies of the item set the loop needs so a seamless wrap never shows a gap: at least one, and enough to cover the viewport. */
export function loopCopies(setWidth: number, viewWidth: number): number {
  if (setWidth <= 0) return 0;
  return Math.max(1, Math.ceil(viewWidth / setWidth));
}
