// Builds public/data/app/receipts.json for the /receipts page: the model's public track record.
// Headline numbers are copied from meta.json (model.backtest, market), so they match the methodology page.
// byWeek and recent are rebuilt from the game log (public/data/app/games/<day>.json) joined to the
// walk-forward predictions in public/data/model-2027.json, and are checked against the headline.
// Inputs:  public/data/app/meta.json, public/data/app/games/*.json, public/data/model-2027.json
// Output:  public/data/app/receipts.json (kept small: the full prediction file is never shipped)
import { readFile, readdir, writeFile } from "node:fs/promises";
import { isD1Conference } from "./d1-conferences.mjs";

const APP = "public/data/app";
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const RECENT_LIMIT = 60;
const RECENT_FIELDS = ["date", "gameId", "awaySlug", "awayShort", "awayScore", "homeSlug", "homeShort", "homeScore", "homeWinProb", "pickCorrect", "marginError"];

const meta = await readJson(`${APP}/meta.json`);
const model = await readJson("public/data/model-2027.json");
const predictions = model.predictions ?? {};
const backtest = meta.model?.backtest ?? model.backtest;
if (!backtest?.all) {
  console.log("[build-receipts] No backtest in meta.json; skipping receipts.json.");
  process.exit(0);
}

// Teams the site knows as D-I (same list the pages link to).
const teamSlugs = new Set((await readJson(`${APP}/teams.json`)).map(t => t.slug));

// Monday of the ISO week containing a YYYY-MM-DD date.
const mondayOf = day => {
  const d = new Date(`${day}T12:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
};

const dayFiles = (await readdir(`${APP}/games`)).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const finals = [];
let finalsNoPred = 0, notD1 = 0, scoreless = 0, mismatchTeams = 0;
for (const file of dayFiles) {
  const { day, games = [] } = await readJson(`${APP}/games/${file}`);
  for (const g of games) {
    if (g.status !== "final") continue;
    const h = g.home ?? {}, a = g.away ?? {};
    if (!Number.isFinite(h.score) || !Number.isFinite(a.score)) { scoreless++; continue; }
    if (!isD1Conference(h.conf) || !isD1Conference(a.conf)) { notD1++; continue; }
    if (!teamSlugs.has(h.slug) || !teamSlugs.has(a.slug)) mismatchTeams++;
    const p = predictions[String(g.id)];
    if (!p) { finalsNoPred++; continue; }
    const homeWon = h.score > a.score;
    const actualMargin = h.score - a.score;
    const favHome = p.homeWinProb >= 0.5;
    finals.push({
      day, date: g.date, gameId: String(g.id), p,
      homeWon, actualMargin,
      pickCorrect: favHome === homeWon,
      brier: (p.homeWinProb - (homeWon ? 1 : 0)) ** 2,
      marginError: Math.abs(actualMargin - p.margin),
      a: { slug: a.slug, short: a.short, score: a.score },
      h: { slug: h.slug, short: h.short, score: h.score },
    });
  }
}

// Weekly table.
const weeks = new Map();
for (const r of finals) {
  const w = mondayOf(r.day);
  const cur = weeks.get(w) ?? { week: w, games: 0, correct: 0, brierSum: 0 };
  cur.games++; cur.correct += r.pickCorrect ? 1 : 0; cur.brierSum += r.brier;
  weeks.set(w, cur);
}
const byWeek = [...weeks.values()].sort((x, y) => x.week.localeCompare(y.week)).map(w => ({
  week: w.week, games: w.games, correct: w.correct,
  accuracy: +(w.correct / w.games).toFixed(4), brier: +(w.brierSum / w.games).toFixed(4),
}));

// Recent picks, newest first.
const recent = [...finals]
  .sort((x, y) => (y.date ?? y.day).localeCompare(x.date ?? x.day))
  .slice(0, RECENT_LIMIT)
  .map(r => [r.day, r.gameId, r.a.slug, r.a.short, r.a.score, r.h.slug, r.h.short, r.h.score,
    +r.p.homeWinProb.toFixed(3), r.pickCorrect, +r.marginError.toFixed(1)]);

// Consistency check against the headline (meta is the source of truth for display).
const n = finals.length, correct = finals.filter(r => r.pickCorrect).length;
const check = {
  metaGames: backtest.all.games, metaCorrect: backtest.all.correct,
  rebuiltGames: n, rebuiltCorrect: correct,
  matches: n === backtest.all.games && correct === backtest.all.correct,
};

const receipts = {
  updated: meta.model?.updatedAt ?? new Date().toISOString(),
  backtest: { description: backtest.description, all: backtest.all, seasoned: backtest.seasoned ?? null, seasonedRule: backtest.seasonedRule ?? null },
  market: meta.market ?? null,
  byWeek,
  recentFields: RECENT_FIELDS,
  recent,
  check,
};

const out = `${APP}/receipts.json`;
const text = JSON.stringify(receipts);
await writeFile(out, text);
const kb = (Buffer.byteLength(text) / 1024).toFixed(1);
console.log(`[build-receipts] ${out}: ${kb} KB, ${byWeek.length} weeks, ${recent.length} recent picks.`);
console.log(`[build-receipts] Headline (meta): ${backtest.all.correct}/${backtest.all.games} (${(backtest.all.accuracy * 100).toFixed(1)}%), rebuilt from game log: ${correct}/${n} (${n ? (correct / n * 100).toFixed(1) : "—"}%).`);
if (!check.matches) console.log(`[build-receipts] MISMATCH: meta.json backtest is ${backtest.all.correct}/${backtest.all.games} but the game log with predictions gives ${correct}/${n}. meta.json is probably older than model-2027.json; rerun build-app-data. Headline shown is meta's.`);
if (scoreless || notD1 || finalsNoPred || mismatchTeams) console.log(`[build-receipts] Skipped: ${scoreless} scoreless finals, ${notD1} non-D-I, ${finalsNoPred} finals without a prediction; ${mismatchTeams} with a team slug missing from teams.json.`);
