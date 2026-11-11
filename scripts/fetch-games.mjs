import { mkdir, readFile, writeFile } from "node:fs/promises";

const season = 2027;
const key = process.env.CBBD_API_KEY;
if (!key) throw new Error("CBBD_API_KEY is missing. Add it as a GitHub Actions secret.");

const windows = [
  ["aug-oct", "2026-08-01T00:00:00Z", "2026-10-31T23:59:59Z"],
  ["nov-dec", "2026-11-01T00:00:00Z", "2026-12-31T23:59:59Z"],
  ["jan-feb", "2027-01-01T00:00:00Z", "2027-02-28T23:59:59Z"],
  ["mar-aug", "2027-03-01T00:00:00Z", "2027-08-01T00:00:00Z"],
];
const batches = await Promise.all(windows.map(async ([label, startDateRange, endDateRange]) => {
  const url = new URL("https://api.collegebasketballdata.com/games");
  url.searchParams.set("season", String(season));
  url.searchParams.set("seasonType", "regular");
  url.searchParams.set("startDateRange", startDateRange);
  url.searchParams.set("endDateRange", endDateRange);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`CBBD games ${label} request failed with HTTP ${response.status}.`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error(`CBBD games ${label} returned an unexpected payload.`);
  if (rows.length >= 3000) console.warn(`[games] ${label} reached the 3,000-row endpoint cap; further date partitioning may be required.`);
  return rows;
}));
const rows = [...new Map(batches.flat().map(row => [String(row?.id), row])).values()];
const directoryPayload = JSON.parse(await readFile("public/data/team-directory.json", "utf8"));
const directoryTeams = Array.isArray(directoryPayload.teams) ? directoryPayload.teams : [];
if (directoryPayload.status !== "available" || !directoryTeams.length) throw new Error("A verified ESPN Division I directory is required before publishing game records.");
const normalizeTeamName = value => String(value ?? "").toLowerCase().replace(/\b(the|university|college)\b/g, "").replace(/[^a-z0-9]/g, "");
const d1TeamNames = new Set(directoryTeams.flatMap(team => [team.location, team.displayName].filter(Boolean).map(normalizeTeamName)));
const isD1Team = name => d1TeamNames.has(normalizeTeamName(name));

const games = rows.flatMap((row) => {
  if (!row || !Number.isInteger(row.id) || typeof row.startDate !== "string" ||
      typeof row.homeTeam !== "string" || typeof row.awayTeam !== "string" ||
      (!isD1Team(row.homeTeam) && !isD1Team(row.awayTeam))) return [];
  const rawStatus = String(row.status ?? row.gameStatus ?? "").toLowerCase();
  const status = rawStatus.includes("final") ? "final"
    : rawStatus.includes("progress") || rawStatus.includes("live") ? "in_progress"
    : rawStatus.includes("postpon") ? "postponed"
    : rawStatus.includes("cancel") ? "cancelled"
    : "scheduled";
  return [{
    id: String(row.id),
    date: row.startDate,
    season: row.season ?? season,
    seasonType: row.seasonType ?? "regular",
    status,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    homeTeamId: row.homeTeamId ?? null,
    awayTeamId: row.awayTeamId ?? null,
    homeConference: row.homeConference ?? null,
    awayConference: row.awayConference ?? null,
    homeScore: typeof row.homePoints === "number" ? row.homePoints : null,
    awayScore: typeof row.awayPoints === "number" ? row.awayPoints : null,
    homeWinner: typeof row.homeWinner === "boolean" ? row.homeWinner : null,
    awayWinner: typeof row.awayWinner === "boolean" ? row.awayWinner : null,
    neutralSite: row.neutralSite === true,
    conferenceGame: row.conferenceGame === true,
    tournament: row.tournament ?? null,
    venue: row.venue ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    homePeriodPoints: Array.isArray(row.homePeriodPoints) ? row.homePeriodPoints : null,
    awayPeriodPoints: Array.isArray(row.awayPeriodPoints) ? row.awayPeriodPoints : null,
  }];
}).sort((a,b) => a.date.localeCompare(b.date));
console.log(`Fetched ${rows.length} distinct game rows across ${windows.length} date windows; retained ${games.length} Division I matchups.`);

const payload = {
  provider: "College Basketball Data",
  season,
  seasonLabel: "2026–27",
  seasonType: "regular",
  fetchedAt: new Date().toISOString(),
  count: games.length,
  status: games.length ? "available" : "empty",
  note: "Schedule, results and scores are taken from four date-partitioned CBBD regular-season game requests to avoid the 3,000-row endpoint cap. Game-level player or play-by-play detail is not inferred.",
  games,
};

await mkdir("public/data", { recursive: true });
await writeFile("public/data/games-season-2027.json", JSON.stringify(payload, null, 2) + "\n");
console.log(`Published ${games.length} verified game records for season ${season}.`);
