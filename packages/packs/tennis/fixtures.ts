// Deterministic fictional tennis rows for tests and the sport lab. Real pages use the
// tennis data feed; these never ship as real players. Totals are built in dependency order
// (points, then games, then matches) so won never exceeds played.
import { fakeName, seeded } from "@sports/kit/fixtures";
import { TOURS } from "./pack";
import type { TennisRow, Tour } from "./types";

const COUNTRIES = [
  { name: "Testland", short: "TST", color: "#c8102e" },
  { name: "Mockovia", short: "MCK", color: "#003087" },
  { name: "Demoria", short: "DMR", color: "#ffb81c" },
  { name: "Fakenia", short: "FKN", color: "#00843d" },
  { name: "Pretendia", short: "PTD", color: "#582c83" },
  { name: "Sampleland", short: "SPL", color: "#e35205" },
];

export function fixtures(n = 160): TennisRow[] {
  const rng = seeded(7);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const round = Math.round;

  return Array.from({ length: n }, (_, i) => {
    const tour = TOURS[i % 2][0] as Tour;
    const men = tour === "men";
    const country = rng.pick(COUNTRIES);
    const z = rng.normal(0, 1, -2.5, 2.5); // shared serve/return skill: higher is better

    // Matches and surfaces (the three surface counts add up to matches).
    const matches = round(rng.normal(28, 11, 3, 70));
    const clayMatches = Math.min(matches, round(matches * rng.normal(0.3, 0.12, 0.05, 0.7)));
    const grassMatches = Math.min(matches - clayMatches, round(matches * rng.normal(0.15, 0.06, 0.02, 0.35)));
    const hardMatches = matches - clayMatches - grassMatches;
    const surfaceWin = (played: number) => round(played * clamp(0.5 + 0.09 * z + rng.normal(0, 0.1), 0.05, 0.95));
    const hardWins = surfaceWin(hardMatches), clayWins = surfaceWin(clayMatches), grassWins = surfaceWin(grassMatches);
    const wins = hardWins + clayWins + grassWins;

    // Own serve.
    const servicePoints = round(matches * rng.normal(70, 6, 50, 95));
    const firstServesIn = round(servicePoints * clamp((men ? 0.62 : 0.6) + 0.02 * z + rng.normal(0, 0.02), 0.45, 0.75));
    const firstServePointsWon = round(firstServesIn * clamp((men ? 0.72 : 0.62) + 0.025 * z + rng.normal(0, 0.02), 0.4, 0.9));
    const secondServePointsWon = round((servicePoints - firstServesIn) * clamp((men ? 0.5 : 0.45) + 0.03 * z + rng.normal(0, 0.03), 0.25, 0.7));
    const servicePointsWon = firstServePointsWon + secondServePointsWon;
    const aces = Math.min(firstServesIn, round(servicePoints * clamp((men ? 0.07 : 0.035) + 0.02 * z + rng.normal(0, 0.012), 0, 0.2)));
    const doubleFaults = round(servicePoints * clamp((men ? 0.03 : 0.04) - 0.006 * z + rng.normal(0, 0.006), 0, 0.12));

    // Service games and break points against.
    const serviceGames = round(servicePoints / rng.normal(5.6, 0.3));
    const hold = clamp((men ? 0.8 : 0.7) + 0.04 * z + rng.normal(0, 0.03), 0.4, 0.97);
    const breakPointsFaced = round(serviceGames * clamp((men ? 0.4 : 0.65) - 0.05 * z + rng.normal(0, 0.05), 0.1, 1.2));
    const breakPointsSaved = round(breakPointsFaced * clamp(0.6 + 0.07 * z + rng.normal(0, 0.06), 0.25, 0.9));
    const gamesLost = Math.min(round(serviceGames * (1 - hold)), breakPointsFaced - breakPointsSaved);
    const serviceGamesWon = serviceGames - gamesLost;

    // Return (opponents' service points).
    const returnPoints = round(matches * rng.normal(70, 6, 50, 95));
    const returnFirstPointsPlayed = round(returnPoints * clamp(0.62 + rng.normal(0, 0.02), 0.5, 0.72));
    const returnSecondPoints = returnPoints - returnFirstPointsPlayed;
    const returnFirstPointsWon = round(returnFirstPointsPlayed * clamp((men ? 0.31 : 0.38) + 0.03 * z + rng.normal(0, 0.02), 0.15, 0.6));
    const returnSecondPointsWon = round(returnSecondPoints * clamp((men ? 0.51 : 0.5) + 0.03 * z + rng.normal(0, 0.03), 0.25, 0.8));
    const returnPointsWon = returnFirstPointsWon + returnSecondPointsWon;

    // Return games and break points.
    const returnGames = round(returnPoints / rng.normal(5.6, 0.3));
    const breakPointChances = round(returnGames * clamp(0.8 + 0.05 * z + rng.normal(0, 0.1), 0.2, 1.6));
    const breakPointsConverted = round(breakPointChances * clamp(0.4 + 0.05 * z + rng.normal(0, 0.06), 0.1, 0.75));
    const returnGamesWon = Math.min(round(returnGames * clamp((men ? 0.2 : 0.3) + 0.04 * z + rng.normal(0, 0.04), 0.03, 0.6)), breakPointsConverted);

    // Pressure: tiebreaks and deciding sets, with a few rows left unrecorded.
    const tiebreaksPlayed = round(matches * clamp(rng.normal(0.25, 0.08, 0, 0.6), 0, 0.6));
    const tiebreaksWon = round(tiebreaksPlayed * clamp(0.5 + 0.05 * z + rng.normal(0, 0.12), 0, 1));
    const decidingSetsPlayed = round(matches * clamp(rng.normal(0.3, 0.1, 0, 0.7), 0, 0.7));
    const decidingSetsWon = round(decidingSetsPlayed * clamp(0.5 + 0.05 * z + rng.normal(0, 0.12), 0, 1));
    const sparse = rng.next() < 0.06;

    // Quality of opposition: lower-ranked players meet fewer top-10 players.
    const top10Played = round(matches * clamp(rng.normal(0.25, 0.1, 0, 0.6), 0, 0.6));
    const top10Won = round(top10Played * clamp(0.35 + 0.08 * z + rng.normal(0, 0.12), 0, 1));
    const noTop10 = rng.next() < 0.08;

    return {
      id: `tn${i}`,
      name: fakeName(i),
      country,
      tour,
      matches, wins, losses: matches - wins,
      aces, doubleFaults, servicePoints, servicePointsWon, firstServesIn, firstServePointsWon, secondServePointsWon,
      serviceGames, serviceGamesWon, breakPointsFaced, breakPointsSaved,
      returnPoints, returnPointsWon, returnFirstPointsPlayed, returnFirstPointsWon, returnSecondPointsWon,
      returnGames, returnGamesWon, breakPointChances, breakPointsConverted,
      tiebreaksPlayed: sparse ? null : tiebreaksPlayed,
      tiebreaksWon: sparse ? null : tiebreaksWon,
      decidingSetsPlayed: sparse ? null : decidingSetsPlayed,
      decidingSetsWon: sparse ? null : decidingSetsWon,
      hardMatches, hardWins, clayMatches, clayWins, grassMatches, grassWins,
      top10Played: noTop10 ? null : top10Played,
      top10Won: noTop10 ? null : top10Won,
    } satisfies TennisRow;
  });
}
