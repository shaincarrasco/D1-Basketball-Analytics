// D1 Hoops Power Rating (DHR) v2
//
// Additive, opponent-adjusted efficiency model solved by ridge-penalised
// coordinate descent. Per game side:
//
//   pointsPer100(team vs opp) = mu + O[team] + D[opp] ± h/2   (home +, away −, neutral 0)
//   possessionsPer40          = muT + T[team] + T[opp]
//
// - O[team] > 0 means a better offence; D[team] > 0 means a WORSE defence
//   (it allows more). AdjO = mu + O, AdjD = mu + D, AdjEM = AdjO − AdjD.
// - Each team is shrunk toward its conference mean (which is itself shrunk
//   toward the national mean), so a two-game sample borrows strength from the
//   conference instead of from nothing.
// - The home edge h is estimated jointly with the team terms and regularised
//   toward a long-run prior, so lopsided early-season "buy games" can't
//   inflate it (v1 measured it raw and got 32.7 points per 100 possessions).
// - Every non-Division I opponent is pooled into a single shared node and
//   those games carry half weight.

export const NON_D1 = "non-d1";

const ENV = (() => { try { return JSON.parse(process.env.DHR_TUNE ?? "{}"); } catch { return {}; } })();
const DEFAULTS_BASE = {
  teamPrior: 3, // games of conference-mean prior per team
  conferencePrior: 2, // teams of national-mean prior per conference
  tempoPrior: 3,
  homeEdgePrior: 4.7, // net points per 100 possessions (≈3.2 points per game)
  homeEdgeWeight: 1000, // games of prior weight on the home edge (early-season buy games bias it upward)
  seasonPriorWeight: 5, // games of weight on a regressed previous-season rating, when supplied
  seasonRegression: 0.6, // fraction of last season's margin carried forward
  nonD1Weight: 0.5,
  gameSigma: 10.5, // irreducible single-game margin noise in points
  netSigmaPer100: 15.7, // single-game net-efficiency noise used for rating uncertainty
  maxIterations: 2000,
  tolerance: 1e-5,
};
const DEFAULTS = { ...DEFAULTS_BASE, ...ENV };

const mean = values => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

/**
 * @param {Array<{gameId:string,date:string,homeId:string,awayId:string,homeConf:string|null,awayConf:string|null,neutral:boolean,homePts:number,awayPts:number,poss:number,minutes:number,weight?:number}>} games
 * @param {{warm?: ReturnType<typeof fit>, seasonPrior?: Map<string,{O:number,D:number}>} & Partial<typeof DEFAULTS>} options
 */
