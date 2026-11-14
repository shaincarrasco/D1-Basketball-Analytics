// Past-season history: the last ten completed seasons (2016–17 to 2025–26), fetched once from
// College Basketball Data and cached as one compact file per season in public/data/history/.
// A finished season never changes, so later runs skip every season already saved (bump
// FORMAT_VERSION only if the summary below changes; that re-fetches every season once).
//
// Per season it makes 1 /ratings/adjusted call and 5 date-windowed /games calls (each call
// returns at most 3,000 games; a window that hits the cap is split in two). Ten seasons cost
// ~60 calls once, against the free tier's 1,000 calls a month; later runs cost 0.
//
// Non-fatal by design: a missing key, an HTTP error or a short payload logs a warning and keeps
// whatever is already cached. Nothing here is invented: a field the provider doesn't give stays null.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const FORMAT_VERSION = 1;
export const FIRST_SEASON = 2017;
export const LAST_SEASON = 2026; // the 2025–26 season; 2026–27 is the live season
const DIR = "public/data/history";
const API = "https://api.collegebasketballdata.com";
const MAX_CALLS = Number(process.env.HISTORY_MAX_CALLS) > 0 ? Number(process.env.HISTORY_MAX_CALLS) : 80;
const ROW_CAP = 3000;

export const seasonLabel = s => `${s - 1}–${String(s).slice(2)}`;
const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const r1 = v => (v === null ? null : Math.round(v * 10) / 10);

/* ------------------------------------------------------------------ fetching */

class HttpError extends Error {
  constructor(status, what) { super(`HTTP ${status} on ${what}`); this.status = status; }
}

function makeClient(key, budget) {
  let calls = 0;
  async function get(path, params) {
    if (calls >= budget) throw new Error(`call budget of ${budget} reached`);
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    calls++;
    const res = await fetch(url, { headers: { Authorization: "Bearer " + key, Accept: "application/json" } });
    if (!res.ok) throw new HttpError(res.status, path);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error(`unexpected payload from ${path}`);
    return rows;
  }
  return { get, used: () => calls };
}

/** Date windows covering a season (Oct 15 → Apr 30). Monthly, so none comes near the 3,000-game cap. */
function seasonWindows(season) {
  const y0 = season - 1, y1 = season;
  return [
    [`${y0}-10-15T00:00:00Z`, `${y0}-11-30T23:59:59Z`],
    [`${y0}-12-01T00:00:00Z`, `${y0}-12-31T23:59:59Z`],
    [`${y1}-01-01T00:00:00Z`, `${y1}-01-31T23:59:59Z`],
    [`${y1}-02-01T00:00:00Z`, `${y1}-02-${y1 % 4 === 0 ? 29 : 28}T23:59:59Z`],
    [`${y1}-03-01T00:00:00Z`, `${y1}-04-30T23:59:59Z`],
  ];
}

async function fetchGames(client, season, start, end, depth = 0) {
  const rows = await client.get("/games", { season, startDateRange: start, endDateRange: end });
  if (rows.length < ROW_CAP || depth >= 2) {
    if (rows.length >= ROW_CAP) console.warn(`[history] ${season} ${start.slice(0, 10)}…${end.slice(0, 10)} still hit the ${ROW_CAP}-game cap; some games may be missing.`);
    return rows;
  }
  const mid = new Date((Date.parse(start) + Date.parse(end)) / 2);
  const a = new Date(mid); a.setUTCHours(23, 59, 59, 0);
  const b = new Date(a.getTime() + 1000);
  return [...await fetchGames(client, season, start, a.toISOString(), depth + 1), ...await fetchGames(client, season, b.toISOString(), end, depth + 1)];
}

/* ------------------------------------------------------------------ summarising (pure) */

