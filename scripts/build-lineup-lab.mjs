// Lineup lab data: a compact player file for /lineups/ (skills.json is 3.8 MB; the page needs a
// few fields for players who actually play) plus a check of the lineup model against observed
// five-man units. Runs after build-skills.mjs.
//
// Output: public/data/app/lineup-lab.json
//   { meta, fields, teams: { slug: [name, short, color, logo] }, rows: [[...fields], ...] }
import { readFile, readdir, writeFile } from "node:fs/promises";
import { RULES, fitAdjustments, projectLineup } from "../src/app/lineups/model.mjs";
// Output also carries the reality-check scale (meta.scale) and the reference list of every team's
// projected starting five (meta.reference) that the page grades lineups against.

const APP = "public/data/app";
const MIN_MPG = 5;
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const players = await readJson(`${APP}/players.json`);
const teams = await readJson(`${APP}/teams.json`);
const skills = await readJson(`${APP}/skills.json`);
const meta = await readJson(`${APP}/meta.json`);
const F = Object.fromEntries(players.fields.map((f, i) => [f, i]));
const teamById = new Map(teams.map(t => [t.id, t]));
const r = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

// Position and height come from the skills team files (normalised G/F/C, inches).
const bio = new Map();
for (const f of await readdir(`${APP}/skills`)) {
  const d = await readJson(`${APP}/skills/${f}`);
  for (const [id, p] of Object.entries(d.players ?? {})) bio.set(id, { pos: p.pos ?? null, ht: p.ht ?? null });
}

const FIELDS = ["id", "n", "t", "pos", "ht", "mpg", "g", "o", "d", "se", "op", "tp", "tpa40", "ft", "ast", "tov", "usg", "orb", "drb", "blk", "stl"];
const lab = new Map();
let skipped = 0;
for (const row of players.rows) {
  const id = row[F.id], t = teamById.get(row[F.teamId]), sk = skills[id];
  const mpg = row[F.min] ?? 0, g = row[F.g] ?? 0;
  if (!t || mpg < MIN_MPG || !g) continue;
  if (!sk || row[F.dprO] == null || row[F.dprD] == null) { skipped++; continue; }
  const b = bio.get(id) ?? { pos: null, ht: null };
  lab.set(id, {
    id, n: row[F.name], t: t.slug, pos: b.pos, ht: b.ht, mpg: r(mpg), g,
    o: r(row[F.dprO], 2), d: r(row[F.dprD], 2), se: r(row[F.dprSE], 2), op: row[F.onPoss] ?? 0,
    tp: sk.tp?.proj ?? null, tpa40: r(((row[F.tpa] ?? 0) / Math.max(1, mpg * g)) * 40), ft: sk.ft?.proj ?? null,
    ast: sk.ast?.proj ?? null, tov: sk.tov?.proj ?? null, usg: sk.usg?.proj ?? null,
    orb: sk.orb?.proj ?? null, drb: sk.drb?.proj ?? null, blk: sk.blk?.proj ?? null, stl: sk.stl?.proj ?? null,
  });
}
const eff = meta.leagueProfile?.eff ?? 104;

