// Lineup lab model: one source of truth for the page (src/lib/lineup-lab.ts re-exports it) and the
// build script (scripts/build-lineup-lab.mjs uses it to check the model against observed units).
// Plain JavaScript so Node 20 (CI) can import it without a TypeScript step; types in model.d.mts.
//
// Projected net per 100 possessions vs an average D-I lineup, before opponent:
//   base   = sum of the five players' DPR offense and DPR defense (DPR is additive by design:
//            it is solved as "points each player adds on top of the other nine on the floor").
//   fit    = small rule-of-thumb adjustments for things a sum of individuals misses:
//            spacing, ball handling, shot creation, rim protection, defensive rebounding.
//            Each is zero for a normal lineup and only moves the number at the extremes.
//
// Every adjustment says what it measured and how much it moved the number, so a reader can
// disagree with any one of them. The sizes are documented priors, checked (not fitted) against
// observed five-man units in the build: early-season samples are far too small to fit them.

/** Thresholds and sizes (points per 100 possessions). Exported so the page can explain them. */
export const RULES = {
  shooter: { tp: 33, tpa40: 4.5 }, // projected 3P% and 3-point attempts per 40 minutes
  spacing: [-2, -0.5, 0, 0.5, 1, 1.25], // by number of shooters, 0..5
  handler: { ast: 18 }, // projected assist rate
  handling: [-2, 0, 0.5], // by number of handlers, 0, 1, 2+
  usage: { low: 88, high: 115, lowPer: 0.15, highPer: 0.1 }, // sum of projected usage rates
  rim: { good: 4, ok: 2, none: -2, thin: -0.5, elite: 6, eliteBonus: 0.5 }, // best projected block rate
  boards: { low: 62, high: 80, lowPer: 0.15, highPer: 0.05, min: -3, max: 1 }, // sum of projected DR%
  big: { ht: 81 }, // 6'9"+ or listed center counts as a big
  smallSample: 150, // on-court possessions behind a DPR before it is mostly his own results
};

const r1 = v => Math.round(v * 10) / 10;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lastName = p => p.n.split(/\s+/).slice(1).join(" ") || p.n;
const list = names => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
const htText = ht => (ht ? `${Math.floor(ht / 12)}′${ht % 12}″` : "");

export const isShooter = p => p.tp != null && p.tpa40 != null && p.tp >= RULES.shooter.tp && p.tpa40 >= RULES.shooter.tpa40;
export const isHandler = p => p.ast != null && p.ast >= RULES.handler.ast;
export const isBig = p => p.pos === "C" || (p.ht != null && p.ht >= RULES.big.ht);

/** Traits of a group of players (any size; the page shows them while the lineup fills up). */
export function traits(players) {
  const shooters = players.filter(isShooter), handlers = players.filter(isHandler), bigs = players.filter(isBig);
  const sum = k => players.reduce((s, p) => s + (p[k] ?? 0), 0);
  const blocker = players.reduce((b, p) => ((p.blk ?? 0) > (b?.blk ?? -1) ? p : b), null);
  const hts = players.map(p => p.ht).filter(h => h != null);
  return {
    shooters, handlers, bigs,
    guards: players.filter(p => p.pos === "G").length,
    usg: sum("usg"), drb: sum("drb"), orb: sum("orb"),
    blocker, maxBlk: blocker?.blk ?? 0,
    avgHt: hts.length ? hts.reduce((a, b) => a + b, 0) / hts.length : null,
    teams: new Set(players.map(p => p.t)).size,
  };
}

/** The fit adjustments for exactly five players. */
export function fitAdjustments(players) {
  const R = RULES, t = traits(players), out = [];
  const ns = t.shooters.length, nh = t.handlers.length;
  out.push({
    key: "spacing", label: "Spacing", side: "off", value: R.spacing[ns],
    detail: `${plural(ns, "shooter")} (projected ${R.shooter.tp}%+ from three on ${R.shooter.tpa40}+ attempts per 40)${ns ? `: ${list(t.shooters.map(lastName))}` : ""}. Two is normal; with fewer, defenses can pack the paint.`,
  });
  out.push({
    key: "handling", label: "Ball handling", side: "off", value: R.handling[Math.min(2, nh)],
    detail: nh ? `${plural(nh, "ball handler")} (projected assist rate ${R.handler.ast}%+): ${list(t.handlers.map(lastName))}.` : `No one is projected to assist on ${R.handler.ast}%+ of teammate baskets.`,
  });
  const u = t.usg;
  const usgAdj = u < R.usage.low ? -R.usage.lowPer * (R.usage.low - u) : u > R.usage.high ? -R.usage.highPer * (u - R.usage.high) : 0;
  out.push({
    key: "usage", label: "Shot creation", side: "off", value: r1(usgAdj),
    detail: `Projected usage adds up to ${Math.round(u)}% (a lineup has to use 100%). ${u < R.usage.low ? "Low-usage players would have to take shots they usually pass up." : u > R.usage.high ? "Several players used to having the ball would have to share it." : `Between ${R.usage.low}% and ${R.usage.high}% counts as balanced.`}`,
  });
  const b = t.maxBlk;
  const rimAdj = b >= R.rim.elite ? R.rim.eliteBonus : b >= R.rim.good ? 0 : b >= R.rim.ok ? R.rim.thin : R.rim.none;
  out.push({
    key: "rim", label: "Rim protection", side: "def", value: rimAdj,
    detail: `Best shot blocker: ${t.blocker ? `${lastName(t.blocker)}, projected to block ${b.toFixed(1)}% of opponent twos` : "none"}. ${R.rim.good}%+ is a real rim protector${b >= R.rim.elite ? `; ${R.rim.elite}%+ is elite` : ""}.`,
  });
  const d = t.drb;
  const boardAdj = Math.max(R.boards.min, Math.min(R.boards.max, d < R.boards.low ? -R.boards.lowPer * (R.boards.low - d) : d > R.boards.high ? R.boards.highPer * (d - R.boards.high) : 0));
  out.push({
    key: "boards", label: "Size and rebounding", side: "def", value: r1(boardAdj),
    detail: `Projected defensive rebound rates add up to ${Math.round(d)}% (typical lineup: ${R.boards.low}–${R.boards.high}%). Rebounders overlap, so extra size above that helps only a little.`,
  });
  return out.map(a => ({ ...a, value: a.value === 0 ? 0 : a.value })); // no "-0"
}

