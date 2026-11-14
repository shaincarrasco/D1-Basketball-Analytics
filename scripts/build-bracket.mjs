// D1 Hoops' projected NCAA tournament field and bubble watch (public/data/app/bracket.json).
//
// Runs at the end of build-app-data.mjs (it reads that script's outputs), so `npm run dev`,
// `npm run build` and `npm run data` all rebuild it. Inputs:
//   public/data/app/teams.json      DHR ratings/ranks, records, quadrant records (build-app-data)
//   public/data/app/meta.json       data timestamps
//   public/data/games-season-2027.json + model-2027.json   schedule, results, pregame win probabilities
//   public/data/sims-2027.json      conference regular-season title odds (10,000-run season simulation)
//
// Method (also explained in plain words on /bracket/):
//   1. Projected end-of-season résumé for every D-I team: games already played count as they
//      happened; every remaining D-I game counts as its DHR win probability. Quadrants use the
//      same NET-style cutoffs and current DHR ranks as the rest of the site.
//   2. Résumé score = projected wins above bubble (WAB: wins minus the wins a bubble-level team
//      would expect against the same schedule) + a bonus per projected Quad 1 win − a penalty per
//      projected Quad 3/4 loss. Quality = DHR adjusted efficiency margin.
//   3. Selection score = 60% résumé + 40% quality (each as a z-score across D-I).
//   4. Auto bids: each conference's team with the best regular-season title odds in the season
//      simulation (shared titles count). Conference tournaments are not simulated.
//   5. At-large: the best selection scores among everyone else. All 76 teams are seeded on one
//      overall list by selection score, S-curve into four regions with conference separation.
//   6. Chance to make the field: a fresh Monte Carlo of the rest of the season with the same
//      noise model as build-simulations.mjs, re-running steps 2–5 in every simulated season.
import { readFile, writeFile } from "node:fs/promises";
import { normalizeGames } from "./lib/game-status.mjs";
import { normalCdf } from "./lib/rating-model.mjs";

// ---------- config: change the format here ----------
// Sources (checked 2026-11-14): NCAA, "NCAA reveals new 76-team bracket" (May 7, 2026): the
// men's field grows from 68 to 76 in 2027; the 12-game "March Madness Opening Round" pairs the
// 12 lowest-seeded automatic qualifiers (six games) and the 12 lowest-seeded at-large teams (six
// games). ESPN expansion FAQ: 32 automatic bids (the Pac-12 is back) and 44 at-large.
const CONFIG = {
  season: 2027,
  fieldSize: 76,
  autoBids: 32,
  /** Teams (not games) in the Opening Round, by bid type. Each pair plays one game. 68-team format: 4 + 4. */
  openingRound: { autoTeams: 12, atLargeTeams: 12 },
  regions: ["East", "West", "South", "Midwest"],
  /** Selection score blend (z-scores across D-I). */
  weights: { resume: 0.6, quality: 0.4 },
  /** Résumé score = projected WAB + q1WinBonus × proj. Q1 wins − q34LossPenalty × proj. Q3+Q4 losses. */
  q1WinBonus: 0.5,
  q34LossPenalty: 0.5,
  /** The "bubble team" for WAB: average DHR rating of national ranks bubbleRank−2 … bubbleRank+2. */
  bubbleRank: 55,
  /** Single-game scoring noise (points), same as build-simulations.mjs. */
  gameSigma: 10.5,
  /** Rating uncertainty per 100 possessions, shrinking with games played (build-simulations.mjs). */
  netSigma: 15.7, priorGames: 3,
  sims: Number(process.env.BRACKET_SIMS ?? 2000),
  /** Show the early-season caveat while the median team has played fewer D-I games than this. */
  earlyGames: 10,
  /** Reclassifying to D-I in 2026–27, so not eligible for the 2027 tournament (NCAA/Wikipedia reclassification list; Erie Times-News on Mercyhurst). */
  ineligible: { 346: "West Georgia", 165: "Mercyhurst", 1073: "West Florida", 1507: "New Haven" },
};
const MAIN_SLOTS = 64;
const atLargeBids = CONFIG.fieldSize - CONFIG.autoBids;
const orGames = (CONFIG.openingRound.autoTeams + CONFIG.openingRound.atLargeTeams) / 2;

