// Builds the app's output shapes from cached game records: players.json rows, per-player p/ files,
// per-game g/ files, teams.json, games.json and rankings.json. Pure: no I/O.
import { classify, clamp, fieldX, isMarker, spotText, tokenResolver } from "./plays.mjs";
import { mapRosterPos } from "./positions.mjs";

/** Box-score and play-by-play stat keys of FootballRow (packages/packs/football/types.ts). */
export const STAT_KEYS = [
  "pAtt", "pCmp", "pYds", "pTd", "pInt", "pSacks", "pSackYds", "pDeepAtt", "pDeepCmp", "pAir", "pAirAtt", "pFirst",
  "rCar", "rYds", "rTd", "rLong", "rRuns10", "rStuffs", "rFirst", "rFumL",
  "rcTgt", "rcRec", "rcYds", "rcTd", "rcLong", "rcAir", "rcYac", "rcDeepTgt", "rcDeepRec", "rcFirst",
  "dTkl", "dSolo", "dTfl", "dSacks", "dHur", "dPd", "dInt", "dTd",
];
const MAX_KEYS = new Set(["rLong", "rcLong"]);
const DECIMAL_KEYS = new Set(["dSacks"]);
const MAPPED = new Set(["QB", "RB", "WR", "TE", "DL", "LB", "DB"]);

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const sum = (xs) => xs.reduce((a, b) => a + (b ?? 0), 0);
const maxOf = (xs) => (xs.length ? Math.max(...xs.map((x) => x ?? 0)) : 0);
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
/** Last-name key: "Russell III" and "L.Phillips Jr." both reduce to the family name without suffix. */
const lastKey = (s) =>
  norm(String(s ?? "").replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, "").split(/\s+/).pop());
const airOf = (e) => (e.spot != null && e.los != null ? e.spot - e.los : null);

/** One player's box-score lines in one game, keyed by group, labels turned into numbers. */
function parseBox(rec, teamId, pid) {
  const out = { passing: null, rushing: null, receiving: null, fumbles: null, defensive: null, interceptions: null };
  const tb = rec.box[teamId];
  const p = tb?.players.find((x) => x.id === pid);
  if (!p) return out;
  for (const group of Object.keys(out)) {
    const vals = p.s[group];
    const labels = tb.labels[group];
    if (!vals || !labels) continue;
    const o = {};
    labels.forEach((lab, i) => {
      if (lab === "C/ATT") {
        const [c, a] = String(vals[i]).split("/");
        o.C = num(c);
        o.ATT = num(a);
      } else o[lab] = num(vals[i]);
    });
    out[group] = o;
  }
  return out;
}

