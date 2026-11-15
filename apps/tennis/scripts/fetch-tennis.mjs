#!/usr/bin/env node
// Builds the tennis app data from theScore: fetches new final singles matches into a per-match
// cache, then writes players.json, rankings.json and results.json under public/data/app.
//
// Usage: node apps/tennis/scripts/fetch-tennis.mjs [--tour atp|wta] [--max-events N]
//   --tour        fetch matches for one tour only (both tours' cache still feeds the output)
//   --max-events  fetch only the N most recent started events per tour (quick runs)
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getJson } from "./lib/http.mjs";
import { buildRecord, surfaceOf } from "./lib/model.mjs";
import { buildOutputs, loadRecords, seasonTotals } from "./lib/aggregate.mjs";
import { writeSeasonFiles } from "./lib/season-files.mjs";
import { writeRace } from "./lib/race.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(APP, "data-cache");
const OUT = path.join(APP, "public", "data", "app");
const SEASON = "2026";
const TOURS = ["atp", "wta"];

function parseArgs(argv) {
  const value = (name) => {
    const i = argv.indexOf(name);
    if (i < 0) return undefined;
    if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) throw new Error(`${name} needs a value`);
    return argv[i + 1];
  };
  const tour = value("--tour");
  if (tour !== undefined && !TOURS.includes(tour)) throw new Error(`--tour must be atp or wta, got ${tour}`);
  const max = value("--max-events");
  const maxEvents = max === undefined ? null : Number(max);
  if (max !== undefined && (!Number.isInteger(maxEvents) || maxEvents < 1)) throw new Error(`--max-events must be a positive integer`);
  return { tours: tour ? [tour] : TOURS, maxEvents };
}

const log = (...a) => console.log(...a);

/** Fetch and cache every new final singles match for one event. Returns counts for the log line. */
async function fetchEvent(tour, event) {
  const matches = (await getJson(`/${tour}/events/${event.id}/matches`)) ?? [];
  const singles = matches.filter(
    (m) => !m.is_double && m.status === "final" && m.team_1 && m.team_2 && Number.isFinite(Date.parse(m.match_date)),
  );
  const counts = { singles: singles.length, fetched: 0, cached: 0, resurfaced: 0, noStats: 0, failed: 0 };

  await Promise.all(
    singles.map(async (m) => {
      const file = path.join(CACHE, tour, `${m.id}.json`);
      if (existsSync(file)) {
        counts.cached++;
        // Keep cached surfaces in step with the event's current ground type, without refetching stats.
        const cached = JSON.parse(await readFile(file, "utf8"));
        const surface = surfaceOf(event.ground_type);
        if (cached.surface !== surface) {
          cached.surface = surface;
          await writeFile(file, JSON.stringify(cached));
          counts.resurfaced++;
        }
        return;
      }
      try {
        const detail = await getJson(`/${tour}/matches/${m.id}`);
        const rec = buildRecord(m, detail, event);
        if (!rec) {
          counts.noStats++; // not cached on purpose: a later run will try again
          return;
        }
        await writeFile(file, JSON.stringify(rec));
        counts.fetched++;
      } catch (err) {
        counts.failed++;
        log(`  ! ${tour} match ${m.id}: ${err.message}`);
      }
    }),
  );
  return counts;
}

async function fetchTour(tour, maxEvents) {
  const schedule = await getJson(`/${tour}/schedule`);
  const ids = [...new Set((schedule?.current_season ?? []).flatMap((month) => month.event_ids ?? []))];
  const now = Date.now();

  const details = await Promise.all(ids.map((id) => getJson(`/${tour}/events/${id}`)));
  let events = details.filter(
    (e) =>
      e &&
      Number.isFinite(Date.parse(e.start_date)) &&
      Date.parse(e.start_date) <= now &&
      !(/doubles/i.test(e.match_type ?? "") && !/singles/i.test(e.match_type ?? "")),
  );
  events.sort((x, y) => Date.parse(y.start_date) - Date.parse(x.start_date));
  if (maxEvents) events = events.slice(0, maxEvents);

  await mkdir(path.join(CACHE, tour), { recursive: true });
  const totals = { events: events.length, singles: 0, fetched: 0, cached: 0, resurfaced: 0, noStats: 0, failed: 0 };
  await Promise.all(
    events.map(async (event) => {
      const c = await fetchEvent(tour, event);
      for (const k of Object.keys(c)) if (k !== "singles") totals[k] += c[k];
      totals.singles += c.singles;
      log(`[${tour}] ${event.id} ${event.name}: ${c.singles} final singles, ${c.fetched} fetched, ${c.cached} cached, ${c.noStats} no stats${c.failed ? `, ${c.failed} failed` : ""}`);
    }),
  );
  return totals;
}

