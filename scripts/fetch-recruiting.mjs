// Recruiting from College Basketball Data (/recruiting/players).
//
// - Settled classes (2022–2026: players now in college) are fetched ONCE and cached in
//   .cache/recruiting/<year>.json; public/data/recruiting.json keeps its old shape for the joins in
//   build-app-data and build-nil.
// - Open classes (high-school prospects: OPEN_CLASSES) are refetched on every full refresh, since
//   commitments change. They are cached in .cache/recruiting/<year>.json and turned into the small
//   served prospects file by build-app-data.
// Cost: 2 calls a day after the first run (was 5). Non-fatal: a missing key or failed call keeps the cache.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { openClasses, prospectRow, PROSPECT_FIELDS, settledClasses } from "./lib/careers.mjs";
import { readGzJson, writeGzJson } from "./lib/gz-json.mjs";

// Derived from the date, so a new season moves last year's open class into the settled set by itself.
export const SETTLED_CLASSES = settledClasses();
export const OPEN_CLASSES = openClasses();
const DIR = ".cache/recruiting";
const API = "https://api.collegebasketballdata.com/recruiting/players";
const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);

const readCache = year => readGzJson(`${DIR}/${year}`);

async function fetchClass(key, year) {
  const url = new URL(API);
  url.searchParams.set("year", String(year));
  const res = await fetch(url, { headers: { Authorization: "Bearer " + key, Accept: "application/json" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("unexpected payload");
  return rows;
}

/** Settled-class row: the shape recruiting.json has always had. */
const settledRow = (r, year) => ({
  year, athleteId: r.athleteId ?? r.athlete_id ?? null, name: r.name ?? null,
  stars: num(r.stars), rating: num(r.rating), ranking: num(r.ranking),
  position: r.position ?? null, school: typeof r.committedTo === "string" ? r.committedTo : r.committedTo?.name ?? r.school ?? null,
  schoolId: r.committedTo?.id ?? r.committedToId ?? null, sourceId: r.sourceId ?? r.id ?? null,
});

const key = process.env.CBBD_API_KEY;
await mkdir(DIR, { recursive: true });

// Settled classes: once. Seed from the existing recruiting.json first so no calls are spent on
// classes we already have; fetch only a class that is still missing.
let old = null;
try { old = JSON.parse(await readFile("public/data/recruiting.json", "utf8")); } catch { /* none yet */ }
const settled = [];
for (const year of SETTLED_CLASSES) {
  let file = await readCache(year);
  // A class cached while it was still open has prospect rows, not settled players: refetch it once.
  if (!file?.players?.length) {
    const seeded = (old?.players ?? []).filter(p => p.year === year);
    if (seeded.length) {
      file = { year, fetchedAt: old.fetchedAt ?? null, players: seeded };
      await writeGzJson(`${DIR}/${year}`, file);
    } else if (key) {
      try {
        const rows = await fetchClass(key, year);
        file = { year, fetchedAt: new Date().toISOString(), players: rows.map(r => settledRow(r, year)) };
        await writeGzJson(`${DIR}/${year}`, file);
        console.log(`[recruiting] ${year}: cached ${rows.length} recruits (settled class, fetched once).`);
      } catch (error) {
        console.warn(`[recruiting] ${year} failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  if (file?.players) settled.push(...file.players);
}
// Only rewrite recruiting.json when its content changed (no daily churn commits).
const sameAsOld = old && JSON.stringify(old.players) === JSON.stringify(settled) && JSON.stringify(old.classes) === JSON.stringify(SETTLED_CLASSES);
if (settled.length && !sameAsOld) {
  await writeFile("public/data/recruiting.json", JSON.stringify({ provider: "College Basketball Data /recruiting/players", fetchedAt: new Date().toISOString(), classes: SETTLED_CLASSES, players: settled }) + "\n");
  console.log(`[recruiting] recruiting.json: ${settled.length} settled-class recruits.`);
}

// Open classes: every full refresh.
if (!key) console.warn("[recruiting] CBBD_API_KEY missing; keeping cached prospect classes.");
for (const year of key ? OPEN_CLASSES : []) {
  try {
    const rows = await fetchClass(key, year);
    if (rows[0]) console.log(`[recruiting] ${year} sample row:`, JSON.stringify(rows[0]).slice(0, 600));
    const out = rows.map(r => prospectRow(r, year)).filter(Boolean);
    await writeGzJson(`${DIR}/${year}`, { year, fetchedAt: new Date().toISOString(), fields: PROSPECT_FIELDS, rows: out });
    console.log(`[recruiting] ${year}: ${out.length} prospects (${out.filter(r => r[PROSPECT_FIELDS.indexOf("college")]).length} committed).`);
  } catch (error) {
    console.warn(`[recruiting] ${year} failed: ${error instanceof Error ? error.message : error}`);
  }
}
