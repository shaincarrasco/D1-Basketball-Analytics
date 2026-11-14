// D1 Hoops estimated NIL / market value for every D-I men's basketball player (2026–27).
// Runs after build-app-data.mjs (reads public/data/app/players.json + teams.json).
//
// Method (plain words; documented on /methodology/#nil):
//   1. Program budget. For the 80 programs CBS Sports placed in 2026–27 roster-spending tiers
//      (public/data/nil-calibration-2027.json) we use the tier. For everyone else we estimate the
//      budget from program strength (this season's rating, last season's, and ten years of history)
//      with a curve fitted on those 80 programs, shifted down by an offset fitted on the few
//      publicly reported budgets outside the power conferences (Memphis, VCU, Wyoming).
//   2. Player share. Each player's slice of his team's budget is proportional to a weight:
//        weight = exp(a × minutes share + b × DPR + c × recruiting) × position factor
//      (centers cost ~61% more than point guards of equal talent, per EvanMiya). Rostered players
//      with no minutes yet get the weight of a player with zero minutes (plus recruiting).
//   3. Estimate = budget × share. a, b, c are fitted to the publicly reported 2026–27 figures
//      (log scale; ranges count as hits anywhere inside them, "at least" figures only penalise
//      estimates below the floor). Fit quality is checked with leave-one-out.
//   4. Range = estimate × exp(±1.28 σ), where σ combines the leave-one-out error with the
//      budget's own uncertainty (tier width, or the curve's error for estimated budgets): an
//      intended 80% range. Everything is rounded so it never looks more precise than it is.
//
// Output: public/data/app/nil.json. Never fails the build: on any error it writes
// { ok: false, reason } and exits 0.
import { readFile, readdir, writeFile } from "node:fs/promises";

