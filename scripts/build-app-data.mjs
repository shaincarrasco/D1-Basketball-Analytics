// Builds the compact, app-ready data layer the site reads.
//
// Inputs (all produced by the fetch scripts + build-power-ratings.mjs):
//   public/data/team-season-2027.json, games-season-2027.json, player-season-2027.json,
//   player-details-2027/*.json, team-directory.json, model-2027.json
// Outputs (public/data/app/):
//   meta.json, teams.json, conferences.json, players.json (columnar),
//   team/<slug>.json, games/index.json, games/<yyyy-mm-dd>.json
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { isD1Conference } from "./d1-conferences.mjs";
import { boxPossessions, loadPbp, solveRapm } from "./lib/pbp-analytics.mjs";
import { normalizeGames } from "./lib/game-status.mjs";

const OUT = "public/data/app";
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const [teamPayload, gamePayload, playerPayload, directory, model] = await Promise.all([
  readJson("public/data/team-season-2027.json"),
  readJson("public/data/games-season-2027.json"),
  readJson("public/data/player-season-2027.json"),
  readJson("public/data/team-directory.json").catch(() => ({ teams: [] })),
  readJson("public/data/model-2027.json"),
]);

const scorelessFinals = normalizeGames(gamePayload.games);
if (scorelessFinals) console.log(`[build-app-data] ${scorelessFinals} scoreless "final" game(s) treated as not played (scheduled or cancelled).`);

const espnRosters = await readJson("public/data/espn-rosters-2027.json").catch(() => ({ teams: {} }));
const sims = await readJson("public/data/sims-2027.json").catch(() => null);
const tvListings = await readJson("public/data/espn-tv-2027.json").catch(() => ({ events: {} }));
const feeds = await readJson("public/data/feeds-2027.json").catch(() => null);
const recruiting = await readJson("public/data/recruiting.json").catch(() => null);
const espnGames = await readJson(".cache/espn-player-games-2027.json").catch(() => ({ events: {} }));

// ---------- helpers ----------
const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const r = (v, d = 1) => (num(v) === null ? null : Math.round(v * 10 ** d) / 10 ** d);
const div = (a, b) => (num(a) !== null && num(b) !== null && b !== 0 ? a / b : null);
const slugify = s => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const etDate = iso => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
const normName = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const isD1 = c => isD1Conference(c);

// Canonical conference display names + slugs.
const CONF_NAMES = {
  "A-10": "Atlantic 10", ACC: "ACC", "Am. East": "America East", "America East": "America East", American: "American", ASUN: "ASUN",
  "Big 12": "Big 12", "Big East": "Big East", "Big Sky": "Big Sky", "Big South": "Big South", "Big Ten": "Big Ten", "Big West": "Big West",
  CAA: "CAA", CUSA: "Conference USA", Horizon: "Horizon", Ivy: "Ivy League", MAAC: "MAAC", Metro: "MAAC", MAC: "MAC", MEAC: "MEAC",
  "Mountain West": "Mountain West", MVC: "Missouri Valley", NEC: "NEC", OVC: "Ohio Valley", "Pac-12": "Pac-12", Patriot: "Patriot League",
  SEC: "SEC", SoCon: "SoCon", Southland: "Southland", Summit: "Summit League", "Sun Belt": "Sun Belt", SWAC: "SWAC", UAC: "United Athletic", WCC: "WCC",
};
const confName = c => CONF_NAMES[c] ?? c;
const confSlug = c => slugify(confName(c));

// ESPN directory: logos + abbreviations, matched on location with known aliases.
const ALIASES = { neworleans: "lsuneworleans", stthomasminnesota: "stthomas" };
const dirByLoc = new Map((directory.teams ?? []).map(t => [normName(t.location || t.displayName), t]));
const findDir = name => dirByLoc.get(normName(name)) ?? dirByLoc.get(ALIASES[normName(name)] ?? "") ?? null;

// ---------- teams ----------
const allTeamRecords = teamPayload.teams ?? [];
const d1Teams = allTeamRecords.filter(t => isD1(t.conference) && t.teamId != null);
const teamById = new Map(d1Teams.map(t => [String(t.teamId), t]));
const slugById = new Map();
const usedSlugs = new Set();
for (const t of d1Teams) {
  let s = slugify(t.team);
  if (usedSlugs.has(s)) s = `${s}-${t.teamId}`;
  usedSlugs.add(s);
  slugById.set(String(t.teamId), s);
}
const mu = model.leagueAverage, muT = model.leagueTempo, homeEdge = model.estimatedHomeEdge;
const pr = id => teamById.get(String(id))?.powerRatings ?? null;
const rankOf = id => pr(id)?.rank ?? null;

// Season four factors from provider totals.
const factors = s => {
  if (!s) return null;
  const fgm = num(s.fieldGoals?.made), fga = num(s.fieldGoals?.attempted), tpm = num(s.threePointFieldGoals?.made), tpa = num(s.threePointFieldGoals?.attempted);
  const twm = num(s.twoPointFieldGoals?.made), twa = num(s.twoPointFieldGoals?.attempted), ftm = num(s.freeThrows?.made), fta = num(s.freeThrows?.attempted);
  const orb = num(s.rebounds?.offensive), drb = num(s.rebounds?.defensive), tov = num(s.turnovers?.total), pts = num(s.points?.total);
  const poss = num(s.possessions) ?? (fga !== null && tov !== null && fta !== null ? fga - (orb ?? 0) + tov + 0.475 * fta : null);
  return { fgm, fga, tpm, tpa, twm, twa, ftm, fta, orb, drb, tov, pts, poss, ast: num(s.assists), stl: num(s.steals), blk: num(s.blocks),
    paint: num(s.points?.inPaint), fastBreak: num(s.points?.fastBreak), offTov: num(s.points?.offTurnovers) };
};
const profile = (own, opp) => {
  const a = factors(own), b = factors(opp);
  if (!a || !b) return null;
  return {
    eff: r(div(a.pts, a.poss) * 100), efg: r(div(a.fgm + 0.5 * a.tpm, a.fga) * 100), tov: r(div(a.tov, a.poss) * 100),
    orb: r(div(a.orb, a.orb + b.drb) * 100), ftr: r(div(a.fta, a.fga) * 100), threeRate: r(div(a.tpa, a.fga) * 100),
    threePct: r(div(a.tpm, a.tpa) * 100), twoPct: r(div(a.twm, a.twa) * 100), ftPct: r(div(a.ftm, a.fta) * 100),
    astRate: r(div(a.ast, a.fgm) * 100), blkRate: r(div(a.blk, b.twa) * 100), stlRate: r(div(a.stl, b.poss) * 100),
    paintShare: r(div(a.paint, a.pts) * 100), fastBreakShare: r(div(a.fastBreak, a.pts) * 100),
  };
};

const allGames = (gamePayload.games ?? []).filter(g => isD1(g.homeConference) || isD1(g.awayConference));
const preds = model.predictions ?? {};
const finals = allGames.filter(g => g.status === "final" && num(g.homeScore) !== null && num(g.awayScore) !== null);

