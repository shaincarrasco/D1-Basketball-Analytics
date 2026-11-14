// Player skill projections: what each player's skills most likely are, given this season's
// box scores AND what players like him usually do. Runs after build-app-data.mjs.
//
// Method (documented on /methodology/#skills):
//   1. Per stat, every game gives a count over an opportunity (3PM over 3PA, offensive boards
//      over available offensive boards while he was on the floor, ...). Team and opponent
//      totals come from the ESPN box scores in .cache/espn-player-games-2027.json.
//   2. Opponent adjustment: each opponent's "allowed" rate for the stat (shrunk toward the
//      D-I rate, non-D-I opponents pooled into one bucket) divides that game's count, so a
//      30-point night against a non-D-I team counts for less than one against a top defense.
//   3. Prior: a weighted regression of the stat on position, height, recruiting stars and
//      class year (3P% also uses his projected FT%). Unranked recruits get the
//      position/height/class prior.
//   4. Shrinkage (empirical Bayes): projection = (adjusted count + k × prior) / (opportunities + k).
//      k is fitted per stat from the data: k = noise per opportunity / true-talent spread.
//      So 3P% (noisy, small real spread) leans on the prior for hundreds of attempts, while
//      usage settles in a couple of games.
//   5. Percentiles vs D-I players averaging 10+ minutes; letter grades on the scouting scale.
//   6. Validation: refit everything on each player's first half of games, predict the second
//      half, and compare with simply using his first-half average.
//
// Output:
//   public/data/app/skills.json          { meta, "<playerId>": { "<stat>": { proj, pct, grade, n, raw } } }
//   public/data/app/skills/<slug>.json   per-team detail for the player page (prior, weight, opponent factor)
import { mkdir, readFile, writeFile } from "node:fs/promises";

const APP = "public/data/app";
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const players = await readJson(`${APP}/players.json`);
const teams = await readJson(`${APP}/teams.json`);
const espn = await readJson(".cache/espn-player-games-2027.json").catch(() => ({ events: {}, fields: [] }));
const F = Object.fromEntries(players.fields.map((f, i) => [f, i]));
const POOL_MIN = 10; // minutes per game for the percentile pool (same as the scouting report)

const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v, d = 1) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

// ---------- stat catalog ----------
// scale: stored rate × scale = displayed value. kind "binom" = a shooting % (binomial noise);
// "rate" = everything else (noise measured from game-to-game variation). opp: opponent-adjusted.
const STATS = [
  // FT% comes first: the 3P% prior uses it.
  { key: "ft", label: "Free-throw %", short: "FT%", unit: "%", scale: 100, kind: "binom", opp: false, nUnit: "free throws" },
  // kFallback: when this season can't yet separate 3P talent from luck, use the published
  // year-to-year 3P% correlation of .371 for players with ~165–315 attempts (KenPom, "back in the
  // lab"): r = n / (n + k) at n ≈ 230 gives k ≈ 390 attempts. Not opponent-adjusted: defenses
  // control opponent 3P% little, and adjusting made the holdout slightly worse.
  { key: "tp", label: "3-point %", short: "3P%", unit: "%", scale: 100, kind: "binom", opp: false, nUnit: "three-point attempts", kFallback: 390 },
  { key: "two", label: "2-point %", short: "2P%", unit: "%", scale: 100, kind: "binom", opp: true, nUnit: "two-point attempts" },
  { key: "rim", label: "FG% at the rim", short: "Rim FG%", unit: "%", scale: 100, kind: "binom", opp: false, nUnit: "shots at the rim", season: true },
  { key: "mid", label: "Mid-range FG%", short: "Mid FG%", unit: "%", scale: 100, kind: "binom", opp: false, nUnit: "two-point jumpers", season: true },
  { key: "pts", label: "Points per 40 minutes", short: "PTS/40", unit: "", scale: 40, kind: "rate", opp: true, nUnit: "minutes" },
  { key: "usg", label: "Usage rate", short: "USG%", unit: "%", scale: 100, kind: "rate", opp: false, nUnit: "team possessions on the floor" },
  { key: "ast", label: "Assist rate", short: "AST%", unit: "%", scale: 100, kind: "rate", opp: true, nUnit: "teammate baskets on the floor" },
  { key: "tov", label: "Turnover rate", short: "TOV%", unit: "%", scale: 100, kind: "rate", opp: true, invert: true, nUnit: "possessions used" },
  { key: "orb", label: "Offensive rebound %", short: "OR%", unit: "%", scale: 100, kind: "rate", opp: true, nUnit: "offensive rebound chances" },
  { key: "drb", label: "Defensive rebound %", short: "DR%", unit: "%", scale: 100, kind: "rate", opp: true, nUnit: "defensive rebound chances" },
  { key: "stl", label: "Steal rate", short: "Stl%", unit: "%", scale: 100, kind: "rate", opp: true, nUnit: "opponent possessions on the floor" },
  { key: "blk", label: "Block rate", short: "Blk%", unit: "%", scale: 100, kind: "rate", opp: true, nUnit: "opponent two-point tries on the floor" },
];
const GAME_STATS = STATS.filter(s => !s.season);

