import { mkdir, writeFile } from "node:fs/promises";

const season = 2027;
const key = process.env.CBBD_API_KEY;
if (!key) throw new Error("CBBD_API_KEY is missing. Add it as a GitHub Actions secret.");

const headers = { Authorization: "Bearer " + key, Accept: "application/json" };
const endpoints = [
  ["season", "/stats/team/season"],
  ["adjusted", "/ratings/adjusted"],
  ["srs", "/ratings/srs"],
  ["elo", "/ratings/elo"],
  ["gameStats", "/games/teams"],
];

async function fetchRows(endpoint) {
  const name = endpoint[0];
  const path = endpoint[1];
  const url = new URL("https://api.collegebasketballdata.com" + path);
  url.searchParams.set("season", String(season));
  if (name === "season" || name === "gameStats") url.searchParams.set("seasonType", "regular");
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error("CBBD " + path + " request failed with HTTP " + response.status + ".");
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("CBBD " + path + " returned an unexpected payload.");
  return rows;
}

const results = await Promise.all(endpoints.map(async endpoint => {
  try {
    return { kind: endpoint[0], rows: await fetchRows(endpoint), warning: null };
  } catch (error) {
    if (endpoint[0] === "season") throw error;
    return { kind: endpoint[0], rows: [], warning: error instanceof Error ? error.message : "Unknown provider error" };
  }
}));
const warnings = results.filter(result => result.warning).map(result => result.kind + ": " + result.warning);
for (const result of results) {
  console.log("[team-rankings] " + result.kind + ": " + result.rows.length + " source rows" + (result.warning ? " · " + result.warning : ""));
}
const byTeam = new Map();
for (const result of results) {
  const kind = result.kind;
  for (const row of result.rows) {
    if (!row || typeof row.team !== "string" || !row.team.trim()) continue;
    const id = String(row.teamId ?? row.team.trim().toLowerCase());
    const current = byTeam.get(id) ?? { teamId: row.teamId ?? null, team: row.team, conference: row.conference ?? null };
    if (kind === "season") {
      Object.assign(current, row);
      current.teamStats = row.teamStats ?? row;
      current.opponentStats = row.opponentStats ?? null;
    } else if (kind === "gameStats") {
      current.gameStats = current.gameStats ?? [];
      current.gameStats.push(row);
    } else current[kind] = row;
    byTeam.set(id, current);
  }
}

const srsById = new Map([...byTeam.values()].map(team => [
  String(team.teamId ?? ""), team.srs?.rating ?? team.srs?.srs ?? team.srs?.value ?? null,
]));
const teams = [...byTeam.values()].map(team => {
  const gameStats = Array.isArray(team.gameStats) ? team.gameStats : [];
  const opponentRatings = gameStats.map(game => srsById.get(String(game.opponentId ?? ""))).filter(value => typeof value === "number" && Number.isFinite(value));
  return {
    ...team,
    adjusted: team.adjusted ? {
      offensiveRating: team.adjusted.offensiveRating ?? team.adjusted.adjO ?? team.adjusted.adjOffense ?? null,
      defensiveRating: team.adjusted.defensiveRating ?? team.adjusted.adjD ?? team.adjusted.adjDefense ?? null,
      netRating: team.adjusted.netRating ?? team.adjusted.adjEM ?? team.adjusted.adjNetRating ?? null,
      rankings: team.adjusted.rankings ?? null,
    } : null,
    srsRating: team.srs?.rating ?? team.srs?.srs ?? team.srs?.value ?? null,
    eloRating: team.elo?.elo ?? team.elo?.rating ?? team.elo?.value ?? null,
    sosRating: opponentRatings.length ? opponentRatings.reduce((sum, value) => sum + value, 0) / opponentRatings.length : null,
  };
});

const payload = {
  provider: "College Basketball Data",
  season,
  seasonLabel: "2026–27",
  seasonType: "regular",
  fetchedAt: new Date().toISOString(),
  count: teams.length,
  status: teams.length ? "available" : "empty",
  sources: endpoints.map(([name, path]) => ({ name, endpoint: path })),
  warnings,
  note: "Team season aggregates, provider ratings, and game-level team box scores are merged by provider team ID. Game-level coverage is limited to rows returned by the provider (up to 3,000 games per request). Missing values remain null.",
  teams,
};

await mkdir("public/data", { recursive: true });
await writeFile("public/data/team-season-2027.json", JSON.stringify(payload, null, 2) + "\n");
console.log("[team-rankings] Published " + teams.length + " current-season team records for season " + season + ".");
if (!teams.length) {
  console.warn("[team-rankings] No team rows were returned. Verify CBBD season coverage, API access, and endpoint response.");
}
