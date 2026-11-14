// Fill in results the schedule provider hasn't published yet, using ESPN's completed box scores.
//
// The College Basketball Data schedule refreshes once a day (and GitHub's cron often runs it hours
// late), while ESPN box scores are fetched on every run. Any provider game that ESPN shows as final
// gets its score, winner and an ESPN possession estimate, so ratings, records, schedules and
// simulations all move on every run. The next provider refresh overwrites these with official rows.
//
// Input/output: public/data/games-season-2027.json (in place). Reads .cache/espn-player-games-2027.json
// and public/data/team-directory.json.
import { readFile, writeFile } from "node:fs/promises";

const GAMES = "public/data/games-season-2027.json";
const readJson = async (path, fallback) => { try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; } };
const [payload, espn, directory] = await Promise.all([
  readJson(GAMES, null),
  readJson(".cache/espn-player-games-2027.json", { events: {} }),
  readJson("public/data/team-directory.json", { teams: [] }),
]);
if (!payload?.games) { console.log("[espn-finals] No schedule file; nothing to merge."); process.exit(0); }

// Same name matching as build-app-data (ESPN directory keyed by location).
const normName = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIASES = { neworleans: "lsuneworleans", stthomasminnesota: "stthomas" };
const dirByLoc = new Map((directory.teams ?? []).map(t => [normName(t.location || t.displayName), t]));
const espnIdOf = name => {
  const d = dirByLoc.get(normName(name)) ?? dirByLoc.get(ALIASES[normName(name)] ?? "");
  return d?.id != null ? String(d.id) : null;
};
const etDate = iso => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));

// ESPN finals indexed by day + ESPN team id.
const byDayTeam = new Map();
for (const [id, ev] of Object.entries(espn.events ?? {})) {
  if ((ev.teams ?? []).length !== 2) continue;
  for (const side of ev.teams) {
    const key = `${ev.day}:${side.teamId}`;
    if (!byDayTeam.has(key)) byDayTeam.set(key, []);
    byDayTeam.get(key).push({ id, ev });
  }
}
// Possessions from the player box: FGA − ORB + TOV + 0.475·FTA per side, averaged.
const fields = espn.fields ?? ["athleteId", "name", "starter", "min", "pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "orb", "drb", "reb", "ast", "stl", "blk", "tov", "pf"];
const col = name => fields.indexOf(name);
const sidePoss = side => {
  const sum = k => (side.players ?? []).reduce((s, p) => s + (Number(p[col(k)]) || 0), 0);
  const fga = sum("fga");
  return fga > 0 ? fga - sum("orb") + sum("tov") + 0.475 * sum("fta") : null;
};

const today = etDate(new Date().toISOString());
let merged = 0, ambiguous = 0;
for (const g of payload.games) {
  if (g.status === "final" || g.status === "postponed" || g.status === "canceled") continue;
  const day = etDate(g.date);
  if (day > today) continue;
  const h = espnIdOf(g.homeTeam), a = espnIdOf(g.awayTeam);
  if (!h && !a) continue;
  // Prefer an event containing both teams; with only one side mapped (non-D-I opponent) require a unique match.
  const cands = (byDayTeam.get(`${day}:${h ?? a}`) ?? []).filter(c => !h || !a || c.ev.teams.some(s => s.teamId === (h ? a : h)));
  if (cands.length !== 1) { if (cands.length > 1) ambiguous++; continue; }
  const { ev } = cands[0];
  const anchor = ev.teams.find(s => s.teamId === (h ?? a));
  const other = ev.teams.find(s => s !== anchor);
  if (!anchor || !other || anchor.pts == null || other.pts == null) continue;
  const homeSide = h ? anchor : other, awaySide = h ? other : anchor;
  g.homeScore = homeSide.pts;
  g.awayScore = awaySide.pts;
  g.homeWinner = g.homeScore > g.awayScore;
  g.awayWinner = g.awayScore > g.homeScore;
  g.status = "final";
  g.scoreSource = "espn";
  const pa = sidePoss(anchor), pb = sidePoss(other);
  g.espnPossessions = pa && pb ? Math.round(((pa + pb) / 2) * 10) / 10 : null;
  merged++;
}
await writeFile(GAMES, JSON.stringify(payload, null, 2) + "\n");
console.log(`[espn-finals] Filled ${merged} result(s) from ESPN box scores${ambiguous ? `; skipped ${ambiguous} ambiguous match(es)` : ""}.`);
