// Past-season player stats (2021–22 to 2025–26) from College Basketball Data, fetched ONCE per
// season and cached in .cache/player-seasons/<season>.json (committed to the repo, not served).
// One /stats/player/season call returns every player for a season, so five seasons cost five calls
// the first time and zero afterwards (free tier: 1,000 calls a month).
//
// Non-fatal: a missing key or a failed call keeps whatever is cached and warns. Nothing is invented;
// a stat the provider doesn't give stays null.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isD1Conference } from "./d1-conferences.mjs";
import { compactSeason, CAREER_FORMAT } from "./lib/careers.mjs";

export const SEASONS = [2022, 2023, 2024, 2025, 2026];
const DIR = ".cache/player-seasons";

const cached = async season => {
  try {
    const file = JSON.parse(await readFile(`${DIR}/${season}.json`, "utf8"));
    return file.format === CAREER_FORMAT && Array.isArray(file.rows) && file.rows.length > 1000 ? file : null;
  } catch { return null; }
};

const key = process.env.CBBD_API_KEY;
await mkdir(DIR, { recursive: true });
let fetched = 0;
for (const season of SEASONS) {
  if (await cached(season)) continue;
  if (!key) { console.warn(`[player-history] CBBD_API_KEY missing; season ${season} not cached yet.`); continue; }
  try {
    const url = new URL("https://api.collegebasketballdata.com/stats/player/season");
    url.searchParams.set("season", String(season));
    url.searchParams.set("seasonType", "regular");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error("unexpected payload");
    const file = compactSeason(rows, season, isD1Conference);
    if (file.rows.length < 3000) throw new Error(`only ${file.rows.length} D-I rows; not caching a partial season`);
    await writeFile(`${DIR}/${season}.json`, JSON.stringify(file) + "\n");
    fetched++;
    console.log(`[player-history] ${season}: cached ${file.rows.length} D-I player rows.`);
  } catch (error) {
    console.warn(`[player-history] ${season} failed: ${error instanceof Error ? error.message : error}`);
  }
}
console.log(`[player-history] ${fetched} season(s) fetched; the rest were already cached.`);