// ---------- check against observed five-man units ----------
// Observed units come from the team files (play-by-play stints, units with 2+ minutes). Caveats,
// all shown on the page: DPR is solved from these same possessions (so the base looks better here
// than it will on new games), observed net is not adjusted for opponent, and samples are tiny.
const units = [];
for (const t of teams) {
  const tf = await readJson(`${APP}/team/${t.slug}.json`).catch(() => null);
  for (const u of tf?.lineups ?? []) {
    const ps = u.pids.map(id => lab.get(id));
    if (ps.some(p => !p) || !(u.poss > 0)) continue;
    const pr = projectLineup(ps, eff);
    units.push({ w: u.poss, obs: u.net, base: pr.base.off + pr.base.def, fit: pr.fit.total, adj: Object.fromEntries(pr.adjustments.map(a => [a.key, a.value])) });
  }
}
const check = sel => {
  const us = units.filter(sel);
  const W = us.reduce((s, u) => s + u.w, 0);
  if (!us.length || !W) return null;
  const mse = f => us.reduce((s, u) => s + u.w * (u.obs - f(u)) ** 2, 0) / W;
  const mRes = us.reduce((s, u) => s + u.w * (u.obs - u.base), 0) / W;
  const mObs = us.reduce((s, u) => s + u.w * u.obs, 0) / W, mBase = us.reduce((s, u) => s + u.w * u.base, 0) / W;
  const cov = us.reduce((s, u) => s + u.w * (u.obs - mObs) * (u.base - mBase), 0), vO = us.reduce((s, u) => s + u.w * (u.obs - mObs) ** 2, 0), vB = us.reduce((s, u) => s + u.w * (u.base - mBase) ** 2, 0);
  // Scale on the fit adjustments: residual (observed − base) = s × fit, weighted by possessions.
  // Var(observed net) ≈ c / possessions, c estimated from the residuals.
  // With an intercept: observed nets run above the DPR sum on average (D-I teams beat non-D-I
  // opponents and the observed list favours starters), and that level must not leak into the scale.
  const slope = f => {
    const mf = us.reduce((s, u) => s + u.w * f(u), 0) / W;
    const sff = us.reduce((s, u) => s + u.w * (f(u) - mf) ** 2, 0);
    if (!(sff > 1e-9)) return null;
    const s = us.reduce((a, u) => a + u.w * (f(u) - mf) * (u.obs - u.base - mRes), 0) / sff;
    const c = us.reduce((a, u) => a + u.w * (u.obs - u.base - mRes - s * (f(u) - mf)) ** 2, 0) / Math.max(1, us.length - 2);
    return { s: r(s, 2), se: r(Math.sqrt(c / sff), 2), share: r(us.filter(u => f(u) !== 0).reduce((a, u) => a + u.w, 0) / W, 3) };
  };
  return {
    units: us.length, poss: Math.round(W),
    rmse: { zero: r(Math.sqrt(mse(() => 0))), base: r(Math.sqrt(mse(u => u.base))), full: r(Math.sqrt(mse(u => u.base + u.fit))) },
    // Same, after letting each version have its own average level (the observed list runs above the DPR sum).
    rmseLevel: (() => { const mF = us.reduce((s, u) => s + u.w * (u.obs - u.base - u.fit), 0) / W; return { base: r(Math.sqrt(mse(u => u.base + mRes))), full: r(Math.sqrt(mse(u => u.base + u.fit + mF))) }; })(),
    corrBase: vO && vB ? r(cov / Math.sqrt(vO * vB), 2) : null,
    // Observed net regressed on the DPR sum (with an intercept): in-sample and not opponent-adjusted.
    slopeBase: vB ? r(cov / vB, 2) : null,
    meanResidual: r(mRes, 2),
    avgFit: r(us.reduce((s, u) => s + u.w * u.fit, 0) / W, 2),
    fitScale: slope(u => u.fit),
    byAdjustment: Object.fromEntries(["spacing", "handling", "usage", "rim", "boards"].map(k => [k, slope(u => u.adj[k])])),
    noiseSd: r(Math.sqrt(us.reduce((s, u) => s + u.w * (100 * 1.05 * Math.SQRT2) ** 2 / u.w, 0) / W)), // typical SD of observed net from coin flips alone
  };
};
const calibration = {
  all: check(() => true),
  big: check(u => u.w >= 40),
  note: "Observed five-man units with 2+ minutes from ESPN play-by-play, every player in the lab. Weighted by possessions. In-sample: DPR is fit on these same possessions. Not opponent-adjusted.",
};

