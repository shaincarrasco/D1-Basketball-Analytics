import { readFile, writeFile } from "node:fs/promises";
import { isD1Conference } from "./d1-conferences.mjs";

const season = 2027;
const teamPath = "public/data/team-season-2027.json";
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const teamPayload = await readJson(teamPath);
const teamRecords = Array.isArray(teamPayload.teams) ? teamPayload.teams : [];
const finite = value => typeof value === "number" && Number.isFinite(value) ? value : null;
const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const at = (source, path) => path.split(".").reduce((value, key) => object(value)[key], source);
const first = (...values) => values.map(finite).find(value => value !== null) ?? null;
const stat = (source, paths) => first(...paths.map(path => at(source, path)));
const possessions = source => {
  const direct = stat(source, ["possessions", "totalPossessions"]);
  if (direct !== null && direct > 0) return direct;
  const fga = stat(source, ["fieldGoals.attempted", "fieldGoals.attempts", "fieldGoalsAttempted"]);
  const orb = stat(source, ["offensiveRebounds.total", "offensiveRebounds", "rebounds.offensive"]);
  const tov = stat(source, ["turnovers.total", "turnovers", "totalTurnovers"]);
  const fta = stat(source, ["freeThrows.attempted", "freeThrows.attempts", "freeThrowsAttempted"]);
  return fga !== null && tov !== null && fta !== null ? fga - (orb ?? 0) + tov + 0.475 * fta : null;
};
const points = source => stat(source, ["points.total", "points", "totalPoints"]);
const byId = new Map(teamRecords.filter(team => team.teamId != null).map(team => [String(team.teamId), team]));
const games = new Map();
for (const team of teamRecords) {
  if (!isD1Conference(team.conference)) continue;
  for (const row of Array.isArray(team.gameStats) ? team.gameStats : []) {
    if (!row || row.gameId == null || row.teamId == null || row.opponentId == null) continue;
    const id = String(row.gameId);
    if (games.has(id)) continue;
    const own = object(row.teamStats);
    const opp = object(row.opponentStats);
    const ownPts = points(own);
    const oppPts = points(opp);
    const ownPoss = possessions(own);
    const oppPoss = possessions(opp);
    const sharedPoss = ownPoss !== null && oppPoss !== null ? (ownPoss + oppPoss) / 2 : ownPoss ?? oppPoss;
    if (ownPts === null || oppPts === null || sharedPoss === null || sharedPoss <= 0) continue;
    const minutes = finite(row.gameMinutes) ?? 40;
    const pace = finite(row.pace) ?? sharedPoss / Math.max(1, minutes) * 40;
    const ownSide = {
      id: String(row.teamId), name: row.team, conference: row.conference ?? null,
      opponentId: String(row.opponentId), opponent: row.opponent ?? "Opponent",
      offense: ownPts / sharedPoss * 100, defense: oppPts / sharedPoss * 100,
      pace, home: row.isHome === true, neutral: row.neutralSite === true,
      gameId: id, date: row.startDate ?? null,
    };
    const oppSide = {
      id: String(row.opponentId), name: row.opponent ?? "Opponent",
      conference: byId.get(String(row.opponentId))?.conference ?? null,
      opponentId: String(row.teamId), opponent: row.team,
      offense: oppPts / sharedPoss * 100, defense: ownPts / sharedPoss * 100,
      pace, home: row.isHome !== true, neutral: row.neutralSite === true,
      gameId: id, date: row.startDate ?? null,
    };
    games.set(id, [ownSide, oppSide]);
  }
}
if (!games.size) throw new Error("No verified game-level box scores were available for DHR; refusing to publish an empty rating model.");
const performances = [...games.values()].flat();
const d1Performances = performances.filter(game => isD1Conference(game.conference));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const leagueO = mean(d1Performances.map(game => game.offense));
const leagueD = mean(d1Performances.map(game => game.defense));
const leagueEfficiency = leagueO !== null && leagueD !== null ? (leagueO + leagueD) / 2 : 100;
const leagueTempo = mean(d1Performances.map(game => game.pace)) ?? 68;
const nodes = new Map();
for (const game of performances) {
  for (const id of [game.id, game.opponentId]) if (!nodes.has(id)) nodes.set(id, { offense: leagueEfficiency, defense: leagueEfficiency, tempo: leagueTempo, games: [] });
  nodes.get(game.id).games.push(game);
}
// Estimate the observed home-court net-efficiency edge, then neutralize each game before solving.
const gamePairs = [...games.values()];
const homeEdges = gamePairs.flatMap(pair => {
  const home = pair.find(game => game.home && !game.neutral);
  const away = pair.find(game => !game.home && !game.neutral);
  return home && away ? [(home.offense - home.defense - away.offense + away.defense) / 2] : [];
});
const homeEdge = mean(homeEdges) ?? 0;
for (let iteration = 0; iteration < 100; iteration++) {
  let maxChange = 0;
  const next = new Map();
  for (const [id, node] of nodes) {
    let offSum = 5 * leagueEfficiency, defSum = 5 * leagueEfficiency, tempoSum = 5 * leagueTempo;
    let weight = 5;
    for (const game of node.games) {
      const opponent = nodes.get(game.opponentId);
      if (!opponent) continue;
      const venue = game.neutral ? 0 : game.home ? 1 : -1;
      const neutralOffense = game.offense - venue * homeEdge / 2;
      const neutralDefense = game.defense + venue * homeEdge / 2;
      offSum += neutralOffense + (opponent.defense - leagueEfficiency);
      defSum += neutralDefense + (leagueEfficiency - opponent.offense);
      tempoSum += game.pace + (opponent.tempo - leagueTempo);
      weight += 1;
    }
    const updated = { offense: offSum / weight, defense: defSum / weight, tempo: tempoSum / weight, games: node.games };
    maxChange = Math.max(maxChange, Math.abs(updated.offense - node.offense), Math.abs(updated.defense - node.defense), Math.abs(updated.tempo - node.tempo));
    next.set(id, updated);
  }
  for (const [id, value] of next) nodes.set(id, value);
  if (maxChange < 0.00001) break;
}
const output = teamRecords.map(team => {
  const node = team.teamId == null ? null : nodes.get(String(team.teamId));
  const teamGames = node?.games.filter(game => isD1Conference(game.conference)) ?? [];
  if (!node || !teamGames.length || !isD1Conference(team.conference)) return { ...team, powerRatings: null };
  const count = teamGames.length;
  const reliability = count / (count + 5);
  const adjO = leagueEfficiency + (node.offense - leagueEfficiency) * reliability;
  const adjD = leagueEfficiency + (node.defense - leagueEfficiency) * reliability;
  const tempo = leagueTempo + (node.tempo - leagueTempo) * reliability;
  const opponentRatings = teamGames.map(game => nodes.get(game.opponentId)).filter(Boolean).map(opponent => { const opponentReliability = opponent.games.length / (opponent.games.length + 5); return (opponent.offense - opponent.defense) * opponentReliability; });
  const sos = mean(opponentRatings);
  return {
    ...team,
    powerRatings: {
      adjO: Number(adjO.toFixed(3)),
      adjD: Number(adjD.toFixed(3)),
      adjEM: Number((adjO - adjD).toFixed(3)),
      tempo: Number(tempo.toFixed(3)),
      sos: sos === null ? null : Number(sos.toFixed(3)),
      games: count,
      rawGames: count,
      reliability: Number(reliability.toFixed(3)),
      sample: count < 4 ? "Early sample" : count < 8 ? "Developing" : "Established",
      model: "D1 Hoops Power Rating v1",
    },
  };
}).map(team => ({ ...team, powerRatings: team.powerRatings ? { ...team.powerRatings, rank: null } : null }));
const ranked = output.filter(team => team.powerRatings).sort((a,b) => b.powerRatings.adjEM - a.powerRatings.adjEM);
ranked.forEach((team, index) => { team.powerRatings.rank = index + 1; });
if (!ranked.length) throw new Error("DHR produced no rankable Division I teams; refusing to publish an empty national ranking.");
const modelUpdatedAt = teamPayload.fetchedAt ?? new Date().toISOString();
const payload = { ...teamPayload, ratingModel: {
  name: "D1 Hoops Power Rating",
  version: "1.0.0",
  method: "Iterative opponent-adjusted offensive and defensive efficiency with neutral-site normalization and five-game league-average prior shrinkage.",
  leagueAverage: Number(leagueEfficiency.toFixed(3)),
  leagueTempo: Number(leagueTempo.toFixed(3)),
  estimatedHomeEdge: Number(homeEdge.toFixed(3)),
  gameCoverage: games.size,
  rankedTeams: ranked.length,
  minimumGames: 1,
  updatedAt: modelUpdatedAt,
}, teams: output };
await writeFile(teamPath, JSON.stringify(payload, null, 2) + "\n");
console.log("[power-ratings] D1 Hoops Power Rating v1: " + ranked.length + " teams ranked from " + games.size + " box-score games; league efficiency " + leagueEfficiency.toFixed(2) + "; home edge " + homeEdge.toFixed(2) + ".");
console.log("[power-ratings] Teams with no verified box-score sample remain unranked. Ratings are opponent-adjusted, venue-neutral, and shrunk toward league average using a five-game prior.");
