// One factual line on why a game is worth watching, for the home hero. Pure: no data fetching.
// Only scheduled games get a reason; the first branch that the data supports wins.
import type { Game, GameSide, TeamSummary } from "@/lib/types";

const TOP25 = 25, TOP10 = 10;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const shortOf = (s: GameSide) => s.short ?? s.name;
/** DHR rank from the game row, falling back to the team summary when the row has none. */
const rankOf = (s: GameSide, teams: Map<string, TeamSummary>) => s.rank ?? (s.slug ? teams.get(s.slug)?.rank ?? null : null);
const isTop = (r: number | null, n: number) => r !== null && r <= n;

/** `projections: false` skips the reasons that quote a win chance (upset watch, coin flip), for readers who haven't asked for projections. */
export function watchReason(g: Game, teams: Map<string, TeamSummary>, opts: { projections?: boolean } = {}): string | null {
  if (g.status !== "scheduled") return null;
  const hr = rankOf(g.home, teams), ar = rankOf(g.away, teams);

  // 1. Both sides in the DHR top 25.
  if (isTop(hr, TOP25) && isTop(ar, TOP25)) {
    const [lo, hi] = [hr!, ar!].sort((x, y) => x - y);
    return `Top-25 clash: No. ${lo} vs No. ${hi}`;
  }

  const wp = opts.projections === false ? null : g.pred?.wp ?? null; // home win probability
  if (wp !== null) {
    // 2. Upset watch: a ranked side is the underdog, or a top-25 favourite is below 62%.
    const underdog = wp < 0.5 ? g.home : wp > 0.5 ? g.away : null;
    const favorite = wp < 0.5 ? g.away : g.home;
    if (underdog) {
      const favP = Math.max(wp, 1 - wp);
      const rankedDog = isTop(rankOf(underdog, teams), TOP25);
      const rankedFavLow = isTop(rankOf(favorite, teams), TOP25) && favP < 0.62;
      if (rankedDog || rankedFavLow) return `Upset watch: ${shortOf(underdog)} has a ${pct(1 - favP)} chance`;
    }

    // 3. Coin flip: home win probability between 42% and 58%. Written away–home, scoreboard order.
    if (wp >= 0.42 && wp <= 0.58) {
      const h = Math.round(wp * 100);
      return `Coin flip: ${100 - h}–${h}`;
    }
  }

  // 4. One side in the DHR top 10 (both sides would have been caught by branch 1).
  const top10 = ([[hr, g.home], [ar, g.away]] as const)
    .filter(([r]) => isTop(r, TOP10))
    .sort((a, b) => a[0]! - b[0]!);
  if (top10.length) return `No. ${top10[0][0]} ${top10[0][1].name} on the floor`;

  // 5. Conference game between two teams within 3 conference wins of each other (both must have played league games).
  if (g.confGame && g.home.slug && g.away.slug) {
    const h = teams.get(g.home.slug), a = teams.get(g.away.slug);
    if (h && a && h.cw + h.cl > 0 && a.cw + a.cl > 0 && Math.abs(h.cw - a.cw) <= 3) {
      return `Conference race: ${shortOf(g.away)} ${a.cw}–${a.cl}, ${shortOf(g.home)} ${h.cw}–${h.cl}`;
    }
  }

  return null;
}
