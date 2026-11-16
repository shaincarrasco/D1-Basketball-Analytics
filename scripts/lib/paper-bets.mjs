// Paper-betting maths: a private simulation of how the rating model's picks would have done
// against real sportsbook lines. No real money, nothing here is shown on the site, and a good
// stretch proves nothing about the future. Pure functions only; scripts/paper-bets.mjs does the I/O.
//
// Conventions:
//   spread   the HOME team's line (negative = home favoured), in the schedule file's home/away
//   prices   American odds as numbers (-110, +130)
//   units    every bet risks 1 unit; a win pays (decimal odds − 1), a loss −1, a push or void 0
import { normalCdf } from "./rating-model.mjs";

export const DEFAULT_PRICE = -110; // assumed for a spread/total with no posted price
// The model's sigma describes the final MARGIN. Totals miss by more, because both teams' scores
// move together with pace: over the first 637 walk-forward finals of 2026-27 the total missed by
// 18.0 points RMS against 13.9 for the margin (sigma ≈ 12.3). Only the total's edge size uses
// this; which side is picked does not depend on it.
export const TOTAL_SIGMA_MULT = 1.45;
export const EDGE_STEPS = [0.02, 0.05, 0.1];
export const SPREAD_BUCKETS = [["0–3.5", 0, 3.5], ["4–7.5", 4, 7.5], ["8–14.5", 8, 14.5], ["15+", 15, Infinity]];
export const MARKETS = ["moneyline", "spread", "total"];
const SMALL_SAMPLE = 100, TINY_SAMPLE = 30;

const finite = v => typeof v === "number" && Number.isFinite(v);
const round = (v, d = 4) => (finite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

// ---------- odds ----------
/** "-4000", "+130", 136, "EVEN" → number; "OFF", blanks and impossible prices → null. */
export function parseAmerican(v) {
  if (v == null) return null;
  if (typeof v === "string") {
    const s = v.trim().toUpperCase();
    if (s === "EVEN" || s === "EV") return 100;
    if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
    v = Number(s);
  }
  return finite(v) && Math.abs(v) >= 100 ? v : null;
}
export const americanToDecimal = a => (parseAmerican(a) == null ? null : a > 0 ? 1 + a / 100 : 1 + 100 / -a);
/** Break-even win probability at this price (still includes the book's margin). */
export const americanToImplied = a => (parseAmerican(a) == null ? null : a > 0 ? 100 / (a + 100) : -a / (-a + 100));
export const decimalToAmerican = d => (!finite(d) || d <= 1 ? null : d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)));
export const impliedToAmerican = p => (!finite(p) || p <= 0 || p >= 1 ? null : decimalToAmerican(1 / p));

/**
 * Remove the book's margin from a two-way market. The two implied probabilities sum to more than 1;
 * scaling both down in proportion is the simplest fair estimate (it slightly overstates long shots,
 * which is fine for bucketing edges).
 */
export function devig(priceA, priceB) {
  const a = americanToImplied(priceA), b = americanToImplied(priceB);
  if (a == null || b == null) return null;
  return { a: a / (a + b), b: b / (a + b), overround: a + b - 1 };
}

// ---------- ESPN odds → line ----------
const lineNum = v => { const n = typeof v === "string" ? Number(v.replace(/^[ou]/i, "")) : v; return finite(n) ? n : null; };
/**
 * One line from an ESPN odds object: the scoreboard's `competitions[0].odds[0]` before a game or
 * the summary's `pickcenter[0]` after it (which keeps the close). `flip` is set when ESPN's home
 * team is the schedule's away team (neutral-site games), so the result is always in the
 * schedule's orientation. Returns null when nothing bettable is posted or the feed contradicts itself.
 */
