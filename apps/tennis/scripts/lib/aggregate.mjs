// Cache loading, season totals per player, and the three output shapes.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { countryInfo } from "./countries.mjs";
import { estimateMatch, setFacts } from "./model.mjs";

const EST_KEYS = [
  "servicePoints", "firstServesIn", "firstServePointsWon", "secondServePointsWon", "servicePointsWon",
  "returnPoints", "returnPointsWon", "returnFirstPointsPlayed", "returnFirstPointsWon", "returnSecondPointsWon",
  "serviceGames", "serviceGamesWon", "breakPointsFaced", "breakPointsSaved", "returnGames", "returnGamesWon",
  "breakPointChances", "breakPointsConverted",
];
const COUNT_KEYS = [
  "matches", "wins", "losses", "aces", "doubleFaults", "tiebreaksPlayed", "tiebreaksWon",
  "decidingSetsPlayed", "decidingSetsWon", "hardMatches", "hardWins", "clayMatches", "clayWins",
  "grassMatches", "grassWins", "top10Played", "top10Won",
];

/** Cached records for one tour in one season. Missing folder = no records yet. */
export async function loadRecords(cacheRoot, tour, season) {
  const dir = path.join(cacheRoot, tour);
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const records = [];
  for (const f of files) {
    const rec = JSON.parse(await readFile(path.join(dir, f), "utf8"));
    if (rec.v === 1 && rec.date?.startsWith(season)) records.push({ ...rec, tour });
  }
  return records;
}

/**
 * Season totals for one tour. Returns a Map keyed by player id plus diagnostics for the sanity check.
 * `sanity` holds the first few matches (newest first) with the points check spelled out.
 */
export function seasonTotals(records) {
  const players = new Map();
  const diag = { records: records.length, fallbacks: 0, outsideTolerance: 0, maxDeviation: 0, other: 0, sanity: [] };
  const ordered = [...records].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : y.id - x.id));

  const acc = (side) => {
    const id = side.id;
    if (!players.has(id)) {
      const a = { id, name: side.name, country: side.country, matches: 0 };
      for (const k of [...COUNT_KEYS, ...EST_KEYS]) a[k] = a[k] ?? 0;
      players.set(id, a);
    }
    return players.get(id);
  };

  for (const rec of ordered) {
    const est = estimateMatch(rec);
    const facts = setFacts(rec);
    if (est.fallback) diag.fallbacks++;
    const diffs = [
      est.p1.servicePointsWon + est.p1.returnPointsWon - rec.p1.st.pts,
      est.p2.servicePointsWon + est.p2.returnPointsWon - rec.p2.st.pts,
    ];
    for (const d of diffs) {
      diag.maxDeviation = Math.max(diag.maxDeviation, Math.abs(d));
      if (Math.abs(d) > 3) diag.outsideTolerance++;
    }
    if (diag.sanity.length < 5) {
      diag.sanity.push({
        id: rec.id, date: rec.date, event: rec.event,
        p1: rec.p1.name, p2: rec.p2.name,
        total: est.total, S1: round1(est.p1.servicePoints), S2: round1(est.p1.returnPoints),
        p1Points: rec.p1.st.pts, estimate: round1(est.p1.servicePointsWon + est.p1.returnPointsWon),
        fallback: est.fallback,
      });
    }

    const sides = [
      { me: rec.p1, opp: rec.p2, e: est.p1, won: rec.winner === 1, tb: facts.tiebreaksP1, tbPlayed: facts.tiebreaks },
      { me: rec.p2, opp: rec.p1, e: est.p2, won: rec.winner === 2, tb: facts.tiebreaksP2, tbPlayed: facts.tiebreaks },
    ];
    for (const s of sides) {
      const a = acc(s.me);
      a.name = a.name || s.me.name;
      a.country = a.country || s.me.country;
      a.matches++;
      if (s.won) a.wins++;
      else a.losses++;
      a.aces += s.me.st.aces;
      a.doubleFaults += s.me.st.df;
      for (const k of EST_KEYS) a[k] += s.e[k];
      a.tiebreaksPlayed += s.tbPlayed;
      a.tiebreaksWon += s.tb;
      if (facts.deciding) {
        a.decidingSetsPlayed++;
        if (s.won) a.decidingSetsWon++;
      }
      if (rec.surface === "hard") { a.hardMatches++; if (s.won) a.hardWins++; }
      if (rec.surface === "clay") { a.clayMatches++; if (s.won) a.clayWins++; }
      if (rec.surface === "grass") { a.grassMatches++; if (s.won) a.grassWins++; }
      if (rec.surface === "other") diag.other++;
      if (Number.isFinite(s.opp.place) && s.opp.place <= 10) {
        a.top10Played++;
        if (s.won) a.top10Won++;
      }
    }
  }
  return { players, diag };
}

