// Per-match records and service/return estimates.
//
// The feed gives points won and serve percentages, not service-point counts, so each player's
// service points are solved from both serve-win rates:
//   P1 = S1*a + (T - S1)*(1 - b), with T = P1 + P2, a = p1 serve-win rate, b = p2 serve-win rate.
// Percent fields (first_serve_successful, first_serve_points_won, second_serve_points_won) are
// 0-100 shares. Count fields (aces, double_faults, points_won, breakpoints_*) are counts.

/** Map a feed match plus its detail to the compact record that the cache stores. Null if unusable. */
export function buildRecord(match, detail, event) {
  const s1 = detail?.team_1_stats;
  const s2 = detail?.team_2_stats;
  if (!s1 || !s2) return null;

  const stats = (s) => ({
    aces: s.aces, df: s.double_faults, pts: s.points_won,
    fs: s.first_serve_successful, fw: s.first_serve_points_won, sw: s.second_serve_points_won,
    bpW: s.breakpoints_won, bpT: s.total_breakpoints,
  });
  const st1 = stats(s1);
  const st2 = stats(s2);
  if (![...Object.values(st1), ...Object.values(st2)].every(Number.isFinite)) return null;

  const g1 = match.team_1_scores;
  const g2 = match.team_2_scores;
  if (!Array.isArray(g1) || !Array.isArray(g2) || g1.length === 0 || g1.length !== g2.length) return null;
  if (![...g1, ...g2].every(Number.isInteger)) return null;

  const winner = match.winner_id === match.team_1?.id ? 1 : match.winner_id === match.team_2?.id ? 2 : null;
  if (winner === null) return null;
  const time = Date.parse(match.match_date);
  if (!Number.isFinite(time)) return null;

  const player = (team, standing, st) => ({
    id: String(team.player1.id),
    name: `${team.player1.first_name ?? ""} ${team.player1.last_name ?? ""}`.trim() || team.player1.name || "Unknown",
    country: team.player1.country ?? null,
    place: Number.isFinite(standing?.place) ? standing.place : null,
    st,
  });

  return {
    v: 1,
    id: match.id,
    date: new Date(time).toISOString().slice(0, 10),
    eventId: event.id,
    event: event.name,
    level: event.tournament_type ?? "",
    surface: surfaceOf(event.ground_type),
    round: match.round_name ?? "",
    g1,
    g2,
    winner,
    p1: player(match.team_1, match.team_1_standing, st1),
    p2: player(match.team_2, match.team_2_standing, st2),
  };
}

/** "hard" | "clay" | "grass" | "other" from theScore's ground_type. */
export function surfaceOf(groundType) {
  const g = String(groundType ?? "");
  if (g.startsWith("hardcourt")) return "hard";
  if (g.includes("clay")) return "clay"; // the feed uses "red_clay"
  if (g.startsWith("grass")) return "grass";
  return "other";
}

const frac = (pct) => pct / 100;

/** Share of their own service points a player wins, from first-serve and second-serve percentages. */
export function serveWinRate(st) {
  const fs = frac(st.fs);
  return fs * frac(st.fw) + (1 - fs) * frac(st.sw);
}

/** Solve for the first player's service points. Falls back to T/2 when ill-conditioned or out of range. */
export function solveServicePoints(p1Points, a, b, total) {
  const denom = a - (1 - b);
  if (!(total > 0) || Math.abs(denom) < 1e-6) return { S1: total / 2, fallback: true };
  const S1 = (p1Points - total * (1 - b)) / denom;
  if (!Number.isFinite(S1) || S1 < 0.35 * total || S1 > 0.65 * total) return { S1: total / 2, fallback: true };
  return { S1, fallback: false };
}

/** One player's serve and return estimates for one match. Counts are floats; rounding happens later. */
function buildSide(own, opp, sOwn, sOpp, games) {
  const ownFsIn = frac(own.st.fs) * sOwn;
  const ownFirstWon = frac(own.st.fw) * ownFsIn;
  const ownSecondWon = frac(own.st.sw) * (sOwn - ownFsIn);

  const oppFsIn = frac(opp.st.fs) * sOpp;
  const oppFirstWon = frac(opp.st.fw) * oppFsIn;
  const oppSecondWon = frac(opp.st.sw) * (sOpp - oppFsIn);
  const oppServicePointsWon = oppFirstWon + oppSecondWon;

  const serviceGames = games / 2;
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  return {
    servicePoints: sOwn,
    firstServesIn: ownFsIn,
    firstServePointsWon: ownFirstWon,
    secondServePointsWon: ownSecondWon,
    servicePointsWon: ownFirstWon + ownSecondWon,
    returnPoints: sOpp,
    returnPointsWon: sOpp - oppServicePointsWon,
    returnFirstPointsPlayed: oppFsIn,
    returnFirstPointsWon: oppFsIn - oppFirstWon,
    returnSecondPointsWon: (sOpp - oppFsIn) - oppSecondWon,
    serviceGames,
    serviceGamesWon: clamp(serviceGames - opp.st.bpW, 0, serviceGames),
    // The feed has ~60 sides with breakpoints_won above total_breakpoints; chances are raised to
    // the won count so converted never exceeds chances.
    breakPointsFaced: Math.max(opp.st.bpT, opp.st.bpW),
    breakPointsSaved: Math.max(opp.st.bpT, opp.st.bpW) - opp.st.bpW,
    returnGames: serviceGames,
    returnGamesWon: clamp(own.st.bpW, 0, serviceGames),
    breakPointChances: Math.max(own.st.bpT, own.st.bpW),
    breakPointsConverted: own.st.bpW,
  };
}

/** Estimates for both players of one record. `fallback` marks a match where the even split was used. */
export function estimateMatch(rec) {
  const { p1, p2 } = rec;
  const total = p1.st.pts + p2.st.pts;
  const { S1, fallback } = solveServicePoints(p1.st.pts, serveWinRate(p1.st), serveWinRate(p2.st), total);
  const S2 = total - S1;
  const games = rec.g1.reduce((x, n) => x + n, 0) + rec.g2.reduce((x, n) => x + n, 0);
  return {
    fallback,
    total,
    p1: buildSide(p1, p2, S1, S2, games),
    p2: buildSide(p2, p1, S2, S1, games),
  };
}

/** Set-level facts: tiebreaks (7-6 / 6-7 sets), sets won, and whether the match went the distance. */
export function setFacts(rec) {
  let tiebreaks = 0;
  let tiebreaksP1 = 0;
  let p1Sets = 0;
  let p2Sets = 0;
  rec.g1.forEach((a, i) => {
    const b = rec.g2[i];
    if (a > b) p1Sets++;
    else p2Sets++;
    if ((a === 7 && b === 6) || (a === 6 && b === 7)) {
      tiebreaks++;
      if (a > b) tiebreaksP1++;
    }
  });
  const winnerSets = rec.winner === 1 ? p1Sets : p2Sets;
  // Full distance: sets played = 2 * (sets the winner needed) - 1.
  const deciding = rec.g1.length === 2 * winnerSets - 1;
  return { tiebreaks, tiebreaksP1, tiebreaksP2: tiebreaks - tiebreaksP1, deciding };
}