const OUT = "public/data/app/bracket.json";
const readJson = async p => JSON.parse(await readFile(p, "utf8"));
const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const r = (v, d = 1) => (num(v) === null ? null : Math.round(v * 10 ** d) / 10 ** d);
const plural = (n, one, many = `${one}s`) => (Math.round(n) === 1 ? one : many);

async function unavailable(reason, extra = {}) {
  console.error(`[bracket] Not published: ${reason}`);
  await writeFile(OUT, JSON.stringify({ ok: false, reason, config: publicConfig(), ...extra }));
}
function publicConfig() {
  return { season: CONFIG.season, fieldSize: CONFIG.fieldSize, autoBids: CONFIG.autoBids, atLargeBids, openingRound: { ...CONFIG.openingRound, games: orGames },
    regions: CONFIG.regions, weights: CONFIG.weights, q1WinBonus: CONFIG.q1WinBonus, q34LossPenalty: CONFIG.q34LossPenalty, bubbleRank: CONFIG.bubbleRank, sims: CONFIG.sims };
}

const [teams, meta, gamePayload, model, sims] = await Promise.all([
  readJson("public/data/app/teams.json"), readJson("public/data/app/meta.json"),
  readJson("public/data/games-season-2027.json"), readJson("public/data/model-2027.json"), readJson("public/data/sims-2027.json").catch(() => null),
]);
normalizeGames(gamePayload.games);

const conferences = [...new Set(teams.map(t => t.conf))];
const problems = [];
if (CONFIG.fieldSize - orGames !== MAIN_SLOTS) problems.push(`field ${CONFIG.fieldSize} minus ${orGames} Opening Round games is not ${MAIN_SLOTS} bracket slots`);
if (conferences.length !== CONFIG.autoBids) problems.push(`config has ${CONFIG.autoBids} automatic bids but the data has ${conferences.length} D-I conferences`);
if (!sims?.teams) problems.push("season simulations (sims-2027.json) are missing, so there are no conference title odds for automatic bids");
if (CONFIG.openingRound.autoTeams % 2 || CONFIG.openingRound.atLargeTeams % 2) problems.push("Opening Round team counts must be even");
if (problems.length) { await unavailable(problems.join("; ")); process.exit(0); }

// ---------- projected résumés ----------
const byId = new Map(teams.map(t => [t.id, t]));
const ranked = teams.filter(t => num(t.rank) !== null && num(t.adjEM) !== null).sort((a, b) => a.rank - b.rank);
const bubbleBand = ranked.filter(t => Math.abs(t.rank - CONFIG.bubbleRank) <= 2);
const bubbleEM = bubbleBand.reduce((s, t) => s + t.adjEM, 0) / bubbleBand.length;
const minEM = Math.min(...ranked.map(t => t.adjEM));
const T = model.leagueTempo ?? 68, HOME = model.estimatedHomeEdge ?? 6;
// Same quadrant cutoffs as build-app-data.mjs (NET-style, on DHR rank).
const quad = (oppRank, venue) => {
  if (!oppRank) return 4;
  const cut = { H: [30, 75, 160], N: [50, 100, 200], A: [75, 135, 240] }[venue];
  return oppRank <= cut[0] ? 1 : oppRank <= cut[1] ? 2 : oppRank <= cut[2] ? 3 : 4;
};
/** Chance a bubble-level team wins this game (v = +1 home, 0 neutral, −1 away). */
const pBubble = (oppEM, v) => normalCdf(((bubbleEM - (oppEM ?? minEM) + v * HOME) * T) / 100 / CONFIG.gameSigma);