// ---------- team / opponent box totals per ESPN game ----------
const EF = Object.fromEntries((espn.fields ?? []).map((f, i) => [f, i]));
const espnIdOf = t => (String(t.logo ?? "").match(/\/(\d+)\.png/) ?? [])[1] ?? null;
const d1Espn = new Set(teams.map(espnIdOf).filter(Boolean));
const sumSide = side => {
  const t = { min: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0 };
  for (const p of side.players ?? []) for (const k of Object.keys(t)) t[k] += num(p[EF[k]]) ?? 0;
  return t;
};
const boxes = new Map(); // `${espnTeamId}:${day}` -> { T, O, oppKey }
const teamGames = new Map(); // espnTeamId -> [{ day, T, O, oppKey }]
for (const ev of Object.values(espn.events ?? {})) {
  const sides = ev.teams ?? [];
  if (sides.length !== 2 || !sides.every(s => s.players?.length)) continue;
  const tot = sides.map(sumSide);
  sides.forEach((s, i) => {
    const g = { day: ev.day, T: tot[i], O: tot[1 - i], oppKey: d1Espn.has(String(s.oppId)) ? String(s.oppId) : "nonD1" };
    boxes.set(`${s.teamId}:${ev.day}`, g);
    if (!teamGames.has(String(s.teamId))) teamGames.set(String(s.teamId), []);
    teamGames.get(String(s.teamId)).push(g);
  });
}
for (const list of teamGames.values()) list.sort((a, b) => a.day.localeCompare(b.day));

// Team-level count/opportunity for the opponent ("allowed") tables, keyed by the opponent.
const possUsed = b => b.fga + 0.44 * b.fta + b.tov;
const possOf = b => b.fga - b.orb + b.tov + 0.475 * b.fta;
const TEAM_LINE = {
  tp: (T) => [T.tpm, T.tpa],
  two: (T) => [T.fgm - T.tpm, T.fga - T.tpa],
  pts: (T) => [T.pts, T.min],
  ast: (T) => [T.ast, T.fgm],
  tov: (T) => [T.tov, possUsed(T)],
  orb: (T, O) => [T.orb, T.orb + O.drb],
  drb: (T, O) => [T.drb, T.drb + O.orb],
  stl: (T, O) => [T.stl, possOf(O)],
  blk: (T, O) => [T.blk, O.fga - O.tpa],
};
/** Opponent factors from a set of team-games: factor > 1 = this opponent gives up more of the stat than average. */
function opponentFactors(games) {
  const out = {};
  for (const s of GAME_STATS.filter(x => x.opp)) {
    const agg = new Map(); let N = 0, D = 0, G = 0;
    for (const g of games) {
      const [n, d] = TEAM_LINE[s.key](g.T, g.O);
      if (!(d > 0)) continue;
      N += n; D += d; G++;
      const a = agg.get(g.oppKey) ?? { n: 0, d: 0 }; a.n += n; a.d += d; agg.set(g.oppKey, a);
    }
    const L = D ? N / D : 0, K = 3 * (G ? D / G : 0); // shrink each opponent toward D-I with three games' worth of evidence
    const f = new Map([...agg].map(([k, a]) => [k, L ? (a.n + K * L) / (a.d + K) / L : 1]));
    out[s.key] = { league: L, factor: k => f.get(k) ?? 1, nonD1: f.get("nonD1") ?? null };
  }
  return out;
}

