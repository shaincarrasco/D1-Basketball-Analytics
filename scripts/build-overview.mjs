import { mkdir, readFile, writeFile } from "node:fs/promises";

const season = 2027;
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const [teamPayload, playerPayload, gamePayload] = await Promise.all([
  readJson("public/data/team-season-2027.json"),
  readJson("public/data/player-season-2027.json"),
  readJson("public/data/games-season-2027.json"),
]);
const numeric = value => typeof value === "number" && Number.isFinite(value) ? value : null;
const get = (source, path) => path.split(".").reduce((value, key) => value && typeof value === "object" ? value[key] : undefined, source);
const ratio = (a,b) => numeric(a) !== null && numeric(b) !== null && b > 0 ? a / b : null;
const teams = (teamPayload.teams ?? []).map(team => {
  const t = team.teamStats ?? {};
  const o = team.opponentStats ?? {};
  const fga = get(t,"fieldGoals.attempted");
  const fta = get(t,"freeThrows.attempted");
  const orb = get(t,"rebounds.offensive") ?? get(t,"offensiveRebounds");
  const turnovers = get(t,"turnovers.total") ?? get(t,"turnovers");
  const points = get(t,"points.total") ?? get(t,"points");
  const oppFga = get(o,"fieldGoals.attempted");
  const oppFta = get(o,"freeThrows.attempted");
  const oppOrb = get(o,"rebounds.offensive") ?? get(o,"offensiveRebounds");
  const oppTurnovers = get(o,"turnovers.total") ?? get(o,"turnovers");
  const oppPoints = get(o,"points.total") ?? get(o,"points");
  const poss = numeric(fga) !== null && numeric(fta) !== null && numeric(turnovers) !== null ? fga - (numeric(orb) ?? 0) + turnovers + 0.475 * fta : null;
  const oppPoss = numeric(oppFga) !== null && numeric(oppFta) !== null && numeric(oppTurnovers) !== null ? oppFga - (numeric(oppOrb) ?? 0) + oppTurnovers + 0.475 * oppFta : null;
  const offense = ratio(points,poss) === null ? null : ratio(points,poss) * 100;
  const defense = ratio(oppPoints,oppPoss) === null ? null : ratio(oppPoints,oppPoss) * 100;
  return {
    team: team.team,
    conference: team.conference ?? null,
    wins: team.wins ?? null,
    losses: team.losses ?? null,
    netEfficiency: offense !== null && defense !== null ? offense - defense : null,
  };
}).filter(team => team.netEfficiency !== null).sort((a,b) => b.netEfficiency - a.netEfficiency).slice(0,8);
const players = [...(playerPayload.players ?? [])]
  .filter(player => numeric(player.points) !== null)
  .sort((a,b) => (b.points ?? -Infinity) - (a.points ?? -Infinity))
  .slice(0,8)
  .map(player => ({ id: player.id, name: player.name, teamName: player.teamName, conference: player.conference ?? null, points: player.points, rebounds: player.rebounds ?? null, assists: player.assists ?? null }));
const now = Date.now();
const games = [...(gamePayload.games ?? [])];
const upcoming = games.filter(game => new Date(game.date).getTime() >= now).sort((a,b) => a.date.localeCompare(b.date));
const recent = games.filter(game => new Date(game.date).getTime() < now).sort((a,b) => b.date.localeCompare(a.date));
const featuredGames = (upcoming.length ? upcoming : recent).slice(0,6).map(game => ({
  id: game.id, date: game.date, status: game.status, homeTeam: game.homeTeam, awayTeam: game.awayTeam,
  homeScore: game.homeScore, awayScore: game.awayScore, homeConference: game.homeConference ?? null,
  awayConference: game.awayConference ?? null, conferenceGame: game.conferenceGame ?? false,
  neutralSite: game.neutralSite ?? false, venue: game.venue ?? null, city: game.city ?? null, state: game.state ?? null,
  homePeriodPoints: game.homePeriodPoints ?? null, awayPeriodPoints: game.awayPeriodPoints ?? null,
}));
const payload = {
  provider: "College Basketball Data",
  season,
  seasonLabel: "2026–27",
  builtAt: new Date().toISOString(),
  overview: [{
    teamCount: teamPayload.count ?? (teamPayload.teams ?? []).length,
    playerCount: playerPayload.count ?? (playerPayload.players ?? []).length,
    gameCount: gamePayload.count ?? games.length,
    teams,
    players,
    games: featuredGames,
    updatedAt: {
      teams: teamPayload.fetchedAt ?? null,
      players: playerPayload.fetchedAt ?? null,
      games: gamePayload.fetchedAt ?? null,
    },
    sources: {
      teams: teamPayload.provider ?? "Unknown",
      players: playerPayload.provider ?? "Unknown",
      games: gamePayload.provider ?? "Unknown",
    },
  }],
};
await mkdir("public/data", { recursive: true });
await writeFile("public/data/overview-2027.json", JSON.stringify(payload) + "\n");
console.log("Built compact overview snapshot from verified season feeds.");