const res = new Map(teams.map(t => [t.id, {
  q: [[0, 0], [0, 0], [0, 0], [0, 0]], pq: [[0, 0], [0, 0], [0, 0], [0, 0]], left: [0, 0, 0, 0],
  wab: 0, pwab: 0, played: 0, base: 0,
}]));
const preds = model.predictions ?? {};
const remaining = []; // D-I vs D-I games still to play, for the simulation
for (const g of gamePayload.games ?? []) {
  const h = byId.get(String(g.homeTeamId)), a = byId.get(String(g.awayTeamId));
  if (!h || !a) continue; // résumés count D-I vs D-I games only (like the NCAA team sheet)
  const final = g.status === "final" && num(g.homeScore) !== null && num(g.awayScore) !== null;
  const p = preds[g.id];
  const pending = !final && (g.status === "scheduled" || g.status === "in_progress") && p;
  if (!final && !pending) continue;
  const vH = g.neutralSite ? 0 : 1;
  const sides = [
    { t: h, o: a, v: vH, venue: g.neutralSite ? "N" : "H" },
    { t: a, o: h, v: -vH, venue: g.neutralSite ? "N" : "A" },
  ].map(s => ({ ...s, q: quad(s.o.rank, s.venue), pb: pBubble(s.o.adjEM, s.v) }));
  if (final) {
    const homeWon = g.homeScore > g.awayScore;
    sides.forEach((s, i) => {
      const won = i === 0 ? homeWon : !homeWon, x = res.get(s.t.id);
      x.q[s.q - 1][won ? 0 : 1]++; x.pq[s.q - 1][won ? 0 : 1]++;
      x.wab += (won ? 1 : 0) - s.pb; x.pwab += (won ? 1 : 0) - s.pb; x.played++;
    });
  } else {
    sides.forEach((s, i) => {
      const wp = i === 0 ? p.homeWinProb : 1 - p.homeWinProb, x = res.get(s.t.id);
      x.pq[s.q - 1][0] += wp; x.pq[s.q - 1][1] += 1 - wp; x.left[s.q - 1]++;
      x.pwab += wp - s.pb;
    });
    remaining.push({ h: h.id, a: a.id, margin: p.margin, conf: g.conferenceGame === true && h.conf === a.conf, qh: sides[0].q, qa: sides[1].q, pbh: sides[0].pb, pba: sides[1].pb });
  }
}
// Cross-check: our played quadrant records must match the ones shown on team pages.
const quadMismatch = teams.filter(t => JSON.stringify(res.get(t.id).q) !== JSON.stringify(t.quads)).map(t => t.slug);
if (quadMismatch.length) console.warn(`[bracket] ${quadMismatch.length} team(s) whose quadrant record differs from teams.json: ${quadMismatch.slice(0, 5).join(", ")}`);

const resumeOf = (wab, q1w, q34l) => wab + CONFIG.q1WinBonus * q1w - CONFIG.q34LossPenalty * q34l;
for (const t of teams) {
  const x = res.get(t.id);
  x.resume = resumeOf(x.pwab, x.pq[0][0], x.pq[2][1] + x.pq[3][1]);
  x.base = resumeOf(x.wab, x.q[0][0], x.q[2][1] + x.q[3][1]); // played games only (simulation starting point)
  x.quality = num(t.adjEM) ?? minEM;
}
const zScores = vals => {
  const m = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length) || 1;
  return vals.map(v => (v - m) / sd);
};
{
  const zr = zScores(teams.map(t => res.get(t.id).resume)), zq = zScores(teams.map(t => res.get(t.id).quality));
  teams.forEach((t, i) => { res.get(t.id).score = CONFIG.weights.resume * zr[i] + CONFIG.weights.quality * zq[i]; });
}
[...teams].sort((a, b) => res.get(b.id).resume - res.get(a.id).resume).forEach((t, i) => { res.get(t.id).resumeRank = i + 1; });
const score = t => res.get(t.id).score;
const eligible = t => !(t.id in CONFIG.ineligible) && !(Number(t.id) in CONFIG.ineligible);