/** One player's stat line for one game, from the box score plus his parsed touches. Null = group absent. */
function gameStats(rec, teamId, pid, mine) {
  const box = parseBox(rec, teamId, pid);
  const throws = mine.filter((e) => e.kind === "throw");
  const sacks = mine.filter((e) => e.kind === "sack");
  const rushes = mine.filter((e) => e.kind === "rush");
  const tg = mine.filter((e) => e.kind === "rec" || e.kind === "inc");
  const recs = mine.filter((e) => e.kind === "rec");
  const cmpThrows = throws.filter((e) => e.cmp);
  const s = Object.fromEntries(STAT_KEYS.map((k) => [k, null]));

  const passG = !!(box.passing || throws.length || sacks.length);
  if (passG) {
    const bp = box.passing;
    const withAir = throws.filter((e) => airOf(e) != null);
    Object.assign(s, {
      pAtt: bp ? bp.ATT : throws.length,
      pCmp: bp ? bp.C : cmpThrows.length,
      pYds: bp ? bp.YDS : sum(cmpThrows.map((e) => e.yds)),
      pTd: bp ? bp.TD : throws.filter((e) => e.td).length,
      pInt: bp ? bp.INT : throws.filter((e) => e.int).length,
      pSacks: sacks.length,
      pSackYds: sum(sacks.map((e) => e.lost)),
      pDeepAtt: throws.filter((e) => e.depth === "deep").length,
      pDeepCmp: cmpThrows.filter((e) => e.depth === "deep").length,
      pAir: sum(withAir.map(airOf)),
      pAirAtt: withAir.length,
      pFirst: throws.filter((e) => e.first).length,
    });
  }

  const rushG = !!(box.rushing || rushes.length);
  if (rushG) {
    const br = box.rushing;
    Object.assign(s, {
      rCar: br ? br.CAR : rushes.length,
      rYds: br ? br.YDS : sum(rushes.map((e) => e.yds)),
      rTd: br ? br.TD : rushes.filter((e) => e.td).length,
      rLong: br ? br.LONG : maxOf(rushes.map((e) => e.yds)),
      rRuns10: rushes.filter((e) => e.yds >= 10).length,
      rStuffs: rushes.filter((e) => e.yds <= 0).length,
      rFirst: rushes.filter((e) => e.first).length,
    });
  }

  const recG = !!(box.receiving || tg.length);
  if (recG) {
    const bc = box.receiving;
    const withAir = recs.filter((e) => airOf(e) != null);
    const withYac = recs.filter((e) => e.spot != null && e.end != null);
    Object.assign(s, {
      rcTgt: tg.length,
      rcRec: bc ? bc.REC : recs.length,
      rcYds: bc ? bc.YDS : sum(recs.map((e) => e.yds)),
      rcTd: bc ? bc.TD : recs.filter((e) => e.td).length,
      rcLong: bc ? bc.LONG : maxOf(recs.map((e) => e.yds)),
      rcAir: sum(withAir.map(airOf)),
      rcYac: sum(withYac.map((e) => e.end - e.spot)),
      rcDeepTgt: tg.filter((e) => e.depth === "deep").length,
      rcDeepRec: recs.filter((e) => e.depth === "deep").length,
      rcFirst: recs.filter((e) => e.first).length,
    });
  }

  if (box.fumbles) s.rFumL = box.fumbles.LOST ?? 0;
  else if (passG || rushG || recG) s.rFumL = 0;

  const defG = !!(box.defensive || box.interceptions);
  if (defG) {
    const d = box.defensive ?? {};
    Object.assign(s, {
      dTkl: d.TOT ?? 0,
      dSolo: d.SOLO ?? 0,
      dTfl: d.TFL ?? 0,
      dSacks: d.SACKS ?? 0,
      dHur: d["QB HUR"] ?? 0,
      dPd: d.PD ?? 0,
      dTd: d.TD ?? 0,
      dInt: box.interceptions?.INT ?? 0,
    });
  }
  return s;
}

const toTouch = (e) => ({
  gid: e.gid,
  week: e.week,
  q: e.q,
  clock: e.clock,
  kind: e.kind === "sack" ? "throw" : e.kind,
  depth: e.depth ?? null,
  dir: e.dir ?? null,
  los: e.los,
  spot: e.spot ?? null,
  end: e.end,
  yds: e.yds,
  td: !!e.td,
  first: !!e.first,
  int: !!e.int,
  text: e.text,
});

/**
 * Parses one cached game. env: { fbs: Set(teamId), rosterItems(teamId) -> items[] }.
 * Returns the g/ shape, per-player stat lines and touches, and check counts.
 */