// ---------- players: identity, prior features, game lines ----------
const teamById = new Map(teams.map(t => [t.id, t]));
const normPos = p => { const u = String(p ?? "").toUpperCase(); return u === "G" || u === "PG" || u === "SG" ? "G" : u === "F" || u === "SF" || u === "PF" ? "F" : u === "C" ? "C" : null; };
const inches = ht => { const m = String(ht ?? "").match(/(\d+)'\s*(\d+)?/); return m ? Number(m[1]) * 12 + Number(m[2] ?? 0) : null; };
const teamFiles = new Map();
for (const t of teams) teamFiles.set(t.slug, await readJson(`${APP}/team/${t.slug}.json`).catch(() => null));

const people = [];
for (const row of players.rows) {
  const t = teamById.get(row[F.teamId]);
  if (!t) continue;
  const tf = teamFiles.get(t.slug);
  const bio = tf?.bios?.[row[F.id]] ?? null;
  const LF = Object.fromEntries((tf?.logFields ?? []).map((f, i) => [f, i]));
  const espnTeam = espnIdOf(t);
  const logs = (tf?.logs?.[row[F.id]] ?? []).filter(x => (x[LF.min] ?? 0) > 0).map(x => ({
    day: x[LF.day], min: x[LF.min], pts: x[LF.pts], fgm: x[LF.fgm], fga: x[LF.fga], tpm: x[LF.tpm], tpa: x[LF.tpa], ftm: x[LF.ftm], fta: x[LF.fta],
    orb: x[LF.orb], drb: x[LF.drb], ast: x[LF.ast], stl: x[LF.stl], blk: x[LF.blk], tov: x[LF.tov], box: boxes.get(`${espnTeam}:${x[LF.day]}`) ?? null,
  })).sort((a, b) => a.day.localeCompare(b.day));
  // Play-by-play shots by day (rim = layups, dunks, tip-ins; mid = two-point jumpers) for validation.
  const shotDays = new Map();
  for (const s of tf?.shots?.byPid?.[row[F.id]] ?? []) {
    const [, , made, value, kind, , day] = s;
    if (value !== 2) continue;
    const z = kind === "J" ? "mid" : "rim";
    const d = shotDays.get(day) ?? { rim: [0, 0], mid: [0, 0] }; d[z][0] += made ? 1 : 0; d[z][1] += 1; shotDays.set(day, d);
  }
  const pos = normPos(row[F.pos]) ?? normPos(bio?.pos);
  people.push({
    id: row[F.id], slug: t.slug, espnTeam, mpg: row[F.min] ?? 0, g: logs.length,
    pos, ht: inches(bio?.ht), stars: row[F.stars] ?? null, year: bio?.year ?? null, recRank: row[F.recRank] ?? null,
    logs, shotDays,
    season: { rim: [row[F.rimM], row[F.rimA]], mid: [row[F.midM], row[F.midA]] },
  });
}
// Position mean height fills a missing height.
const htByPos = {};
for (const p of ["G", "F", "C", null]) { const v = people.filter(x => x.pos === p && x.ht).map(x => x.ht); htByPos[p] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 77; }

/** One game's count and opportunity for a stat (null when the opportunity is unknown). */
function gameLine(s, x) {
  const fgm2 = x.fgm - x.tpm, fga2 = x.fga - x.tpa;
  switch (s) {
    case "tp": return [x.tpm, x.tpa];
    case "ft": return [x.ftm, x.fta];
    case "two": return [fgm2, fga2];
    case "pts": return [x.pts, x.min];
    case "tov": return [x.tov, x.fga + 0.44 * x.fta + x.tov];
  }
  const b = x.box;
  if (!b || !(b.T.min > 0)) return null;
  const f = x.min / (b.T.min / 5); // share of the game he was on the floor
  switch (s) {
    case "usg": return [x.fga + 0.44 * x.fta + x.tov, f * possUsed(b.T)];
    case "ast": return [x.ast, Math.max(0, f * b.T.fgm - x.fgm)];
    case "orb": return [x.orb, f * (b.T.orb + b.O.drb)];
    case "drb": return [x.drb, f * (b.T.drb + b.O.orb)];
    case "stl": return [x.stl, f * possOf(b.O)];
    case "blk": return [x.blk, f * (b.O.fga - b.O.tpa)];
  }
  return null;
}

// ---------- small linear algebra ----------
function wls(X, y, w, lambda = 1) {
  const p = X[0].length, A = Array.from({ length: p }, () => new Array(p).fill(0)), b = new Array(p).fill(0);
  for (let i = 0; i < X.length; i++) for (let j = 0; j < p; j++) { b[j] += w[i] * X[i][j] * y[i]; for (let k = 0; k < p; k++) A[j][k] += w[i] * X[i][j] * X[i][k]; }
  const tr = A.reduce((s, r, j) => s + r[j], 0) / p;
  for (let j = 1; j < p; j++) A[j][j] += lambda * 1e-3 * tr; // light ridge, intercept unpenalised
  for (let c = 0; c < p; c++) { // Gaussian elimination with partial pivoting
    let m = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
    [A[c], A[m]] = [A[m], A[c]]; [b[c], b[m]] = [b[m], b[c]];
    for (let r = 0; r < p; r++) { if (r === c || !A[c][c]) continue; const q = A[r][c] / A[c][c]; for (let k = c; k < p; k++) A[r][k] -= q * A[c][k]; b[r] -= q * b[c]; }
  }
  return b.map((v, j) => (A[j][j] ? v / A[j][j] : 0));
}
const FEATURES = ["base", "forward", "center", "height", "5-star", "4-star", "3-star", "sophomore", "junior", "senior"];
const featuresOf = p => {
  const ht = (p.ht ?? htByPos[p.pos]) - 77;
  return [1, p.pos === "F" ? 1 : 0, p.pos === "C" ? 1 : 0, ht, p.stars === 5 ? 1 : 0, p.stars === 4 ? 1 : 0, p.stars && p.stars <= 3 ? 1 : 0,
    p.year === "SO" ? 1 : 0, p.year === "JR" ? 1 : 0, p.year === "SR" ? 1 : 0];
};

// ---------- the projection engine ----------
// sel(p) -> the games that count (all of them, or the first half for validation). Returns per-stat fits
// and per-player { n, rawN, adjN, prior, proj, w, sched } for that game set.
function project(sel, teamGameSel) {
  const opp = opponentFactors(teamGameSel);
  const fits = {}, out = new Map(people.map(p => [p.id, {}]));
  for (const s of STATS) {
    const sc = opp[s.key];
    // Aggregate each player's counts.
    const rows = [];
    for (const p of people) {
      let n = 0, d = 0, adj = 0, sq = 0, games = 0;
      const perGame = [];
      if (s.season) {
        if (sel.all) { const [m, a] = p.season[s.key]; if (num(a) && a > 0) { n = m ?? 0; d = a; adj = n; } }
        else for (const x of sel(p)) { const z = p.shotDays.get(x.day)?.[s.key]; if (z && z[1] > 0) { n += z[0]; d += z[1]; perGame.push(z); } adj = n; }
      } else {
        for (const x of sel(p)) {
          const line = gameLine(s.key, x);
          if (!line || !(line[1] > 0)) continue;
          const fac = sc && x.box ? sc.factor(x.box.oppKey) : 1;
          n += line[0]; d += line[1]; adj += line[0] / fac; games++; perGame.push(line);
        }
      }
      rows.push({ p, n, d, adj, perGame, games });
    }
    const data = rows.filter(r => r.d > 0);
    const totalN = data.reduce((a, r) => a + r.adj, 0), totalD = data.reduce((a, r) => a + r.d, 0);
    const mean = totalD ? totalN / totalD : 0;
    // Noise per unit of opportunity: binomial for shooting, game-to-game spread for rates.
    let sigma2 = mean * (1 - mean);
    if (s.kind === "rate") {
      let ss = 0, df = 0;
      for (const r of data) {
        const g = r.perGame.filter(l => l[1] > 0);
        if (g.length < 2) continue;
        const rbar = g.reduce((a, l) => a + l[0], 0) / g.reduce((a, l) => a + l[1], 0);
        for (const l of g) ss += l[1] * (l[0] / l[1] - rbar) ** 2;
        df += g.length - 1;
      }
      if (df > 50) sigma2 = ss / df;
    }
    // Extra 3P% feature: how far his projected FT% sits from its prior (touch carries over).
    const extra = s.key === "tp" ? (p => { const f = out.get(p.id).ft; return f ? f.proj - f.prior : 0; }) : null;
    const X = data.map(r => (extra ? [...featuresOf(r.p), extra(r.p)] : featuresOf(r.p)));
    const y = data.map(r => r.adj / r.d);
    // Iterate: fit prior, measure true-talent spread (tau2) left after the prior, reweight.
    let tau2 = null, tau2Se = null, beta = null, k = null, kSource = "data";
    let w = data.map(r => r.d);
    for (let it = 0; it < 4; it++) {
      beta = wls(X, y, w);
      const mu = X.map(x => x.reduce((a, v, j) => a + v * beta[j], 0));
      const minD = s.kind === "binom" ? 5 : (totalD / Math.max(1, data.length)) * 0.5;
      let acc = 0, cnt = 0, noiseSq = 0;
      data.forEach((r, i) => { if (r.d >= minD) { acc += (y[i] - mu[i]) ** 2 - sigma2 / r.d; noiseSq += (sigma2 / r.d) ** 2; cnt++; } });
      tau2 = cnt ? acc / cnt : 0;
      // Rough standard error of tau2 (squared normal noise has variance 2·v²): below two of these
      // the talent spread can't be told apart from zero yet.
      tau2Se = cnt ? Math.sqrt(2 * noiseSq) / cnt : Infinity;
      const floor = sigma2 / 2000; // caps k at 2000 opportunities
      k = sigma2 / Math.max(tau2, floor);
      kSource = "data";
      if (tau2 < 2 * tau2Se && s.kFallback) { k = s.kFallback; kSource = "outside"; }
      w = data.map(r => 1 / (sigma2 / k + sigma2 / r.d));
    }
    fits[s.key] = { mean, sigma2, tau2, tau2Se, k, kSource, beta, features: extra ? [...FEATURES, "FT% above his prior"] : FEATURES, opp: sc ? { nonD1: sc.nonD1 } : null };
    for (const r of rows) {
      const x = extra ? [...featuresOf(r.p), extra(r.p)] : featuresOf(r.p);
      const prior = Math.max(0, x.reduce((a, v, j) => a + v * beta[j], 0));
      const proj = (r.adj + k * prior) / (r.d + k);
      out.get(r.p.id)[s.key] = { n: r.d, rawN: r.n, adjN: r.adj, prior, proj, w: r.d / (r.d + k), games: r.games };
    }
  }
  return { fits, out, opp };
}

// ---------- production run ----------
const allSel = p => p.logs; allSel.all = true;
const allTeamGames = [...teamGames.values()].flat();
const prod = project(allSel, allTeamGames);

// Percentiles vs D-I players averaging 10+ minutes; grades on the scouting-report scale
// (src/app/player/scouting.tsx `grade`).
const grade = pc => { const n = pc * 100; return n >= 97 ? "A+" : n >= 93 ? "A" : n >= 90 ? "A-" : n >= 85 ? "B+" : n >= 80 ? "B" : n >= 75 ? "B-" : n >= 65 ? "C+" : n >= 50 ? "C" : n >= 35 ? "C-" : n >= 25 ? "D+" : n >= 10 ? "D" : "D-"; };
const poolIds = new Set(people.filter(p => p.mpg >= POOL_MIN).map(p => p.id));
const pools = {};
for (const s of STATS) pools[s.key] = people.filter(p => poolIds.has(p.id)).map(p => prod.out.get(p.id)[s.key].proj).sort((a, b) => a - b);
const pctOf = (s, v) => {
  const a = pools[s.key]; let lo = 0, hi = a.length;
  if (s.invert) { while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= v) lo = m + 1; else hi = m; } return (a.length - lo) / a.length; }
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo / a.length;
};