// Per-team game logs (from the team's perspective).
const venueOf = (g, isHome) => (g.neutralSite ? "N" : isHome ? "H" : "A");
const quad = (oppRank, venue) => {
  if (!oppRank) return 4;
  const cut = { H: [30, 75, 160], N: [50, 100, 200], A: [75, 135, 240] }[venue];
  return oppRank <= cut[0] ? 1 : oppRank <= cut[1] ? 2 : oppRank <= cut[2] ? 3 : 4;
};
const boxByGameTeam = new Map();
for (const t of allTeamRecords) for (const row of t.gameStats ?? []) boxByGameTeam.set(`${row.gameId}:${row.teamId}`, row);
const teamLog = new Map(d1Teams.map(t => [String(t.teamId), []]));
for (const g of allGames) {
  for (const side of ["home", "away"]) {
    const id = String(side === "home" ? g.homeTeamId : g.awayTeamId);
    if (!teamLog.has(id)) continue;
    const isHome = side === "home";
    const oppId = String(isHome ? g.awayTeamId : g.homeTeamId);
    const oppD1 = isD1(isHome ? g.awayConference : g.homeConference);
    const venue = venueOf(g, isHome);
    const p = preds[g.id];
    const final = g.status === "final" && num(g.homeScore) !== null;
    const pts = isHome ? g.homeScore : g.awayScore, oppPts = isHome ? g.awayScore : g.homeScore;
    const box = boxByGameTeam.get(`${g.id}:${id}`);
    const a = factors(box?.teamStats), b = factors(box?.opponentStats);
    const poss = a?.poss && b?.poss ? (a.poss + b.poss) / 2 : null;
    const offEff = final && poss ? (pts / poss) * 100 : null, defEff = final && poss ? (oppPts / poss) * 100 : null;
    // Game performance: efficiency margin adjusted for this opponent and venue using current ratings.
    let perf = null;
    if (offEff !== null && oppD1 && pr(oppId)) {
      const o = pr(oppId), v = venue === "N" ? 0 : venue === "H" ? 1 : -1;
      perf = (offEff - (o.adjD - mu) - (v * homeEdge) / 2) - (defEff - (o.adjO - mu) + (v * homeEdge) / 2);
    }
    const oppRank = oppD1 ? rankOf(oppId) : null;
    teamLog.get(id).push({
      id: String(g.id), date: g.date, day: etDate(g.date), status: g.status, venue,
      opp: isHome ? g.awayTeam : g.homeTeam, oppId: oppD1 ? oppId : null, oppSlug: oppD1 ? slugById.get(oppId) ?? null : null,
      oppRank, oppConf: oppD1 ? (isHome ? g.awayConference : g.homeConference) : null, d1: oppD1,
      conf: g.conferenceGame === true, pts: final ? pts : null, oppPts: final ? oppPts : null,
      result: final ? (pts > oppPts ? "W" : "L") : null,
      wp: p ? r(isHome ? p.homeWinProb : 1 - p.homeWinProb, 3) : null,
      projPts: p ? r(isHome ? p.homePts : p.awayPts) : null, projOppPts: p ? r(isHome ? p.awayPts : p.homePts) : null,
      offEff: r(offEff), defEff: r(defEff), pace: r(poss ? poss * (40 / Math.max(40, box?.gameMinutes ?? 40)) : null), perf: r(perf),
      quad: oppD1 ? quad(oppRank, venue) : null,
    });
  }
}
for (const list of teamLog.values()) list.sort((a, b) => a.date.localeCompare(b.date));

const recordOf = (list, pred = () => true) => {
  const f = list.filter(x => x.result && pred(x));
  return [f.filter(x => x.result === "W").length, f.filter(x => x.result === "L").length];
};

const teamSummaries = d1Teams.map(t => {
  const id = String(t.teamId), p = t.powerRatings, log = teamLog.get(id) ?? [], dir = findDir(t.team);
  const finished = log.filter(x => x.result);
  const [w, l] = recordOf(log), [cw, cl] = recordOf(log, x => x.conf);
  let streak = null;
  if (finished.length) {
    const last = finished.at(-1).result; let n = 0;
    for (let i = finished.length - 1; i >= 0 && finished[i].result === last; i--) n++;
    streak = `${last}${n}`;
  }
  // Only games still on the calendar count toward projections and "next game".
  const upcoming = log.filter(x => !x.result && (x.status === "scheduled" || x.status === "in_progress"));
  const next = upcoming[0];
  // Expected wins over the remaining schedule using current ratings.
  const projWinsLeft = upcoming.reduce((s, x) => s + (x.wp ?? 0.5), 0);
  const confLeft = upcoming.filter(x => x.conf).reduce((s, x) => s + (x.wp ?? 0.5), 0);
  const q = [1, 2, 3, 4].map(n => recordOf(log, x => x.quad === n));
  return {
    id, slug: slugById.get(id), name: t.team, short: dir?.abbreviation ?? t.team.slice(0, 4).toUpperCase(), mascot: dir?.name ?? null,
    logo: dir?.logo ?? null, color: dir?.color ?? null, altColor: dir?.altColor ?? null, conf: t.conference, confName: confName(t.conference), confSlug: confSlug(t.conference),
    w, l, cw, cl, streak,
    rank: p?.rank ?? null, adjEM: r(p?.adjEM, 2), adjO: r(p?.adjO), adjD: r(p?.adjD), adjT: r(p?.tempo), sos: r(p?.sos, 2),
    adjORank: p?.adjORank ?? null, adjDRank: p?.adjDRank ?? null, adjTRank: p?.tempoRank ?? null, sosRank: p?.sosRank ?? null,
    sample: p?.sample ?? "Unrated", ratedGames: p?.games ?? 0,
    off: profile(t.teamStats, t.opponentStats), def: profile(t.opponentStats, t.teamStats),
    perf: finished.filter(x => x.perf !== null).map(x => x.perf),
    last: finished.slice(-10).map(x => ({ r: x.result, m: x.pts - x.oppPts })),
    quads: q, close: recordOf(log, x => Math.abs(x.pts - x.oppPts) <= 5),
    projW: r(w + projWinsLeft, 1), projL: r(l + (upcoming.length - projWinsLeft), 1),
    projCW: r(cw + confLeft, 1), projCL: r(cl + (upcoming.filter(x => x.conf).length - confLeft), 1),
    next: next ? { id: next.id, date: next.date, opp: next.opp, oppSlug: next.oppSlug, oppRank: next.oppRank, venue: next.venue, wp: next.wp } : null,
  };
});

// National ranks for the profile stats (1 = best).
// Offence: higher is better except turnover rate. Defence (opponent stats): lower is
// better except forced turnover rate. off.stlRate/off.blkRate are our own steals and
// blocks (defensive), def.stlRate/def.blkRate are opponents' (lower is better for us).
for (const side of ["off", "def"]) {
  const keys = Object.keys(teamSummaries.find(t => t[side])?.[side] ?? {});
  for (const k of keys) {
    const higherBetter = side === "off" ? k !== "tov" : k === "tov";
    const sorted = teamSummaries.filter(t => num(t[side]?.[k]) !== null).sort((x, y) => (higherBetter ? y[side][k] - x[side][k] : x[side][k] - y[side][k]));
    sorted.forEach((t, i) => { t[side + "Ranks"] ??= {}; t[side + "Ranks"][k] = i + 1; });
  }
}
// Neutral-information stats where "best" is ambiguous (tempo-like) keep ranks but are labelled in the UI.
teamSummaries.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.name.localeCompare(b.name));
const summaryById = new Map(teamSummaries.map(t => [t.id, t]));

