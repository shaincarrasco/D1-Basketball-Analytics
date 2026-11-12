// Play-by-play analytics built from the ESPN-derived per-game summaries
// (scripts/lib/espn-pbp.mjs): possessions, lineup aggregation and a regularised
// adjusted plus-minus player rating (DPR) with a box-score prior.
import { readFile, readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

export async function loadPbp(dir) {
  const events = new Map();
  let files = [];
  try { files = await readdir(dir); } catch { return events; }
  for (const f of files) {
    if (!f.endsWith(".json.gz")) continue;
    const day = f.slice(0, 10);
    try {
      const data = JSON.parse(gunzipSync(await readFile(`${dir}/${f}`)).toString("utf8"));
      for (const [id, ev] of Object.entries(data.events ?? {})) events.set(id, { ...ev, id, day });
    } catch { /* unreadable day file: skip */ }
  }
  return events;
}

/** Possessions per team side from an ESPN player box (cache rows: see fetch-espn-player-games fields). */
export function boxPossessions(eventBox, fields) {
  const i = name => fields.indexOf(name);
  const poss = {};
  for (const side of eventBox?.teams ?? []) {
    let fga = 0, fta = 0, orb = 0, tov = 0;
    for (const row of side.players ?? []) {
      fga += row[i("fga")] ?? 0; fta += row[i("fta")] ?? 0; orb += row[i("orb")] ?? 0; tov += row[i("tov")] ?? 0;
    }
    poss[side.teamId] = fga - orb + tov + 0.475 * fta;
  }
  const vals = Object.values(poss).filter(v => v > 30);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

/**
 * Regularised adjusted plus-minus with offence/defence split, solved by conjugate gradient.
 * Each stint side is one row: pointsPer100 = mu + Σ O[offence players] + Σ D[defence players], weight = possessions.
 * Coefficients are shrunk toward `prior` (Map id -> {O, D}) with strength `lambda` (possessions).
 */
export function solveRapm(rows, prior, { lambda = 2500, iterations = 400 } = {}) {
  const ids = new Map();
  const idx = id => { if (!ids.has(id)) ids.set(id, ids.size); return ids.get(id); };
  const R = rows.map(r => ({ o: r.off.map(id => 2 * idx(id)), d: r.def.map(id => 2 * idx(id) + 1), y: r.y, w: r.w }));
  const n = ids.size * 2;
  const totalW = R.reduce((s, r) => s + r.w, 0);
  const mu = R.reduce((s, r) => s + r.w * r.y, 0) / Math.max(1, totalW);
  const b = new Float64Array(n);
  for (const [id, k] of ids) { const p = prior.get(id); if (p) { b[2 * k] = p.O; b[2 * k + 1] = p.D; } }
  const cols = r => r.o.concat(r.d);
  // Residual target after the prior: y - mu - X b
  const t = R.map(r => r.y - mu - cols(r).reduce((s, j) => s + b[j], 0));
  const Ax = x => {
    const out = new Float64Array(n);
    for (let i = 0; i < R.length; i++) {
      const c = cols(R[i]); let s = 0;
      for (const j of c) s += x[j];
      s *= R[i].w;
      for (const j of c) out[j] += s;
    }
    for (let j = 0; j < n; j++) out[j] += lambda * x[j];
    return out;
  };
  const rhs = new Float64Array(n);
  for (let i = 0; i < R.length; i++) for (const j of cols(R[i])) rhs[j] += R[i].w * t[i];
  // Conjugate gradient
  const x = new Float64Array(n), r = Float64Array.from(rhs), p = Float64Array.from(rhs);
  let rr = r.reduce((s, v) => s + v * v, 0);
  for (let k = 0; k < iterations && rr > 1e-8; k++) {
    const Ap = Ax(p);
    const alpha = rr / p.reduce((s, v, j) => s + v * Ap[j], 0);
    for (let j = 0; j < n; j++) { x[j] += alpha * p[j]; r[j] -= alpha * Ap[j]; }
    const rrNew = r.reduce((s, v) => s + v * v, 0);
    const beta = rrNew / rr; rr = rrNew;
    for (let j = 0; j < n; j++) p[j] = r[j] + beta * p[j];
  }
  // Noise scale and approximate posterior standard errors.
  const diag = new Float64Array(n);
  let sse = 0;
  for (let i = 0; i < R.length; i++) {
    const c = cols(R[i]);
    let fit = 0; for (const j of c) fit += x[j];
    sse += R[i].w * (t[i] - fit) ** 2;
    for (const j of c) diag[j] += R[i].w;
  }
  const sigma2 = sse / Math.max(1, R.length);
  const out = new Map();
  for (const [id, k] of ids) {
    const O = b[2 * k] + x[2 * k], D = b[2 * k + 1] + x[2 * k + 1];
    const seO = Math.sqrt(sigma2 / (diag[2 * k] + lambda)), seD = Math.sqrt(sigma2 / (diag[2 * k + 1] + lambda));
    out.set(id, { O, D, net: O - D, se: Math.sqrt(seO ** 2 + seD ** 2), poss: diag[2 * k] });
  }
  return { mu, ratings: out, sigma2 };
}
