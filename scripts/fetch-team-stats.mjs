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
];

async function fetchRows(endpoint) {
  const name = endpoint[0];
  const path = endpoint[1];
  const url = new URL("https://api.collegebasketballdata.com" + path);
  url.searchParams.set("season", String(season));
  if (name === "season") url.searchParams.set("seasonType", "regular");
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
const byTeam = new Map();
for (const result of results) {
  const kind = result.kind;
  for (const row of result.rows) {
    if (!row || typeof row.team !== "string" || !row.team.trim()) continue;
    const id = String(row.teamId ?? row.team.trim().toLowerCase());
    const current = byTeam.get(id) ?? { teamId: row.teamId ?? null, team: row.team, conference: row.conference ?? null };
    if (kind === "season") Object.assign(current, row);
    else current[kind] = row;
    byTeam.set(id, current);
  }
}

const teams = [...byTeam.values()].map(team => ({
  ...team,
  adjusted: team.adjusted ? {
    offensiveRating: team.adjusted.offensiveRating ?? null,
    defensiveRating: team.adjusted.defensiveRating ?? null,
    netRating: team.adjusted.netRating ?? null,
    rankings: team.adjusted.rankings ?? null,
  } : null,
  srsRating: team.srs?.rating ?? null,
  eloRating: team.elo?.elo ?? null,
}));

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
  note: "Team season box-score aggregates, adjusted efficiency, SRS, and Elo are merged by provider team ID. Missing values remain null; rankings are not inferred.",
  teams,
};

await mkdir("public/data", { recursive: true });
await writeFile("public/data/team-season-2027.json", JSON.stringify(payload, null, 2) + "\n");
console.log("Published " + teams.length + " current-season team records for season " + season + ".");
