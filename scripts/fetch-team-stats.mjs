import { mkdir, writeFile } from "node:fs/promises";

const season = 2027;
const key = process.env.CBBD_API_KEY;
if (!key) throw new Error("CBBD_API_KEY is missing. Add it as a GitHub Actions secret.");

const url = new URL("https://api.collegebasketballdata.com/stats/team/season");
url.searchParams.set("season", String(season));
url.searchParams.set("seasonType", "regular");

const response = await fetch(url, {
  headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
});
if (!response.ok) {
  throw new Error(`CBBD team season stats request failed with HTTP ${response.status}.`);
}
const rows = await response.json();
if (!Array.isArray(rows)) throw new Error("CBBD returned an unexpected team season stats payload.");

const teams = rows.filter(row => row && typeof row === "object" &&
  typeof (row.team ?? row.teamName ?? row.name) === "string")
  .map(row => ({
    ...row,
    teamName: row.teamName ?? row.team ?? row.name,
    conference: row.conference ?? null,
  }));

const payload = {
  provider: "College Basketball Data",
  season,
  seasonLabel: "2026–27",
  seasonType: "regular",
  fetchedAt: new Date().toISOString(),
  count: teams.length,
  status: teams.length ? "available" : "empty",
  note: teams.length
    ? "Team season statistics are shown as supplied by the provider. Missing fields remain unavailable."
    : "No team season records have been published for this season yet.",
  teams,
};
await mkdir("public/data", { recursive: true });
await writeFile("public/data/team-season-2027.json", JSON.stringify(payload, null, 2) + "\n");
console.log(`Published ${teams.length} team season stat records for season ${season}.`);