const NATIONAL = [
  [/\bNCAA\b|Men's Basketball Championship/i, "NCAA"],
  [/\bNIT\b|National Invitation/i, "NIT"],
  [/\bCBI\b|College Basketball Invitational/i, "CBI"],
  [/\bCIT\b|CollegeInsider/i, "CIT"],
  [/Crown/i, "Crown"],
  [/Vegas 16/i, "Vegas 16"],
  [/Basketball Classic|\bTBC\b/i, "TBC"],
];
const lateSeason = iso => { const m = new Date(iso).getUTCMonth(); return m === 2 || m === 3; }; // March or April
/** National postseason event of a game (NCAA, NIT, ...), or null. Early-season events such as the
 *  "NIT Season Tip-Off" are excluded by date. */
function nationalEvent(g) {
  if (!lateSeason(g.startDate)) return null;
  const text = `${g.tournament ?? ""} ${g.gameNotes ?? ""}`;
  for (const [re, name] of NATIONAL) if (re.test(text)) return name;
  if (g.seasonType === "postseason" && !(g.conferenceGame && g.homeConference === g.awayConference)) return g.tournament?.trim() || "Postseason";
  return null;
}
/** Conference tournament game, as marked by the provider (postseason type, tournament name or notes). */
function providerConfTourney(g) {
  if (!g.conferenceGame || g.homeConference !== g.awayConference || !lateSeason(g.startDate) || nationalEvent(g)) return false;
  return g.seasonType === "postseason" || !!g.tournament?.trim() || /tournament|championship/i.test(g.gameNotes ?? "");
}
const etDay = iso => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
const NCAA_ROUNDS = ["First Four", "Round of 64", "Round of 32", "Sweet 16", "Elite Eight", "Final Four", "Runner-up"];

/** Single-elimination champion: the one team with no losses whose every rival has exactly one.
 *  An unfinished or cancelled bracket (several teams still unbeaten) gives null. */
function bracketChampion(games) {
  const rec = new Map();
  const add = (id, won) => { const r = rec.get(id) ?? { w: 0, l: 0 }; won ? r.w++ : r.l++; rec.set(id, r); };
  for (const g of games) { add(g.win, true); add(g.lose, false); }
  const unbeaten = [...rec].filter(([, r]) => r.l === 0);
  if (unbeaten.length !== 1 || unbeaten[0][1].w === 0) return null;
  return [...rec].every(([id, r]) => id === unbeaten[0][0] || r.l === 1) ? unbeaten[0][0] : null;
}

/**
 * Builds one season's compact summary from raw CBBD rows.
 * ratings: /ratings/adjusted rows; games: /games rows (any season type).
 */
export function summarizeSeason(season, ratingRows, gameRows) {
  const notes = [];
  const rated = ratingRows.map(r => ({
    id: Number.isInteger(r?.teamId) ? r.teamId : null, team: typeof r?.team === "string" ? r.team : null, conf: r?.conference ?? null,
    o: num(r?.offensiveRating), d: num(r?.defensiveRating), net: num(r?.netRating),
    rk: num(r?.rankings?.net), ork: num(r?.rankings?.offense), drk: num(r?.rankings?.defense),
  })).filter(t => t.id !== null && t.team && t.o !== null && t.d !== null);
  for (const t of rated) if (t.net === null) t.net = t.o - t.d;
  // Rank by net among the rated teams unless the provider ranked every team itself.
  if (rated.some(t => t.rk === null)) {
    [...rated].sort((a, b) => b.net - a.net).forEach((t, i) => { t.rk = i + 1; });
    [...rated].sort((a, b) => b.o - a.o).forEach((t, i) => { t.ork = i + 1; });
    [...rated].sort((a, b) => a.d - b.d).forEach((t, i) => { t.drk = i + 1; });
  }
  const ids = new Set(rated.map(t => t.id));
  const confOf = new Map(rated.map(t => [t.id, t.conf]));

  // Completed games involving at least one rated (D-I) team; exhibitions excluded.
  const seen = new Set();
  const games = [];
  for (const g of gameRows) {
    if (!g || seen.has(g.id) || g.seasonType === "preseason") continue;
    const hp = num(g.homePoints), ap = num(g.awayPoints);
    if (hp === null || ap === null || hp === ap || (g.status && String(g.status).toLowerCase() !== "final")) continue;
    if (!ids.has(g.homeTeamId) && !ids.has(g.awayTeamId)) continue;
    seen.add(g.id);
    games.push({ ...g, win: hp > ap ? g.homeTeamId : g.awayTeamId, lose: hp > ap ? g.awayTeamId : g.homeTeamId });
  }
  games.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));

  // Conference tournament games: the provider's markers first; where a conference has none, a
  // fallback (late-season conference game at a neutral site, or a third meeting) with a note.
  const confTourney = new Set();
  const markedConfs = new Set();
  for (const g of games) if (providerConfTourney(g)) { confTourney.add(g.id); markedConfs.add(g.homeConference); }
  const meetings = new Map();
  const fallbackConfs = new Set();
  for (const g of games) {
    if (!g.conferenceGame || g.homeConference !== g.awayConference) continue;
    const pair = [g.homeTeamId, g.awayTeamId].sort().join(":");
    const before = meetings.get(pair) ?? 0;
    meetings.set(pair, before + 1);
    if (markedConfs.has(g.homeConference) || confTourney.has(g.id) || !lateSeason(g.startDate) || nationalEvent(g)) continue;
    if (g.neutralSite || before >= 2) { confTourney.add(g.id); fallbackConfs.add(g.homeConference); }
  }
  // Campus-site early rounds: a late-season day on which every conference game knocked its loser
  // out (no later conference game). On the last regular-season day most losers still play on.
  const lastConfGame = new Map();
  for (const g of games) if (g.conferenceGame && g.homeConference === g.awayConference && !nationalEvent(g)) for (const id of [g.homeTeamId, g.awayTeamId]) lastConfGame.set(id, g.startDate);
  const days = new Map();
  for (const g of games) {
    if (!g.conferenceGame || g.homeConference !== g.awayConference || markedConfs.has(g.homeConference) || !lateSeason(g.startDate) || nationalEvent(g)) continue;
    const k = `${g.homeConference}|${etDay(g.startDate)}`;
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(g);
  }
  for (const list of days.values()) {
    if (list.every(g => lastConfGame.get(g.lose) === g.startDate)) for (const g of list) { confTourney.add(g.id); fallbackConfs.add(g.homeConference); }
  }
  if (fallbackConfs.size) notes.push(`Conference tournament games were not marked by the provider for ${fallbackConfs.size} conference${fallbackConfs.size === 1 ? "" : "s"}; they were picked out as late-season neutral-site games or third meetings, so a conference record there can be off by a game.`);

  // Records.
  const rec = new Map(rated.map(t => [t.id, { w: 0, l: 0, cw: 0, cl: 0 }]));
  for (const g of games) {
    const isConf = g.conferenceGame && g.homeConference === g.awayConference && !confTourney.has(g.id) && !nationalEvent(g);
    for (const [id, won] of [[g.win, true], [g.lose, false]]) {
      const r = rec.get(id);
      if (!r) continue;
      won ? r.w++ : r.l++;
      if (isConf) won ? r.cw++ : r.cl++;
    }
  }

  // National postseason.
  const byEvent = new Map();
  for (const g of games) { const ev = nationalEvent(g); if (ev) { if (!byEvent.has(ev)) byEvent.set(ev, []); byEvent.get(ev).push(g); } }
  const post = new Map();
  const ncaa = byEvent.get("NCAA") ?? [];
  let ncaaChampion = null;
  if (ncaa.length) {
    // First Four = games before the first day with 8+ tournament games (the round of 64).
    const perDay = new Map();
    for (const g of ncaa) perDay.set(etDay(g.startDate), (perDay.get(etDay(g.startDate)) ?? 0) + 1);
    const r64Day = [...perDay].sort((a, b) => a[0].localeCompare(b[0])).find(([, n]) => n >= 8)?.[0] ?? null;
    const last = new Map();
    let ok = true;
    for (const g of ncaa) {
      const round = r64Day && etDay(g.startDate) < r64Day ? 0 : Math.max(last.get(g.homeTeamId) ?? 0, last.get(g.awayTeamId) ?? 0) + 1;
      if (round > 6) ok = false;
      last.set(g.homeTeamId, round); last.set(g.awayTeamId, round);
      for (const side of ["home", "away"]) {
        const id = g[side + "TeamId"];
        if (!ids.has(id)) continue;
        const p = post.get(id) ?? { ev: "NCAA", seed: null, res: null, w: 0, l: 0 };
        p.seed = p.seed ?? num(g[side + "Seed"]);
        id === g.win ? p.w++ : p.l++;
        p.res = id === g.win ? (round === 6 ? "Champion" : null) : NCAA_ROUNDS[round] ?? null;
        post.set(id, p);
      }
      if (round === 6) ncaaChampion = g.win;
    }
    if (!ok) { for (const p of post.values()) p.res = null; ncaaChampion = null; notes.push("NCAA tournament rounds could not be worked out from the game list; only wins and losses are shown."); }
    if (ncaa.length < 63) notes.push(`Only ${ncaa.length} NCAA tournament games were in the provider's list, so some results may be missing.`);
  } else if (season === 2020) {
    notes.push("There was no 2020 postseason: the NCAA tournament and NIT were canceled in March 2020 (COVID-19).");
  }
  for (const [ev, list] of byEvent) {
    if (ev === "NCAA") continue;
    const final = list[list.length - 1];
    const champ = bracketChampion(list) === final.win ? final.win : null;
    for (const g of list) for (const id of [g.win, g.lose]) {
      if (!ids.has(id) || post.has(id) && post.get(id).ev !== ev) continue;
      const p = post.get(id) ?? { ev, seed: null, res: null, w: 0, l: 0 };
      id === g.win ? p.w++ : p.l++;
      post.set(id, p);
    }
    if (champ !== null && post.has(champ)) post.get(champ).res = "Champion";
    if (champ !== null && post.has(final.lose)) post.get(final.lose).res = "Runner-up";
  }

  // Conference finish, best regular-season record, tournament champion.
  const confs = new Map();
  for (const t of rated) { if (!confs.has(t.conf)) confs.set(t.conf, []); confs.get(t.conf).push(t.id); }
  const pct = id => { const r = rec.get(id); return r.cw + r.cl ? r.cw / (r.cw + r.cl) : null; };
  const finish = new Map();
  const conferences = [];
  for (const [conf, list] of confs) {
    const withGames = list.filter(id => pct(id) !== null);
    for (const id of withGames) {
      const better = withGames.filter(o => pct(o) > pct(id)).length, tied = withGames.filter(o => o !== id && pct(o) === pct(id)).length;
      finish.set(id, [better + 1, tied > 0, withGames.length]);
    }
    const top = withGames.length ? Math.max(...withGames.map(pct)) : null;
    const best = top === null ? [] : withGames.filter(id => pct(id) === top);
    const tGames = games.filter(g => confTourney.has(g.id) && g.homeConference === conf && confOf.get(g.win) === conf && confOf.get(g.lose) === conf);
    const champ = tGames.length ? bracketChampion(tGames) : null;
    conferences.push({ conf, teams: list.length, best, bestRec: best.length ? `${rec.get(best[0]).cw}–${rec.get(best[0]).cl}` : null, tourney: champ });
  }
  conferences.sort((a, b) => String(a.conf).localeCompare(String(b.conf)));
  const tourneyChamps = new Set(conferences.map(c => c.tourney).filter(v => v !== null));

  const teams = rated.sort((a, b) => a.rk - b.rk).map(t => {
    const r = rec.get(t.id), f = finish.get(t.id), p = post.get(t.id) ?? null;
    return {
      id: t.id, team: t.team, conf: t.conf, w: r.w, l: r.l, cw: r.cw, cl: r.cl,
      o: r1(t.o), d: r1(t.d), net: r1(t.net), rk: t.rk, ork: t.ork, drk: t.drk,
      cf: f ? `${f[1] ? "T-" : ""}${f[0]}` : null, cn: f ? f[2] : null,
      ct: tourneyChamps.has(t.id) ? 1 : 0,
      post: p,
    };
  });
  return {
    formatVersion: FORMAT_VERSION, provider: "College Basketball Data (/ratings/adjusted, /games)", season, label: seasonLabel(season),
    teamCount: teams.length, gamesCounted: games.length, ncaaChampion, conferences, notes, teams,
  };
}

