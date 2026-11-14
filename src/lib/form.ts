// Form, consistency, movers and indispensability.
//
// Every badge on the site comes from here, and every threshold is a constant below, so the
// rules are the same on the home page, team pages, rankings and the methodology page.
// Inputs: public/data/app/form.json (DHR history from scripts/build-power-ratings.mjs plus
// each team's dated game performances), teams.json and players.json.
import type { Player, TeamSummary } from "./types";

export type RatingHistory = { v: 1; season: number; teams: string[]; through: (string | null)[]; em: (number | null)[][] };
export type FormFile = { asOf: string | null; history: RatingHistory | null; perf: Record<string, [string, number][]> };

// ---------- thresholds ----------
/** Recent form looks at games in this many days, ending on the latest day with a final. */
export const FORM_WINDOW_DAYS = 30;
/** Hot / Cold needs at least this many games in the window... */
export const FORM_MIN_GAMES = 4;
/** ...and this many games before it to compare with. Form is recent games vs the team's own
 *  earlier games, not vs DHR: DHR is pulled toward last season early on, so against DHR good
 *  teams would look "hot" and bad teams "cold" for weeks. */
export const FORM_MIN_GAMES_BEFORE = 2;
/** The recent average must beat (or trail) the earlier average by at least this many points per 100... */
export const FORM_MIN_GAP = 6;
/** ...and by at least this many standard errors of that difference (single games are noisy). */
export const FORM_Z = 1.5;
/** Steady / Volatile needs this many games. */
export const CONSISTENCY_MIN_GAMES = 6;
/** Steady: game-to-game spread at most this share of the typical D-I team's spread. */
export const STEADY_RATIO = 0.7;
/** Volatile: game-to-game spread at least this share of the typical D-I team's spread. */
export const VOLATILE_RATIO = 1.35;
/** Fallback single-game spread (points per 100) when too few games exist to measure it; the rating model's netSigmaPer100. */
export const DEFAULT_GAME_SPREAD = 15.7;
/** "Biggest movers" compares DHR now with DHR this many days earlier. */
export const MOVER_DAYS = 7;
/** A mover must have played at least this many games in that window (so the move is about them). */
export const MOVER_MIN_GAMES = 1;
/** Indispensability leaderboard: minimum games and minutes per game. */
export const INDISPENSABLE_MIN_GAMES = 3;
export const INDISPENSABLE_MIN_MPG = 10;
// Same impact formula as the injury engine (scripts/lib/injuries.mjs); keep these in step.
export const REPLACEMENT_DPR = -2;
export const DPR_SHRINK_POSS = 1500;
export const DPR_PRIOR_POSS = 300;

// ---------- words (shared with the methodology page) ----------
export const FORM_WORDS = {
  hot: "Hot: playing clearly better over the last 30 days than in its earlier games, with each game adjusted for opponent and venue.",
  cold: "Cold: playing clearly worse over the last 30 days than in its earlier games, with each game adjusted for opponent and venue.",
  steady: "Steady: its games land close to its own average. Fewer surprises either way.",
  volatile: "Volatile: its games swing well above and below its own average. Capable of big wins and bad losses.",
  indispensable: "How much the team's DHR rating would drop if this player sat and a typical end-of-bench player took his minutes.",
} as const;

// ---------- dates ----------
const DAY = 864e5;
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);

/** First day any team can carry a Hot / Cold badge: the window must leave room for earlier games. */
export function firstFormDay(file: FormFile): string | null {
  const days = Object.values(file.perf).flatMap(l => l.map(x => x[0])).sort();
  return days.length ? addDays(days[0], FORM_WINDOW_DAYS) : null;
}

/** Typical single-game spread across D-I: pooled within-team standard deviation of game performance. */
export function leagueSpread(file: FormFile, teams: TeamSummary[]): { sd: number; games: number } {
  const rated = new Set(teams.filter(t => t.adjEM != null).map(t => t.id));
  let ss = 0, df = 0, n = 0;
  for (const [id, list] of Object.entries(file.perf)) {
    if (!rated.has(id) || list.length < 2) continue;
    const m = mean(list.map(x => x[1]));
    for (const [, p] of list) ss += (p - m) ** 2;
    df += list.length - 1; n += list.length;
  }
  return df >= 100 ? { sd: Math.sqrt(ss / df), games: n } : { sd: DEFAULT_GAME_SPREAD, games: n };
}

export type FormBadge = "hot" | "cold" | null;
export type ConsistencyBadge = "steady" | "volatile" | null;
export type TeamForm = {
  id: string;
  /** Window [from, to] inclusive. */
  from: string | null; to: string | null;
  games: number; before: number;
  /** Average game performance in the window and before it, and the difference (points per 100). DHR for context. */
  recent: number | null; earlier: number | null; gap: number | null; rating: number | null;
  /** Size of gap the badge needs with this many games. */
  needed: number | null;
  badge: FormBadge;
  /** Plain-words reason there is no badge (or what earned it). */
  why: string;
  consistency: { games: number; spread: number | null; ratio: number | null; badge: ConsistencyBadge; why: string };
};

