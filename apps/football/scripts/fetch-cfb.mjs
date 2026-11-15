#!/usr/bin/env node
// Builds the college football app data from ESPN: fetches each new final game's summary into a compact
// cache, then writes players.json, teams.json, games.json, rankings.json, p/ and g/ under public/data/app.
//
// Usage: node apps/football/scripts/fetch-cfb.mjs [--weeks N] [--season YYYY]
//   --weeks   only the last N weeks that have completed games (quick runs); fetch and output cover those weeks
//   --season  season year; must be the current season (the feeds serve only the current season)
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espn from "./lib/espn.mjs";
import { extractGame } from "./lib/extract.mjs";
import { buildOutputs } from "./lib/build.mjs";
import { checkReport } from "./lib/checks.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(APP, "data-cache");
const GAMES = path.join(CACHE, "games");
const ROSTERS = path.join(CACHE, "rosters");
const OUT = path.join(APP, "public", "data", "app");
const ROSTER_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const log = (...a) => console.log(...a);

// The cache is committed to the repo, so it is stored gzipped (about a sixth of the size).
const gz = (base) => `${base}.json.gz`;
async function readCache(base) {
  if (existsSync(gz(base))) return JSON.parse(gunzipSync(await readFile(gz(base))).toString("utf8"));
  if (existsSync(`${base}.json`)) {                         // older plain-JSON entry: migrate it
    const v = JSON.parse(await readFile(`${base}.json`, "utf8"));
    await writeCache(base, v);
    await rm(`${base}.json`);
    return v;
  }
  return null;
}
const writeCache = (base, v) => writeFile(gz(base), gzipSync(JSON.stringify(v), { level: 9 }));
const cachedGame = (id) => existsSync(gz(path.join(GAMES, id))) || existsSync(path.join(GAMES, `${id}.json`));

function parseArgs(argv) {
  const value = (name) => {
    const i = argv.indexOf(name);
    if (i < 0) return undefined;
    if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) throw new Error(`${name} needs a value`);
    return argv[i + 1];
  };
  const w = value("--weeks");
  const weeks = w === undefined ? null : Number(w);
  if (w !== undefined && (!Number.isInteger(weeks) || weeks < 1)) throw new Error("--weeks must be a positive integer");
  const s = value("--season");
  const season = s === undefined ? null : Number(s);
  if (s !== undefined && !/^\d{4}$/.test(s)) throw new Error("--season must be a year such as 2026");
  return { weeks, season };
}

async function dirBytes(dir) {
  let total = 0;
  if (!existsSync(dir)) return 0;
  for (const e of await readdir(dir)) {
    const p = path.join(dir, e);
    const s = await stat(p);
    total += s.isDirectory() ? await dirBytes(p) : s.size;
  }
  return total;
}

/** Scoreboards for every regular week up to the current one, plus any postseason events. */
async function loadWeeks() {
  const cur = await espn.fetchScoreboard(2);
  const season = cur.season.year;
  const currentWeek = cur.week.number;
  const regular = [];
  for (let w = 1; w <= currentWeek; w++) {
    const sb = w === currentWeek ? cur : await espn.fetchScoreboard(2, w);
    regular.push({ st: 2, week: w, label: `Week ${w}`, events: sb.events ?? [] });
  }
  const post = await espn.fetchScoreboard(3);
  const byN = new Map();
  for (const ev of post?.events ?? []) {
    const n = ev.week?.number ?? 1;
    byN.set(n, [...(byN.get(n) ?? []), ev]);
  }
  const postseason = [...byN.keys()].sort((a, b) => a - b).map((n) => ({
    st: 3,
    week: 100 + n, // postseason weeks sit above the regular-season numbers
    label: `Postseason ${n}`,
    events: byN.get(n),
  }));
  return { season, currentWeek, weeks: [...regular, ...postseason] };
}

async function loadRoster(teamId) {
  const base = path.join(ROSTERS, teamId);
  const cached = await readCache(base);
  if (cached && Date.now() - cached.fetched < ROSTER_TTL_MS) return { items: cached.items, cached: true };
  try {
    const items = await espn.fetchRoster(teamId);
    await writeCache(base, { fetched: Date.now(), items });
    return { items, cached: false };
  } catch (err) {
    if (cached) return { items: cached.items, cached: true };   // offline: a stale roster beats none
    throw err;
  }
}