// ---------- selection ----------
const titleOdds = t => sims.teams[t.id]?.titleShare ?? 0;
const outrightOdds = t => sims.teams[t.id]?.titleOutright ?? 0;
const autoByConf = new Map();
for (const c of conferences) {
  const pick = teams.filter(t => t.conf === c && eligible(t)).sort((a, b) => titleOdds(b) - titleOdds(a) || outrightOdds(b) - outrightOdds(a) || score(b) - score(a))[0];
  if (pick) autoByConf.set(c, pick);
}
const autos = new Set([...autoByConf.values()].map(t => t.id));
const pool = teams.filter(t => eligible(t) && !autos.has(t.id)).sort((a, b) => score(b) - score(a));
const atLarge = pool.slice(0, atLargeBids);
const field = [...autoByConf.values(), ...atLarge].sort((a, b) => score(b) - score(a));
const overallOf = new Map(field.map((t, i) => [t.id, i + 1]));
const lastAtLargeScore = score(atLarge.at(-1));

// Opening Round: the lowest-seeded auto qualifiers and lowest-seeded at-large teams, paired with
// the closest team next to them on the overall list (avoiding same-conference games).
const pairUp = list => {
  const pairs = [];
  for (let i = 0; i < list.length; i += 2) pairs.push([list[i], list[i + 1]]);
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0].conf !== pairs[i][1].conf) continue;
    for (const j of [i + 1, i - 1]) {
      if (!pairs[j]) continue;
      const [a, b] = pairs[i], [c, d] = pairs[j];
      if (a.conf !== d.conf && c.conf !== b.conf) { pairs[i] = [a, d]; pairs[j] = [c, b]; break; }
    }
  }
  return pairs.map(p => p.sort((x, y) => overallOf.get(x.id) - overallOf.get(y.id)));
};
const autoOR = field.filter(t => autos.has(t.id)).slice(-CONFIG.openingRound.autoTeams);
const atLargeOR = atLarge.slice(-CONFIG.openingRound.atLargeTeams);
const orIds = new Set([...autoOR, ...atLargeOR].map(t => t.id));
const orPairs = [...pairUp(autoOR).map(p => ({ kind: "auto", teams: p })), ...pairUp(atLargeOR).map(p => ({ kind: "at-large", teams: p }))];
// 64 bracket entries: direct teams plus one entry per Opening Round game (ranked by its better team).
const entries = [
  ...field.filter(t => !orIds.has(t.id)).map(t => ({ teams: [t], kind: null, overall: overallOf.get(t.id) })),
  ...orPairs.map(p => ({ teams: p.teams, kind: p.kind, overall: Math.min(...p.teams.map(t => overallOf.get(t.id))) })),
].sort((a, b) => a.overall - b.overall);
if (entries.length !== MAIN_SLOTS) { await unavailable(`built ${entries.length} bracket entries, expected ${MAIN_SLOTS}`); process.exit(0); }

// ---------- regions (S-curve with conference separation) ----------
// Bracket order inside a region, top to bottom. Positions 2k/2k+1 meet in the round of 64,
// groups of 4 in the round of 32, halves in the Sweet 16, the whole region in the Elite Eight.
const POS = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
const meetRound = (s1, s2) => { const a = POS.indexOf(s1), b = POS.indexOf(s2); for (let k = 1; k <= 4; k++) if (a >> k === b >> k) return k; return 4; };
const PERMS = [];
(function perm(rest, acc) { if (!rest.length) { PERMS.push(acc); return; } rest.forEach((v, i) => perm(rest.filter((_, j) => j !== i), [...acc, v])); })([0, 1, 2, 3], []);
const regionSlots = [[], [], [], []]; // {seed, entry}
const confsOf = e => e.teams.map(t => t.conf);
for (let line = 1; line <= 16; line++) {
  const lineEntries = entries.slice((line - 1) * 4, line * 4);
  const serp = line % 2 ? [0, 1, 2, 3] : [3, 2, 1, 0];
  let best = null;
  for (const p of PERMS) {
    let cost = 0;
    lineEntries.forEach((e, j) => {
      cost += 1.5 * Math.abs(p[j] - serp[j]);
      for (const placed of regionSlots[p[j]]) {
        const overlap = confsOf(e).filter(c => confsOf(placed.entry).includes(c)).length;
        if (!overlap) continue;
        const round = meetRound(line, placed.seed);
        cost += overlap * (round === 1 ? 100 : round === 2 ? 40 : round === 3 ? 15 : line <= 4 && placed.seed <= 4 ? 25 : 2);
      }
    });
    if (!best || cost < best.cost) best = { cost, p };
  }
  lineEntries.forEach((e, j) => regionSlots[best.p[j]].push({ seed: line, entry: e }));
}
const conflicts = { r64: 0, r32: 0, s16: 0, topFourSameRegion: 0 };
for (const slots of regionSlots) for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
  const a = slots[i], b = slots[j];
  if (!confsOf(a.entry).some(c => confsOf(b.entry).includes(c))) continue;
  const k = meetRound(a.seed, b.seed);
  if (k === 1) conflicts.r64++; else if (k === 2) conflicts.r32++; else if (k === 3) conflicts.s16++; else if (a.seed <= 4 && b.seed <= 4) conflicts.topFourSameRegion++;
}

