// Monte Carlo season simulation from DHR v2 projections.
// Each simulation draws a rating shock per team (how wrong today's rating might be,
// shrinking as games accumulate) and then plays every remaining game with
// single-game noise. Outputs win-total distributions and conference regular-season title odds.
import { readFile, writeFile } from "node:fs/promises";
import { isD1Conference } from "./d1-conferences.mjs";

const SIMS = Number(process.env.DHR_SIMS ?? 10000);
const GAME_SIGMA = 10.5, NET_SIGMA = 15.7, PRIOR_GAMES = 3;
const readJson = async p => JSON.parse(await readFile(p, "utf8"));
const [teamPayload, gamePayload, model] = await Promise.all([
  readJson("public/data/team-season-2027.json"), readJson("public/data/games-season-2027.json"), readJson("public/data/model-2027.json"),
]);

// Seeded PRNG so a rebuild with the same data gives the same odds.
let seed = 20262027;
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let spare = null;
const normal = () => { if (spare !== null) { const s = spare; spare = null; return s; } let u = 0, v = 0; while (u === 0) u = rand(); v = rand(); const m = Math.sqrt(-2 * Math.log(u)); spare = m * Math.sin(2 * Math.PI * v); return m * Math.cos(2 * Math.PI * v); };

const teams = (teamPayload.teams ?? []).filter(t => isD1Conference(t.conference) && t.teamId != null);
const idx = new Map(teams.map((t, i) => [String(t.teamId), i]));
const n = teams.length;
const tempoPts = (model.leagueTempo ?? 68) / 100;
const shockSd = teams.map(t => (NET_SIGMA / Math.sqrt((t.powerRatings?.games ?? 0) + PRIOR_GAMES)) * tempoPts);

const baseW = new Int32Array(n), baseL = new Int32Array(n), baseCW = new Int32Array(n), baseCL = new Int32Array(n);
const remaining = [];
for (const g of gamePayload.games ?? []) {
  const h = idx.get(String(g.homeTeamId)), a = idx.get(String(g.awayTeamId));
  if (h === undefined && a === undefined) continue;
  const conf = g.conferenceGame === true && h !== undefined && a !== undefined;
  if (g.status === "final" && typeof g.homeScore === "number" && typeof g.awayScore === "number") {
    const homeWon = g.homeScore > g.awayScore;
    if (h !== undefined) { homeWon ? baseW[h]++ : baseL[h]++; if (conf) homeWon ? baseCW[h]++ : baseCL[h]++; }
    if (a !== undefined) { homeWon ? baseL[a]++ : baseW[a]++; if (conf) homeWon ? baseCL[a]++ : baseCW[a]++; }
  } else if (g.status === "scheduled" || g.status === "in_progress") {
    const p = model.predictions?.[g.id];
    if (!p) continue;
    remaining.push({ h: h ?? -1, a: a ?? -1, margin: p.margin, conf });
  }
}

const confOf = teams.map(t => t.conference);
const confMembers = new Map();
teams.forEach((t, i) => { if (!confMembers.has(t.conference)) confMembers.set(t.conference, []); confMembers.get(t.conference).push(i); });

const maxGames = 45;
const winHist = Array.from({ length: n }, () => new Int32Array(maxGames + 1));
const titleShare = new Float64Array(n), titleOutright = new Float64Array(n), confWinsSum = new Float64Array(n), winsSum = new Float64Array(n);
const W = new Int32Array(n), CW = new Int32Array(n), CL = new Int32Array(n), shock = new Float64Array(n);
for (let s = 0; s < SIMS; s++) {
  W.set(baseW); CW.set(baseCW); CL.set(baseCL);
  for (let i = 0; i < n; i++) shock[i] = normal() * shockSd[i];
  for (const g of remaining) {
    const m = g.margin + (g.h >= 0 ? shock[g.h] : 0) - (g.a >= 0 ? shock[g.a] : 0) + normal() * GAME_SIGMA;
    const homeWon = m > 0;
    if (g.h >= 0 && homeWon) W[g.h]++;
    if (g.a >= 0 && !homeWon) W[g.a]++;
    if (g.conf) { if (homeWon) { CW[g.h]++; CL[g.a]++; } else { CW[g.a]++; CL[g.h]++; } }
  }
  for (let i = 0; i < n; i++) { winHist[i][Math.min(maxGames, W[i])]++; winsSum[i] += W[i]; confWinsSum[i] += CW[i]; }
  for (const members of confMembers.values()) {
    // Best conference win percentage; members with no conference games can't win the title.
    let best = -1;
    for (const i of members) { const gp = CW[i] + CL[i]; if (gp) best = Math.max(best, CW[i] / gp); }
    if (best < 0) continue;
    const top = members.filter(i => CW[i] + CL[i] && Math.abs(CW[i] / (CW[i] + CL[i]) - best) < 1e-9);
    for (const i of top) titleShare[i] += 1;
    if (top.length === 1) titleOutright[top[0]] += 1;
  }
}

const pct = (hist, q) => { let acc = 0; const target = q * SIMS; for (let w = 0; w < hist.length; w++) { acc += hist[w]; if (acc >= target) return w; } return hist.length - 1; };
const out = {};
teams.forEach((t, i) => {
  const hist = winHist[i];
  const lo = hist.findIndex(c => c > 0), hi = hist.length - 1 - [...hist].reverse().findIndex(c => c > 0);
  out[String(t.teamId)] = {
    wins: +(winsSum[i] / SIMS).toFixed(1), p10: pct(hist, 0.1), p50: pct(hist, 0.5), p90: pct(hist, 0.9),
    confWins: +(confWinsSum[i] / SIMS).toFixed(1),
    titleShare: +(titleShare[i] / SIMS).toFixed(4), titleOutright: +(titleOutright[i] / SIMS).toFixed(4),
    win20: +([...hist].slice(20).reduce((a, b) => a + b, 0) / SIMS).toFixed(4),
    hist: { from: lo, counts: Array.from(hist.slice(lo, hi + 1)).map(c => +(c / SIMS).toFixed(4)) },
  };
});
await writeFile("public/data/sims-2027.json", JSON.stringify({ sims: SIMS, remainingGames: remaining.length, builtAt: new Date().toISOString(), method: "Rating shock per team per simulation (sd = 15.7/sqrt(games+3) per 100 possessions) plus 10.5-point single-game noise on every remaining game.", teams: out }) + "\n");
console.log(`[sims] ${SIMS} simulations of ${remaining.length} remaining games for ${n} teams.`);