export function processGame(rec, env) {
  // Team total rows (negative ids) are not players; caches written before the extract filter still hold them.
  for (const tb of Object.values(rec.box)) tb.players = tb.players.filter((p) => !String(p.id).startsWith("-"));
  const resolveTok = tokenResolver(rec);
  const boxIdx = new Map(
    Object.entries(rec.box).map(([tid, tb]) => [tid, new Map(tb.players.map((p) => [p.id, p]))]),
  );
  const resolvePlayer = (teamId, jersey, nameTok) => {
    const last = lastKey(String(nameTok).split(".").pop());
    const jer = String(jersey);
    const pool = new Map();
    for (const it of env.rosterItems(teamId)) {
      pool.set(it.id, { id: it.id, last: lastKey(it.last ?? it.name), jersey: String(it.jersey ?? "") });
    }
    for (const bp of boxIdx.get(teamId)?.values() ?? []) {
      pool.set(bp.id, { id: bp.id, last: lastKey(bp.name), jersey: String(bp.jersey ?? "") });
    }
    const all = [...pool.values()];
    const pick = (list) => {
      const ids = [...new Set(list.map((x) => x.id))];
      return ids.length === 1 ? ids[0] : null;
    };
    return pick(all.filter((x) => x.jersey === jer && x.last === last)) ?? pick(all.filter((x) => x.last === last));
  };
  const byName = (teamId, name) => {
    const want = norm(name);
    const hits = new Set();
    for (const bp of boxIdx.get(teamId)?.values() ?? []) if (norm(bp.name) === want) hits.add(bp.id);
    for (const it of env.rosterItems(teamId)) if (norm(it.name) === want) hits.add(it.id);
    return hits.size === 1 ? [...hits][0] : null;
  };
  const ctx = { gid: rec.id, week: rec.week, resolveTok, player: resolvePlayer, byName };

  const events = [];
  const drives = [];
  for (const d of rec.drives) {
    const dt = d.team;
    // Kickoffs belong to the other team's end of the field; drop them before drive start/end (and markers).
    const plays = d.plays.filter((p) => !isMarker(p.type) && !/^Kickoff/i.test(p.type ?? ""));
    for (const p of plays) if (p.sT != null) for (const e of classify(p, ctx)) events.push(e);

    const shaped = plays.map((p) => {
      const start = fieldX(p.sY, p.sT, dt);
      return {
        q: p.q,
        clock: p.clock,
        type: p.type,
        text: p.text,
        down: p.down,
        dist: p.dist,
        start,
        end: start == null ? null : clamp(start + (p.yds ?? 0)),
        yds: p.yds ?? 0,
        score: p.score,
      };
    });
    const withStart = shaped.filter((p) => p.start != null);
    drives.push({
      team: dt,
      start: withStart[0]?.start ?? null,
      end: withStart.length ? withStart[withStart.length - 1].end : null,
      result: d.result,
      yards: d.yards,
      plays: shaped,
    });
  }

  // Team-level checks: receptions and carries parsed from text against the box score.
  const teamChecks = [rec.home.id, rec.away.id].map((tid) => {
    const tb = rec.box[tid];
    let boxRec = 0;
    let boxCar = 0;
    for (const p of tb?.players ?? []) {
      if (p.s.receiving) boxRec += num(p.s.receiving[tb.labels.receiving.indexOf("REC")]);
      if (p.s.rushing) boxCar += num(p.s.rushing[tb.labels.rushing.indexOf("CAR")]);
    }
    return {
      gid: rec.id,
      team: tid,
      boxRec,
      parsedRec: events.filter((e) => e.kind === "rec" && e.offense === tid).length,
      boxCar,
      // ESPN's box score counts sacks among carries, so the carry check adds them back in.
      parsedRush: events.filter((e) => (e.kind === "rush" || e.kind === "sack") && e.offense === tid).length,
    };
  });

  const ids = new Map();
  for (const tid of [rec.home.id, rec.away.id]) for (const p of rec.box[tid]?.players ?? []) ids.set(p.id, tid);
  for (const e of events) if (e.player && !ids.has(e.player)) ids.set(e.player, e.offense);

  const players = new Map();
  for (const [pid, tid] of ids) {
    if (!env.fbs.has(tid)) continue;
    const mine = events.filter((e) => e.player === pid);
    const boxP = boxIdx.get(tid)?.get(pid);
    const rosterP = env.rosterItems(tid).find((it) => it.id === pid);
    players.set(pid, {
      team: tid,
      info: {
        name: boxP?.name ?? rosterP?.name ?? "",
        jersey: boxP?.jersey ?? rosterP?.jersey ?? null,
        hs: boxP?.hs ?? rosterP?.hs ?? null,
      },
      stats: gameStats(rec, tid, pid, mine),
      touches: mine.filter((e) => e.kind !== "sack").map(toTouch),
    });
  }

  const diag = {
    events: events.length,
    unresolved: events.filter((e) => e.player == null).length,
    spotMissing: events.filter((e) => (e.kind === "rec" || e.kind === "inc" || e.kind === "throw") && e.spot == null).length,
  };
  return { drives, players, teamChecks, diag };
}

/** Season total from per-game lines: counts sum, long plays take the max, null when no game had the group. */
export function aggregate(lines) {
  const out = {};
  for (const k of STAT_KEYS) {
    const vals = lines.map((s) => s[k]).filter((v) => v != null);
    let v = null;
    if (vals.length) v = MAX_KEYS.has(k) ? Math.max(...vals) : sum(vals);
    if (v != null && DECIMAL_KEYS.has(k)) v = Math.round(v * 10) / 10;
    out[k] = v;
  }
  return out;
}

/** The pack position: roster position when it maps, else from what the player did. Null = drop. */
function positionOf(agg, rosterPos) {
  if (rosterPos && MAPPED.has(rosterPos)) return rosterPos;
  if (agg.pAtt != null) return "QB";
  if (agg.rCar != null && (agg.rcYds == null || agg.rYds > agg.rcYds)) return "RB";
  if (agg.rcRec != null || agg.rcTgt != null) return "WR";
  return null;
}

