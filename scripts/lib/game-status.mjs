// Provider quirk: College Basketball Data sometimes marks a game "final" with a 0-0 score
// before it is played (or when it is called off). Basketball has no 0-0 finals, so such a
// game is never a result: if it tipped (or was due to tip) more than a few hours ago it is
// treated as cancelled, otherwise as still scheduled. merge-espn-finals.mjs fills the real
// score from ESPN once the game is over.
const PLAYED_BY_MS = 4 * 3600_000;

export function isScorelessFinal(g) {
  return g.status === "final" && !(Number(g.homeScore) > 0) && !(Number(g.awayScore) > 0);
}
/** Mutates the provider games in place; returns how many were reclassified. */
export function normalizeGames(games, now = Date.now()) {
  let n = 0;
  for (const g of games ?? []) {
    if (!isScorelessFinal(g)) continue;
    const tip = Date.parse(g.date);
    g.status = Number.isFinite(tip) && tip + PLAYED_BY_MS > now ? "scheduled" : "canceled";
    g.homeScore = null; g.awayScore = null;
    n++;
  }
  return n;
}