export function teamForm(team: TeamSummary, file: FormFile, spread: number): TeamForm {
  const to = file.asOf, from = to ? addDays(to, -(FORM_WINDOW_DAYS - 1)) : null;
  const list = file.perf[team.id] ?? [];
  const inWin = from ? list.filter(x => x[0] >= from) : [];
  const early = from ? list.filter(x => x[0] < from) : list;
  const before = early.length;
  const rating = team.adjEM;
  const recent = inWin.length ? mean(inWin.map(x => x[1])) : null;
  const earlier = early.length ? mean(early.map(x => x[1])) : null;
  const gap = recent != null && earlier != null ? recent - earlier : null;
  const needed = inWin.length && before ? Math.max(FORM_MIN_GAP, FORM_Z * spread * Math.sqrt(1 / inWin.length + 1 / before)) : null;
  let badge: FormBadge = null, why: string;
  if (rating == null) why = "Not rated yet.";
  else if (inWin.length < FORM_MIN_GAMES) why = `Needs ${FORM_MIN_GAMES} D-I games in the last ${FORM_WINDOW_DAYS} days (has ${inWin.length}).`;
  else if (before < FORM_MIN_GAMES_BEFORE) why = before === 0 ? `Every game so far is inside the last ${FORM_WINDOW_DAYS} days, so there are no earlier games to compare with yet.` : `Needs ${FORM_MIN_GAMES_BEFORE} earlier games to compare with (has ${before}).`;
  else if (gap != null && needed != null && Math.abs(gap) >= needed) {
    badge = gap > 0 ? "hot" : "cold";
    why = `${Math.abs(gap).toFixed(1)} points per 100 possessions ${gap > 0 ? "better" : "worse"} over its last ${inWin.length} games than in its ${before} before.`;
  } else why = `Within ${needed!.toFixed(1)} points per 100 of its earlier games: normal variation for ${inWin.length} recent and ${before} earlier games.`;

  // Consistency: spread of a team's games around its own average.
  const all = list.map(x => x[1]);
  const m = mean(all);
  const sd = all.length >= 2 ? Math.sqrt(all.reduce((s, p) => s + (p - m) ** 2, 0) / (all.length - 1)) : null;
  const ratio = sd != null ? sd / spread : null;
  let cBadge: ConsistencyBadge = null, cWhy: string;
  if (sd == null || all.length < CONSISTENCY_MIN_GAMES) cWhy = `Needs ${CONSISTENCY_MIN_GAMES} D-I games with box scores (has ${all.length}).`;
  else if (ratio! <= STEADY_RATIO) { cBadge = "steady"; cWhy = `Games land within ±${sd.toFixed(1)} per 100 of its average, tighter than a typical team (±${spread.toFixed(1)}).`; }
  else if (ratio! >= VOLATILE_RATIO) { cBadge = "volatile"; cWhy = `Games swing ±${sd.toFixed(1)} per 100 around its average, wider than a typical team (±${spread.toFixed(1)}).`; }
  else cWhy = `Games swing ±${sd.toFixed(1)} per 100 around its average, close to a typical team (±${spread.toFixed(1)}).`;

  return { id: team.id, from, to, games: inWin.length, before, recent, earlier, gap, rating, needed, badge, why, consistency: { games: all.length, spread: sd, ratio, badge: cBadge, why: cWhy } };
}

/** Form for every rated team, keyed by team id. */
export function allForms(teams: TeamSummary[], file: FormFile) {
  const { sd } = leagueSpread(file, teams);
  return { spread: sd, byId: new Map(teams.map(t => [t.id, teamForm(t, file, sd)])) };
}

// ---------- rating history ----------
export type HistoryPoint = { through: string | null; em: number; rank: number };
const rankCache = new WeakMap<RatingHistory, (number | null)[][]>();
function ranks(h: RatingHistory) {
  let out = rankCache.get(h);
  if (!out) {
    out = h.em.map(row => {
      const order = row.map((v, j) => [v, j] as const).filter(([v]) => v != null).sort((a, b) => b[0]! - a[0]!);
      const r: (number | null)[] = row.map(() => null);
      order.forEach(([, j], i) => { r[j] = i + 1; });
      return r;
    });
    rankCache.set(h, out);
  }
  return out;
}

/** One team's DHR after each refit (first point = preseason when a prior exists). */
export function teamHistory(file: FormFile, id: string): HistoryPoint[] {
  const h = file.history;
  const j = h ? h.teams.indexOf(id) : -1;
  if (!h || j < 0) return [];
  const rk = ranks(h);
  return h.em.flatMap((row, i) => (row[j] == null ? [] : [{ through: h.through[i], em: row[j]!, rank: rk[i][j]! }]));
}