export function parseEspnLine(odds, { flip = false, which = "close" } = {}) {
  if (!odds || typeof odds !== "object") return null;
  const at = side => side?.[which] ?? null;
  let spread = lineNum(at(odds.pointSpread?.home)?.line) ?? (which === "close" ? lineNum(odds.spread) : null);
  const total = lineNum(at(odds.total?.over)?.line) ?? (which === "close" ? lineNum(odds.overUnder) : null);
  let homeML = parseAmerican(at(odds.moneyline?.home)?.odds) ?? (which === "close" ? parseAmerican(odds.homeTeamOdds?.moneyLine) : null);
  let awayML = parseAmerican(at(odds.moneyline?.away)?.odds) ?? (which === "close" ? parseAmerican(odds.awayTeamOdds?.moneyLine) : null);
  let homeSpreadOdds = parseAmerican(at(odds.pointSpread?.home)?.odds) ?? (which === "close" ? parseAmerican(odds.homeTeamOdds?.spreadOdds) : null);
  let awaySpreadOdds = parseAmerican(at(odds.pointSpread?.away)?.odds) ?? (which === "close" ? parseAmerican(odds.awayTeamOdds?.spreadOdds) : null);
  const overOdds = parseAmerican(at(odds.total?.over)?.odds) ?? (which === "close" ? parseAmerican(odds.overOdds) : null);
  const underOdds = parseAmerican(at(odds.total?.under)?.odds) ?? (which === "close" ? parseAmerican(odds.underOdds) : null);
  // A spread that disagrees with ESPN's own favourite flag means we cannot tell whose line it is.
  if (which === "close" && spread != null && spread !== 0) {
    const homeFav = odds.homeTeamOdds?.favorite, awayFav = odds.awayTeamOdds?.favorite;
    if ((homeFav === true && spread > 0) || (awayFav === true && spread < 0)) return null;
  }
  if (total != null && total <= 0) return null;
  if (flip) {
    if (spread != null) spread = -spread || 0;
    [homeML, awayML] = [awayML, homeML];
    [homeSpreadOdds, awaySpreadOdds] = [awaySpreadOdds, homeSpreadOdds];
  }
  if (spread == null && total == null && homeML == null && awayML == null) return null;
  return { book: odds.provider?.name ?? null, spread, total, homeML, awayML, homeSpreadOdds, awaySpreadOdds, overOdds, underOdds };
}

// ---------- selection ----------
const spreadBucket = spread => (spread == null ? null : SPREAD_BUCKETS.find(([, lo, hi]) => Math.abs(spread) >= lo && Math.abs(spread) <= hi)?.[0] ?? null);
const priced = (posted, other) => {
  const price = posted ?? DEFAULT_PRICE, priceAssumed = posted == null;
  // Neither side posted: both are treated as −110, a 50/50 market. Only the pick's side posted: the vig cannot be
  // removed, so there is no market probability and no edge (a guess here would overstate the edge).
  if (!priceAssumed && other == null) return { price, priceAssumed, marketProb: null };
  const fair = devig(price, priceAssumed ? DEFAULT_PRICE : other);
  return { price, priceAssumed, marketProb: fair?.a ?? null };
};

/**
 * The model's flat 1-unit bets for one game: up to one each on the moneyline, the spread and the
 * total. `edge` is the model's probability of winning the bet minus the market's no-vig probability.
 * Spread and total probabilities assume the final margin (total) is normally distributed around the
 * model's number with standard deviation sigma (sigma × TOTAL_SIGMA_MULT), and ignore the small
 * chance of landing exactly on a whole-number line.
 */
