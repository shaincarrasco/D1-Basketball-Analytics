// Past-season player stats and high-school prospects: pure transforms, no I/O.
//
// Storage plan (keep the served site small):
// - Raw provider seasons are compacted into .cache/player-seasons/<season>.json (committed, NOT
//   served). A finished season never changes, so each is fetched once.
// - Only the players on a current roster get their past seasons, and those rows ride inside the
//   team file the team and player pages already download (~1–3 KB per team, no extra request).
// - Prospects (high-school classes not yet in college) are one small columnar file, loaded only by
//   the prospects page.

export const CAREER_FORMAT = 1;

/** Raw columns kept per player-season (season totals, rounded). */
export const RAW_FIELDS = ["id", "teamId", "team", "conf", "pos", "g", "gs", "min", "pts", "reb", "ast", "stl", "blk", "tov",
  "fgm", "fga", "tpm", "tpa", "ftm", "fta", "ortg", "drtg", "usg", "ts"];

/** Per-season row shown to readers (per-game values). */
export const CAREER_FIELDS = ["season", "teamId", "team", "g", "mpg", "ppg", "rpg", "apg", "spg", "bpg", "fgPct", "tpPct", "ftPct", "ts", "ortg"];

const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const r1 = v => (v === null ? null : Math.round(v * 10) / 10);
const made = o => num(o?.made);
const att = o => num(o?.attempted);

/** One provider /stats/player/season row → raw compact row (or null if unusable). */
export function rawRow(row, isD1) {
  if (!row || typeof row !== "object" || !Number.isInteger(row.athleteId)) return null;
  if (typeof row.team !== "string" || !isD1(row.conference)) return null;
  return [
    String(row.athleteId), row.teamId != null ? String(row.teamId) : null, row.team.trim(), row.conference ?? null,
    typeof row.position === "string" ? row.position : null,
    num(row.games), num(row.starts), r1(num(row.minutes)), num(row.points), num(row.rebounds?.total ?? row.rebounds), num(row.assists),
    num(row.steals), num(row.blocks), num(row.turnovers),
    made(row.fieldGoals), att(row.fieldGoals), made(row.threePointFieldGoals), att(row.threePointFieldGoals),
    made(row.freeThrows), att(row.freeThrows),
    r1(num(row.offensiveRating)), r1(num(row.defensiveRating)), r1(num(row.usage)), r1(num(row.trueShootingPct)),
  ];
}

/** Provider rows for one season → the cached compact season file. */
export function compactSeason(rows, season, isD1) {
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const r = rawRow(row, isD1);
    if (r) out.push(r);
  }
  return { format: CAREER_FORMAT, season, fields: RAW_FIELDS, rows: out };
}

const pct = (m, a, minAtt) => (m !== null && a !== null && a >= minAtt ? r1((100 * m) / a) : null);
const per = (v, g) => (v !== null && g ? r1(v / g) : null);

/** A cached raw row → the reader-facing per-game career row. */
export function careerRow(season, raw, f) {
  const g = raw[f.g];
  return [
    season, raw[f.teamId], raw[f.team], g,
    per(raw[f.min], g), per(raw[f.pts], g), per(raw[f.reb], g), per(raw[f.ast], g), per(raw[f.stl], g), per(raw[f.blk], g),
    pct(raw[f.fgm], raw[f.fga], 10), pct(raw[f.tpm], raw[f.tpa], 10), pct(raw[f.ftm], raw[f.fta], 10),
    raw[f.ts], raw[f.ortg],
  ];
}

/**
 * Cached seasons + the ids we care about → Map<playerId, careerRow[]>, oldest season first.
 * A player who played for two teams in one season keeps both rows (provider gives one per team).
 * Players with no games in a season are skipped.
 */
export function careersFor(seasonFiles, wanted) {
  const out = new Map();
  const files = [...seasonFiles].filter(s => s && Array.isArray(s.rows)).sort((a, b) => a.season - b.season);
  for (const file of files) {
    const f = Object.fromEntries(file.fields.map((k, i) => [k, i]));
    for (const raw of file.rows) {
      const id = raw[f.id];
      if (!wanted.has(id) || !raw[f.g]) continue;
      (out.get(id) ?? out.set(id, []).get(id)).push(careerRow(file.season, raw, f));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ prospects */

export const PROSPECT_FIELDS = ["year", "rank", "name", "pos", "stars", "rating", "ht", "wt", "hs", "city", "state", "teamId", "college"];

/**
 * One provider /recruiting/players row → prospect row. `committedTo` is the college; `school` is the
 * high school. An uncommitted prospect has no college (we never fall back to the high school).
 */
export function prospectRow(r, year) {
  if (!r || typeof r !== "object" || typeof r.name !== "string") return null;
  const c = r.committedTo;
  const college = c && typeof c === "object" ? c.name ?? null : typeof c === "string" ? c : null;
  const teamId = c && typeof c === "object" && c.id != null ? String(c.id) : r.committedToId != null ? String(r.committedToId) : null;
  const ht = num(r.heightInches ?? r.height);
  return [
    year, num(r.ranking), r.name.trim(), r.position ?? null, num(r.stars), num(r.rating),
    ht === null ? null : Math.round(ht), num(r.weightPounds ?? r.weight),
    typeof r.school === "string" && r.school !== college ? r.school : null,
    r.city ?? r.hometown?.city ?? null, r.stateProvince ?? r.state ?? r.hometown?.state ?? null,
    teamId, college,
  ];
}

/**
 * Prospect rows → per-team class summary, ranked by the sum of commits' ratings (the usual
 * "class points" idea, without inventing a provider's proprietary formula).
 * Returns [{ teamId, year, commits, five, four, avgRating, points, rank }].
 */
export function classRanks(rows) {
  const f = Object.fromEntries(PROSPECT_FIELDS.map((k, i) => [k, i]));
  const byKey = new Map();
  for (const r of rows) {
    if (!r[f.teamId]) continue;
    const k = `${r[f.year]}|${r[f.teamId]}`;
    const s = byKey.get(k) ?? { teamId: r[f.teamId], year: r[f.year], commits: 0, five: 0, four: 0, ratingSum: 0, rated: 0 };
    s.commits++;
    if (r[f.stars] === 5) s.five++;
    if (r[f.stars] === 4) s.four++;
    if (r[f.rating] !== null) { s.ratingSum += r[f.rating]; s.rated++; }
    byKey.set(k, s);
  }
  const out = [...byKey.values()].map(s => ({
    teamId: s.teamId, year: s.year, commits: s.commits, five: s.five, four: s.four,
    avgRating: s.rated ? Math.round((s.ratingSum / s.rated) * 10000) / 10000 : null,
    points: Math.round(s.ratingSum * 100) / 100,
  }));
  for (const year of new Set(out.map(s => s.year))) {
    out.filter(s => s.year === year).sort((a, b) => b.points - a.points || b.commits - a.commits)
      .forEach((s, i) => { s.rank = i + 1; });
  }
  return out;
}