// League averages for context.
const avg = (list, f) => { const v = list.map(f).filter(x => num(x) !== null); return v.length ? r(v.reduce((s, x) => s + x, 0) / v.length, 2) : null; };
const leagueProfile = {};
for (const k of Object.keys(teamSummaries.find(t => t.off)?.off ?? {})) leagueProfile[k] = avg(teamSummaries, t => t.off?.[k]);

// ---------- conferences ----------
const confMap = new Map();
for (const t of teamSummaries) {
  if (!confMap.has(t.confSlug)) confMap.set(t.confSlug, { slug: t.confSlug, name: t.confName, code: t.conf, teams: [] });
  confMap.get(t.confSlug).teams.push(t.id);
}
const conferences = [...confMap.values()].map(c => {
  const teams = c.teams.map(id => summaryById.get(id)).filter(Boolean);
  const rated = teams.filter(t => t.adjEM !== null);
  const ncGames = teams.flatMap(t => (teamLog.get(t.id) ?? []).filter(x => x.result && !x.conf));
  return {
    ...c, size: teams.length,
    avgEM: avg(rated, t => t.adjEM), avgO: avg(rated, t => t.adjO), avgD: avg(rated, t => t.adjD), avgT: avg(rated, t => t.adjT),
    topEM: rated.length ? Math.max(...rated.map(t => t.adjEM)) : null,
    ncW: ncGames.filter(x => x.result === "W").length, ncL: ncGames.filter(x => x.result === "L").length,
    best: rated.sort((a, b) => b.adjEM - a.adjEM)[0]?.id ?? null,
  };
}).sort((a, b) => (b.avgEM ?? -99) - (a.avgEM ?? -99));
conferences.forEach((c, i) => { c.rank = i + 1; });

// ---------- players ----------
const detailById = new Map();
for (const file of await readdir("public/data/player-details-2027").catch(() => [])) {
  if (!file.endsWith(".json")) continue;
  const payload = await readJson(`public/data/player-details-2027/${file}`);
  for (const p of payload.players ?? []) detailById.set(String(p.id), p);
}
const teamIdByName = new Map(d1Teams.map(t => [normName(t.team), String(t.teamId)]));
const PLAYER_FIELDS = ["id", "name", "teamId", "pos", "g", "gs", "min", "pts", "reb", "orb", "drb", "ast", "stl", "blk", "tov", "pf",
  "usg", "ortg", "drtg", "net", "porpag", "efg", "ts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "ws", "ws40", "orbPct", "ftr",
  "rimA", "rimM", "midA", "midM", "thrA", "thrM", "astd", "dunks"];
const players = [];
for (const p of playerPayload.players ?? []) {
  const detail = detailById.get(String(p.id));
  const teamId = String(detail?.sourceStats?.teamId ?? teamIdByName.get(normName(p.teamName)) ?? "");
  if (!summaryById.has(teamId)) continue;
  const reb = detail?.sourceStats?.rebounds, sp = detail?.shootingProfile, g = num(p.games) || null;
  const row = {
    id: String(p.id), name: p.name, teamId, pos: p.position || null, g: p.games, gs: p.starts, min: r(p.minutes), pts: r(p.points), reb: r(p.rebounds),
    orb: r(div(num(reb?.offensive), g)), drb: r(div(num(reb?.defensive), g)), ast: r(p.assists), stl: r(p.steals), blk: r(p.blocks),
    tov: r(p.turnovers), pf: r(p.fouls), usg: r(p.usage), ortg: r(p.offensiveRating), drtg: r(p.defensiveRating), net: r(p.netRating),
    porpag: r(p.porpag, 2), efg: r(p.efg), ts: r(num(p.ts) !== null ? p.ts * 100 : null), fgm: p.fieldGoals?.made ?? null, fga: p.fieldGoals?.attempted ?? null,
    tpm: p.threePointFieldGoals?.made ?? null, tpa: p.threePointFieldGoals?.attempted ?? null, ftm: p.freeThrows?.made ?? null, fta: p.freeThrows?.attempted ?? null,
    ws: r(p.winShares?.total, 2), ws40: r(p.winShares?.totalPer40, 3), orbPct: r(p.offensiveReboundPct), ftr: r(p.freeThrowRate),
    rimA: sp ? (sp.dunks?.attempted ?? 0) + (sp.layups?.attempted ?? 0) + (sp.tipIns?.attempted ?? 0) : null,
    rimM: sp ? (sp.dunks?.made ?? 0) + (sp.layups?.made ?? 0) + (sp.tipIns?.made ?? 0) : null,
    midA: sp?.twoPointJumpers?.attempted ?? null, midM: sp?.twoPointJumpers?.made ?? null,
    thrA: sp?.threePointJumpers?.attempted ?? null, thrM: sp?.threePointJumpers?.made ?? null,
    astd: r(sp?.assistedPct), dunks: sp?.dunks?.made ?? null,
  };
  players.push(PLAYER_FIELDS.map(f => row[f] ?? null));
}
const playerIdx = Object.fromEntries(PLAYER_FIELDS.map((f, i) => [f, i]));

