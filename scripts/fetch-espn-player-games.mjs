// Player game-by-game box scores and roster bios from ESPN's public site API.
//
// Outputs:
//   public/data/espn-rosters-2027.json   jersey, position, height, weight, class, hometown per team
//   .cache/espn-player-games-2027.json   one slim box score per completed D-I game (incremental)
//
// Incremental: completed games already in the cache are never re-fetched, and rosters
// refresh at most every 3 days. Failures are logged and skipped so one bad game can't
// block the build.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { derivePbp } from "./lib/espn-pbp.mjs";

const API = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";
const SEASON_START = "2026-11-01";
const ROSTER_PATH = "public/data/espn-rosters-2027.json";
const GAMES_PATH = ".cache/espn-player-games-2027.json";
const PBP_DIR = ".cache/espn-pbp-2027"; // one gzipped file per Eastern day: { events: { <id>: derived } }
const CONCURRENCY = 6;

const readJson = async (path, fallback) => { try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJson(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "d1-hoops-analytics (github.com/shaincarrasco/D1-Basketball-Analytics)" } });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    if (attempt >= 3) { console.warn(`[espn] giving up on ${url}: ${error.message}`); return null; }
    await sleep(800 * attempt);
    return getJson(url, attempt + 1);
  }
}
async function pool(items, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const etDay = d => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const split = v => { const [m, a] = String(v ?? "").split("-").map(Number); return [Number.isFinite(m) ? m : null, Number.isFinite(a) ? a : null]; };

// ---------- rosters ----------
const directory = await readJson("public/data/team-directory.json", { teams: [] });
const rosters = await readJson(ROSTER_PATH, { fetchedAt: null, teams: {} });
const rosterAgeDays = rosters.fetchedAt ? (Date.now() - new Date(rosters.fetchedAt).getTime()) / 864e5 : Infinity;
if (rosterAgeDays > 3 || process.env.ESPN_FORCE_ROSTERS === "1") {
  const teams = {};
  await pool(directory.teams ?? [], async team => {
    const data = await getJson(`${API}/teams/${team.id}/roster`);
    if (!data?.athletes) return;
    teams[team.id] = data.athletes.map(a => ({
      id: String(a.id), name: a.displayName ?? a.fullName, jersey: a.jersey ?? null, pos: a.position?.abbreviation ?? null,
      ht: a.displayHeight ?? null, wt: num(a.weight), year: a.experience?.abbreviation ?? null,
      home: a.birthPlace?.displayText ?? null,
    }));
  });
  if (Object.keys(teams).length > 100) {
    await writeFile(ROSTER_PATH, JSON.stringify({ provider: "ESPN", fetchedAt: new Date().toISOString(), teams }) + "\n");
    console.log(`[espn] Rosters for ${Object.keys(teams).length} teams saved.`);
  } else console.warn("[espn] Roster fetch returned too few teams; keeping the previous file.");
} else console.log(`[espn] Rosters are ${rosterAgeDays.toFixed(1)} days old; skipping refresh.`);

// ---------- game box scores ----------
const cache = await readJson(GAMES_PATH, { events: {}, completeDays: [] });
cache.events ??= {}; cache.completeDays ??= [];
const completeDays = new Set(cache.completeDays);
const today = etDay(new Date());
const days = [];
for (let d = new Date(`${SEASON_START}T12:00:00Z`); etDay(d) <= today; d = new Date(d.getTime() + 864e5)) days.push(etDay(d));

// Play-by-play summaries already derived, by day.
await mkdir(PBP_DIR, { recursive: true });
const pbpByDay = new Map();
for (const f of await readdir(PBP_DIR)) {
  if (!f.endsWith(".json.gz")) continue;
  try { pbpByDay.set(f.slice(0, 10), JSON.parse(gunzipSync(await readFile(`${PBP_DIR}/${f}`)).toString("utf8"))); } catch { /* rebuild that day */ }
}
const hasPbp = (day, id) => Boolean(pbpByDay.get(day)?.events?.[id]);
const dirtyDays = new Set();
const pending = [];
await pool(days.filter(d => !completeDays.has(d)), async day => {
  const board = await getJson(`${API}/scoreboard?dates=${day.replace(/-/g, "")}&groups=50&limit=500`);
  if (!board?.events) return;
  let allDone = true;
  for (const ev of board.events) {
    const state = ev.status?.type?.state;
    if (state !== "post") { if (state !== "postponed" && !/postponed|canceled|cancelled/i.test(ev.status?.type?.name ?? "")) allDone = false; continue; }
    if (!cache.events[ev.id] || !hasPbp(day, ev.id)) pending.push({ id: ev.id, day });
  }
  // A day is "complete" once every game is final and it's at least a day old.
  if (allDone && day < today) completeDays.add(day);
});

// Cached games from finished days that still lack a play-by-play summary.
const queued = new Set(pending.map(p => p.id));
for (const [id, ev] of Object.entries(cache.events)) if (!hasPbp(ev.day, id) && !queued.has(id)) pending.push({ id, day: ev.day });

let fetched = 0;
await pool(pending, async ({ id, day }) => {
  const sum = await getJson(`${API}/summary?event=${id}`);
  const comp = sum?.header?.competitions?.[0];
  const box = sum?.boxscore?.players;
  if (!comp || !Array.isArray(box) || box.length !== 2) return;
  const sides = comp.competitors ?? [];
  const teams = box.map(t => {
    const me = sides.find(c => String(c.id) === String(t.team?.id));
    const opp = sides.find(c => String(c.id) !== String(t.team?.id));
    const stat = t.statistics?.[0];
    const keys = stat?.keys ?? [];
    const k = name => keys.indexOf(name);
    const players = (stat?.athletes ?? []).filter(a => !a.didNotPlay && Array.isArray(a.stats) && a.stats.length).map(a => {
      const s = a.stats;
      const [fgm, fga] = split(s[k("fieldGoalsMade-fieldGoalsAttempted")]);
      const [tpm, tpa] = split(s[k("threePointFieldGoalsMade-threePointFieldGoalsAttempted")]);
      const [ftm, fta] = split(s[k("freeThrowsMade-freeThrowsAttempted")]);
      return [String(a.athlete?.id), a.athlete?.displayName ?? "", a.starter ? 1 : 0, num(s[k("minutes")]), num(s[k("points")]),
        fgm, fga, tpm, tpa, ftm, fta, num(s[k("offensiveRebounds")]), num(s[k("defensiveRebounds")]), num(s[k("rebounds")]),
        num(s[k("assists")]), num(s[k("steals")]), num(s[k("blocks")]), num(s[k("turnovers")]), num(s[k("fouls")])];
    });
    return {
      teamId: String(t.team?.id), oppId: opp ? String(opp.id) : null, oppName: opp?.team?.location ?? opp?.team?.displayName ?? null,
      home: me?.homeAway === "home", neutral: comp.neutralSite === true,
      pts: num(me?.score), oppPts: num(opp?.score), players,
    };
  });
  cache.events[id] = { day, date: comp.date ?? null, teams };
  try {
    const derived = derivePbp(sum);
    if (derived) {
      if (!pbpByDay.has(day)) pbpByDay.set(day, { events: {} });
      pbpByDay.get(day).events[id] = derived;
      dirtyDays.add(day);
    }
  } catch (error) { console.warn(`[espn] play-by-play for ${id} skipped: ${error.message}`); }
  fetched++;
});

cache.completeDays = [...completeDays].sort();
cache.fields = ["athleteId", "name", "starter", "min", "pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "orb", "drb", "reb", "ast", "stl", "blk", "tov", "pf"];
cache.fetchedAt = new Date().toISOString();
await mkdir(".cache", { recursive: true });
await writeFile(GAMES_PATH, JSON.stringify(cache) + "\n");
for (const day of dirtyDays) await writeFile(`${PBP_DIR}/${day}.json.gz`, gzipSync(JSON.stringify(pbpByDay.get(day))));
console.log(`[espn] ${fetched} new box scores (${Object.keys(cache.events).length} cached across ${cache.completeDays.length} complete days).`);
