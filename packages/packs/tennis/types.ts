// One singles player's season on the tour, as raw totals. Every percentage and ratio is
// computed in pack.ts, so a feed (or a fixture) only has to supply counts. Null = not
// recorded; the pack's sample guards then leave that metric out for the player.

export type Tour = "men" | "women";

export type TennisRow = {
  id: string;
  name: string;
  /** Current world ranking and points (null when outside the published list). */
  rank?: number | null;
  points?: number | null;
  headshot?: string | null;
  country: { name: string; short: string; color: string };
  tour: Tour;

  // Results
  matches: number;
  wins: number;
  losses: number;

  // Serve (own service points)
  aces: number | null;
  doubleFaults: number | null;
  servicePoints: number | null;
  servicePointsWon: number | null;
  firstServesIn: number | null;
  firstServePointsWon: number | null;
  secondServePointsWon: number | null;
  serviceGames: number | null;
  serviceGamesWon: number | null;
  breakPointsFaced: number | null;
  breakPointsSaved: number | null;

  // Return (opponent's service points)
  returnPoints: number | null;
  returnPointsWon: number | null;
  returnFirstPointsPlayed: number | null;
  returnFirstPointsWon: number | null;
  returnSecondPointsWon: number | null;
  returnGames: number | null;
  returnGamesWon: number | null;
  breakPointChances: number | null;
  breakPointsConverted: number | null;

  // Pressure
  tiebreaksPlayed: number | null;
  tiebreaksWon: number | null;
  decidingSetsPlayed: number | null;
  decidingSetsWon: number | null;

  // Surfaces (matches on each surface; the three add up to `matches`)
  hardMatches: number | null;
  hardWins: number | null;
  clayMatches: number | null;
  clayWins: number | null;
  grassMatches: number | null;
  grassWins: number | null;

  // Quality of opposition
  top10Played: number | null;
  top10Won: number | null;
};