// ---------- player game logs + bios (ESPN) ----------
// ESPN and the stats provider use different player ids, so players are joined by
// team + normalised name, with a last-name + first-initial fallback when unique.
const nameKey = n => String(n ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
const looseKey = n => { const parts = String(n ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z ]/g, "").trim().split(/\s+/); return parts.length > 1 ? `${parts[0][0]}${parts.at(-1)}` : parts[0]; };
const espnIdBySlug = new Map(teamSummaries.map(t => [t.slug, findDir(t.name)?.id ?? null]));
const slugByEspn = new Map([...espnIdBySlug].filter(([, e]) => e).map(([slug, e]) => [String(e), slug]));
const LOG_FIELDS = ["day", "opp", "oppSlug", "venue", "result", "teamPts", "oppPts", "starter", "min", "pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "orb", "drb", "reb", "ast", "stl", "blk", "tov", "pf"];
// athleteId -> game rows, per ESPN team
const espnLines = new Map();
for (const ev of Object.values(espnGames.events ?? {})) {
  for (const side of ev.teams ?? []) {
    const venue = side.neutral ? "N" : side.home ? "H" : "A";
    const result = side.pts !== null && side.oppPts !== null ? (side.pts > side.oppPts ? "W" : "L") : null;
    for (const row of side.players ?? []) {
      const [athleteId, name, starter, ...stats] = row;
      const key = `${side.teamId}:${athleteId}`;
      if (!espnLines.has(key)) espnLines.set(key, { name, teamId: side.teamId, rows: [] });
      espnLines.get(key).rows.push([ev.day, side.oppName, slugByEspn.get(String(side.oppId)) ?? null, venue, result, side.pts, side.oppPts, starter, ...stats]);
    }
  }
}
const logsBySlug = new Map(), biosBySlug = new Map();
const pidByAid = new Map(); // ESPN athlete id -> provider player id
let matched = 0, unmatched = 0;
for (const t of teamSummaries) {
  const espnId = espnIdBySlug.get(t.slug);
  if (!espnId) continue;
  const roster = espnRosters.teams?.[espnId] ?? [];
  const candidates = new Map(); // athleteId -> name
  for (const a of roster) candidates.set(a.id, a.name);
  for (const [key, v] of espnLines) if (v.teamId === String(espnId)) candidates.set(key.split(":")[1], v.name);
  const byFull = new Map(), byLoose = new Map();
  for (const [id, name] of candidates) {
    byFull.set(nameKey(name), id);
    const lk = looseKey(name); byLoose.set(lk, byLoose.has(lk) ? null : id);
  }
  const logs = {}, bios = {};
  for (const row of players.filter(p => p[playerIdx.teamId] === t.id)) {
    const pid = row[playerIdx.id], name = row[playerIdx.name];
    const aid = byFull.get(nameKey(name)) ?? byLoose.get(looseKey(name)) ?? null;
    if (!aid) { unmatched++; continue; }
    matched++;
    pidByAid.set(String(aid), pid);
    const lines = espnLines.get(`${espnId}:${aid}`);
    if (lines) logs[pid] = lines.rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const bio = roster.find(a => a.id === aid);
    if (bio) bios[pid] = { jersey: bio.jersey, pos: bio.pos, ht: bio.ht, wt: bio.wt, year: bio.year, home: bio.home };
  }
  logsBySlug.set(t.slug, logs); biosBySlug.set(t.slug, bios);
}
console.log(`[app-data] ESPN player match: ${matched} matched, ${unmatched} unmatched.`);
// ---------- season averages catch up to the box scores ----------
// The stats provider's season table can trail ESPN's box scores by a game or two. When a
// player's game log has more games than his season row, rebuild the box-score stats from the
// log so the profile, leaderboards and team leaders agree with the game log. Ratings that need
// play-by-play (usage, ORtg, DPR, shot zones) stay as published until the next provider refresh.
{
  const L = Object.fromEntries(LOG_FIELDS.map((f, i) => [f, i]));
  let caughtUp = 0, agree = 0, compared = 0;
  const byId = new Map(players.map(row => [row[playerIdx.id], row]));
  for (const logs of logsBySlug.values()) {
    for (const [pid, rows] of Object.entries(logs)) {
      const row = byId.get(pid);
      if (!row) continue;
      const played = rows.filter(x => (x[L.min] ?? 0) > 0);
      const sum = k => played.reduce((a, x) => a + (num(x[L[k]]) ?? 0), 0);
      const gl = played.length, gp = num(row[playerIdx.g]) ?? 0;
      if (gl === gp && gl > 0 && row[playerIdx.pts] !== null) { compared++; if (Math.abs(sum("pts") / gl - row[playerIdx.pts]) < 0.15) agree++; }
      if (gl <= gp) continue;
      const set = (k, v) => { row[playerIdx[k]] = v; };
      const per = k => r(sum(k) / gl);
      const fgm = sum("fgm"), fga = sum("fga"), tpm = sum("tpm"), tpa = sum("tpa"), ftm = sum("ftm"), fta = sum("fta"), pts = sum("pts");
      set("g", gl); set("gs", played.filter(x => x[L.starter]).length);
      for (const k of ["min", "pts", "reb", "orb", "drb", "ast", "stl", "blk", "tov", "pf"]) set(k, per(k));
      set("fgm", fgm); set("fga", fga); set("tpm", tpm); set("tpa", tpa); set("ftm", ftm); set("fta", fta);
      set("efg", fga ? r(((fgm + 0.5 * tpm) / fga) * 100) : null);
      set("ts", fga + fta ? r((pts / (2 * (fga + 0.44 * fta))) * 100) : null);
      set("ftr", fga ? r((fta / fga) * 100) : null);
      caughtUp++;
    }
  }
  console.log(`[app-data] Season averages rebuilt from box scores for ${caughtUp} players a game behind; ${agree}/${compared} up-to-date players match their logs.`);
}


// ---------- play-by-play: shots, lineups, on/off, DPR, game flow, lines ----------
const pbp = await loadPbp(".cache/espn-pbp-2027");
const espnFields = espnGames.fields ?? [];
const gamePoss = new Map(); // event id -> possessions per team
for (const [id, ev] of Object.entries(espnGames.events ?? {})) { const p = boxPossessions(ev, espnFields); if (p) gamePoss.set(id, p); }
const espnByTeam = new Map([...espnIdBySlug].filter(([, e]) => e).map(([slug, e]) => [String(e), slug]));
const shotsBySlug = new Map(), lineupStints = new Map();
const rapmRows = [];
for (const ev of pbp.values()) {
  const poss = gamePoss.get(ev.id) ?? 68;
  for (const sh of ev.shots ?? []) {
    const [team, aid, x, y, made, value, kind, ast] = sh;
    const off = espnByTeam.get(team), def = espnByTeam.get(team === ev.homeId ? ev.awayId : ev.homeId);
    const pid = pidByAid.get(aid) ?? null;
    if (off) { if (!shotsBySlug.has(off)) shotsBySlug.set(off, { off: [], def: [], byPid: {} }); const o = shotsBySlug.get(off); o.off.push([x, y, made, value]); if (pid) (o.byPid[pid] ??= []).push([x, y, made, value, kind, ast, ev.day]); }
    if (def) { if (!shotsBySlug.has(def)) shotsBySlug.set(def, { off: [], def: [], byPid: {} }); shotsBySlug.get(def).def.push([x, y, made, value]); }
  }
  // Pair each team's stints with the opponent unit on the floor at the same time for RAPM.
  const byTeam = { [ev.homeId]: [], [ev.awayId]: [] };
  for (const st of ev.stints ?? []) byTeam[st[0]]?.push(st);
  for (const [team, list] of Object.entries(byTeam)) {
    const slug = espnByTeam.get(team);
    for (const st of list) {
      const sec = st[2] - st[1];
      if (slug) { if (!lineupStints.has(slug)) lineupStints.set(slug, []); lineupStints.get(slug).push({ ids: st[3], sec, pf: st[4], pa: st[5], poss: (sec / 2400) * poss }); }
    }
  }
  // Split the game into intervals where both units are known.
  const cuts = [...new Set((ev.stints ?? []).flatMap(s => [s[1], s[2]]))].sort((a, b) => a - b);
  const unitAt = (team, t) => (byTeam[team] ?? []).find(s => s[1] <= t && t < s[2]);
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], z = cuts[i + 1], mid = (a + z) / 2;
    const hu = unitAt(ev.homeId, mid), au = unitAt(ev.awayId, mid);
    if (!hu || !au) continue;
    // Points in the interval from the score flow.
    const scoreAt = t => { let h = 0, w = 0; for (const f of ev.flow) { if (f[0] <= t) { h = f[1]; w = f[2]; } else break; } return [h, w]; };
    const [h0, a0] = scoreAt(a), [h1, a1] = scoreAt(z);
    const p = ((z - a) / 2400) * poss;
    if (p < 0.5) continue;
    rapmRows.push({ off: hu[3], def: au[3], y: ((h1 - h0) / p) * 100, w: p });
    rapmRows.push({ off: au[3], def: hu[3], y: ((a1 - a0) / p) * 100, w: p });
  }
}
// Box-score prior (v0 heuristic, documented on the methodology page): a quarter of each player's
// Oliver offensive/defensive rating gap to the D-I average, offence scaled by usage.
const avgOf = k => { const v = players.map(p => p[playerIdx[k]]).filter(x => typeof x === "number" && (players.length ? true : false)); return v.reduce((s, x) => s + x, 0) / Math.max(1, v.length); };
const avgOrtg = avgOf("ortg"), avgDrtg = avgOf("drtg");
const rowByPid = new Map(players.map(p => [p[playerIdx.id], p]));
const aidByPid = new Map([...pidByAid].map(([a, p]) => [p, a]));
const prior = new Map();
for (const [aid, pid] of pidByAid) {
  const row = rowByPid.get(pid); if (!row) continue;
  const ortg = row[playerIdx.ortg], drtg = row[playerIdx.drtg], usg = row[playerIdx.usg];
  if (typeof ortg !== "number" || typeof drtg !== "number") continue;
  const usageScale = Math.min(1.5, Math.max(0.5, (usg ?? 20) / 20));
  prior.set(aid, { O: Math.max(-6, Math.min(6, 0.25 * (ortg - avgOrtg) * usageScale)), D: Math.max(-6, Math.min(6, 0.25 * (drtg - avgDrtg))) });
}
// D-I average FG% by shot zone (mirrors src/lib/shots.ts zoneOf) for shot-chart shading.
const zoneOf = (x, y, value) => {
  const ang = Math.atan2(x - 25, y) * (180 / Math.PI);
  if (value === 3) return y < 8.75 ? (x < 25 ? "c3L" : "c3R") : ang < -22 ? "ab3L" : ang > 22 ? "ab3R" : "ab3C";
  if (Math.hypot(x - 25, y) < 4) return "rim";
  if (x >= 19 && x <= 31 && y <= 13.75) return "paint";
  return ang < -30 ? "midL" : ang > 30 ? "midR" : "midC";
};
const leagueZones = {};
for (const ev of pbp.values()) for (const sh of ev.shots ?? []) { const z = zoneOf(sh[2], sh[3], sh[5]); leagueZones[z] ??= { fga: 0, fgm: 0 }; leagueZones[z].fga++; leagueZones[z].fgm += sh[4]; }
const rapm = rapmRows.length > 500 ? solveRapm(rapmRows, prior) : null;
console.log(`[app-data] Play-by-play: ${pbp.size} games, ${rapmRows.length} lineup rows, ${rapm?.ratings.size ?? 0} players rated.`);
const dprOf = pid => {
  const aid = aidByPid.get(pid);
  const r = aid ? rapm?.ratings.get(aid) : null;
  if (r) return r;
  const p = aid ? prior.get(aid) : null;
  return p ? { O: p.O, D: p.D, net: p.O - p.D, se: null, poss: 0 } : null;
};
for (const row of players) {
  const d = dprOf(row[playerIdx.id]);
  row.push(d ? r(d.net, 2) : null, d ? r(d.O, 2) : null, d ? r(-d.D, 2) : null, d?.se != null ? r(d.se, 2) : null, d ? Math.round(d.poss) : null);
}
PLAYER_FIELDS.push("dpr", "dprO", "dprD", "dprSE", "onPoss");
playerIdx.dpr = PLAYER_FIELDS.indexOf("dpr");
// Recruiting stars (College Basketball Data, high-school classes 2022–2026), joined on athlete id
// with a name + college fallback.
{
  const recById = new Map(), recByName = new Map();
  for (const rec of recruiting?.players ?? []) {
    if (rec.athleteId != null) recById.set(String(rec.athleteId), rec);
    recByName.set(`${nameKey(rec.name)}:${normName(rec.school)}`, rec);
  }
  PLAYER_FIELDS.push("stars", "recRank", "recYear");
  let hits = 0;
  for (const row of players) {
    const team = summaryById.get(row[playerIdx.teamId]);
    const rec = recById.get(row[playerIdx.id]) ?? recByName.get(`${nameKey(row[playerIdx.name])}:${normName(team?.name)}`) ?? null;
    if (rec) hits++;
    row.push(rec?.stars ?? null, rec?.ranking ?? null, rec?.year ?? null);
  }
  console.log(`[app-data] Recruiting: ${hits} current players matched to a high-school ranking.`);
}
// DPR rank among players with real on-court samples.
{
  const ranked = players.filter(p => (p[PLAYER_FIELDS.indexOf("onPoss")] ?? 0) >= 150 && p[playerIdx.dpr] !== null).sort((a, b) => b[playerIdx.dpr] - a[playerIdx.dpr]);
  PLAYER_FIELDS.push("dprRank");
  const rankMap = new Map(ranked.map((p, i) => [p[playerIdx.id], i + 1]));
  for (const row of players) row.push(rankMap.get(row[playerIdx.id]) ?? null);
}