// ---------- reality check: how much of a summed rating shows up in a real team rating ----------
// Five players' DPR added up overstates a lineup: early-season DPR runs hot (box-score priors are not
// opponent-adjusted and blowouts of weak teams count), and the top of any ranking is partly luck.
// We can't check that on five-man units (their nets are in-sample and not opponent-adjusted), so we
// check it on whole teams: each team's minutes-weighted DPR sum (what its average five on the floor
// adds up to) against its opponent-adjusted efficiency margin (AdjEM). The slope of that regression
// is the share of a summed rating that turns into real, opponent-adjusted margin. The page
// multiplies the DPR sum by it; fit adjustments are already lineup-level and are added unscaled.
const teamPts = [];
{
  const byTeam = new Map();
  for (const row of players.rows) { const k = row[F.teamId]; if (!byTeam.has(k)) byTeam.set(k, []); byTeam.get(k).push(row); }
  for (const t of teams) {
    const rs = byTeam.get(t.id) ?? [];
    const tot = rs.reduce((s, x) => s + (x[F.min] ?? 0) * (x[F.g] ?? 0), 0);
    if (!tot || typeof t.adjEM !== "number") continue;
    let x = 0;
    for (const row of rs) if (row[F.dprO] != null && row[F.dprD] != null) x += ((row[F.min] ?? 0) * (row[F.g] ?? 0) / tot) * 5 * (row[F.dprO] + row[F.dprD]);
    teamPts.push({ x, y: t.adjEM });
  }
}
const scale = (() => {
  const n = teamPts.length;
  if (n < 30) return null;
  const mx = teamPts.reduce((s, u) => s + u.x, 0) / n, my = teamPts.reduce((s, u) => s + u.y, 0) / n;
  const sxx = teamPts.reduce((s, u) => s + (u.x - mx) ** 2, 0), syy = teamPts.reduce((s, u) => s + (u.y - my) ** 2, 0);
  const sxy = teamPts.reduce((s, u) => s + (u.x - mx) * (u.y - my), 0);
  const k = sxy / sxx, a = my - k * mx;
  const res = teamPts.reduce((s, u) => s + (u.y - a - k * u.x) ** 2, 0) / (n - 2);
  return { k: r(k, 3), se: r(Math.sqrt(res / sxx), 3), r: r(sxy / Math.sqrt(sxx * syy), 2), intercept: r(a, 2), rmse: r(Math.sqrt(res), 1), teams: n };
})();
const K = scale?.k ?? 1;

// ---------- reference: every team's projected starting five (top five by minutes) ----------
const labList = [...lab.values()];
const starters = [];
for (const t of teams) {
  const five = labList.filter(p => p.t === t.slug).sort((a, b) => b.mpg - a.mpg).slice(0, 5);
  if (five.length < 5) continue;
  starters.push({ t: t.slug, net: r(projectLineup(five, eff, K).net, 1) });
}
starters.sort((a, b) => a.net - b.net);
const reference = { starters: starters.map(s => s.net), best: starters.slice(-3).reverse() };

const out = {
  meta: {
    built: new Date().toISOString(), season: "2026-27", eff: r(eff, 2), minMpg: MIN_MPG, players: lab.size, rules: RULES,
    calibration, scale, reference,
  },
  fields: FIELDS,
  teams: Object.fromEntries(teams.map(t => [t.slug, [t.name, t.short ?? t.name, t.color ?? null, t.logo ?? null, typeof t.rank === "number" ? t.rank : null]])),
  rows: [...lab.values()].map(p => FIELDS.map(f => p[f])),
};
await writeFile(`${APP}/lineup-lab.json`, JSON.stringify(out));

const c = calibration.all, b = calibration.big;
console.log(`[lineup-lab] ${lab.size} players at ${MIN_MPG}+ mpg (${skipped} skipped: no DPR or skills).`);
for (const [name, x] of [["all units", c], ["40+ poss", b]]) {
  if (!x) { console.log(`[lineup-lab] ${name}: none`); continue; }
  console.log(`[lineup-lab] ${name}: ${x.units} units, ${x.poss} poss; RMSE vs observed net: zero ${x.rmse.zero}, DPR sum ${x.rmse.base}, +fit ${x.rmse.full} (level-matched: ${x.rmseLevel.base} -> ${x.rmseLevel.full}); corr(DPR sum, observed) ${x.corrBase}; mean observed − DPR sum ${x.meanResidual}; avg fit ${x.avgFit}; fit scale ${x.fitScale?.s} ± ${x.fitScale?.se}`);
  console.log(`[lineup-lab]   by adjustment (scale ± SE, share of poss where it is non-zero): ${Object.entries(x.byAdjustment).map(([k, v]) => `${k} ${v ? `${v.s}±${v.se} (${Math.round(v.share * 100)}%)` : "n/a"}`).join("; ")}`);
}
if (scale) console.log(`[lineup-lab] reality check (teams): AdjEM = ${scale.intercept} + ${scale.k} × minutes-weighted DPR sum (± ${scale.se}), r ${scale.r}, typical miss ${scale.rmse}, ${scale.teams} teams. Units in-sample slope: all ${c?.slopeBase}, 40+ poss ${b?.slopeBase}.`);
console.log(`[lineup-lab] reference: ${starters.length} starting fives, median ${reference.starters[Math.floor(starters.length / 2)]}, best ${reference.best.map(x => `${x.t} ${x.net}`).join(", ")}`);
// Sanity: an all-center lineup and a no-handler lineup should draw the matching adjustments.
void fitAdjustments;