const APP = "public/data/app";
const OUT = `${APP}/nil.json`;
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const normName = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const nameKey = n => String(n ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const Z80 = 1.2816;

/** Round so the number never looks more precise than it is. */
export function roundMoney(v) {
  if (!(v > 0)) return 0;
  const step = v < 100e3 ? 5e3 : v < 1e6 ? 25e3 : v < 5e6 ? 50e3 : 100e3;
  return Math.max(step === 5e3 ? 5e3 : step, Math.round(v / step) * step);
}

// Same shrink the injury engine and the indispensable list use (src/lib/form.ts).
const DPR_SHRINK_POSS = 1500, DPR_PRIOR_POSS = 300;
const USG_K = 150;
const shrunkDpr = (dpr, onPoss) => { const poss = (onPoss ?? 0) + DPR_PRIOR_POSS; return dpr != null ? dpr * (poss / (poss + DPR_SHRINK_POSS)) : 0; };
// EvanMiya (Field of 68, Apr 16 2026): equal-talent center $1.3M vs point guard $813K (+61%).
// Forwards sit halfway on the log scale; unknown positions get the forward value.
const POS_MULT = { G: 1, F: Math.sqrt(1.6), C: 1.6 };
const normPos = p => { const u = String(p ?? "").toUpperCase(); return ["G", "PG", "SG"].includes(u) ? "G" : ["F", "SF", "PF"].includes(u) ? "F" : u === "C" ? "C" : null; };

// Recruiting signal: 1 for the No. 1 recruit, ~0.5 at No. 12, 0 at No. 150 or unranked. Full weight
// for freshmen (2026 class), half for sophomores, a quarter for older players (their production
// should carry them by now, but we only have a few games of it).
const recSignal = (rank, year) => {
  if (!rank || !year) return 0;
  const base = Math.max(0, 1 - Math.log(rank) / Math.log(150));
  return base * (year >= 2026 ? 1 : year === 2025 ? 0.5 : 0.25);
};

async function build() {
  const [players, teams, cal, espnRosters, recruiting] = await Promise.all([
    readJson(`${APP}/players.json`), readJson(`${APP}/teams.json`), readJson("public/data/nil-calibration-2027.json"),
    readJson("public/data/espn-rosters-2027.json").catch(() => ({ teams: {} })), readJson("public/data/recruiting.json").catch(() => ({ players: [] })),
  ]);
  const F = Object.fromEntries(players.fields.map((f, i) => [f, i]));
  const teamById = new Map(teams.map(t => [t.id, t]));
  const teamByName = new Map(teams.map(t => [normName(t.name), t]));

  // ---------- program strength ----------
  // History files use different rating scales across seasons, so each season is z-scored.
  const hist = new Map(); // teamId -> [{ season, z, ncaa }]
  for (const f of (await readdir("public/data/history").catch(() => [])).filter(f => f.endsWith(".json")).sort()) {
    const h = await readJson(`public/data/history/${f}`);
    if (h.season === 2020) continue; // that season's ratings file is broken (no tournament, outlier scale)
    const nets = h.teams.map(t => num(t.net)).filter(v => v !== null);
    const m = mean(nets), s = sd(nets) || 1;
    for (const t of h.teams) {
      if (num(t.net) === null) continue;
      const id = String(t.id);
      if (!hist.has(id)) hist.set(id, []);
      hist.get(id).push({ season: h.season, z: (t.net - m) / s, ncaa: t.post?.ev === "NCAA" });
    }
  }
  const ems = teams.map(t => num(t.adjEM)).filter(v => v !== null);
  const emM = mean(ems), emS = sd(ems) || 1;
  const strength = new Map();
  for (const t of teams) {
    const h = hist.get(t.id) ?? [];
    const last = h.find(x => x.season === 2026)?.z ?? null;
    const ten = h.length ? mean(h.map(x => x.z)) : null;
    const now = num(t.adjEM) !== null ? (t.adjEM - emM) / emS : null;
    const parts = [[now, 0.25], [last, 0.35], [ten, 0.4]].filter(([v]) => v !== null);
    const w = parts.reduce((s, [, x]) => s + x, 0);
    strength.set(t.id, {
      s: w ? parts.reduce((s, [v, x]) => s + v * x, 0) / w : -1,
      ncaa10: h.filter(x => x.ncaa).length, seasons: h.length, ap: t.ap?.rank ?? null,
    });
  }

  // ---------- program budgets ----------
  const tierOf = new Map(); // teamId -> { tier, low, high }
  const unmatchedTier = [];
  for (const tier of cal.programs.cbsTiers.tiers) {
    for (const name of tier.teams) {
      const t = teamByName.get(normName(name));
      if (!t) { unmatchedTier.push(name); continue; }
      // Open-ended tiers: Tier 1 is "$20M or more" (we assume up to $25M, and $25–30M for the three
      // CBS says top $25M); Tier 2 is "just under $20M" (we use $17.5–20M, between Tiers 3 and 1).
      let low = tier.low, high = tier.high;
      if (tier.tier === 1) { const over = (tier.over25 ?? []).includes(name); low = over ? 25e6 : 20e6; high = over ? 30e6 : 25e6; }
      if (tier.tier === 2) { low = 17.5e6; high = 20e6; }
      tierOf.set(t.id, { tier: tier.tier, low, high, label: tier.label });
    }
  }
  // Curve: log(budget) = α + β × strength, fitted on CBS teams (budget = geometric tier midpoint).
  const pts = [...tierOf].map(([id, b]) => ({ x: strength.get(id).s, y: Math.log(Math.sqrt(b.low * b.high)) }));
  const xm = mean(pts.map(p => p.x)), ym = mean(pts.map(p => p.y));
  const beta = pts.reduce((s, p) => s + (p.x - xm) * (p.y - ym), 0) / (pts.reduce((s, p) => s + (p.x - xm) ** 2, 0) || 1);
  const alpha = ym - beta * xm;
  const curveResid = pts.map(p => p.y - (alpha + beta * p.x));
  const curveSd = sd(curveResid);
  const curveR2 = 1 - curveResid.reduce((s, r) => s + r * r, 0) / pts.reduce((s, p) => s + (p.y - ym) ** 2, 0);
  // Non-power programs: CBS covers only the power conferences plus Gonzaga, so outside them a second
  // line, log(budget) = γ0 + γ1 × strength, is fitted on the publicly reported non-power budgets.
  // Older figures are grown by EvanMiya's +44% low/mid-major market change per season.
  const anchorDefs = [
    { team: "Memphis", value: 9e6, note: "2026–27 revenue-share budget (a floor: collective NIL is extra)" },
    { team: "VCU", value: 5e6, note: "AD's 'around $5 million' competitive budget (May 2026)" },
    { team: "Wyoming", value: 550e3 * 1.44, note: "$550K in 2025–26, grown 44% (EvanMiya's mid/low-major market change)" },
    { team: "UNC Greensboro", value: 95e3 * 1.44 * 1.44, note: "$95K in 2024–25, grown 44% a season for two seasons (our assumption)" },
    { team: "Gonzaga", value: null, note: "CBS Tier 3 ($15.1M–$17.5M)" },
  ];
  const anchors = anchorDefs.map(a => {
    const t = teamByName.get(normName(a.team)); if (!t) return null;
    const value = a.value ?? (tierOf.has(t.id) ? Math.sqrt(tierOf.get(t.id).low * tierOf.get(t.id).high) : null);
    return value ? { ...a, value, id: t.id, x: strength.get(t.id).s } : null;
  }).filter(Boolean);
  const ax = anchors.map(a => a.x), ay = anchors.map(a => Math.log(a.value));
  const axm = mean(ax), aym = mean(ay);
  const g1 = anchors.length > 2 ? ay.reduce((s, y, i) => s + (ax[i] - axm) * (y - aym), 0) / (ax.reduce((s, x) => s + (x - axm) ** 2, 0) || 1) : beta;
  const g0 = aym - g1 * axm;
  const anchorResid = anchors.map((a, i) => ay[i] - (g0 + g1 * a.x));
  // Uncertainty for an estimated budget: the anchors' residual spread (n − 2 dof), never below 0.6.
  const estSd = Math.max(0.6, anchors.length > 2 ? Math.sqrt(anchorResid.reduce((s, r) => s + r * r, 0) / (anchors.length - 2)) : 1);
  const budget = new Map();
  for (const t of teams) {
    const tier = tierOf.get(t.id);
    if (tier) {
      budget.set(t.id, { mid: Math.sqrt(tier.low * tier.high), low: tier.low, high: tier.high, sigma: Math.log(tier.high / tier.low) / (2 * Z80), kind: "reported-tier", tier: tier.tier, label: tier.label });
    } else {
      const mid = Math.exp(g0 + g1 * strength.get(t.id).s);
      budget.set(t.id, { mid, low: mid * Math.exp(-Z80 * estSd), high: mid * Math.exp(Z80 * estSd), sigma: estSd, kind: "estimated", tier: null, label: null });
    }
  }

  // ---------- rosters: observed players + rostered players with no minutes yet ----------
  const recByName = new Map();
  for (const rec of recruiting.players ?? []) recByName.set(`${nameKey(rec.name)}:${normName(rec.school)}`, rec);
  const rosterOf = new Map(); // teamId -> [{ pid|null, name, pos, role, dpr, rec, observed }]
  const espnPos = new Map(); // `${teamId}:${nameKey}` -> pos
  const espnByTeam = new Map();
  for (const t of teams) {
    const list = espnRosters.teams?.[t.espnId] ?? [];
    espnByTeam.set(t.id, list);
    for (const a of list) espnPos.set(`${t.id}:${nameKey(a.name)}`, normPos(a.pos));
  }
  for (const row of players.rows) {
    const tid = row[F.teamId];
    if (!teamById.has(tid)) continue;
    const g = num(row[F.g]) ?? 0, min = num(row[F.min]) ?? 0;
    const pos = normPos(row[F.pos]) ?? espnPos.get(`${tid}:${nameKey(row[F.name])}`) ?? null;
    const p = {
      pid: row[F.id], name: row[F.name], teamId: tid, pos, g, min, gs: num(row[F.gs]) ?? 0,
      role: g > 0 ? Math.min(min, 36) / 40 : 0, dpr: shrunkDpr(num(row[F.dpr]), num(row[F.onPoss])), rawDpr: num(row[F.dpr]),
      rec: recSignal(num(row[F.recRank]), num(row[F.recYear])), recRank: num(row[F.recRank]), recYear: num(row[F.recYear]), stars: num(row[F.stars]), observed: true,
      // Usage (share of team plays he finishes while on the floor), pulled toward the D-I average
      // of 20% until he has ~150 minutes, in steps of 5 points.
      use: num(row[F.usg]) !== null ? ((num(row[F.usg]) * min * g + 20 * USG_K) / (min * g + USG_K) - 20) / 5 : 0,
    };
    if (!rosterOf.has(tid)) rosterOf.set(tid, []);
    rosterOf.get(tid).push(p);
  }
  let unseen = 0;
  for (const t of teams) {
    const list = rosterOf.get(t.id) ?? [];
    const seen = new Set(list.map(p => nameKey(p.name)));
    for (const a of espnByTeam.get(t.id) ?? []) {
      if (seen.has(nameKey(a.name))) continue;
      const rec = recByName.get(`${nameKey(a.name)}:${normName(t.name)}`);
      list.push({ pid: null, name: a.name, teamId: t.id, pos: normPos(a.pos), g: 0, min: 0, gs: 0, role: 0, dpr: 0, rawDpr: null,
        rec: recSignal(rec?.ranking ?? null, rec?.year ?? null), recRank: rec?.ranking ?? null, recYear: rec?.year ?? null, stars: rec?.stars ?? null, observed: false, use: 0 });
      unseen++;
    }
    rosterOf.set(t.id, list);
  }

  const posMult = p => POS_MULT[p.pos] ?? POS_MULT.F;
  const weightOf = (p, k) => Math.exp(k.a * p.role + k.b * p.dpr + k.c * p.rec + k.u * p.use) * posMult(p);
  const valuesFor = k => {
    const out = new Map(); // `${teamId}:${nameKey}` -> { value, share }
    for (const [tid, list] of rosterOf) {
      const ws = list.map(p => weightOf(p, k)), tot = ws.reduce((s, x) => s + x, 0) || 1;
      const b = budget.get(tid).mid;
      list.forEach((p, i) => out.set(`${tid}:${nameKey(p.name)}`, { value: (b * ws[i]) / tot, share: ws[i] / tot }));
    }
    return out;
  };

  // ---------- calibration set ----------
  const calRows = cal.players.map(c => {
    const t = teamByName.get(normName(c.team));
    const p = t ? (rosterOf.get(t.id) ?? []).find(x => nameKey(x.name) === nameKey(c.name)) : null;
    return { ...c, teamId: t?.id ?? null, slug: t?.slug ?? null, pid: p?.pid ?? null, observed: !!p?.observed, key: t && p ? `${t.id}:${nameKey(p.name)}` : null };
  });
  const fitRows = calRows.filter(c => c.observed && c.key && c.fit !== false);
  const lossOf = (c, v) => {
    const lv = Math.log(Math.max(v, 1));
    if (c.high == null) return Math.max(0, Math.log(c.low) - lv) ** 2; // floor: only an estimate below it is wrong
    if (lv < Math.log(c.low)) return (Math.log(c.low) - lv) ** 2;
    if (lv > Math.log(c.high)) return (lv - Math.log(c.high)) ** 2;
    return 0;
  };
  const GRID = { a: [], b: [], c: [], u: [] };
  for (let a = 0; a <= 12.001; a += 1) GRID.a.push(+a.toFixed(2));
  for (let b = 0; b <= 0.6001; b += 0.075) GRID.b.push(+b.toFixed(3));
  for (let c = 0; c <= 4.001; c += 0.5) GRID.c.push(+c.toFixed(2));
  for (let u = 0; u <= 1.2001; u += 0.15) GRID.u.push(+u.toFixed(2));
  // Small ridge toward a plain minutes-only split keeps the three numbers from chasing one report.
  const ridge = k => 0.002 * (k.b / 0.1) ** 2 + 0.002 * k.c ** 2 + 0.002 * (k.u / 0.3) ** 2;
  const fit = rows => {
    let best = null;
    for (const a of GRID.a) for (const b of GRID.b) for (const c of GRID.c) for (const u of GRID.u) {
      const k = { a, b, c, u };
      const vals = valuesFor(k);
      let loss = ridge(k);
      for (const r of rows) loss += lossOf(r, vals.get(r.key).value);
      if (!best || loss < best.loss) best = { k, loss };
    }
    return best.k;
  };
  // valuesFor over every roster is ~5K players; the grid is 25×17×25 ≈ 10K fits. Precompute per
  // team only for teams in the calibration set to keep the build fast.
  const calTeams = new Set(fitRows.map(r => r.teamId));
  const fullRoster = rosterOf;
  const calRoster = new Map([...rosterOf].filter(([tid]) => calTeams.has(tid)));
  const withRoster = (m, fn) => { const keep = new Map(rosterOf); rosterOf.clear(); for (const [k, v] of m) rosterOf.set(k, v); try { return fn(); } finally { rosterOf.clear(); for (const [k, v] of keep) rosterOf.set(k, v); } };
  const K = withRoster(calRoster, () => fit(fitRows));
  // Leave-one-out: refit without each calibration player, then predict him.
  const loo = withRoster(calRoster, () => fitRows.map(r => {
    const k = fit(fitRows.filter(x => x !== r));
    return { name: r.name, value: valuesFor(k).get(r.key).value, k };
  }));
  const target = r => (r.high == null ? null : Math.sqrt(r.low * r.high));
  const looErr = fitRows.map((r, i) => {
    const v = loo[i].value;
    if (r.high == null) return { r, v, logErr: Math.max(0, Math.log(r.low) - Math.log(v)), floor: true };
    const lv = Math.log(v), lo = Math.log(r.low), hi = Math.log(r.high);
    return { r, v, logErr: lv < lo ? lo - lv : lv > hi ? lv - hi : 0, floor: false };
  });
  // σ for the player share: RMS of leave-one-out log misses, never below 0.35 (about ±40%).
  const shareSigma = Math.max(0.35, Math.sqrt(mean(looErr.map(e => e.logErr ** 2))));

  // ---------- final values ----------
  const vals = valuesFor(K);
  const rows = [];
  const teamOut = {};
  for (const t of teams) {
    const list = fullRoster.get(t.id) ?? [];
    const b = budget.get(t.id);
    const sigma = Math.sqrt(shareSigma ** 2 + b.sigma ** 2);
    let sumObs = 0;
    const top = [];
    for (const p of list) {
      const v = vals.get(`${t.id}:${nameKey(p.name)}`);
      if (!p.observed) continue;
      sumObs += v.value;
      const point = roundMoney(v.value), low = roundMoney(v.value * Math.exp(-Z80 * sigma)), high = roundMoney(v.value * Math.exp(Z80 * sigma));
      rows.push([p.pid, t.id, point, low, high, Math.round(v.share * 1000) / 10, p.pos, Math.round(p.role * 40 * 10) / 10, Math.round(p.dpr * 10) / 10, p.recRank ?? null, p.recYear ?? null]);
      top.push({ pid: p.pid, name: p.name, value: point });
    }
    top.sort((x, y) => y.value - x.value);
    teamOut[t.id] = {
      budget: roundMoney(b.mid), budgetLow: roundMoney(b.low), budgetHigh: roundMoney(b.high), kind: b.kind, tier: b.tier, tierLabel: b.label,
      onCourt: roundMoney(sumObs), players: top.length, unseen: list.filter(p => !p.observed).length, top: top.slice(0, 3),
    };
  }

  // ---------- fit report ----------
  const finalErr = fitRows.map(r => {
    const v = vals.get(r.key).value, t = budget.get(r.teamId);
    const sigma = Math.sqrt(shareSigma ** 2 + t.sigma ** 2);
    const low = v * Math.exp(-Z80 * sigma), high = v * Math.exp(Z80 * sigma);
    const overlaps = r.high == null ? high >= r.low : high >= r.low && low <= r.high;
    return { r, v, low, high, overlaps };
  });
  const pointRows = looErr.filter(e => !e.floor);
  const pctErr = pointRows.map(e => Math.abs(e.v / target(e.r) - 1));
  const report = {
    params: { minutes: K.a, dpr: K.b, recruiting: K.c, usage: K.u, posMult: POS_MULT },
    budgetCurve: { alpha, beta, r2: curveR2, sd: curveSd, nonPower: { intercept: g0, slope: g1 }, estimatedSigma: estSd,
      anchors: anchors.map((a, i) => ({ team: a.team, value: a.value, note: a.note, fitted: Math.exp(g0 + g1 * a.x), residLog: anchorResid[i] })) },
    shareSigma,
    calibration: {
      players: calRows.length, fitted: fitRows.length, notPlayedYet: calRows.filter(c => !c.observed).map(c => c.name),
      pointFigures: pointRows.length, floors: looErr.filter(e => e.floor).length,
      looMedianAbsPctErr: median(pctErr),
      looInsideReported: pointRows.filter(e => e.logErr === 0).length,
      looFloorsMet: looErr.filter(e => e.floor && e.logErr === 0).length,
      rangeOverlapsReported: finalErr.filter(e => e.overlaps).length,
      inSampleMedianAbsPctErr: median(finalErr.filter(e => e.r.high != null).map(e => Math.abs(e.v / target(e.r) - 1))),
    },
    over39: rows.filter(r => r[2] >= 3.9e6).length,
  };

  const playerCal = calRows.map(c => {
    const e = finalErr.find(x => x.r === c), l = looErr.find(x => x.r === c);
    return {
      name: c.name, team: c.team, slug: c.slug, pid: c.pid, low: c.low, high: c.high, kind: c.kind, note: c.note ?? null, reports: c.reports,
      model: e ? { point: roundMoney(e.v), low: roundMoney(e.low), high: roundMoney(e.high), overlaps: e.overlaps, loo: roundMoney(l.v) } : null,
    };
  });
  const programCal = cal.programs.reported.map(p => {
    const t = teamByName.get(normName(p.team));
    const b = t ? budget.get(t.id) : null;
    return { ...p, slug: t?.slug ?? null, model: b ? { mid: roundMoney(b.mid), low: roundMoney(b.low), high: roundMoney(b.high), kind: b.kind } : null };
  });

  const out = {
    ok: true, season: 2027, seasonLabel: "2026–27", built: new Date().toISOString(), compiled: cal.compiled,
    fields: ["pid", "teamId", "value", "low", "high", "share", "pos", "mpg", "dpr", "recRank", "recYear"],
    rows, teams: teamOut, fit: report,
    calibration: { players: playerCal, programs: programCal, priorSeason: cal.priorSeason, sources: cal.sources, landscape: cal.landscape, caveats: cal.caveats, tiers: cal.programs.cbsTiers.about },
  };
  await writeFile(OUT, JSON.stringify(out));

  const c = report.calibration;
  const fmt = v => `$${(v / 1e6).toFixed(2)}M`;
  console.log(`[nil] ${rows.length} players, ${unseen} rostered with no minutes yet; ${tierOf.size} CBS-tier budgets${unmatchedTier.length ? ` (unmatched: ${unmatchedTier.join(", ")})` : ""}.`);
  console.log(`[nil] budget curve: log B = ${alpha.toFixed(2)} + ${beta.toFixed(2)}×strength, R² ${curveR2.toFixed(2)}, sd ${curveSd.toFixed(2)}; non-power log B = ${g0.toFixed(2)} + ${g1.toFixed(2)}×strength, est σ ${estSd.toFixed(2)}; anchors ${report.budgetCurve.anchors.map(a => `${a.team} ${fmt(a.value)}→${fmt(a.fitted)}`).join(", ")}`);
  console.log(`[nil] weights: minutes ${K.a}, DPR ${K.b}, recruiting ${K.c}, usage ${K.u}; share σ ${shareSigma.toFixed(2)}`);
  console.log(`[nil] calibration: ${c.fitted}/${c.players} fitted (${c.pointFigures} figures/ranges, ${c.floors} floors); LOO median |%err| ${(c.looMedianAbsPctErr * 100).toFixed(0)}%, LOO inside reported ${c.looInsideReported}/${c.pointFigures}, floors met ${c.looFloorsMet}/${c.floors}; range overlaps report ${c.rangeOverlapsReported}/${c.fitted}; ${report.over39} players estimated ≥ $3.9M (The Athletic: at least 18)`);
  for (const e of finalErr) console.log(`[nil]   ${e.r.name.padEnd(18)} reported ${e.r.high == null ? `≥${fmt(e.r.low)}` : e.r.low === e.r.high ? fmt(e.r.low) : `${fmt(e.r.low)}–${fmt(e.r.high)}`}  model ${fmt(e.v)} (${fmt(e.low)}–${fmt(e.high)})${e.overlaps ? "" : "  MISS"}`);
}

try {
  await build();
} catch (error) {
  console.warn("[nil] Build failed; publishing an unavailable file. " + (error instanceof Error ? error.stack : error));
  try { await writeFile(OUT, JSON.stringify({ ok: false, reason: "The NIL estimates could not be built from today's data." })); } catch { /* ignore */ }
}