// Lineups + on/off per team.
const lineupsBySlug = new Map(), onOffBySlug = new Map();
for (const [slug, list] of lineupStints) {
  const agg = new Map(); let tSec = 0, tPf = 0, tPa = 0, tPoss = 0;
  const on = new Map();
  for (const s of list) {
    tSec += s.sec; tPf += s.pf; tPa += s.pa; tPoss += s.poss;
    const pids = s.ids.map(a => pidByAid.get(a) ?? null);
    const key = pids.map(p => p ?? "?").sort().join(",");
    if (!agg.has(key)) agg.set(key, { pids: pids.slice().sort(), sec: 0, pf: 0, pa: 0, poss: 0 });
    const a = agg.get(key); a.sec += s.sec; a.pf += s.pf; a.pa += s.pa; a.poss += s.poss;
    for (const p of pids) { if (!p) continue; if (!on.has(p)) on.set(p, { sec: 0, pf: 0, pa: 0, poss: 0 }); const o = on.get(p); o.sec += s.sec; o.pf += s.pf; o.pa += s.pa; o.poss += s.poss; }
  }
  lineupsBySlug.set(slug, [...agg.values()].filter(a => a.sec >= 120).sort((a, b) => b.sec - a.sec).slice(0, 40)
    .map(a => ({ pids: a.pids, min: r(a.sec / 60), pf: a.pf, pa: a.pa, poss: r(a.poss), net: r(((a.pf - a.pa) / Math.max(1, a.poss)) * 100) })));
  const onOff = {};
  for (const [pid, o] of on) {
    const offPoss = tPoss - o.poss;
    onOff[pid] = { min: r(o.sec / 60), onNet: r(((o.pf - o.pa) / Math.max(1, o.poss)) * 100), offNet: offPoss > 5 ? r((((tPf - o.pf) - (tPa - o.pa)) / offPoss) * 100) : null, poss: r(o.poss) };
  }
  onOffBySlug.set(slug, onOff);
}

