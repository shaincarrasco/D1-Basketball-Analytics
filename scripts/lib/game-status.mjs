// Provider quirk: College Basketball Data sometimes marks a game "final" with a 0-0 score
// (cancelled, postponed, or not yet scored). Basketball has no 0-0 finals, so treat those as
// cancelled everywhere: they must not count as results, ties in the rating fit, or upsets.
export function isScorelessFinal(g) {
  return g.status === "final" && !(Number(g.homeScore) > 0) && !(Number(g.awayScore) > 0);
}
/** Mutates the provider games in place; returns how many were reclassified. */
export function normalizeGames(games) {
  let n = 0;
  for (const g of games ?? []) if (isScorelessFinal(g)) { g.status = "canceled"; n++; }
  return n;
}
