import { mkdir, writeFile } from "node:fs/promises";

const season = 2027;
const key = process.env.CBBD_API_KEY;
if (!key) throw new Error("CBBD_API_KEY is missing. Add it as a GitHub Actions secret.");

const url = new URL("https://api.collegebasketballdata.com/stats/player/season");
url.searchParams.set("season", String(season));
url.searchParams.set("seasonType", "regular");
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
});
if (!response.ok) throw new Error(`CBBD player stats request failed with HTTP ${response.status}.`);
const rows = await response.json();
if (!Array.isArray(rows)) throw new Error("CBBD returned an unexpected player stats payload.");

const numeric = value => typeof value === "number" && Number.isFinite(value) ? value : null;
const safeDivide = (value, games) => numeric(value) !== null && numeric(games) > 0 ? value / games : null;
const detailGroupFor = conference => String(conference || "unclassified")
  .toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unclassified";

const validRows = rows.filter(row => row && typeof row === "object" &&
  Number.isInteger(row.athleteId) && typeof row.name === "string" && row.name.trim() &&
  typeof row.team === "string" && row.team.trim());
const detailsByGroup = new Map();
const players = validRows.map(row => {
  const games = numeric(row.games);
  const conference = typeof row.conference === "string" ? row.conference : null;
  const detailGroup = detailGroupFor(conference);
  const detailRows = detailsByGroup.get(detailGroup) ?? [];
  detailRows.push({ id: String(row.athleteId), sourceStats: row, shootingProfile: null });
  detailsByGroup.set(detailGroup, detailRows);
  return {
    id: String(row.athleteId),
    name: row.name.trim(),
    teamName: row.team.trim(),
    conference,
    detailGroup,
    position: typeof row.position === "string" ? row.position : "",
    year: "",
    games,
    starts: numeric(row.starts),
    minutes: safeDivide(row.minutes, games),
    points: safeDivide(row.points, games),
    rebounds: safeDivide(row.rebounds?.total, games),
    assists: safeDivide(row.assists, games),
    steals: safeDivide(row.steals, games),
    blocks: safeDivide(row.blocks, games),
    turnovers: safeDivide(row.turnovers, games),
    fouls: safeDivide(row.fouls, games),
    usage: numeric(row.usage),
    offensiveRating: numeric(row.offensiveRating),
    defensiveRating: numeric(row.defensiveRating),
    netRating: numeric(row.netRating),
    porpag: numeric(row.PORPAG),
    bpm: null,
    impact: numeric(row.PORPAG),
    efg: numeric(row.effectiveFieldGoalPct),
    ts: numeric(row.trueShootingPct),
    assistsTurnoverRatio: numeric(row.assistsTurnoverRatio),
    freeThrowRate: numeric(row.freeThrowRate),
    offensiveReboundPct: numeric(row.offensiveReboundPct),
    fieldGoals: row.fieldGoals ?? null,
    twoPointFieldGoals: row.twoPointFieldGoals ?? null,
    threePointFieldGoals: row.threePointFieldGoals ?? null,
    freeThrows: row.freeThrows ?? null,
    winShares: row.winShares ?? null,
  };
});

await mkdir("public/data", { recursive: true });
await mkdir("public/data/player-details-2027", { recursive: true });
for (const [group, detailPlayers] of detailsByGroup) {
  const detailPayload = {
    provider: "College Basketball Data",
    season,
    seasonLabel: "2026–27",
    conferenceKey: group,
    fetchedAt: new Date().toISOString(),
    count: detailPlayers.length,
    players: detailPlayers,
  };
  await writeFile(`public/data/player-details-2027/${group}.json`, JSON.stringify(detailPayload) + "\n");
}
const payload = {
  provider: "College Basketball Data",
  season,
  seasonLabel: "2026–27",
  seasonType: "regular",
  fetchedAt: new Date().toISOString(),
  count: players.length,
  detailGroups: detailsByGroup.size,
  status: players.length ? "available" : "empty",
  note: "The searchable player index contains normalized leaderboard fields. Full provider records and shooting profiles are split into conference files and fetched only when a player profile is opened.",
  players,
};
await writeFile("public/data/player-season-2027.json", JSON.stringify(payload) + "\n");
console.log(`Fetched ${players.length} validated player records across ${detailsByGroup.size} lazy-loaded conference detail files.`);

// Publish the national team directory at build time so GitHub Pages does not
// depend on a browser-to-ESPN request (which can be blocked by CORS/network policy).
try {
  const directoryResponse = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=500", {
    headers: { Accept: "application/json" },
  });
  if (!directoryResponse.ok) throw new Error(`ESPN team directory returned HTTP ${directoryResponse.status}`);
  const directoryJson = await directoryResponse.json();
  const rawTeams = directoryJson.sports?.[0]?.leagues?.[0]?.teams ?? directoryJson.teams ?? [];
  const teams = rawTeams.map(entry => entry.team ?? entry)
    .filter(team => team?.id && (team.displayName || team.name))
    .map(team => ({
      id: String(team.id),
      displayName: team.displayName || team.name,
      name: team.name || team.displayName,
      abbreviation: team.abbreviation || "",
      location: team.location || team.groups?.name || "Other",
      logo: team.logos?.[0]?.href || team.logo || "",
    }));
  if (!teams.length) throw new Error("ESPN returned no recognizable team records");
  const directory = { provider: "ESPN", fetchedAt: new Date().toISOString(), count: teams.length, status: "available", teams };
  await writeFile("public/data/team-directory.json", JSON.stringify(directory, null, 2) + "\n");
  console.log(`Published ${teams.length} team directory records.`);
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown directory fetch error";
  await writeFile("public/data/team-directory.json", JSON.stringify({ provider: "ESPN", fetchedAt: new Date().toISOString(), count: 0, status: "unavailable", warning: message, teams: [] }, null, 2) + "\n");
  console.log("Team directory snapshot unavailable; browser fallback will remain enabled.");
}
