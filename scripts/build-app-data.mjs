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

const OUT = "public/data/app";
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const [teamPayload, gamePayload, playerPayload, directory, model] = await Promise.all([
  readJson("public/data/team-season-2027.json"),
  readJson("public/data/games-season-2027.json"),
  readJson("public/data/player-season-2027.json"),
  readJson("public/data/team-directory.json").catch(() => ({ teams: [] })),
  readJson("public/data/model-2027.json"),
]);

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
  const upcoming = log.filter(x => !x.result);
  const next = upcoming[0];
  // Expected wins over the remaining schedule using current ratings.
  const projWinsLeft = upcoming.reduce((s, x) => s + (x.wp ?? 0.5), 0);
  const confLeft = upcoming.filter(x => x.conf).reduce((s, x) => s + (x.wp ?? 0.5), 0);
  const q = [1, 2, 3, 4].map(n => recordOf(log, x => x.quad === n));
  return {
    id, slug: slugById.get(id), name: t.team, short: dir?.abbreviation ?? t.team.slice(0, 4).toUpperCase(), mascot: dir?.name ?? null,
    logo: dir?.logo ?? null, conf: t.conference, confName: confName(t.conference), confSlug: confSlug(t.conference),
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

// ---------- write ----------
await rm(OUT, { recursive: true, force: true });
await mkdir(`${OUT}/team`, { recursive: true });
await mkdir(`${OUT}/games`, { recursive: true });
const write = (path, data) => writeFile(`${OUT}/${path}`, JSON.stringify(data));

const updated = { teams: teamPayload.fetchedAt ?? null, players: playerPayload.fetchedAt ?? null, games: gamePayload.fetchedAt ?? null, built: new Date().toISOString() };
const counts = { teams: teamSummaries.length, ratedTeams: teamSummaries.filter(t => t.rank).length, players: players.length, games: allGames.length, finals: finals.length };
const { predictions: _omit, ...modelInfo } = model;
await write("meta.json", { season: 2027, seasonLabel: "2026–27", provider: "College Basketball Data", updated, counts, model: modelInfo, leagueProfile });
await write("teams.json", teamSummaries);
await write("conferences.json", conferences);
await write("players.json", { fields: PLAYER_FIELDS, rows: players });

// Team detail files: game log + roster.
for (const t of teamSummaries) {
  const record = teamById.get(t.id);
  const roster = players.filter(p => p[playerIdx.teamId] === t.id).sort((a, b) => (b[playerIdx.min] ?? 0) * (b[playerIdx.g] ?? 0) - (a[playerIdx.min] ?? 0) * (a[playerIdx.g] ?? 0));
  const tot = factors(record.teamStats), opp = factors(record.opponentStats), gp = record.games || null;
  const perGame = s => s && gp ? { pts: r(div(s.pts, gp)), reb: r(div((s.orb ?? 0) + (s.drb ?? 0), gp)), ast: r(div(s.ast, gp)), tov: r(div(s.tov, gp)), stl: r(div(s.stl, gp)), blk: r(div(s.blk, gp)), paint: r(div(s.paint, gp)), fastBreak: r(div(s.fastBreak, gp)) } : null;
  await write(`team/${t.slug}.json`, { id: t.id, games: teamLog.get(t.id) ?? [], roster, perGame: perGame(tot), oppPerGame: perGame(opp) });
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
    id: s ? id : null, slug: s?.slug ?? null, name: side === "home" ? g.homeTeam : g.awayTeam, short: s?.short ?? null, logo: s?.logo ?? null,
    conf: s?.conf ?? null, rank: s?.rank ?? null, adjEM: s?.adjEM ?? null, record: s ? `${s.w}-${s.l}` : null,
    score: g.status === "scheduled" ? null : side === "home" ? g.homeScore : g.awayScore, periods: (side === "home" ? g.homePeriodPoints : g.awayPeriodPoints) ?? null,
  };
};
const boxLine = row => {
  const a = factors(row?.teamStats);
  if (!a) return null;
  return { fgm: a.fgm, fga: a.fga, tpm: a.tpm, tpa: a.tpa, ftm: a.ftm, fta: a.fta, orb: a.orb, drb: a.drb, ast: a.ast, stl: a.stl, blk: a.blk, tov: a.tov,
    paint: a.paint, fastBreak: a.fastBreak, offTov: a.offTov, poss: r(a.poss), largestLead: num(row.teamStats?.points?.largestLead) };
};
const emSorted = teamSummaries.filter(t => t.adjEM !== null).map(t => t.adjEM).sort((a, b) => a - b);
const emPct = em => (em === null ? 0 : emSorted.filter(x => x <= em).length / emSorted.length);
const index = [];
for (const [day, list] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const games = list.sort((a, b) => a.date.localeCompare(b.date)).map(g => {
    const p = preds[g.id];
    const home = sideInfo(g, "home"), away = sideInfo(g, "away");
    // Watchability: half quality (both teams' rating percentile), half competitiveness.
    const closeness = p ? 1 - Math.abs(2 * p.homeWinProb - 1) : 0;
    const watch = p ? Math.round(100 * (0.55 * Math.sqrt(emPct(home.adjEM) * emPct(away.adjEM)) + 0.45 * closeness)) : null;
    const final = g.status === "final" && num(g.homeScore) !== null;
    const winnerWP = final && p ? (g.homeScore > g.awayScore ? p.homeWinProb : 1 - p.homeWinProb) : null;
    const hb = boxByGameTeam.get(`${g.id}:${g.homeTeamId}`), ab = boxByGameTeam.get(`${g.id}:${g.awayTeamId}`);
    return {
      id: String(g.id), date: g.date, status: g.status, neutral: g.neutralSite === true, confGame: g.conferenceGame === true,
      venue: g.venue ?? null, city: g.city ?? null, state: g.state ?? null, tournament: g.tournament ?? null,
      home, away,
      pred: p ? { wp: r(p.homeWinProb, 3), margin: r(p.margin), home: r(p.homePts), away: r(p.awayPts), tempo: r(p.tempo) } : null,
      watch, upset: winnerWP !== null && winnerWP < 0.35 ? r(winnerWP, 3) : null,
      box: hb || ab ? { home: boxLine(hb ?? (ab ? { teamStats: ab.opponentStats } : null)), away: boxLine(ab ?? (hb ? { teamStats: hb.opponentStats } : null)) } : null,
    };
  });
  index.push({ day, games: games.length, finals: games.filter(g => g.status === "final").length });
  await write(`games/${day}.json`, { day, games });
}
await write("games/index.json", { days: index });

console.log(`[app-data] ${teamSummaries.length} teams, ${conferences.length} conferences, ${players.length} players, ${index.length} game days written to ${OUT}.`);