// Event lookup for provider games: day + ESPN home/away ids (either orientation).
const eventByKey = new Map();
for (const ev of pbp.values()) {
  eventByKey.set(`${ev.day}:${ev.homeId}:${ev.awayId}`, { ev, flip: false });
  eventByKey.set(`${ev.day}:${ev.awayId}:${ev.homeId}`, { ev, flip: true });
}
const espnIdOf = teamId => { const s = summaryById.get(String(teamId)); return s ? espnIdBySlug.get(s.slug) ?? null : null; };
const eventFor = g => {
  const h = espnIdOf(g.homeTeamId), a = espnIdOf(g.awayTeamId);
  if (!h || !a) return null;
  return eventByKey.get(`${etDate(g.date)}:${h}:${a}`) ?? null;
};
// Market lines + flow per provider game, and grading of the walk-forward model against the line.
const marketByGame = new Map();
let mGames = 0, mModelAbs = 0, mLineAbs = 0, atsW = 0, atsL = 0, atsP = 0;
for (const g of allGames) {
  const hit = eventFor(g);
  if (!hit) continue;
  const { ev, flip } = hit;
  const spread = ev.line?.spread == null ? null : flip ? -ev.line.spread : ev.line.spread; // home perspective, negative = home favoured
  const flow = ev.flow?.length > 2 ? ev.flow.map(f => (flip ? [f[0], f[2], f[1]] : f)) : null;
  marketByGame.set(String(g.id), { espnId: ev.id, line: spread == null ? null : { spread, total: ev.line.total, provider: ev.line.provider }, flow });
  const p = preds[g.id];
  if (spread != null && p && g.status === "final" && num(g.homeScore) !== null && isD1(g.homeConference) && isD1(g.awayConference)) {
    const actual = g.homeScore - g.awayScore, lineMargin = -spread;
    mGames++; mModelAbs += Math.abs(actual - p.margin); mLineAbs += Math.abs(actual - lineMargin);
    if (Math.abs(p.margin - lineMargin) >= 0.5) {
      const pickHome = p.margin > lineMargin, cover = actual + spread;
      if (cover === 0) atsP++; else if ((cover > 0) === pickHome) atsW++; else atsL++;
    }
  }
}
const market = mGames ? { games: mGames, modelMAE: r(mModelAbs / mGames, 2), lineMAE: r(mLineAbs / mGames, 2), atsW, atsL, atsP,
  note: "Walk-forward model margin vs the pregame spread ESPN shows (DraftKings when listed). Picks count only when the model and the line differ by at least half a point." } : null;
console.log(`[app-data] Market: ${market ? `${mGames} games, model MAE ${market.modelMAE} vs line ${market.lineMAE}, ATS ${atsW}-${atsL}-${atsP}` : "no lines"}.`);
// Where to watch: ESPN TV/streaming listings matched by day + both teams (either orientation).
const tvByKey = new Map();
const listingByKey = new Map(); // day:teamA:teamB -> ESPN event id, for every listed game (pick'em + live on unplayed games)
for (const [eid, ev] of Object.entries(tvListings.events ?? {})) {
  listingByKey.set(`${ev.day}:${ev.homeId}:${ev.awayId}`, eid);
  listingByKey.set(`${ev.day}:${ev.awayId}:${ev.homeId}`, eid);
  if (!ev.tv?.length) continue;
  const tv = ev.tv.map(([name, type, market]) => ({ name, type, market }));
  tvByKey.set(`${ev.day}:${ev.homeId}:${ev.awayId}`, tv);
  tvByKey.set(`${ev.day}:${ev.awayId}:${ev.homeId}`, tv);
}
const tvByGame = new Map();
const eventByGame = new Map();
for (const g of allGames) {
  const h = espnIdOf(g.homeTeamId), a = espnIdOf(g.awayTeamId), day = etDate(g.date);
  let eid = h && a ? listingByKey.get(`${day}:${h}:${a}`) : null;
  if (!eid && (h || a)) {
    const hits = [...listingByKey.entries()].filter(([k]) => k.startsWith(`${day}:${h ?? a}:`));
    if (hits.length === 1) eid = hits[0][1];
  }
  if (eid) eventByGame.set(String(g.id), eid);
  let tv = h && a ? tvByKey.get(`${day}:${h}:${a}`) : null;
  // One D-I side (e.g. vs a non-D-I opponent): match on that team alone when it has one listing that day.
  if (!tv && (h || a)) {
    const id = h ?? a;
    const hits = [...tvByKey.entries()].filter(([k]) => k.startsWith(`${day}:${id}:`));
    if (hits.length === 1) tv = hits[0][1];
  }
  if (tv) tvByGame.set(String(g.id), tv);
}
console.log(`[app-data] Where to watch: ${tvByGame.size} games with TV/streaming listings.`);

// ---------- news, previews/recaps, polls, availability (feeds from live/src/bin/feeds.rs) ----------
const eventKey = new Map(); // day:espnA:espnB -> ESPN event id
for (const [id, ev] of Object.entries(tvListings.events ?? {})) { eventKey.set(`${ev.day}:${ev.homeId}:${ev.awayId}`, id); eventKey.set(`${ev.day}:${ev.awayId}:${ev.homeId}`, id); }
for (const ev of pbp.values()) { eventKey.set(`${ev.day}:${ev.homeId}:${ev.awayId}`, ev.id); eventKey.set(`${ev.day}:${ev.awayId}:${ev.homeId}`, ev.id); }
const eventIdByGame = new Map();
for (const g of allGames) {
  const h = espnIdOf(g.homeTeamId), a = espnIdOf(g.awayTeamId);
  const id = h && a ? eventKey.get(`${etDate(g.date)}:${h}:${a}`) : null;
  if (id) eventIdByGame.set(String(g.id), id);
}
const art = id => {
  const a = feeds?.articles?.[id];
  return a ? { h: a.headline, url: a.url, t: a.published, kind: a.kind, src: a.source, by: a.byline ?? null } : null;
};
const articlesFor = ids => (ids ?? []).map(art).filter(Boolean);
const newsBySlug = new Map();
for (const t of teamSummaries) {
  const e = espnIdBySlug.get(t.slug);
  if (e && feeds?.teamNews?.[e]) newsBySlug.set(t.slug, articlesFor(feeds.teamNews[e]).slice(0, 15));
}
const gameArticles = new Map();
for (const [gid, eid] of eventIdByGame) { const list = articlesFor(feeds?.gameNews?.[eid]); if (list.length) gameArticles.set(gid, list); }
// Polls onto team summaries.
const pollRank = new Map();
for (const [poll, list] of Object.entries(feeds?.polls ?? {})) for (const e of list) { if (!pollRank.has(e.team)) pollRank.set(e.team, {}); pollRank.get(e.team)[poll] = { rank: e.rank, prev: e.previous ?? null, pts: e.points ?? null, fpv: e.firstPlace ?? null }; }
// Availability: ESPN-listed injuries, players who stopped appearing in box scores, and
// injury/suspension headlines that tag the player.
const injuryWords = /injur|surgery|torn|sprain|fracture|concussion|out for|sidelined|suspend|day-to-day|questionable|status uncertain|will miss|to miss/i;
const availabilityBySlug = new Map();
const espnGamesByTeam = new Map(); // espn team id -> sorted days it played (box scores)
for (const ev of Object.values(espnGames.events ?? {})) for (const side of ev.teams ?? []) { if (!espnGamesByTeam.has(side.teamId)) espnGamesByTeam.set(side.teamId, new Set()); espnGamesByTeam.get(side.teamId).add(ev.day); }
for (const t of teamSummaries) {
  const e = espnIdBySlug.get(t.slug);
  if (!e) continue;
  const list = [];
  const teamDays = [...(espnGamesByTeam.get(String(e)) ?? [])].sort();
  const logs = logsBySlug.get(t.slug) ?? {};
  for (const row of players.filter(p => p[playerIdx.teamId] === t.id)) {
    const pid = row[playerIdx.id], name = row[playerIdx.name], aid = aidByPid.get(pid);
    const espnInj = aid ? (feeds?.injuries ?? []).find(i => i.athlete === aid) : null;
    if (espnInj) { list.push({ pid, name, status: espnInj.status, detail: espnInj.detail ?? null, since: espnInj.date ?? null, source: "espn" }); continue; }
    const played = new Set((logs[pid] ?? []).filter(l => (l[LOG_FIELDS.indexOf("min")] ?? 0) > 0).map(l => l[0]));
    const mins = (logs[pid] ?? []).map(l => l[LOG_FIELDS.indexOf("min")] ?? 0).filter(m => m > 0);
    const avgMin = mins.length ? mins.reduce((s2, m) => s2 + m, 0) / mins.length : 0;
    let missed = 0;
    for (let i = teamDays.length - 1; i >= 0 && !played.has(teamDays[i]); i--) missed++;
    const headline = aid ? (feeds?.athleteNews?.[aid] ?? []).map(art).find(a => a && injuryWords.test(a.h)) : null;
    if (played.size && missed > 0 && avgMin >= 12) {
      list.push({ pid, name, status: missed === 1 ? "Missed last game" : `Missed last ${missed} games`, detail: headline ? headline.h : "Reason not reported", since: teamDays[teamDays.length - missed], source: "box", url: headline?.url ?? null });
    } else if (headline) {
      list.push({ pid, name, status: "In the news", detail: headline.h, since: headline.t?.slice(0, 10) ?? null, source: "news", url: headline.url });
    }
  }
  if (list.length) availabilityBySlug.set(t.slug, list);
}
console.log(`[app-data] Feeds: ${feeds ? Object.keys(feeds.articles ?? {}).length : 0} articles, ${gameArticles.size} games with previews/recaps, ${[...availabilityBySlug.values()].flat().length} availability notes.`);

