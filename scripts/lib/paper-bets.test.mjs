// npm test (vitest; listed by name in vitest.config.mts because the other script tests use node:test)
import { describe, expect, it } from "vitest";
import {
  americanToDecimal, americanToImplied, buildSummary, closingLineValue, decimalToAmerican, devig, impliedToAmerican,
  parseAmerican, parseEspnLine, selectBets, settleBet, summarize, wilson, TOTAL_SIGMA_MULT,
} from "./paper-bets.mjs";
import { normalCdf } from "./rating-model.mjs";

const LINE = { book: "DraftKings", spread: -6.5, total: 145.5, homeML: -280, awayML: 230, homeSpreadOdds: -108, awaySpreadOdds: -112, overOdds: -110, underOdds: -110 };
const MODEL = { homeWinProb: 0.8, margin: 10, homePts: 78, awayPts: 68, sigma: 12 };
const pick = (bets, market) => bets.find(b => b.market === market);

describe("odds conversion", () => {
  it("parses ESPN's price formats and rejects what is not a price", () => {
    expect(parseAmerican("-4000")).toBe(-4000);
    expect(parseAmerican("+130")).toBe(130);
    expect(parseAmerican(136)).toBe(136);
    expect(parseAmerican("EVEN")).toBe(100);
    for (const bad of ["OFF", "", null, undefined, 0, 50, "-99", "abc", NaN]) expect(parseAmerican(bad)).toBeNull();
  });
  it("converts American odds to decimal and implied probability", () => {
    expect(americanToDecimal(-110)).toBeCloseTo(1.9091, 4);
    expect(americanToDecimal(150)).toBe(2.5);
    expect(americanToDecimal(-4000)).toBeCloseTo(1.025, 6); // a −4000 favorite pays 0.025u
    expect(americanToImplied(-110)).toBeCloseTo(0.5238, 4); // break-even at −110
    expect(americanToImplied(100)).toBe(0.5);
    expect(americanToImplied(300)).toBe(0.25);
    expect(americanToDecimal("OFF")).toBeNull();
  });
  it("round-trips back to American odds", () => {
    for (const a of [-4000, -280, -110, 100, 130, 1600]) {
      expect(decimalToAmerican(americanToDecimal(a))).toBe(a);
      expect(impliedToAmerican(americanToImplied(a))).toBe(a);
    }
    expect(decimalToAmerican(1)).toBeNull();
    expect(impliedToAmerican(1)).toBeNull();
  });
});

describe("devig", () => {
  it("splits a −110/−110 market 50/50 with a 4.76% overround", () => {
    const d = devig(-110, -110);
    expect(d.a).toBeCloseTo(0.5, 10);
    expect(d.overround).toBeCloseTo(0.0476, 4);
  });
  it("normalises a lopsided market to sum to 1", () => {
    const d = devig(-280, 230);
    expect(d.a + d.b).toBeCloseTo(1, 10);
    expect(d.a).toBeCloseTo(0.7368 / (0.7368 + 0.303), 3);
    expect(d.a).toBeLessThan(americanToImplied(-280));
  });
  it("needs both prices", () => { expect(devig(-280, null)).toBeNull(); expect(devig("OFF", 150)).toBeNull(); });
});