// ---------- validation: first half of each player's games -> second half ----------
const half = p => p.logs.slice(0, Math.floor(p.logs.length / 2));
const second = p => p.logs.slice(Math.floor(p.logs.length / 2));
const trainTeamGames = [...teamGames.values()].flatMap(list => list.slice(0, Math.floor(list.length / 2)));
const val = project(half, trainTeamGames);
const validation = {};
for (const s of STATS) {
  let wsum = 0, seRaw = 0, seShr = 0, seOpp = 0, seRawAbs = 0, seShrAbs = 0, seOppAbs = 0, sePrior = 0, noise = 0, players = 0;
  const rot = { w: 0, raw: 0, proj: 0, players: 0 };
  for (const p of people) {
    if (p.logs.length < 2) continue;
    const tr = val.out.get(p.id)[s.key];
    if (!tr || !(tr.n > 0)) continue;
    // Second-half truth.
    let n2 = 0, d2 = 0, facW = 0;
    for (const x of second(p)) {
      if (s.season) { const z = p.shotDays.get(x.day)?.[s.key]; if (z && z[1] > 0) { n2 += z[0]; d2 += z[1]; facW += z[1]; } continue; }
      const line = gameLine(s.key, x);
      if (!line || !(line[1] > 0)) continue;
      n2 += line[0]; d2 += line[1];
      facW += line[1] * (s.opp && x.box ? val.opp[s.key].factor(x.box.oppKey) : 1);
    }
    if (!(d2 > 0)) continue;
    const truth = n2 / d2, sched = facW / d2;
    const raw = tr.rawN / tr.n;
    const shrunkNoOpp = (tr.rawN + val.fits[s.key].k * tr.prior) / (tr.n + val.fits[s.key].k);
    const withOpp = tr.proj * sched; // opponent-neutral projection, re-scaled to the opponents he actually faced next
    players++; wsum += d2;
    seRaw += d2 * (raw - truth) ** 2; seShr += d2 * (shrunkNoOpp - truth) ** 2; seOpp += d2 * (withOpp - truth) ** 2;
    seRawAbs += d2 * Math.abs(raw - truth); seShrAbs += d2 * Math.abs(shrunkNoOpp - truth); seOppAbs += d2 * Math.abs(withOpp - truth);
    sePrior += d2 * (tr.prior * (s.opp ? sched : 1) - truth) ** 2;
    if (p.mpg >= POOL_MIN) { rot.players++; rot.w += d2; rot.raw += d2 * (raw - truth) ** 2; rot.proj += d2 * ((s.opp ? withOpp : shrunkNoOpp) - truth) ** 2; }
    noise += val.fits[s.key].sigma2; // d2 × (sigma2 / d2): the part of the error nothing can remove
  }
  const best = s.opp ? seOpp : seShr;
  validation[s.key] = {
    players,
    rmseRaw: round(Math.sqrt(seRaw / wsum) * s.scale, 2),
    rmseProj: round(Math.sqrt(best / wsum) * s.scale, 2),
    rmseShrinkOnly: round(Math.sqrt(seShr / wsum) * s.scale, 2),
    maeRaw: round((seRawAbs / wsum) * s.scale, 2),
    maeProj: round(((s.opp ? seOppAbs : seShrAbs) / wsum) * s.scale, 2),
    mseCut: round(1 - best / seRaw, 3),
    // Error left after removing the coin-flip noise in the second half itself (rough floor).
    reducibleCut: seRaw - noise > 0 ? round(1 - Math.max(0, best - noise) / (seRaw - noise), 3) : null,
    rmsePriorOnly: round(Math.sqrt(sePrior / wsum) * s.scale, 2),
    rotation: { players: rot.players, rmseRaw: round(Math.sqrt(rot.raw / rot.w) * s.scale, 2), rmseProj: round(Math.sqrt(rot.proj / rot.w) * s.scale, 2), mseCut: round(1 - rot.proj / rot.raw, 3) },
    usedOpp: s.opp,
  };
}