const toRosterPos = (raw) => mapRosterPos(raw) ?? raw;

/**
 * records: cached game records (any order). teams: Map(id -> team info). rosters: Map(teamId -> items).
 * polls: from espn.fetchPolls(). weeks: games.json week list. season, updated: strings/numbers.
 */
export function buildOutputs({ season, updated, records, teams, rosters, polls, weeks, currentWeek }) {
  const env = {
    fbs: new Set(teams.keys()),
    rosterItems: (tid) => rosters.get(tid) ?? [],
  };
  const rosterPosOf = (tid, pid) => {
    const it = (rosters.get(tid) ?? []).find((x) => x.id === pid);
    return it ? toRosterPos(it.pos) : null;
  };

  const sorted = [...records].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const byPlayer = new Map();
  const gFiles = new Map();
  const teamChecks = [];
  const diag = { games: 0, events: 0, unresolved: 0, spotMissing: 0, dropped: 0 };

  for (const rec of sorted) {
    const r = processGame(rec, env);
    diag.games++;
    diag.events += r.diag.events;
    diag.unresolved += r.diag.unresolved;
    diag.spotMissing += r.diag.spotMissing;
    teamChecks.push(...r.teamChecks);
    gFiles.set(rec.id, { id: rec.id, home: rec.home.id, away: rec.away.id, drives: r.drives });

    for (const [pid, pg] of r.players) {
      let P = byPlayer.get(pid);
      if (!P) {
        P = { id: pid, team: pg.team, info: pg.info, games: [], touches: [] };
        byPlayer.set(pid, P);
      }
      P.team = pg.team; // last game's team
      if (pg.info.name) P.info = pg.info;
      const has = Object.values(pg.stats).some((v) => v != null);
      const opp = pg.team === rec.home.id ? rec.away : rec.home;
      const me = pg.team === rec.home.id ? rec.home : rec.away;
      if (has) {
        const result = `${me.score > opp.score ? "W" : me.score < opp.score ? "L" : "T"} ${me.score}-${opp.score}`;
        P.games.push({ gid: rec.id, week: rec.week, date: rec.date, opp: opp.id, home: pg.team === rec.home.id, result, stats: pg.stats });
      }
      P.touches.push(...pg.touches);
    }
  }

  const rows = [];
  const pFiles = new Map();
  for (const P of byPlayer.values()) {
    if (P.games.length === 0) continue;
    const agg = aggregate(P.games.map((g) => g.stats));
    const pos = positionOf(agg, rosterPosOf(P.team, P.id));
    const team = teams.get(P.team);
    if (!pos || !team) {
      diag.dropped++;
      continue;
    }
    rows.push({
      id: P.id,
      name: P.info.name,
      pos,
      jersey: P.info.jersey,
      headshot: P.info.hs,
      team: {
        id: team.id,
        name: team.name,
        short: team.short,
        abbr: team.abbr,
        color: team.color,
        altColor: team.altColor,
        logo: team.logo,
        confSlug: team.confSlug,
        confName: team.confName,
      },
      games: P.games.length,
      ...agg,
    });
    pFiles.set(P.id, { id: P.id, games: P.games, touches: P.touches });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const teamRows = [...teams.values()]
    .map((t) => {
      const rank = (key) => polls.find((p) => p.key === key)?.ranks.find((r) => r.teamId === t.id)?.rank ?? null;
      return {
        id: t.id,
        name: t.name,
        short: t.short,
        abbr: t.abbr,
        color: t.color,
        altColor: t.altColor,
        logo: t.logo,
        confSlug: t.confSlug,
        confName: t.confName,
        wins: t.wins,
        losses: t.losses,
        confWins: t.confWins,
        confLosses: t.confLosses,
        apRank: rank("ap"),
        cfpRank: rank("cfp"),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const rankings = {
    updated,
    polls: polls.map((p) => ({ ...p, ranks: p.ranks.filter((r) => teams.has(r.teamId)).sort((a, b) => a.rank - b.rank) })),
  };

  return {
    players: { updated, season, rows },
    teams: teamRows,
    games: { season, currentWeek, weeks },
    rankings,
    pFiles,
    gFiles,
    allTouches: [...byPlayer.values()].flatMap((P) => P.touches),
    teamChecks,
    diag,
  };
}