// ---------- chance to make the field (simulation) ----------
let seed = 76202027;
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let spare = null;
const normal = () => { if (spare !== null) { const s = spare; spare = null; return s; } let u = 0; while (u === 0) u = rand(); const v = rand(), m = Math.sqrt(-2 * Math.log(u)); spare = m * Math.sin(2 * Math.PI * v); return m * Math.cos(2 * Math.PI * v); };
const n = teams.length, idx = new Map(teams.map((t, i) => [t.id, i]));
const shockSd = teams.map(t => (CONFIG.netSigma / Math.sqrt((t.ratedGames ?? 0) + CONFIG.priorGames)) * (T / 100));
const simGames = remaining.map(g => ({ ...g, h: idx.get(g.h), a: idx.get(g.a) }));
const confIdx = conferences.map(c => teams.map((t, i) => (t.conf === c && eligible(t) ? i : -1)).filter(i => i >= 0));
const eligibleIdx = teams.map((t, i) => (eligible(t) ? i : -1)).filter(i => i >= 0);
const inField = new Float64Array(n), autoCount = new Float64Array(n);
const R = new Float64Array(n), Q = new Float64Array(n), S = new Float64Array(n), CW = new Int32Array(n), CL = new Int32Array(n), shock = new Float64Array(n);
const isAuto = new Uint8Array(n);
for (let s = 0; s < CONFIG.sims; s++) {
  for (let i = 0; i < n; i++) {
    const t = teams[i], x = res.get(t.id);
    shock[i] = normal() * shockSd[i]; R[i] = x.base; CW[i] = t.cw; CL[i] = t.cl; isAuto[i] = 0;
    Q[i] = x.quality + shock[i] / (T / 100);
  }
  for (const g of simGames) {
    const homeWon = g.margin + shock[g.h] - shock[g.a] + normal() * CONFIG.gameSigma > 0;
    R[g.h] += (homeWon ? 1 : 0) - g.pbh + (homeWon && g.qh === 1 ? CONFIG.q1WinBonus : 0) - (!homeWon && g.qh >= 3 ? CONFIG.q34LossPenalty : 0);
    R[g.a] += (homeWon ? 0 : 1) - g.pba + (!homeWon && g.qa === 1 ? CONFIG.q1WinBonus : 0) - (homeWon && g.qa >= 3 ? CONFIG.q34LossPenalty : 0);
    if (g.conf) { if (homeWon) { CW[g.h]++; CL[g.a]++; } else { CW[g.a]++; CL[g.h]++; } }
  }
  const zr = zScores(Array.from(R)), zq = zScores(Array.from(Q));
  for (let i = 0; i < n; i++) S[i] = CONFIG.weights.resume * zr[i] + CONFIG.weights.quality * zq[i];
  for (const members of confIdx) {
    let pick = -1, bestPct = -1;
    for (const i of members) {
      const gp = CW[i] + CL[i], pct = gp ? CW[i] / gp : 0;
      if (pct > bestPct + 1e-9 || (Math.abs(pct - bestPct) < 1e-9 && S[i] > S[pick])) { pick = i; bestPct = pct; }
    }
    if (pick >= 0) { isAuto[pick] = 1; autoCount[pick]++; inField[pick]++; }
  }
  const rest = eligibleIdx.filter(i => !isAuto[i]).sort((a, b) => S[b] - S[a]);
  for (let k = 0; k < atLargeBids && k < rest.length; k++) inField[rest[k]]++;
}
const makeField = t => r(inField[idx.get(t.id)] / CONFIG.sims, 3);