/** Plain-words balance warnings (any size >= 1; most need all five). */
export function warnings(players) {
  const R = RULES, t = traits(players), w = [];
  const full = players.length === 5;
  if (full && t.handlers.length === 0) w.push({ key: "handler", level: "high", text: "No ball handler. Nobody here is projected to set up teammates (assist rate 18%+), so expect more turnovers and late-clock shots." });
  if (full && t.shooters.length <= 1) w.push({ key: "spacing", level: t.shooters.length ? "mid" : "high", text: `Cramped floor. ${t.shooters.length ? "Only one player is" : "No one is"} a real 3-point threat (projected ${R.shooter.tp}%+ on ${R.shooter.tpa40}+ attempts per 40), so defenses can sag into the paint.` });
  if (t.bigs.length >= 3) w.push({ key: "bigs", level: t.bigs.length >= 4 ? "high" : "mid", text: `${t.bigs.length === 5 ? "Five" : t.bigs.length === 4 ? "Four" : "Three"} bigs (centers or 6′9″+): ${list(t.bigs.map(lastName))}. Hard to space the floor and to guard quick perimeter players.` });
  if (full && t.guards === 0) w.push({ key: "guards", level: "mid", text: "No guards listed. Someone has to bring the ball up against pressure." });
  if (full && t.bigs.length === 0 && t.drb < R.boards.low) w.push({ key: "small", level: "mid", text: `Small lineup with no big: projected defensive rebounding adds up to ${Math.round(t.drb)}%, below a typical unit.` });
  else if (full && t.drb < R.boards.low) w.push({ key: "boards", level: "mid", text: `Thin on the glass: projected defensive rebounding adds up to ${Math.round(t.drb)}%, below a typical unit (${R.boards.low}%+).` });
  if (full && t.maxBlk < R.rim.ok) w.push({ key: "rim", level: "mid", text: "No rim protector. Nobody here blocks 2%+ of opponent twos." });
  if (full && t.usg > R.usage.high) w.push({ key: "usage-high", level: "low", text: `One ball, many scorers: projected usage adds up to ${Math.round(t.usg)}%. Someone gives up shots.` });
  if (full && t.usg < R.usage.low) w.push({ key: "usage-low", level: "mid", text: `Who takes the shots? Projected usage adds up to only ${Math.round(t.usg)}%.` });
  const thin = players.filter(p => (p.op ?? 0) < R.smallSample);
  if (thin.length) w.push({ key: "sample", level: "info", text: `${list(thin.map(lastName))} ${thin.length === 1 ? "has" : "have"} fewer than ${R.smallSample} play-by-play possessions, so ${thin.length === 1 ? "his rating is" : "their ratings are"} mostly the box-score starting point.` });
  if (t.teams > 1) w.push({ key: "teams", level: "info", text: `Players from ${t.teams} teams have never shared a floor. Only the fit adjustments model how they'd mesh.` });
  return w;
}

/** Full projection for five players. eff = D-I average points per 100 possessions. */
export function projectLineup(players, eff) {
  const sum = k => players.reduce((s, p) => s + (p[k] ?? 0), 0);
  const base = { off: sum("o"), def: sum("d") };
  const adjustments = fitAdjustments(players);
  const fitOff = adjustments.filter(a => a.side === "off").reduce((s, a) => s + a.value, 0);
  const fitDef = adjustments.filter(a => a.side === "def").reduce((s, a) => s + a.value, 0);
  const off = base.off + fitOff, def = base.def + fitDef;
  // Rough 1-SE band: players' DPR errors combined as if independent (teammates' errors are partly
  // offsetting, fit adjustments add their own uncertainty, so read it as a rough size, not a CI).
  const se = Math.sqrt(players.reduce((s, p) => s + (p.se ?? 3) ** 2, 0));
  return {
    base, adjustments, fit: { off: fitOff, def: fitDef, total: fitOff + fitDef },
    off, def, net: off + def, se,
    ptsFor: eff + off, ptsAgainst: eff - def,
    warnings: warnings(players),
  };
}

/** Points-per-possession noise for an observed unit: SD of its net per 100 after `poss` possessions each way. */
export const observedSd = poss => (poss > 0 ? (100 * 1.05 * Math.SQRT2) / Math.sqrt(poss) : null);

export { htText };