describe("parseEspnLine", () => {
  const scoreboard = {
    provider: { name: "DraftKings" }, spread: 2.5, overUnder: 145.5,
    moneyline: { home: { close: { odds: "+130" }, open: { odds: "+120" } }, away: { close: { odds: "-155" }, open: { odds: "-142" } } },
    pointSpread: { home: { close: { line: "+2.5", odds: "-110" }, open: { line: "+1.5", odds: "-105" } }, away: { close: { line: "-2.5", odds: "-110" }, open: { line: "-1.5", odds: "-115" } } },
    total: { over: { close: { line: "o145.5", odds: "-108" }, open: { line: "o144.5", odds: "-110" } }, under: { close: { line: "u145.5", odds: "-112" }, open: { line: "u144.5", odds: "-110" } } },
  };
  it("reads the scoreboard shape", () => {
    expect(parseEspnLine(scoreboard)).toEqual({ book: "DraftKings", spread: 2.5, total: 145.5, homeML: 130, awayML: -155, homeSpreadOdds: -110, awaySpreadOdds: -110, overOdds: -108, underOdds: -112 });
  });
  it("reads the opening line when asked", () => {
    expect(parseEspnLine(scoreboard, { which: "open" })).toMatchObject({ spread: 1.5, total: 144.5, homeML: 120, awayML: -142, overOdds: -110 });
  });
  it("flips to the schedule's orientation when ESPN's home team is our away team", () => {
    expect(parseEspnLine(scoreboard, { flip: true })).toMatchObject({ spread: -2.5, homeML: -155, awayML: 130, total: 145.5, overOdds: -108 });
  });
  it("reads the summary pickcenter shape from its flat fields", () => {
    const pc = { provider: { name: "DraftKings" }, spread: -19.5, overUnder: 149.5, overOdds: -115, underOdds: -105, homeTeamOdds: { favorite: true, moneyLine: -2800, spreadOdds: -105 }, awayTeamOdds: { favorite: false, moneyLine: 1300, spreadOdds: -115 } };
    expect(parseEspnLine(pc)).toEqual({ book: "DraftKings", spread: -19.5, total: 149.5, homeML: -2800, awayML: 1300, homeSpreadOdds: -105, awaySpreadOdds: -115, overOdds: -115, underOdds: -105 });
  });
  it("treats OFF moneylines as missing, never as a price", () => {
    const off = { spread: -34.5, overUnder: 153.5, moneyline: { home: { close: { odds: "OFF" } }, away: { close: { odds: "OFF" } } } };
    expect(parseEspnLine(off)).toMatchObject({ spread: -34.5, homeML: null, awayML: null });
  });
  it("returns null with no line, and when the spread contradicts the favorite flag", () => {
    expect(parseEspnLine(null)).toBeNull();
    expect(parseEspnLine({ provider: { name: "DraftKings" } })).toBeNull();
    expect(parseEspnLine({ spread: 4.5, homeTeamOdds: { favorite: true } })).toBeNull();
  });
});

describe("selectBets", () => {
  it("backs the model's winner on the moneyline at the real price", () => {
    const b = pick(selectBets(LINE, MODEL), "moneyline");
    expect(b).toMatchObject({ side: "home", price: -280, priceAssumed: false, role: "favorite", modelProb: 0.8, spreadBucket: "4–7.5" });
    expect(b.marketProb).toBeCloseTo(devig(-280, 230).a, 4);
    expect(b.edge).toBeCloseTo(0.8 - devig(-280, 230).a, 3);
  });
  it("takes the underdog moneyline when the model disagrees with the market", () => {
    const b = pick(selectBets(LINE, { ...MODEL, homeWinProb: 0.4, margin: -3 }), "moneyline");
    expect(b).toMatchObject({ side: "away", price: 230, role: "underdog" });
    expect(b.edge).toBeCloseTo(0.6 - devig(230, -280).a, 3);
  });
  it("places no moneyline bet without a price for the pick", () => {
    expect(pick(selectBets({ ...LINE, homeML: null }, MODEL), "moneyline")).toBeUndefined();
    const oneSided = pick(selectBets({ ...LINE, awayML: null }, MODEL), "moneyline");
    expect(oneSided.price).toBe(-280);
    expect(oneSided.edge).toBeNull(); // cannot de-vig one price
  });
  it("lays the points when the model margin clears the spread", () => {
    const b = pick(selectBets(LINE, MODEL), "spread");
    expect(b).toMatchObject({ side: "home", line: -6.5, price: -108, priceAssumed: false, role: "favorite" });
    expect(b.modelProb).toBeCloseTo(normalCdf(3.5 / 12), 4);
    expect(b.edge).toBeCloseTo(normalCdf(3.5 / 12) - devig(-108, -112).a, 3);
  });
  it("takes the points when the model margin falls short of the spread", () => {
    const b = pick(selectBets(LINE, { ...MODEL, margin: 2 }), "spread");
    expect(b).toMatchObject({ side: "away", line: 6.5, price: -112, role: "underdog" });
    expect(b.modelProb).toBeCloseTo(normalCdf(4.5 / 12), 4);
  });
  it("assumes −110 for a spread or total with no posted price and says so", () => {
    const bets = selectBets({ spread: 3, total: 150, homeML: null, awayML: null }, MODEL);
    expect(bets.map(b => b.market)).toEqual(["spread", "total"]);
    expect(pick(bets, "spread")).toMatchObject({ side: "home", line: 3, price: -110, priceAssumed: true, marketProb: 0.5, role: "underdog" });
    expect(pick(bets, "total")).toMatchObject({ side: "under", line: 150, price: -110, priceAssumed: true });
  });
  it("picks the over or under from the model's combined score, with the wider total sigma", () => {
    const over = pick(selectBets({ ...LINE, total: 140.5 }, MODEL), "total");
    expect(over).toMatchObject({ side: "over", line: 140.5, role: null });
    expect(over.modelProb).toBeCloseTo(normalCdf(5.5 / (12 * TOTAL_SIGMA_MULT)), 4);
    expect(pick(selectBets({ ...LINE, total: 150.5, overOdds: -105, underOdds: -115 }, MODEL), "total")).toMatchObject({ side: "under", price: -115 });
  });
  it("skips a market when the model sits exactly on the number", () => {
    const bets = selectBets({ ...LINE, spread: -10, total: 146 }, MODEL);
    expect(bets.map(b => b.market)).toEqual(["moneyline"]);
  });
  it("returns nothing without a line or a prediction", () => {
    expect(selectBets(null, MODEL)).toEqual([]);
    expect(selectBets(LINE, null)).toEqual([]);
  });
});