async function main() {
  const { weeks: lastN, season: wantSeason } = parseArgs(process.argv.slice(2));
  const updated = new Date().toISOString();
  await mkdir(GAMES, { recursive: true });
  await mkdir(ROSTERS, { recursive: true });

  // Scoreboards, teams and polls are saved after each good fetch so the site can still be
  // rebuilt from the cache alone when ESPN can't be reached (the deploy treats this run as non-fatal).
  let season, currentWeek, games, fbs, polls;
  try {
    const w = await loadWeeks();
    ({ season, currentWeek } = w);
    games = w.weeks.map((x) => ({ ...x, events: undefined, games: x.events.map(espn.toGame) }));
    fbs = await espn.fetchFbsTeams();
    polls = await espn.fetchPolls();
    await writeCache(path.join(CACHE, "meta"), { season, currentWeek, games, fbs: [...fbs.entries()], polls });
  } catch (err) {
    const meta = await readCache(path.join(CACHE, "meta"));
    if (!meta) throw err;
    log(`! ESPN unreachable (${err.message}); rebuilding from the cached scoreboards, teams and polls`);
    ({ season, currentWeek, games, polls } = meta);
    fbs = new Map(meta.fbs);
  }
  if (wantSeason !== null && wantSeason !== season) {
    throw new Error(`--season ${wantSeason}: the feeds serve only the current season (${season})`);
  }
  const finals = games.filter((w) => w.games.some((g) => g.status === "post"));
  const scope = lastN ? finals.slice(-lastN) : finals;
  log(`cfb fetch ${updated} season ${season}: regular weeks 1..${currentWeek}, postseason weeks ${games.filter((w) => w.st === 3).length}`);
  log(`scoreboards: ${games.reduce((n, w) => n + w.games.length, 0)} games, ${games.reduce((n, w) => n + w.games.filter((g) => g.status === "post").length, 0)} final`);
  log(`scope: ${scope.length ? `${scope[0].label}..${scope[scope.length - 1].label}` : "none"} (${scope.length} weeks${lastN ? `, --weeks ${lastN}` : ""})`);

  log(`teams: ${fbs.size} FBS; polls: ${polls.map((p) => `${p.key} ${p.ranks.length}`).join(", ")}`);

  const scopeMeta = scope.flatMap((w) =>
    w.games.filter((g) => g.status === "post").map((g) => ({
      id: g.id, date: g.date, week: w.week, seasontype: w.st, home: g.home.id, away: g.away.id,
    })),
  );

  // Summaries: fetch only finished games missing from the cache.
  let fetched = 0;
  let cached = 0;
  let noData = 0;
  let failed = 0;
  const missing = scopeMeta.filter((m) => !cachedGame(m.id));
  cached = scopeMeta.length - missing.length;
  await Promise.all(
    missing.map(async (m) => {
      try {
        const sum = await espn.fetchSummary(m.id);
        if (!sum?.drives || !sum.boxscore) {
          noData++;
          return;
        }
        const rec = extractGame(sum, { id: m.id, season, week: m.week, seasontype: m.seasontype, date: m.date });
        await writeCache(path.join(GAMES, m.id), rec);
        fetched++;
      } catch (err) {
        failed++;
        log(`  ! game ${m.id}: ${err.message}`);
      }
      const done = fetched + noData + failed;
      if (done && done % 100 === 0) log(`  summaries ${done}/${missing.length}`);
    }),
  );
  log(`summaries: ${fetched} fetched, ${cached} cached, ${noData} without data, ${failed} failed`);

  // Rosters for FBS teams in scope (positions and jersey lookups).
  const teamIds = [...new Set(scopeMeta.flatMap((m) => [m.home, m.away]))].filter((id) => fbs.has(id));
  const rosters = new Map();
  let rosterFetched = 0;
  await Promise.all(
    teamIds.map(async (id) => {
      const r = await loadRoster(id);
      if (!r.cached) rosterFetched++;
      rosters.set(id, r.items);
    }),
  );
  log(`rosters: ${teamIds.length} FBS teams in scope, ${rosterFetched} fetched, ${teamIds.length - rosterFetched} cached`);

  const records = [];
  for (const m of scopeMeta) {
    const rec = await readCache(path.join(GAMES, m.id));
    if (rec) records.push(rec);
  }

  const out = buildOutputs({
    season,
    updated,
    records,
    teams: fbs,
    rosters,
    polls,
    weeks: games.map((w) => ({
      week: w.week,
      label: w.label,
      start: w.games.length ? w.games.map((g) => g.date).sort()[0].slice(0, 10) : null,
      games: w.games,
    })),
    currentWeek,
  });

  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, "players.json"), JSON.stringify(out.players));
  await writeFile(path.join(OUT, "teams.json"), JSON.stringify(out.teams));
  await writeFile(path.join(OUT, "games.json"), JSON.stringify(out.games));
  await writeFile(path.join(OUT, "rankings.json"), JSON.stringify(out.rankings));
  // Rewrite p/ and g/ whole so files for players or games outside this run's scope do not linger.
  await rm(path.join(OUT, "p"), { recursive: true, force: true });
  await rm(path.join(OUT, "g"), { recursive: true, force: true });
  await mkdir(path.join(OUT, "p"), { recursive: true });
  await mkdir(path.join(OUT, "g"), { recursive: true });
  for (const [id, f] of out.pFiles) await writeFile(path.join(OUT, "p", `${id}.json`), JSON.stringify(f));
  for (const [id, f] of out.gFiles) await writeFile(path.join(OUT, "g", `${id}.json`), JSON.stringify(f));

  log(`built: ${out.players.rows.length} player rows (${out.diag.dropped} dropped: no position), ${out.diag.events} parsed events, ${out.diag.unresolved} unresolved players`);
  log(`wrote ${path.relative(process.cwd(), OUT)}/{players,teams,games,rankings}.json, p/ (${out.pFiles.size}), g/ (${out.gFiles.size})`);
  const dirs = [
    { name: "p/", bytes: await dirBytes(path.join(OUT, "p")) },
    { name: "g/", bytes: await dirBytes(path.join(OUT, "g")) },
  ];
  log("");
  for (const line of checkReport(out, dirs)) log(line);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
