import { mkdir, readFile, writeFile } from "node:fs/promises";

const season = 2027;
const key = process.env.CBBD_API_KEY;
if (!key) throw new Error("CBBD_API_KEY is missing.");
const event = process.env.GITHUB_EVENT_NAME ?? "";
const snapshotPath = "public/data/player-shooting-season-2027.json";
const playerPath = "public/data/player-season-2027.json";
const detailDirectory = "public/data/player-details-2027";
let previous = null;
try { previous = JSON.parse(await readFile(snapshotPath, "utf8")); } catch { /* no previous snapshot */ }

async function attachProfiles(profiles) {
  const seasonPayload = JSON.parse(await readFile(playerPath, "utf8"));
  const players = seasonPayload.players ?? [];
  const groups = new Map();
  for (const player of players) {
    const group = player.detailGroup || "unclassified";
    const ids = groups.get(group) ?? new Set();
    ids.add(String(player.id));
    groups.set(group, ids);
  }
  const shootingById = new Map((profiles ?? []).map(row => [String(row.athleteId), row]));
  await mkdir(detailDirectory, { recursive: true });
  for (const [group, ids] of groups) {
    const path = `${detailDirectory}/${group}.json`;
    let detailPayload;
    try { detailPayload = JSON.parse(await readFile(path, "utf8")); } catch { continue; }
    detailPayload.players = (detailPayload.players ?? []).map(detail => {
      const profile = shootingById.get(String(detail.id)) ?? null;
      return { ...detail, shootingProfile: profile };
    });
    await writeFile(path, JSON.stringify(detailPayload) + "\n");
  }
}

const refresh = event === "workflow_dispatch" || (event === "schedule" && new Date().getUTCDay() === 0) || (event === "push" && !previous);
if (!refresh) {
  if (!previous) {
    await mkdir("public/data", { recursive: true });
    await writeFile(snapshotPath, JSON.stringify({ provider: "College Basketball Data", season, status: "pending", fetchedAt: null, count: 0, players: [] }) + "\n");
  } else {
    await attachProfiles(previous.players);
  }
  console.log("Player shooting refresh skipped; saved profiles were attached to lazy-loaded player detail files.");
  process.exit(0);
}

const seasonPayload = JSON.parse(await readFile(playerPath, "utf8"));
const conferences = [...new Set((seasonPayload.players ?? []).map(player => player.conference).filter(value => typeof value === "string" && value.trim()))].sort();
if (!conferences.length) {
  console.log("No current-season conferences are available yet; preserving the previous shooting snapshot.");
  if (!previous) await writeFile(snapshotPath, JSON.stringify({ provider: "College Basketball Data", season, status: "pending", fetchedAt: new Date().toISOString(), count: 0, players: [] }) + "\n");
  if (previous) await attachProfiles(previous.players);
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
  if (!previous) await writeFile(snapshotPath, JSON.stringify({ provider: "College Basketball Data", season, status: "unavailable", fetchedAt: new Date().toISOString(), count: 0, warnings, players: [] }) + "\n");
  if (previous) await attachProfiles(previous.players);
  process.exit(0);
}
const shootingPlayers = [...playersById.values()];
const payload = { provider: "College Basketball Data", season, seasonLabel: "2026–27", seasonType: "regular", status: "available", fetchedAt: new Date().toISOString(), conferenceCount: conferences.length, count: shootingPlayers.length, warnings, players: shootingPlayers };
await mkdir("public/data", { recursive: true });
await writeFile(snapshotPath, JSON.stringify(payload) + "\n");
await attachProfiles(shootingPlayers);
console.log(`Published ${shootingPlayers.length} player shooting profiles across ${conferences.length} conferences.`);