async function cacheBytes(dir) {
  let total = 0;
  const { readdir } = await import("node:fs/promises");
  let entries = [];
  try {
    entries = await readdir(dir);
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e);
    const s = await stat(p);
    total += s.isDirectory() ? await cacheBytes(p) : s.size;
  }
  return total;
}

async function main() {
  const { tours, maxEvents } = parseArgs(process.argv.slice(2));
  const updated = new Date().toISOString();
  log(`tennis fetch ${updated} season ${SEASON} tours ${tours.join(",")}${maxEvents ? ` max-events ${maxEvents}` : ""}`);

  const fetchTotals = {};
  for (const tour of tours) fetchTotals[tour] = await fetchTour(tour, maxEvents);

  // Standings and both tours' cache always feed the output, so a one-tour run still writes full files.
  const perTour = {};
  for (const tour of TOURS) {
    const standings = await getJson(`/${tour}/standings`);
    if (!Array.isArray(standings) || standings.length === 0) throw new Error(`no standings for ${tour}`);
    const records = await loadRecords(CACHE, tour, SEASON);
    const { players, diag } = seasonTotals(records);
    perTour[tour] = { records, totals: players, standings, diag };
  }

  // Sanity check: service points won + return points won should equal points won, per player.
  log("");
  log("sanity check (player 1 of each match; estimate = servicePointsWon + returnPointsWon, expect within +-3 of points_won)");
  for (const tour of TOURS) {
    const d = perTour[tour].diag;
    for (const s of d.sanity) {
      log(`  [${tour}] ${s.date} ${s.p1} v ${s.p2} (${s.event}): T=${s.total} P1=${s.p1Points} S1=${s.S1} S2=${s.S2} estimate=${s.estimate}${s.fallback ? " (even-split fallback)" : ""}`);
    }
    log(`  [${tour}] ${d.records} matches: max deviation ${round1(d.maxDeviation)}, outside +-3: ${d.outsideTolerance} player-sides, even-split fallbacks: ${d.fallbacks}, surface 'other' sides: ${d.other}`);
  }

  const out = buildOutputs(perTour, SEASON, updated);
  if (out.collisions.length) log(`warning: ${out.collisions.length} player ids appear on both tours; results.json keys may clash`);

  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, "players.json"), JSON.stringify(out.players));
  await writeFile(path.join(OUT, "rankings.json"), JSON.stringify(out.rankings));
  await writeFile(path.join(OUT, "results.json"), JSON.stringify(out.results));
  const sf = await writeSeasonFiles(OUT, perTour);
  log(`wrote ${sf.players} player season files and ${sf.events} events`);
  const race = await writeRace(OUT, perTour, updated);
  log(`race: men #1 ${race.men?.rows[0]?.name} ${race.men?.rows[0]?.points}, women #1 ${race.women?.rows[0]?.name} ${race.women?.rows[0]?.points}`);

  log("");
  for (const tour of TOURS) {
    const label = tour === "atp" ? "men" : "women";
    const t = fetchTotals[tour];
    const recs = perTour[tour].records.length;
    log(`${label}: ${t ? `${t.events} events fetched this run, ${t.singles} final singles this run (${t.fetched} new, ${t.cached} cached, ${t.noStats} without stats, ${t.failed} failed)` : "not fetched this run"}; ${recs} season records in cache; ${out.players.rows.filter((r) => r.tour === label).length} players`);
  }
  log(`wrote ${path.relative(process.cwd(), OUT)}/{players,rankings,results}.json; cache ${(await cacheBytes(CACHE) / 1024 / 1024).toFixed(2)} MB`);
}

const round1 = (x) => Math.round(x * 10) / 10;

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