describe("settleBet", () => {
  it("pays a moneyline favorite its real price: −4000 wins 0.025u, loses 1u", () => {
    const b = { market: "moneyline", side: "home", price: -4000 };
    expect(settleBet(b, 90, 60)).toEqual({ result: "win", profit: 0.025 });
    expect(settleBet(b, 60, 61)).toEqual({ result: "loss", profit: -1 });
  });
  it("pays an underdog moneyline at plus money", () => {
    expect(settleBet({ market: "moneyline", side: "away", price: 230 }, 60, 61)).toEqual({ result: "win", profit: 2.3 });
  });
  it("grades spreads on half-points from the picked side's line", () => {
    const fav = { market: "spread", side: "home", line: -6.5, price: -110 };
    expect(settleBet(fav, 77, 70).result).toBe("win");
    expect(settleBet(fav, 76, 70).result).toBe("loss");
    expect(settleBet(fav, 77, 70).profit).toBeCloseTo(0.9091, 4);
    const dog = { market: "spread", side: "away", line: 6.5, price: -112 };
    expect(settleBet(dog, 76, 70).result).toBe("win");
    expect(settleBet(dog, 77, 70).result).toBe("loss");
    expect(settleBet(dog, 60, 70).result).toBe("win"); // dog wins outright
  });
  it("pushes a whole-number spread that lands on the number", () => {
    expect(settleBet({ market: "spread", side: "home", line: -7, price: -110 }, 77, 70)).toEqual({ result: "push", profit: 0 });
    expect(settleBet({ market: "spread", side: "away", line: 7, price: -110 }, 77, 70)).toEqual({ result: "push", profit: 0 });
  });
  it("grades totals including pushes and half-points", () => {
    const over = { market: "total", side: "over", line: 145.5, price: -108 };
    expect(settleBet(over, 76, 70).result).toBe("win");
    expect(settleBet(over, 75, 70).result).toBe("loss");
    expect(settleBet({ market: "total", side: "under", line: 145.5, price: -112 }, 75, 70).result).toBe("win");
    expect(settleBet({ market: "total", side: "over", line: 146, price: -110 }, 76, 70)).toEqual({ result: "push", profit: 0 });
    expect(settleBet({ market: "total", side: "under", line: 146, price: -110 }, 76, 70)).toEqual({ result: "push", profit: 0 });
  });
  it("leaves a bet ungraded without a score", () => {
    expect(settleBet({ market: "spread", side: "home", line: -3, price: -110 }, null, null)).toEqual({ result: null, profit: null });
  });
});

describe("closingLineValue", () => {
  it("is positive when the spread moved toward the pick", () => {
    expect(closingLineValue({ market: "spread", side: "home", line: -3.5 }, { spread: -5.5 })).toBe(2);
    expect(closingLineValue({ market: "spread", side: "away", line: 3.5 }, { spread: -5.5 })).toBe(-2);
    expect(closingLineValue({ market: "spread", side: "away", line: 6.5 }, { spread: -4.5 })).toBe(2);
  });
  it("is positive when the total moved toward the pick", () => {
    expect(closingLineValue({ market: "total", side: "over", line: 140.5 }, { total: 143.5 })).toBe(3);
    expect(closingLineValue({ market: "total", side: "under", line: 140.5 }, { total: 143.5 })).toBe(-3);
  });
  it("compares no-vig moneyline probabilities", () => {
    const bet = { market: "moneyline", side: "home", marketProb: 0.6 };
    expect(closingLineValue(bet, { homeML: -200, awayML: 170 })).toBeCloseTo(devig(-200, 170).a - 0.6, 4);
    expect(closingLineValue(bet, { homeML: null, awayML: 170 })).toBeNull();
    expect(closingLineValue(bet, null)).toBeNull();
  });
});