// Team-perspective line on every team game log row.
for (const [tid, list] of teamLog) {
  for (const row of list) {
    const tv = tvByGame.get(row.id);
    if (tv) row.tv = tv.map(t => t.name);
    const m = marketByGame.get(row.id);
    const g = allGames.find(x => String(x.id) === row.id);
    if (!m?.line || !g) continue;
    const isHome = String(g.homeTeamId) === tid;
    row.line = isHome ? m.line.spread : -m.line.spread;
    if (row.result) { const cover = row.pts - row.oppPts + row.line; row.ats = cover > 0 ? "W" : cover < 0 ? "L" : "P"; }
  }
}
for (const t of teamSummaries) {
  const sim = sims?.teams?.[t.id];
  t.sim = sim ? { wins: sim.wins, p10: sim.p10, p90: sim.p90, confWins: sim.confWins, title: sim.titleShare, outright: sim.titleOutright, win20: sim.win20 } : null;
  t.espnId = espnIdBySlug.get(t.slug) ?? null;
  if (t.next) t.next.tv = tvByGame.get(t.next.id)?.map(x => x.name) ?? null;
  const pr = pollRank.get(String(t.espnId));
  t.ap = pr?.ap ?? null; t.coaches = pr?.coaches ?? null;
  t.unavailable = (availabilityBySlug.get(t.slug) ?? []).filter(a => a.source !== "news").length;
  const log = teamLog.get(t.id) ?? [];
  t.ats = [log.filter(x => x.ats === "W").length, log.filter(x => x.ats === "L").length, log.filter(x => x.ats === "P").length];
}

// ---------- write ----------
await rm(OUT, { recursive: true, force: true });
await mkdir(`${OUT}/team`, { recursive: true });
await mkdir(`${OUT}/games`, { recursive: true });
const write = (path, data) => writeFile(`${OUT}/${path}`, JSON.stringify(data));

const updated = { teams: teamPayload.fetchedAt ?? null, players: playerPayload.fetchedAt ?? null, games: gamePayload.fetchedAt ?? null, built: new Date().toISOString() };
const counts = { teams: teamSummaries.length, ratedTeams: teamSummaries.filter(t => t.rank).length, players: players.length, games: allGames.length, finals: finals.length };
const { predictions: _omit, ...modelInfo } = model;
// Live post-game ratings (src/lib/live-ratings.ts) refit from the exact pipeline inputs.
try { await write("dhr-input.json", JSON.parse(await readFile("public/data/dhr-input-2027.json", "utf8"))); } catch { /* optional */ }
await write("meta.json", { season: 2027, seasonLabel: "2026–27", provider: "College Basketball Data", updated, counts, model: modelInfo, leagueProfile, market,
  shotZones: leagueZones,
  sims: sims ? { sims: sims.sims, remainingGames: sims.remainingGames, method: sims.method } : null,
  dpr: rapm ? { players: rapm.ratings.size, rows: rapmRows.length, lambda: 2500, method: "Regularised adjusted plus-minus (offence/defence) from ESPN play-by-play lineups, shrunk toward a box-score prior" } : null });
await write("teams.json", teamSummaries);
// League news + polls + league-wide availability tracker.
const slugOfEspn = id => slugByEspn.get(String(id)) ?? null;
const pollRows = list => (list ?? []).map(e => { const slug = slugOfEspn(e.team), t = slug ? teamSummaries.find(x => x.slug === slug) : null; return { rank: e.rank, prev: e.previous ?? null, pts: e.points ?? null, fpv: e.firstPlace ?? null, slug, name: t?.name ?? null, dhr: t?.rank ?? null, w: t?.w ?? null, l: t?.l ?? null }; });
await write("news.json", { fetchedAt: feeds?.fetchedAt ?? null, league: articlesFor(feeds?.league).slice(0, 30), polls: { ap: pollRows(feeds?.polls?.ap), coaches: pollRows(feeds?.polls?.coaches) }, pollDate: feeds?.pollDate ?? null });
await write("injuries.json", teamSummaries.flatMap(t => (availabilityBySlug.get(t.slug) ?? []).map(a => ({ ...a, slug: t.slug, team: t.name, conf: t.conf, rank: t.rank }))));

// Calendar feeds (.ics) per team: subscribe once, updates with every deploy.
await mkdir(`${OUT}/cal`, { recursive: true });
const icsEsc = v => String(v ?? "").replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
const icsDate = d => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const siteUrl = "https://shaincarrasco.github.io/D1-Basketball-Analytics";
for (const t of teamSummaries) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//D1 Hoops//Schedule//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEsc(`${t.name} basketball (D1 Hoops)`)}`, "X-PUBLISHED-TTL:PT6H", "REFRESH-INTERVAL;VALUE=DURATION:PT6H"];
  for (const g of teamLog.get(t.id) ?? []) {
    const start = new Date(g.date), end = new Date(start.getTime() + 2 * 3600e3);
    const vs = g.venue === "A" ? "at" : "vs";
    const result = g.result ? ` (${g.result} ${g.pts}-${g.oppPts})` : "";
    const desc = [g.wp != null && !g.result ? `D1 Hoops win probability: ${Math.round(g.wp * 100)}%` : null, g.projPts != null && !g.result ? `Projected: ${Math.round(g.projPts)}-${Math.round(g.projOppPts)}` : null, g.tv?.length ? `Watch: ${g.tv.join(", ")}` : null, `${siteUrl}/games/?d=${g.day}&g=${g.id}`].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT", `UID:${g.id}-${t.slug}@d1hoops`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEsc(`${t.name} ${vs} ${g.opp}${result}`)}`, `DESCRIPTION:${icsEsc(desc)}`, `URL:${siteUrl}/teams/${t.slug}/`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  await writeFile(`${OUT}/cal/${t.slug}.ics`, lines.join("\r\n") + "\r\n");
}
await write("conferences.json", conferences);
await write("players.json", { fields: PLAYER_FIELDS, rows: players });