export function selectBets(line, model) {
  const bets = [];
  if (!line || !model) return bets;
  const { spread, total } = line;
  const bucket = spreadBucket(spread);
  const sigma = finite(model.sigma) && model.sigma > 0 ? model.sigma : null;
  const bet = (market, side, lineValue, p, modelProb, role) => bets.push({
    market, side, line: lineValue, price: p.price, priceAssumed: p.priceAssumed,
    modelProb: round(modelProb), marketProb: round(p.marketProb),
    edge: modelProb != null && p.marketProb != null ? round(modelProb - p.marketProb) : null,
    role, spreadBucket: bucket,
  });

  // (a) Moneyline on the model's predicted winner, only at a real posted price.
  const pHome = finite(model.homeWinProb) ? model.homeWinProb : null;
  const mlSide = pHome == null ? null : pHome > 0.5 ? "home" : pHome < 0.5 ? "away" : model.margin > 0 ? "home" : model.margin < 0 ? "away" : null;
  if (mlSide) {
    const [mine, theirs] = mlSide === "home" ? [line.homeML, line.awayML] : [line.awayML, line.homeML];
    if (mine != null) {
      const fair = devig(mine, theirs);
      const homeFav = line.homeML != null && line.awayML != null && line.homeML !== line.awayML ? line.homeML < line.awayML : spread != null && spread !== 0 ? spread < 0 : null;
      bet("moneyline", mlSide, null, { price: mine, priceAssumed: false, marketProb: fair?.a ?? null },
        mlSide === "home" ? pHome : 1 - pHome, homeFav == null ? "pickem" : homeFav === (mlSide === "home") ? "favorite" : "underdog");
    }
  }
  // (b) Against the spread: home covers when margin + line > 0, so back whichever side the model's margin clears.
  if (spread != null && finite(model.margin)) {
    const cover = model.margin + spread;
    if (cover !== 0) {
      const side = cover > 0 ? "home" : "away";
      const p = side === "home" ? priced(line.homeSpreadOdds, line.awaySpreadOdds) : priced(line.awaySpreadOdds, line.homeSpreadOdds);
      const fav = spread === 0 ? "pickem" : (spread < 0) === (side === "home") ? "favorite" : "underdog";
      bet("spread", side, side === "home" ? spread : -spread || 0, p, sigma ? normalCdf(Math.abs(cover) / sigma) : null, fav);
    }
  }
  // (c) Total: over when the model's combined score is above the line, under when below.
  if (total != null && finite(model.homePts) && finite(model.awayPts)) {
    const diff = model.homePts + model.awayPts - total;
    if (diff !== 0) {
      const side = diff > 0 ? "over" : "under";
      const p = side === "over" ? priced(line.overOdds, line.underOdds) : priced(line.underOdds, line.overOdds);
      bet("total", side, total, p, sigma ? normalCdf(Math.abs(diff) / (sigma * TOTAL_SIGMA_MULT)) : null, null);
    }
  }
  return bets;
}

// ---------- settlement ----------
/** Grade one bet against a final score. `line` on a spread bet is the picked side's own line. */
export function settleBet(bet, homeScore, awayScore) {
  if (!finite(homeScore) || !finite(awayScore)) return { result: null, profit: null };
  const margin = homeScore - awayScore;
  let diff; // > 0 wins, 0 pushes, < 0 loses
  if (bet.market === "moneyline") diff = bet.side === "home" ? margin : -margin;
  else if (bet.market === "spread") diff = (bet.side === "home" ? margin : -margin) + bet.line;
  else if (bet.market === "total") diff = bet.side === "over" ? homeScore + awayScore - bet.line : bet.line - (homeScore + awayScore);
  else return { result: null, profit: null };
  if (diff === 0) return { result: "push", profit: 0 };
  return diff > 0 ? { result: "win", profit: round(americanToDecimal(bet.price) - 1) } : { result: "loss", profit: -1 };
}

/**
 * Closing-line value: how much better the frozen pregame number was than the close, for the side
 * that was bet. Points for spreads and totals, no-vig probability for moneylines. Positive = the
 * market moved toward the pick after the bet, the best early sign that an edge is real.
 */
export function closingLineValue(bet, closing) {
  if (!closing) return null;
  if (bet.market === "spread") return closing.spread == null ? null : round(bet.line - (bet.side === "home" ? closing.spread : -closing.spread), 2);
  if (bet.market === "total") return closing.total == null ? null : round(bet.side === "over" ? closing.total - bet.line : bet.line - closing.total, 2);
  if (bet.market === "moneyline") {
    const fair = bet.side === "home" ? devig(closing.homeML, closing.awayML) : devig(closing.awayML, closing.homeML);
    return fair && bet.marketProb != null ? round(fair.a - bet.marketProb) : null;
  }
  return null;
}