describe("summary", () => {
  const graded = [
    { market: "spread", side: "home", price: -110, result: "win", profit: 0.9091, edge: 0.12, role: "favorite", spreadBucket: "4–7.5", clv: 1 },
    { market: "spread", side: "away", price: -110, result: "loss", profit: -1, edge: 0.03, role: "underdog", spreadBucket: "15+", clv: -0.5 },
    { market: "spread", side: "home", price: -110, result: "push", profit: 0, edge: 0.06, role: "favorite", spreadBucket: "4–7.5" },
    { market: "spread", side: "home", price: -110, result: "void", profit: 0, edge: 0.2, role: "favorite", spreadBucket: "0–3.5" },
    { market: "spread", side: "home", price: -110, result: null, profit: null, edge: 0.2, role: "favorite", spreadBucket: "0–3.5" },
    { market: "moneyline", side: "home", price: -4000, result: "win", profit: 0.025, edge: -0.01, role: "favorite", spreadBucket: "15+" },
    { market: "total", side: "over", price: -110, result: "win", profit: 0.9091, edge: 0.01, role: null, spreadBucket: "15+" },
  ];
  it("counts W-L-P, units and ROI, leaving void and open bets out", () => {
    const s = summarize(graded.filter(b => b.market === "spread"));
    expect(s).toMatchObject({ bets: 3, wins: 1, losses: 1, pushes: 1, open: 1, void: 1, units: -0.091, winPct: 0.5, sample: "too few to read" });
    expect(s.roi).toBeCloseTo(-0.0303, 4);
    expect(s.breakEvenPct).toBeCloseTo(0.5238, 4);
    expect(s.roiCI[0]).toBeLessThan(s.roi);
    expect(s.roiCI[1]).toBeGreaterThan(s.roi);
  });
  it("handles an empty set", () => {
    expect(summarize([])).toMatchObject({ bets: 0, units: 0, roi: null, roiCI: null, winPct: null, winPctCI: null });
  });
  it("gives a Wilson interval that contains the observed rate and narrows with n", () => {
    const small = wilson(11, 20), big = wilson(550, 1000);
    expect(small[0]).toBeLessThan(0.55); expect(small[1]).toBeGreaterThan(0.55);
    expect(big[1] - big[0]).toBeLessThan(small[1] - small[0]);
    expect(big[0]).toBeCloseTo(0.519, 2);
    expect(wilson(0, 0)).toBeNull();
  });
  it("slices by edge, favorite/underdog and spread size per market", () => {
    const s = buildSummary(graded);
    expect(s.overall.bets).toBe(5);
    const slice = (m, key) => s.markets[m].slices.find(x => x.key === key);
    expect(slice("spread", "all").bets).toBe(3);
    expect(slice("spread", "edge2").bets).toBe(3);
    expect(slice("spread", "edge5").bets).toBe(2);
    expect(slice("spread", "edge10").bets).toBe(1);
    expect(slice("spread", "favorite")).toMatchObject({ bets: 2, wins: 1, pushes: 1 });
    expect(slice("spread", "underdog")).toMatchObject({ bets: 1, losses: 1 });
    expect(slice("spread", "spread:4–7.5").bets).toBe(2);
    expect(slice("spread", "spread:15+").bets).toBe(1);
    expect(slice("moneyline", "edge2").bets).toBe(0);
    expect(slice("moneyline", "all").units).toBe(0.025);
    expect(slice("total", "over").bets).toBe(1);
    expect(slice("total", "favorite")).toBeUndefined();
    expect(slice("spread", "over")).toBeUndefined();
    expect(s.markets.spread.clv).toEqual({ bets: 2, avg: 0.25, beatPct: 0.5 });
    expect(s.markets.total.clv.bets).toBe(0);
  });
});

describe("one-sided prices", () => {
  it("gives no edge when only the pick's side of a spread is priced", () => {
    const bets = selectBets({ spread: -3.5, total: null, homeML: null, awayML: null, homeSpreadOdds: -150, awaySpreadOdds: null, overOdds: null, underOdds: null }, { homeWinProb: 0.8, margin: 9, homePts: 75, awayPts: 66, sigma: 12 });
    const spread = bets.find(b => b.market === "spread");
    expect(spread.side).toBe("home");
    expect(spread.price).toBe(-150);
    expect(spread.edge ?? null).toBeNull();
  });
});