/* ------------------------------------------------------------------ cache + main */

/** Compact but diff-friendly: one team or conference per line. */
export function serialize(summary) {
  const { teams, conferences, ...head } = summary;
  const lines = Object.entries(head).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  const list = (k, arr) => ` ${JSON.stringify(k)}: [\n${arr.map(x => "  " + JSON.stringify(x)).join(",\n")}\n ]`;
  return `{\n${[...lines, list("conferences", conferences), list("teams", teams)].join(",\n")}\n}\n`;
}

async function cachedSeasons() {
  const ok = new Set();
  let files = [];
  try { files = await readdir(DIR); } catch { return ok; }
  for (const f of files) {
    const m = /^(\d{4})\.json$/.exec(f);
    if (!m) continue;
    try {
      const d = JSON.parse(await readFile(`${DIR}/${f}`, "utf8"));
      if (d.formatVersion === FORMAT_VERSION && d.season === Number(m[1]) && (d.teams ?? []).length >= 300) ok.add(d.season);
    } catch { /* unreadable: refetch */ }
  }
  return ok;
}

export async function main() {
  const wanted = [];
  for (let s = LAST_SEASON; s >= FIRST_SEASON; s--) wanted.push(s);
  const cached = await cachedSeasons();
  const missing = wanted.filter(s => !cached.has(s));
  if (!missing.length) { console.log(`[history] All ${wanted.length} seasons (${seasonLabel(FIRST_SEASON)} to ${seasonLabel(LAST_SEASON)}) already cached. CBBD calls this run: 0.`); return; }
  const key = process.env.CBBD_API_KEY;
  if (!key) { console.warn(`[history] CBBD_API_KEY missing; ${cached.size} season(s) cached, ${missing.length} not fetched yet. CBBD calls this run: 0.`); return; }

  await mkdir(DIR, { recursive: true });
  const client = makeClient(key, MAX_CALLS);
  const saved = [];
  for (const season of missing) {
    if (client.used() + 6 > MAX_CALLS) { console.warn(`[history] Stopping before ${seasonLabel(season)}: this run's budget is ${MAX_CALLS} calls. The rest come next run.`); break; }
    const before = client.used();
    try {
      const ratings = await client.get("/ratings/adjusted", { season });
      if (ratings.length < 300) throw new Error(`only ${ratings.length} adjusted-rating rows`);
      const games = [];
      for (const [start, end] of seasonWindows(season)) games.push(...await fetchGames(client, season, start, end));
      const summary = summarizeSeason(season, ratings, games);
      if (summary.teamCount < 300) throw new Error(`only ${summary.teamCount} usable teams`);
      if (summary.gamesCounted < 2500) throw new Error(`only ${summary.gamesCounted} completed games`);
      await writeFile(`${DIR}/${season}.json`, serialize({ ...summary, fetchedAt: new Date().toISOString() }));
      saved.push(season);
      console.log(`[history] Saved ${seasonLabel(season)}: ${summary.teamCount} teams, ${summary.gamesCounted} games, ${client.used() - before} calls${summary.notes.length ? ` (${summary.notes.length} note${summary.notes.length === 1 ? "" : "s"})` : ""}.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[history] Could not fetch ${seasonLabel(season)}; keeping the cache as is. ${msg}`);
      if (error instanceof HttpError && [401, 403, 429].includes(error.status)) { console.warn("[history] Stopping: the key was refused or the monthly quota is used up."); break; }
      if (/budget/.test(msg)) break;
    }
  }
  console.log(`[history] CBBD calls this run: ${client.used()} (budget ${MAX_CALLS}). Saved ${saved.length} season(s); ${cached.size + saved.length} of ${wanted.length} cached.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); } catch (error) { console.warn("[history] Unexpected error; keeping the cache as is. " + (error instanceof Error ? error.message : error)); }
}