// ---------- summary ----------
/** 95% Wilson interval for a win rate; behaves sensibly at small n and near 0/1. */
export function wilson(wins, n, z = 1.96) {
  if (!n) return null;
  const p = wins / n, d = 1 + (z * z) / n;
  const mid = (p + (z * z) / (2 * n)) / d, half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [round(Math.max(0, mid - half)), round(Math.min(1, mid + half))];
}

/**
 * Record for a set of graded bets. ROI is units won per unit risked (pushes count as risked);
 * winPct ignores pushes. breakEvenPct is the average win rate the prices themselves require, the
 * number a moneyline win rate has to be read against. Voided and unsettled bets are only counted.
 */
export function summarize(bets) {
  const graded = bets.filter(b => b.result === "win" || b.result === "loss" || b.result === "push");
  const n = graded.length;
  const wins = graded.filter(b => b.result === "win").length, losses = graded.filter(b => b.result === "loss").length;
  const units = graded.reduce((s, b) => s + b.profit, 0);
  const mean = n ? units / n : null;
  const sd = n > 1 ? Math.sqrt(graded.reduce((s, b) => s + (b.profit - mean) ** 2, 0) / (n - 1)) : null;
  const half = sd != null ? (1.96 * sd) / Math.sqrt(n) : null;
  const avg = (list, f) => { const v = list.map(f).filter(finite); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  return {
    bets: n, wins, losses, pushes: n - wins - losses,
    open: bets.filter(b => b.result == null).length, void: bets.filter(b => b.result === "void").length,
    units: round(units, 3), roi: round(mean), roiCI: half != null ? [round(mean - half), round(mean + half)] : null,
    winPct: wins + losses ? round(wins / (wins + losses)) : null, winPctCI: wilson(wins, wins + losses),
    breakEvenPct: round(avg(graded.filter(b => b.result !== "push"), b => americanToImplied(b.price))),
    avgEdge: round(avg(graded, b => b.edge)),
    sample: n < TINY_SAMPLE ? "too few to read" : n < SMALL_SAMPLE ? "small sample" : null,
  };
}

function clvSummary(bets) {
  const v = bets.map(b => b.clv).filter(finite);
  if (!v.length) return { bets: 0, avg: null, beatPct: null };
  return { bets: v.length, avg: round(v.reduce((s, x) => s + x, 0) / v.length, 3), beatPct: round(v.filter(x => x > 0).length / v.length) };
}

const SLICES = [
  ["all", "All bets", () => true],
  ...EDGE_STEPS.map(e => [`edge${Math.round(e * 100)}`, `Edge ≥ ${Math.round(e * 100)} pts`, b => b.edge != null && b.edge >= e]),
  ["favorite", "Picked the favorite", b => b.role === "favorite"],
  ["underdog", "Picked the underdog", b => b.role === "underdog"],
  ["over", "Over", b => b.side === "over"],
  ["under", "Under", b => b.side === "under"],
  ...SPREAD_BUCKETS.map(([label]) => [`spread:${label}`, `Spread ${label}`, b => b.spreadBucket === label]),
];

/**
 * Per-market and overall records with the standard slices. Each bet row is a ledger bet plus
 * optional `clv`. Slices that cannot apply to a market (favorite/underdog on a total) are dropped.
 */
export function buildSummary(bets) {
  const markets = {};
  for (const market of MARKETS) {
    const mine = bets.filter(b => b.market === market);
    markets[market] = {
      slices: SLICES
        .filter(([key]) => (market === "total" ? key !== "favorite" && key !== "underdog" : key !== "over" && key !== "under"))
        .map(([key, label, keep]) => ({ key, label, ...summarize(mine.filter(keep)) })),
      clv: clvSummary(mine),
    };
  }
  return { overall: summarize(bets), markets };
}