export function fit(games, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const sides = [];
  const confOf = new Map();
  for (const g of games) {
    const w = g.weight ?? 1;
    const minutesFactor = 40 / Math.max(40, g.minutes || 40);
    const pace = g.poss * minutesFactor;
    const homeOff = (g.homePts / g.poss) * 100;
    const awayOff = (g.awayPts / g.poss) * 100;
    const v = g.neutral ? 0 : 1;
    sides.push({ team: g.homeId, opp: g.awayId, y: homeOff, venue: v, pace, w, gameId: g.gameId });
    sides.push({ team: g.awayId, opp: g.homeId, y: awayOff, venue: -v, pace, w, gameId: g.gameId });
    confOf.set(g.homeId, g.homeConf ?? NON_D1);
    confOf.set(g.awayId, g.awayConf ?? NON_D1);
  }
  const teams = [...confOf.keys()];
  const mu = sides.length ? sides.reduce((s, x) => s + x.y * x.w, 0) / sides.reduce((s, x) => s + x.w, 0) : 104;
  const muT = sides.length ? sides.reduce((s, x) => s + x.pace * x.w, 0) / sides.reduce((s, x) => s + x.w, 0) : 68;

  const O = new Map(), D = new Map(), T = new Map();
  for (const t of teams) {
    O.set(t, options.warm?.O.get(t) ?? 0);
    D.set(t, options.warm?.D.get(t) ?? 0);
    T.set(t, options.warm?.T.get(t) ?? 0);
  }
  let h = options.warm?.h ?? cfg.homeEdgePrior;

  const byTeam = new Map(teams.map(t => [t, []]));
  const byOpp = new Map(teams.map(t => [t, []]));
  for (const s of sides) { byTeam.get(s.team).push(s); byOpp.get(s.opp).push(s); }
  const confTeams = new Map();
  for (const t of teams) {
    const c = confOf.get(t);
    if (!confTeams.has(c)) confTeams.set(c, []);
    confTeams.get(c).push(t);
  }

  let iterations = 0;
  for (; iterations < cfg.maxIterations; iterations++) {
    let delta = 0;
    const prevO = new Map(O), prevD = new Map(D), prevT = new Map(T);
    // Conference priors (national mean is 0 by construction).
    const confO = new Map(), confD = new Map(), confT = new Map();
    for (const [c, list] of confTeams) {
      if (c === NON_D1) { confO.set(c, 0); confD.set(c, 0); confT.set(c, 0); continue; }
      const k = cfg.conferencePrior;
      confO.set(c, list.reduce((s, t) => s + O.get(t), 0) / (list.length + k));
      confD.set(c, list.reduce((s, t) => s + D.get(t), 0) / (list.length + k));
      confT.set(c, list.reduce((s, t) => s + T.get(t), 0) / (list.length + k));
    }
    for (const t of teams) {
      const c = confOf.get(t);
      // Prior: regressed previous-season rating when available, otherwise the conference mean.
      const sp = options.seasonPrior?.get(t);
      const pw = sp ? cfg.seasonPriorWeight : cfg.teamPrior;
      const pO = sp ? sp.O * cfg.seasonRegression : confO.get(c);
      const pD = sp ? sp.D * cfg.seasonRegression : confD.get(c);
      // Offence: residual of our scoring after removing opponent defence and venue.
      let num = pw * pO, den = pw;
      for (const s of byTeam.get(t)) { num += s.w * (s.y - mu - D.get(s.opp) - (s.venue * h) / 2); den += s.w; }
      const nextO = num / den;
      // Defence: residual of what opponents scored on us after removing their offence and venue.
      num = pw * pD; den = pw;
      for (const s of byOpp.get(t)) { num += s.w * (s.y - mu - O.get(s.team) - (s.venue * h) / 2); den += s.w; }
      const nextD = num / den;
      // Tempo: each game's pace is shared, so attribute the residual to each side.
      num = cfg.tempoPrior * confT.get(c); den = cfg.tempoPrior;
      for (const s of byTeam.get(t)) { num += s.w * (s.pace - muT - T.get(s.opp)); den += s.w; }
      const nextT = num / den;
      O.set(t, nextO); D.set(t, nextD); T.set(t, nextT);
    }
    // Re-centre so the D-I average is exactly mu (identifiability).
    const d1 = teams.filter(t => confOf.get(t) !== NON_D1);
    const cO = mean(d1.map(t => O.get(t))), cD = mean(d1.map(t => D.get(t))), cT = mean(d1.map(t => T.get(t)));
    for (const t of teams) {
      O.set(t, O.get(t) - cO); D.set(t, D.get(t) - cD); T.set(t, T.get(t) - cT);
      delta = Math.max(delta, Math.abs(O.get(t) - prevO.get(t)), Math.abs(D.get(t) - prevD.get(t)), Math.abs(T.get(t) - prevT.get(t)));
    }
    // Home edge: net residual of venue games, regularised toward the prior.
    let hn = cfg.homeEdgeWeight * cfg.homeEdgePrior, hd = cfg.homeEdgeWeight;
    for (const s of sides) {
      if (s.venue !== 1) continue;
      const homeResid = s.y - mu - O.get(s.team) - D.get(s.opp);
      const pair = byTeam.get(s.opp).find(x => x.gameId === s.gameId);
      if (!pair) continue;
      const awayResid = pair.y - mu - O.get(pair.team) - D.get(pair.opp);
      hn += s.w * (homeResid - awayResid); hd += s.w;
    }
    const nextH = hn / hd;
    delta = Math.max(delta, Math.abs(nextH - h));
    h = nextH;
    if (process.env.DHR_DEBUG && iterations % 100 === 0) console.log("iter", iterations, delta.toFixed(7), h.toFixed(3));
    if (delta < cfg.tolerance) break;
  }

  const games_ = new Map(teams.map(t => [t, 0]));
  for (const s of sides) games_.set(s.team, games_.get(s.team) + s.w);
  return { mu, muT, h, O, D, T, conf: confOf, games: games_, iterations, cfg, seasonPrior: options.seasonPrior ?? null };
}

/** Rating for one team (non-D-I teams map onto the pooled node). */
export function rating(model, teamId, isD1 = true) {
  const id = isD1 ? teamId : NON_D1;
  const known = model.O.has(id);
  const O = known ? model.O.get(id) : 0;
  const D = known ? model.D.get(id) : 0;
  const T = known ? model.T.get(id) : 0;
  const n = known ? model.games.get(id) : 0;
  const sp = model.seasonPrior?.get(id);
  if (!known && sp) return { id, known: false, hasSeasonPrior: true, O: sp.O * model.cfg.seasonRegression, D: sp.D * model.cfg.seasonRegression, T: 0, n: 0, adjO: model.mu + sp.O * model.cfg.seasonRegression, adjD: model.mu + sp.D * model.cfg.seasonRegression, adjEM: (sp.O - sp.D) * model.cfg.seasonRegression, adjT: model.muT };
  return { id, known, hasSeasonPrior: Boolean(sp), O, D, T, n, adjO: model.mu + O, adjD: model.mu + D, adjEM: O - D, adjT: model.muT + T };
}

const erf = x => {
  // Abramowitz–Stegun 7.1.26
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
};
export const normalCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));

/** Pregame projection. Margin is from the home team's perspective. */
export function predict(model, home, away, neutral) {
  const cfg = model.cfg ?? DEFAULTS;
  const tempo = model.muT + home.T + away.T;
  const edge = neutral ? 0 : model.h / 2;
  const homeEff = model.mu + home.O + away.D + edge;
  const awayEff = model.mu + away.O + home.D - edge;
  const homePts = (homeEff * tempo) / 100;
  const awayPts = (awayEff * tempo) / 100;
  const margin = homePts - awayPts;
  const u = r => (cfg.netSigmaPer100 / Math.sqrt(r.n + (r.hasSeasonPrior ? cfg.seasonPriorWeight : cfg.teamPrior))) * (tempo / 100);
  const sigma = Math.sqrt(cfg.gameSigma ** 2 + u(home) ** 2 + u(away) ** 2);
  return { tempo, homePts, awayPts, margin, sigma, homeWinProb: normalCdf(margin / sigma) };
}