// Team detail files: game log + roster.
for (const t of teamSummaries) {
  const record = teamById.get(t.id);
  const roster = players.filter(p => p[playerIdx.teamId] === t.id).sort((a, b) => (b[playerIdx.min] ?? 0) * (b[playerIdx.g] ?? 0) - (a[playerIdx.min] ?? 0) * (a[playerIdx.g] ?? 0));
  const tot = factors(record.teamStats), opp = factors(record.opponentStats), gp = record.games || null;
  const perGame = s => s && gp ? { pts: r(div(s.pts, gp)), reb: r(div((s.orb ?? 0) + (s.drb ?? 0), gp)), ast: r(div(s.ast, gp)), tov: r(div(s.tov, gp)), stl: r(div(s.stl, gp)), blk: r(div(s.blk, gp)), paint: r(div(s.paint, gp)), fastBreak: r(div(s.fastBreak, gp)) } : null;
  await write(`team/${t.slug}.json`, { id: t.id, games: teamLog.get(t.id) ?? [], roster, perGame: perGame(tot), oppPerGame: perGame(opp),
    logFields: LOG_FIELDS, logs: logsBySlug.get(t.slug) ?? {}, bios: biosBySlug.get(t.slug) ?? {},
    news: newsBySlug.get(t.slug) ?? [], availability: availabilityBySlug.get(t.slug) ?? [],
    playerNews: Object.fromEntries(players.filter(p => p[playerIdx.teamId] === t.id).map(p => [p[playerIdx.id], articlesFor(feeds?.athleteNews?.[aidByPid.get(p[playerIdx.id])]).slice(0, 8)]).filter(([, l]) => l.length)),
    rosterFields: PLAYER_FIELDS, winHist: sims?.teams?.[t.id]?.hist ?? null, shots: shotsBySlug.get(t.slug) ?? null, lineups: lineupsBySlug.get(t.slug) ?? [], onOff: onOffBySlug.get(t.slug) ?? {} });
}

// Games by Eastern date.
const byDay = new Map();
for (const g of allGames) {
  const day = etDate(g.date);
  if (!byDay.has(day)) byDay.set(day, []);
  byDay.get(day).push(g);
}
const sideInfo = (g, side) => {
  const id = String(side === "home" ? g.homeTeamId : g.awayTeamId);
  const s = summaryById.get(id);
  return {
    id: s ? id : null, slug: s?.slug ?? null, name: side === "home" ? g.homeTeam : g.awayTeam, short: s?.short ?? null, logo: s?.logo ?? null, color: s?.color ?? null,
    conf: s?.conf ?? null, rank: s?.rank ?? null, adjEM: s?.adjEM ?? null, record: s ? `${s.w}-${s.l}` : null,
    score: g.status === "final" || g.status === "in_progress" ? (side === "home" ? g.homeScore : g.awayScore) : null, periods: (side === "home" ? g.homePeriodPoints : g.awayPeriodPoints) ?? null,
  };
};
const boxLine = row => {
  const a = factors(row?.teamStats);
  if (!a) return null;
  return { fgm: a.fgm, fga: a.fga, tpm: a.tpm, tpa: a.tpa, ftm: a.ftm, fta: a.fta, orb: a.orb, drb: a.drb, ast: a.ast, stl: a.stl, blk: a.blk, tov: a.tov,
    paint: a.paint, fastBreak: a.fastBreak, offTov: a.offTov, poss: r(a.poss), largestLead: num(row.teamStats?.points?.largestLead) };
};
// Team quality on a 0–1 scale from the rating: +30 or better (a top-five team) = 1, -5 or worse = 0.
// Linear in points, so No. 11 vs No. 30 is a real gap (percentiles squash the top of the table).
const teamQ = em => (em === null ? 0 : Math.max(0, Math.min(1, (em + 5) / 35)));
const index = [];
for (const [day, list] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const games = list.sort((a, b) => a.date.localeCompare(b.date)).map(g => {
    const p = preds[g.id];
    const home = sideInfo(g, "home"), away = sideInfo(g, "away");
    // Watchability = matchup quality x competitiveness. Quality leans on the weaker team (a
    // game is only as good as its worse side); a coin flip between two weak teams still scores
    // low, and a 70/30 game between two top-25 teams beats a toss-up between No. 30 and No. 60.
    const closeness = p ? 1 - Math.abs(2 * p.homeWinProb - 1) : 0;
    const qa = teamQ(home.adjEM), qb = teamQ(away.adjEM);
    const quality = 0.65 * Math.min(qa, qb) + 0.35 * Math.max(qa, qb);
    const watch = p ? Math.round(100 * quality * (0.55 + 0.45 * closeness)) : null;
    const final = g.status === "final" && num(g.homeScore) !== null;
    const winnerWP = final && p ? (g.homeScore > g.awayScore ? p.homeWinProb : 1 - p.homeWinProb) : null;
    const hb = boxByGameTeam.get(`${g.id}:${g.homeTeamId}`), ab = boxByGameTeam.get(`${g.id}:${g.awayTeamId}`);
    return {
      id: String(g.id), date: g.date, status: g.status, neutral: g.neutralSite === true, confGame: g.conferenceGame === true,
      venue: g.venue ?? null, city: g.city ?? null, state: g.state ?? null, tournament: g.tournament ?? null,
      home, away,
      pred: p ? { wp: r(p.homeWinProb, 3), margin: r(p.margin), home: r(p.homePts), away: r(p.awayPts), tempo: r(p.tempo) } : null,
      watch, upset: winnerWP !== null && winnerWP < 0.35 ? r(winnerWP, 3) : null,
      tv: tvByGame.get(String(g.id)) ?? null,
      articles: gameArticles.get(String(g.id)) ?? null,
      espnId: marketByGame.get(String(g.id))?.espnId ?? eventByGame.get(String(g.id)) ?? null, line: marketByGame.get(String(g.id))?.line ?? null, flow: marketByGame.get(String(g.id))?.flow ?? null,
      box: hb || ab ? { home: boxLine(hb ?? (ab ? { teamStats: ab.opponentStats } : null)), away: boxLine(ab ?? (hb ? { teamStats: hb.opponentStats } : null)) } : null,
    };
  });
  index.push({ day, games: games.length, finals: games.filter(g => g.status === "final").length });
  await write(`games/${day}.json`, { day, games });
}
await write("games/index.json", { days: index });

console.log(`[app-data] ${teamSummaries.length} teams, ${conferences.length} conferences, ${players.length} players, ${index.length} game days written to ${OUT}.`);