/** Index of the latest snapshot on or before `day` (preseason counts as before everything). */
function snapshotOn(h: RatingHistory, day: string) {
  let k = -1;
  h.through.forEach((t, i) => { if (t == null || t <= day) k = i; });
  return k;
}

export type Mover = { id: string; now: number; then: number; change: number; rankNow: number; rankThen: number; games: number };
/** DHR change over the last `days` days (or since preseason when `days` is null). */
export function movers(file: FormFile, days: number | null = MOVER_DAYS): { since: string | null; rows: Mover[] } {
  const h = file.history;
  if (!h || !file.asOf || h.em.length < 2) return { since: null, rows: [] };
  const last = h.em.length - 1;
  const start = days == null ? 0 : snapshotOn(h, addDays(file.asOf, -days));
  if (start < 0 || start === last) return { since: null, rows: [] };
  const since = h.through[start];
  const rk = ranks(h);
  const rows: Mover[] = [];
  h.teams.forEach((id, j) => {
    const now = h.em[last][j], then = h.em[start][j];
    if (now == null || then == null) return;
    const games = (file.perf[id] ?? []).filter(x => since == null || x[0] > since).length;
    if (games < MOVER_MIN_GAMES) return;
    rows.push({ id, now, then, change: now - then, rankNow: rk[last][j]!, rankThen: rk[start][j]!, games });
  });
  return { since, rows };
}

// ---------- indispensability ----------
export type Indispensable = {
  id: string; name: string; teamId: string; pos: string | null; g: number; mpg: number;
  dpr: number | null; onPoss: number;
  /** DPR pulled toward average until the on-court sample is large (same as the injury engine). */
  shrunk: number;
  /** Team DHR points per 100 possessions lost without him, and the same in points per game at the team's tempo. */
  drop: number; perGame: number | null;
  /** Team's DHR rank now and if its rating fell by `drop` (everyone else unchanged). */
  teamRank: number | null; rankWithout: number | null;
};

export function shrunkDpr(dpr: number | null, onPoss: number | null) {
  const poss = (onPoss ?? 0) + DPR_PRIOR_POSS;
  return dpr != null ? dpr * (poss / (poss + DPR_SHRINK_POSS)) : 0;
}

export function indispensability(players: Player[], teams: TeamSummary[]): Indispensable[] {
  const byId = new Map(teams.map(t => [t.id, t]));
  const ems = teams.filter(t => t.adjEM != null && t.rank != null).map(t => ({ id: t.id, em: t.adjEM! }));
  const rankIf = (id: string, em: number) => 1 + ems.filter(x => x.id !== id && x.em > em).length;
  const out: Indispensable[] = [];
  for (const p of players) {
    const t = byId.get(p.teamId);
    if (!t || p.min == null || (p.g ?? 0) < INDISPENSABLE_MIN_GAMES || p.min < INDISPENSABLE_MIN_MPG) continue;
    const shrunk = shrunkDpr(p.dpr, p.onPoss);
    const drop = Math.max(0, (p.min / 40) * (shrunk - REPLACEMENT_DPR));
    out.push({
      id: p.id, name: p.name, teamId: p.teamId, pos: p.pos, g: p.g ?? 0, mpg: p.min, dpr: p.dpr, onPoss: p.onPoss ?? 0, shrunk, drop,
      perGame: t.adjT != null ? (drop * t.adjT) / 100 : null,
      teamRank: t.rank, rankWithout: t.adjEM != null && t.rank != null ? rankIf(t.id, t.adjEM - drop) : null,
    });
  }
  return out.sort((a, b) => b.drop - a.drop);
}

/** Flat per-team row for tables (rankings Form view). */
export type FormRow = {
  badge: FormBadge; why: string; recent: number | null; earlier: number | null; gap: number | null; games: number; before: number;
  cBadge: ConsistencyBadge; cWhy: string; spread: number | null; cGames: number;
  ch7: number | null; rank7: number | null; games7: number | null; chPre: number | null; rankPre: number | null;
};
export function formRows(forms: Map<string, TeamForm>, week: Mover[], season: Mover[]): Record<string, FormRow> {
  const w = new Map(week.map(m => [m.id, m])), s = new Map(season.map(m => [m.id, m]));
  const out: Record<string, FormRow> = {};
  const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
  for (const [id, f] of forms) {
    const a = w.get(id), b = s.get(id);
    out[id] = {
      badge: f.badge, why: f.why, recent: r1(f.recent), earlier: r1(f.earlier), gap: r1(f.gap), games: f.games, before: f.before,
      cBadge: f.consistency.badge, cWhy: f.consistency.why, spread: r1(f.consistency.spread), cGames: f.consistency.games,
      ch7: a ? r1(a.change) : null, rank7: a?.rankThen ?? null, games7: a?.games ?? null, chPre: b ? r1(b.change) : null, rankPre: b?.rankThen ?? null,
    };
  }
  return out;
}