const round1 = (x) => Math.round(x * 10) / 10;
const int = (x) => (Number.isFinite(x) ? Math.round(x) : null);

/** Standings row to { rank, points, name, country, headshot }. Generic placeholder headshots become null. */
function standingInfo(row) {
  const p = row.team.player1;
  const head = p.headshots?.w192xh192 ?? null;
  return {
    id: String(p.id),
    rank: int(row.place),
    points: int(row.points),
    name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.name,
    country: countryInfo(p.country),
    headshot: head && !/default_headshot/.test(head) ? head : null,
  };
}

/** The players.json row for one season total, with current standing data added when available. */
function playerRow(a, tour, standing) {
  const row = {
    id: a.id,
    name: standing?.name ?? a.name,
    rank: standing?.rank ?? null,
    points: standing?.points ?? null,
    headshot: standing?.headshot ?? null,
    country: countryInfo(a.country),
    tour,
  };
  row.country = standing?.country ?? row.country;
  // Keep the TennisRow key order: results first, then serve, return, pressure, surfaces, opposition.
  const order = [
    "matches", "wins", "losses",
    "aces", "doubleFaults", "servicePoints", "servicePointsWon", "firstServesIn", "firstServePointsWon",
    "secondServePointsWon", "serviceGames", "serviceGamesWon", "breakPointsFaced", "breakPointsSaved",
    "returnPoints", "returnPointsWon", "returnFirstPointsPlayed", "returnFirstPointsWon",
    "returnSecondPointsWon", "returnGames", "returnGamesWon", "breakPointChances", "breakPointsConverted",
    "tiebreaksPlayed", "tiebreaksWon", "decidingSetsPlayed", "decidingSetsWon",
    "hardMatches", "hardWins", "clayMatches", "clayWins", "grassMatches", "grassWins",
    "top10Played", "top10Won",
  ];
  for (const k of order) row[k] = int(a[k]);
  return row;
}

/**
 * Build the three output documents.
 * perTour: { atp: { records, totals, standings }, wta: { ... } } where standings is the raw array.
 */
export function buildOutputs(perTour, season, updated) {
  const outRows = [];
  const rankings = {};
  const results = {};
  const collisions = [];
  const seen = new Map();

  for (const [tour, { totals, standings, records }] of Object.entries(perTour)) {
    const label = tour === "atp" ? "men" : "women";
    const infos = standings.map(standingInfo);
    const byId = new Map(infos.map((s) => [s.id, s]));

    for (const [id, a] of totals) {
      if (seen.has(id) && seen.get(id) !== tour) collisions.push(id);
      seen.set(id, tour);
      if (a.matches < 1) continue;
      outRows.push(playerRow(a, label, byId.get(id)));
    }

    rankings[label] = infos.map((s) => {
      const a = totals.get(s.id);
      return {
        place: s.rank,
        points: s.points,
        id: s.id,
        name: s.name,
        country: { name: s.country.name, short: s.country.short },
        headshot: s.headshot,
        matches: a ? a.matches : 0,
        wins: a ? a.wins : 0,
      };
    });

    for (const rec of records) {
      // Each row is written from its own player's side: player games first, opponent games second.
      const sides = [
        { me: rec.p1, opp: rec.p2, won: rec.winner === 1, mine: rec.g1, theirs: rec.g2 },
        { me: rec.p2, opp: rec.p1, won: rec.winner === 2, mine: rec.g2, theirs: rec.g1 },
      ];
      for (const { me, opp, won, mine, theirs } of sides) {
        const list = results[me.id] ?? (results[me.id] = []);
        list.push({
          date: rec.date,
          matchId: rec.id,
          event: rec.event,
          level: rec.level,
          surface: rec.surface,
          round: rec.round,
          oppId: opp.id,
          opp: opp.name,
          oppRank: opp.place,
          won,
          score: mine.map((g, i) => `${g}-${theirs[i]}`).join(" "),
        });
      }
    }
  }

  for (const list of Object.values(results)) {
    list.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : y.matchId - x.matchId));
    list.splice(12);
    for (const m of list) delete m.matchId;
  }

  return {
    players: { updated, season, rows: outRows },
    rankings: { updated, men: rankings.men, women: rankings.women },
    results,
    collisions,
  };
}