// ---------- output ----------
const regionOf = new Map(), seedOf = new Map();
regionSlots.forEach((slots, ri) => slots.forEach(s => s.entry.teams.forEach(t => { regionOf.set(t.id, ri); seedOf.set(t.id, s.seed); })));
const fieldIds = new Set(field.map(t => t.id));
const bubble = {
  lastFourByes: atLarge.slice(atLargeBids - CONFIG.openingRound.atLargeTeams - 4, atLargeBids - CONFIG.openingRound.atLargeTeams),
  lastFourIn: atLarge.slice(-4),
  firstFourOut: pool.slice(atLargeBids, atLargeBids + 4),
  nextFourOut: pool.slice(atLargeBids + 4, atLargeBids + 8),
};
const groupOf = new Map();
for (const [g, list] of Object.entries(bubble)) for (const t of list) groupOf.set(t.id, g);
const pctText = p => (p >= 0.995 ? ">99%" : p > 0 && p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);

function notesFor(t) {
  const x = res.get(t.id), out = [];
  const [q1w] = t.quads[0], left1 = x.left[0];
  const bad = t.quads[2][1] + t.quads[3][1];
  if (autos.has(t.id) && score(t) < lastAtLargeScore) {
    out.push(`Bid rides on the ${t.confName}: ${pctText(titleOdds(t))} regular-season title odds in our simulations.`);
  } else if (q1w === 0) {
    out.push(left1 ? `No Quad 1 wins yet; ${left1} Quad 1 ${plural(left1, "game")} left.` : "No Quad 1 wins yet and no Quad 1 games left on the schedule.");
  } else {
    out.push(`${q1w} Quad 1 ${plural(q1w, "win")} so far; ${left1} Quad 1 ${plural(left1, "game")} left.`);
  }
  if (bad) out.push(`${bad} Quad 3–4 ${plural(bad, "loss", "losses")} on the résumé.`);
  return out.slice(0, 2);
}
const row = t => {
  const x = res.get(t.id), inF = fieldIds.has(t.id);
  return {
    slug: t.slug, name: t.name, short: t.short, logo: t.logo, color: t.color, conf: t.conf, confName: t.confName, confSlug: t.confSlug,
    seed: inF ? seedOf.get(t.id) : null, overall: inF ? overallOf.get(t.id) : null, region: inF ? CONFIG.regions[regionOf.get(t.id)] : null,
    bid: autos.has(t.id) ? "auto" : inF ? "at-large" : "out", openingRound: orIds.has(t.id), group: groupOf.get(t.id) ?? null,
    w: t.w, l: t.l, quads: t.quads, projW: t.sim?.wins ?? t.projW, projL: t.sim ? r(t.projW + t.projL - t.sim.wins) : t.projL,
    projQ1: [r(x.pq[0][0]), r(x.pq[0][1])], q1Left: x.left[0], q2Left: x.left[1],
    rank: t.rank, resumeRank: x.resumeRank, wab: r(x.pwab, 2), score: r(x.score, 3),
    makeField: makeField(t), autoOdds: autos.has(t.id) ? r(titleOdds(t), 3) : null, notes: notesFor(t),
  };
};
const rows = {};
for (const t of [...field, ...bubble.firstFourOut, ...bubble.nextFourOut]) rows[t.slug] = row(t);
const index = {};
for (const t of teams) {
  const inF = fieldIds.has(t.id);
  index[t.slug] = { s: autos.has(t.id) ? "auto" : inF ? "at-large" : "out", seed: inF ? seedOf.get(t.id) : null, g: groupOf.get(t.id) ?? null, or: orIds.has(t.id), p: makeField(t), x: eligible(t) ? undefined : 1 };
}
const regions = regionSlots.map((slots, ri) => ({
  name: CONFIG.regions[ri],
  slots: POS.map(sd => { const e = slots.find(s => s.seed === sd).entry; return { seed: sd, teams: e.teams.map(t => t.slug), kind: e.kind }; }),
}));
const lines = Array.from({ length: 16 }, (_, k) => ({
  seed: k + 1,
  entries: entries.slice(k * 4, k * 4 + 4).map(e => ({ teams: e.teams.map(t => t.slug), kind: e.kind, region: CONFIG.regions[regionOf.get(e.teams[0].id)] })),
}));
const openingRound = orPairs.map(p => ({ kind: p.kind, seed: seedOf.get(p.teams[0].id), region: CONFIG.regions[regionOf.get(p.teams[0].id)], teams: p.teams.map(t => t.slug) }))
  .sort((a, b) => a.seed - b.seed || CONFIG.regions.indexOf(a.region) - CONFIG.regions.indexOf(b.region));