// ---------- write ----------
const meta = {
  built: new Date().toISOString(),
  season: "2026-27",
  method: "Empirical-Bayes shrinkage toward a prior from position, height, recruiting stars and class year; opponent-adjusted where the stat depends on the opponent.",
  pool: { minMpg: POOL_MIN, players: poolIds.size },
  scale: "pct is 0–1 vs D-I players averaging 10+ minutes (1 = best; turnover rate is inverted so 1 = fewest). grade uses the scouting-report scale. proj and raw are in display units (see stats[].unit). n = the player's own opportunities this season in stats[].nUnit.",
  stats: STATS.map(s => {
    const f = prod.fits[s.key];
    return {
      key: s.key, label: s.label, short: s.short, unit: s.unit, nUnit: s.nUnit, invert: !!s.invert, oppAdjusted: s.opp, seasonOnly: !!s.season,
      k: round(f.k, 1), kSource: f.kSource, league: round(f.mean * s.scale, 2), talentSd: round(Math.sqrt(Math.max(0, f.tau2)) * s.scale, 2), talentMeasurable: f.tau2 >= 2 * f.tau2Se,
      prior: Object.fromEntries(f.features.map((name, j) => [name, round(f.beta[j] * (name === "FT% above his prior" ? 1 : s.scale), 3)])),
      nonD1Factor: f.opp?.nonD1 != null ? round(f.opp.nonD1, 3) : null,
      validation: validation[s.key],
    };
  }),
  classGrowth: "Not modelled: the data has one season of player stats, so year-over-year growth can't be measured. Class year enters the starting point only as the level difference between this season's freshmen, sophomores, juniors and seniors.",
  validationNote: "Refit on each player's first half of games (and each team's first half for opponent factors), scored on the second half, weighted by second-half opportunities. Players with 2+ games and opportunities in both halves.",
};
const skills = { meta };
const detail = new Map();
for (const p of people) {
  const o = prod.out.get(p.id), entry = {}, det = {};
  for (const s of STATS) {
    const x = o[s.key];
    const pc = pctOf(s, x.proj);
    entry[s.key] = { proj: round(x.proj * s.scale, 1), pct: round(pc, 2), grade: grade(pc), n: round(x.n, 0), raw: x.n > 0 ? round((x.rawN / x.n) * s.scale, 1) : null };
    det[s.key] = { prior: round(x.prior * s.scale, 1), w: round(x.w, 3), opp: x.n > 0 && s.opp ? round(x.rawN / Math.max(1e-9, x.adjN), 3) : null, made: s.kind === "binom" ? round(x.rawN, 0) : null };
  }
  skills[p.id] = entry;
  if (!detail.has(p.slug)) detail.set(p.slug, {});
  detail.get(p.slug)[p.id] = { g: p.g, pos: p.pos, ht: p.ht, stars: p.stars, year: p.year, ...Object.fromEntries(STATS.map(s => [s.key, { ...entry[s.key], ...det[s.key] }])) };
}
await writeFile(`${APP}/skills.json`, JSON.stringify(skills));
await mkdir(`${APP}/skills`, { recursive: true });
for (const [slug, d] of detail) await writeFile(`${APP}/skills/${slug}.json`, JSON.stringify({ meta: { stats: meta.stats.map(({ validation: _v, prior: _p, ...s }) => s), pool: meta.pool }, players: d }));

console.log(`[skills] ${people.length} players projected on ${STATS.length} skills; pool ${poolIds.size} players at ${POOL_MIN}+ mpg.`);
for (const s of meta.stats) {
  const v = s.validation;
  console.log(`[skills] ${s.short.padEnd(8)} k=${String(s.k).padStart(7)}  (${s.kSource}) league ${s.league} talent sd ${String(s.talentSd).padStart(5)}${s.talentMeasurable ? "" : "?"}  holdout RMSE raw ${v.rmseRaw} -> proj ${v.rmseProj} (shrink only ${v.rmseShrinkOnly}, prior only ${v.rmsePriorOnly}); rotation ${v.rotation.rmseRaw} -> ${v.rotation.rmseProj} (-${Math.round(v.rotation.mseCut * 100)}%); MSE -${Math.round((v.mseCut ?? 0) * 100)}%, reducible -${v.reducibleCut === null ? "n/a" : Math.round(v.reducibleCut * 100) + "%"}; n=${v.players}`);
}
