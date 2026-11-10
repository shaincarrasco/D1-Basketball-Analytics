import { mkdir, readFile, writeFile } from "node:fs/promises";

const season = 2027;
const key = process.env.CBBD_API_KEY;
if (!key) throw new Error("CBBD_API_KEY is missing.");
const event = process.env.GITHUB_EVENT_NAME ?? "";
const snapshotPath = "public/data/player-shooting-season-2027.json";
const playerPath = "public/data/player-season-2027.json";
let previous = null;
try { previous = JSON.parse(await readFile(snapshotPath, "utf8")); } catch { /* no previous snapshot */ }
const refresh = event === "workflow_dispatch" || (event === "schedule" && new Date().getUTCDay() === 0) || (event === "push" && !previous);
if (!refresh) {
  if (!previous) {
    await mkdir("public/data", { recursive: true });
    await writeFile(snapshotPath, JSON.stringify({ provider: "College Basketball Data", season, status: "pending", fetchedAt: null, count: 0, players: [] }, null, 2) + "\n");
  }
  console.log("Player shooting refresh skipped; the saved weekly snapshot will be reused.");
  process.exit(0);
}
const seasonPayload = JSON.parse(await readFile(playerPath, "utf8"));
const conferences = [...new Set((seasonPayload.players ?? []).map((p) => p.conference).filter((v) => typeof v === "string" && v.trim()))].sort();
if (!conferences.length) {
  console.log("No current-season conferences are available yet; preserving the previous shooting snapshot.");
  if (!previous) await writeFile(snapshotPath, JSON.stringify({ provider: "College Basketball Data", season, status: "pending", fetchedAt: new Date().toISOString(), count: 0, players: [] }, null, 2) + "\n");
  process.exit(0);
}
const playersById = new Map();
const warnings = [];
for (const conference of conferences) {
  const url = new URL("https://api.collegebasketballdata.com/stats/player/shooting/season");
  url.searchParams.set("season", String(season));
  url.searchParams.set("seasonType", "regular");
  url.searchParams.set("conference", conference);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  if (!response.ok) {
    warnings.push(`Conference ${conference}: HTTP ${response.status}`);
    if ([401, 403, 429].includes(response.status)) break;
    continue;
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) { warnings.push(`Conference ${conference}: unexpected response format`); continue; }
  for (const row of rows) if (row && Number.isInteger(row.athleteId)) playersById.set(String(row.athleteId), row);
}
if (warnings.length && playersById.size === 0) {
  console.log("Player shooting profiles were not available; preserving any prior snapshot. " + warnings.join("; "));
  if (!previous) await writeFile(snapshotPath, JSON.stringify({ provider: "College Basketball Data", season, status: "unavailable", fetchedAt: new Date().toISOString(), count: 0, warnings, players: [] }, null, 2) + "\n");
  process.exit(0);
}
const shootingPlayers = [...playersById.values()];
const payload = { provider: "College Basketball Data", season, seasonLabel: "2026–27", seasonType: "regular", status: "available", fetchedAt: new Date().toISOString(), conferenceCount: conferences.length, count: shootingPlayers.length, warnings, players: shootingPlayers };
await mkdir("public/data", { recursive: true });
await writeFile(snapshotPath, JSON.stringify(payload, null, 2) + "\n");
const shootingById = new Map(shootingPlayers.map((p) => [String(p.athleteId), p]));
seasonPayload.players = (seasonPayload.players ?? []).map((p) => {
  const shootingProfile = shootingById.get(String(p.id)) ?? null;
  return { ...p, shootingProfile, sourceStats: { ...(p.sourceStats ?? {}), shootingProfile } };
});
await writeFile(playerPath, JSON.stringify(seasonPayload, null, 2) + "\n");
console.log(`Published ${shootingPlayers.length} player shooting profiles across ${conferences.length} conferences.`);