const gp = teams.map(t => res.get(t.id).played).sort((a, b) => a - b);
const medianGames = gp[Math.floor(gp.length / 2)];

// ---------- verify ----------
const seen = new Set(), dupes = [];
for (const reg of regions) for (const s of reg.slots) for (const slug of s.teams) { if (seen.has(slug)) dupes.push(slug); seen.add(slug); }
const perLine = lines.map(l => l.entries.length);
const autoPerConf = conferences.map(c => field.filter(t => t.conf === c && autos.has(t.id)).length);
const checks = {
  fieldSize: seen.size, autoBids: autos.size, atLarge: atLarge.length, conferences: conferences.length,
  everyConferenceOneAuto: autoPerConf.every(x => x === 1), entriesPerLine: perLine, openingRoundGames: openingRound.length,
  duplicates: dupes, bubbleSizes: Object.fromEntries(Object.entries(bubble).map(([k, v]) => [k, v.length])), conflicts, quadMismatch: quadMismatch.length,
  ineligibleInField: field.filter(t => !eligible(t)).map(t => t.slug),
};
const failed = [];
if (checks.fieldSize !== CONFIG.fieldSize) failed.push(`field has ${checks.fieldSize} teams`);
if (checks.autoBids !== CONFIG.autoBids || !checks.everyConferenceOneAuto) failed.push("automatic bids are not one per conference");
if (perLine.some(x => x !== 4)) failed.push("a seed line does not have four entries");
if (dupes.length) failed.push(`duplicate teams: ${dupes.join(", ")}`);
if (Object.values(checks.bubbleSizes).some(x => x !== 4)) failed.push("a bubble group does not have four teams");
if (checks.ineligibleInField.length) failed.push(`ineligible team in field: ${checks.ineligibleInField.join(", ")}`);
if (failed.length) { await unavailable(`checks failed: ${failed.join("; ")}`, { checks }); process.exit(0); }

const updated = meta.updated?.games ?? meta.updated?.built ?? new Date().toISOString();
await writeFile(OUT, JSON.stringify({
  ok: true, season: CONFIG.season, updated, built: new Date().toISOString(), config: publicConfig(),
  medianGames, early: medianGames < CONFIG.earlyGames, remainingGames: remaining.length, bubbleRating: r(bubbleEM, 2),
  ineligible: Object.values(CONFIG.ineligible),
  regions, finalFour: [[0, 3], [1, 2]], lines, openingRound, bubble: Object.fromEntries(Object.entries(bubble).map(([k, v]) => [k, v.map(t => t.slug)])),
  teams: rows, index, checks,
}));
console.log(`[bracket] ${checks.fieldSize}-team field: ${checks.autoBids} auto bids (${conferences.length} conferences), ${checks.atLarge} at-large, ${openingRound.length} Opening Round games; ` +
  `bubble rating ${r(bubbleEM, 1)}; median ${medianGames} D-I games played; ${CONFIG.sims} sims of ${remaining.length} games; same-conference R64/R32 meetings: ${conflicts.r64}/${conflicts.r32}.`);
