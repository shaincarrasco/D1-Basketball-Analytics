// Past-season player stats (the five finished seasons before the live one) from College Basketball
// Data, fetched ONCE per season and cached gzipped in .cache/player-seasons/<season>.json.gz
// (committed to the repo, not served).
// One /stats/player/season call returns every player for a season, so five seasons cost five calls
// the first time and zero afterwards (free tier: 1,000 calls a month).
//
// Non-fatal: a missing key or a failed call keeps whatever is cached and warns. Nothing is invented;
// a stat the provider doesn't give stays null.
import { mkdir } from "node:fs/promises";
import { compactSeason, CAREER_FORMAT, pastSeasons } from "./lib/careers.mjs";
import { readGzJson, writeGzJson } from "./lib/gz-json.mjs";

export const SEASONS = pastSeasons();
const DIR = ".cache/player-seasons";

const cached = async season => {
  const file = await readGzJson(`${DIR}/${season}`);
  return file?.format === CAREER_FORMAT && Array.isArray(file.rows) && file.rows.length > 1000 ? file : null;
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
    const file = compactSeason(rows, season); // every row: old conference names must not drop seasons
    if (file.rows.length < 3000) throw new Error(`only ${file.rows.length} rows; not caching a partial season`);
    await writeGzJson(`${DIR}/${season}`, file);
    fetched++;
    console.log(`[player-history] ${season}: cached ${file.rows.length} player rows.`);
  } catch (error) {
    console.warn(`[player-history] ${season} failed: ${error instanceof Error ? error.message : error}`);
  }
}
console.log(`[player-history] ${fetched} season(s) fetched; the rest were already cached.`);
