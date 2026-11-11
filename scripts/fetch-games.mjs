import { mkdir, writeFile } from "node:fs/promises";

const season = 2027;
const key = process.env.CBBD_API_KEY;
if (!key) throw new Error("CBBD_API_KEY is missing. Add it as a GitHub Actions secret.");

const url = new URL("https://api.collegebasketballdata.com/games");
url.searchParams.set("season", String(season));
url.searchParams.set("seasonType", "regular");
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
});
if (!response.ok) throw new Error(`CBBD games request failed with HTTP ${response.status}.`);
const rows = await response.json();
if (!Array.isArray(rows)) throw new Error("CBBD returned an unexpected games payload.");

const games = rows.flatMap((row) => {
  if (!row || !Number.isInteger(row.id) || typeof row.startDate !== "string" ||
      typeof row.homeTeam !== "string" || typeof row.awayTeam !== "string") return [];
  const status = ["scheduled", "in_progress", "final", "postponed", "cancelled"].includes(row.status)
    ? row.status : "scheduled";
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
    source: row,
  }];
}).sort((a,b) => a.date.localeCompare(b.date));

const payload = {
  provider: "College Basketball Data",
  season,
  seasonLabel: "2026–27",
  seasonType: "regular",
  fetchedAt: new Date().toISOString(),
  count: games.length,
  status: games.length ? "available" : "empty",
  note: "Schedule, results and scores are taken from the CBBD regular-season games endpoint. Game-level player or play-by-play detail is not inferred.",
  games,
};

await mkdir("public/data", { recursive: true });
await writeFile("public/data/games-season-2027.json", JSON.stringify(payload, null, 2) + "\n");
console.log(`Published ${games.length} verified game records for season ${season}.`);
