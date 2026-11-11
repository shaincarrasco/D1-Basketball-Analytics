// Builds DHR v2 ratings, walk-forward pregame predictions and a backtest.
// Inputs:  public/data/team-season-2027.json, public/data/games-season-2027.json
// Outputs: powerRatings on each team record (team-season file, for compatibility)
//          public/data/model-2027.json (ratings, per-game predictions, backtest)
import { readFile, writeFile } from "node:fs/promises";
import { isD1Conference } from "./d1-conferences.mjs";
import { fit, predict, rating, NON_D1 } from "./lib/rating-model.mjs";

const teamPath = "public/data/team-season-2027.json";
const gamePath = "public/data/games-season-2027.json";
const modelPath = "public/data/model-2027.json";
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const [teamPayload, gamePayload] = await Promise.all([readJson(teamPath), readJson(gamePath)]);
const teamRecords = Array.isArray(teamPayload.teams) ? teamPayload.teams : [];
const scheduled = Array.isArray(gamePayload.games) ? gamePayload.games : [];

// Optional preseason prior: last season's provider-adjusted ratings (scripts/fetch-prior-ratings.mjs).
let seasonPrior = null, priorInfo = null;
try {
  const prior = await readJson("public/data/prior-ratings.json");
  const rows = (prior.teams ?? []).filter(r => Number.isFinite(r.offensiveRating) && Number.isFinite(r.defensiveRating));
  if (rows.length > 200) {
    const mO = rows.reduce((s, r) => s + r.offensiveRating, 0) / rows.length;
    const mD = rows.reduce((s, r) => s + r.defensiveRating, 0) / rows.length;
    seasonPrior = new Map(rows.map(r => [String(r.teamId), { O: r.offensiveRating - mO, D: r.defensiveRating - mD }]));
    priorInfo = { season: prior.season ?? null, provider: prior.provider ?? null, teams: rows.length };
  }
} catch { /* no prior file: fall back to conference-mean priors */ }

const finite = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const etDate = iso => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
const estPoss = s => {
  if (!s) return null;
  const direct = finite(s.possessions);
  if (direct && direct > 0) return direct;
  const fga = finite(s.fieldGoals?.attempted), orb = finite(s.rebounds?.offensive), tov = finite(s.turnovers?.total), fta = finite(s.freeThrows?.attempted);
  return fga !== null && tov !== null && fta !== null ? fga - (orb ?? 0) + tov + 0.475 * fta : null;
};

// Possessions and minutes per game from the provider's game-level team box scores.
const boxByGame = new Map();
for (const team of teamRecords) {
  for (const row of team.gameStats ?? []) {
    if (row?.gameId == null || boxByGame.has(String(row.gameId))) continue;
    const a = estPoss(row.teamStats), b = estPoss(row.opponentStats);
    const poss = a && b ? (a + b) / 2 : a ?? b;
    boxByGame.set(String(row.gameId), { poss, minutes: finite(row.gameMinutes) ?? 40 });
  }
}

const isD1 = conf => isD1Conference(conf);
const nodeId = (id, conf) => (isD1(conf) ? String(id) : NON_D1);
const allGames = scheduled
  .filter(g => g.homeTeamId != null && g.awayTeamId != null && (isD1(g.homeConference) || isD1(g.awayConference)))
  .map(g => ({ ...g, et: etDate(g.date) }))
  .sort((a, b) => a.date.localeCompare(b.date));

const toFitGame = g => {
  const box = boxByGame.get(String(g.id));
  const nonD1 = !isD1(g.homeConference) || !isD1(g.awayConference);
  const poss = box?.poss ?? null;
  return {
    gameId: String(g.id), date: g.date,
    homeId: nodeId(g.homeTeamId, g.homeConference), awayId: nodeId(g.awayTeamId, g.awayConference),
    homeConf: isD1(g.homeConference) ? g.homeConference : null, awayConf: isD1(g.awayConference) ? g.awayConference : null,
    neutral: g.neutralSite === true, homePts: g.homeScore, awayPts: g.awayScore,
    poss: poss ?? 69, minutes: box?.minutes ?? 40,
    // Games without a box score still carry score information, at reduced weight.
    weight: (nonD1 ? 0.5 : 1) * (poss ? 1 : 0.5),
  };
};
const finals = allGames.filter(g => g.status === "final" && finite(g.homeScore) !== null && finite(g.awayScore) !== null);
const fitGames = finals.map(toFitGame);
if (!fitGames.length) throw new Error("No completed games available; refusing to publish an empty DHR model.");

// Walk-forward: ratings for day D use only games completed before D.
const dates = [...new Set(allGames.map(g => g.et))].sort();
const predictions = {};
let model = null, fittedThrough = -1;
for (const day of dates) {
  const usable = fitGames.filter((_, i) => finals[i].et < day);
  if (usable.length !== fittedThrough) {
    model = fit(usable, { warm: model ?? undefined, seasonPrior: seasonPrior ?? undefined });
    fittedThrough = usable.length;
  }
  for (const g of allGames.filter(x => x.et === day)) {
    const home = rating(model, String(g.homeTeamId), isD1(g.homeConference));
    const away = rating(model, String(g.awayTeamId), isD1(g.awayConference));
    const p = predict(model, home, away, g.neutralSite === true);
    predictions[g.id] = {
      homeWinProb: +p.homeWinProb.toFixed(4), margin: +p.margin.toFixed(2),
      homePts: +p.homePts.toFixed(1), awayPts: +p.awayPts.toFixed(1), tempo: +p.tempo.toFixed(1),
      sigma: +p.sigma.toFixed(2), homePrior: +home.n.toFixed(1), awayPrior: +away.n.toFixed(1),
    };
  }
}

// Current ratings from every completed game.
const current = fit(fitGames, { warm: model ?? undefined, seasonPrior: seasonPrior ?? undefined });

// Backtest the out-of-sample predictions.
const evaluate = rows => {
  if (!rows.length) return null;
  let correct = 0, abs = 0, brier = 0, logLoss = 0;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, won: 0 }));
  for (const { p, homeWon, actualMargin } of rows) {
    const fav = p.homeWinProb >= 0.5 ? homeWon : !homeWon;
    if (fav) correct++;
    abs += Math.abs(actualMargin - p.margin);
    const o = homeWon ? 1 : 0;
    brier += (p.homeWinProb - o) ** 2;
    const q = Math.min(0.999, Math.max(0.001, p.homeWinProb));
    logLoss += -(o * Math.log(q) + (1 - o) * Math.log(1 - q));
    // Calibrate on the favourite's probability.
    const favP = Math.max(p.homeWinProb, 1 - p.homeWinProb);
    const b = Math.min(9, Math.floor(favP * 10));
    bins[b].n++; bins[b].p += favP; bins[b].won += fav ? 1 : 0;
  }
  const n = rows.length;
  return {
    games: n, correct, accuracy: +(correct / n).toFixed(4), marginMAE: +(abs / n).toFixed(2),
    brier: +(brier / n).toFixed(4), logLoss: +(logLoss / n).toFixed(4),
    calibration: bins.map((b, i) => ({ bin: `${i * 10}-${i * 10 + 10}%`, games: b.n, expected: b.n ? +(b.p / b.n).toFixed(3) : null, actual: b.n ? +(b.won / b.n).toFixed(3) : null })).filter(b => b.games),
  };
};
const scored = finals.filter(g => isD1(g.homeConference) && isD1(g.awayConference)).map(g => ({ g, p: predictions[g.id], homeWon: g.homeScore > g.awayScore, actualMargin: g.homeScore - g.awayScore })).filter(r => r.p);
const backtest = {
  description: "Out-of-sample: every prediction uses only games completed before that game's date (Eastern time). D-I vs D-I games only.",
  all: evaluate(scored),
  seasoned: evaluate(scored.filter(r => r.p.homePrior >= 3 && r.p.awayPrior >= 3)),
  seasonedRule: "Both teams had at least 3 prior weighted D-I games",
};

// Team ratings + ranks.
const ratingRows = teamRecords.filter(t => isD1(t.conference) && t.teamId != null).map(t => {
  const r = rating(current, String(t.teamId), true);
  if (!r.known) return { teamId: t.teamId, rated: false };
  const opps = fitGames.filter(g => g.homeId === String(t.teamId) || g.awayId === String(t.teamId)).map(g => (g.homeId === String(t.teamId) ? g.awayId : g.homeId));
  const sos = opps.length ? opps.reduce((s, o) => s + rating(current, o, o !== NON_D1).adjEM, 0) / opps.length : null;
  return { teamId: t.teamId, rated: true, adjO: r.adjO, adjD: r.adjD, adjEM: r.adjEM, tempo: r.adjT, sos, games: r.n };
});
const rated = ratingRows.filter(r => r.rated).sort((a, b) => b.adjEM - a.adjEM);
rated.forEach((r, i) => { r.rank = i + 1; });
const rankBy = (key, dir) => { [...rated].sort((a, b) => dir * (a[key] - b[key])).forEach((r, i) => { r[key + "Rank"] = i + 1; }); };
rankBy("adjO", -1); rankBy("adjD", 1); rankBy("tempo", -1); rankBy("sos", -1);
const byTeamId = new Map(ratingRows.map(r => [String(r.teamId), r]));
const round = (v, d = 3) => (v == null ? null : +v.toFixed(d));
const sample = n => (n < 4 ? "Early sample" : n < 8 ? "Developing" : "Established");

const outputTeams = teamRecords.map(team => {
  const r = byTeamId.get(String(team.teamId));
  if (!r?.rated) return { ...team, powerRatings: null };
  return {
    ...team,
    powerRatings: {
      adjO: round(r.adjO), adjD: round(r.adjD), adjEM: round(r.adjEM), tempo: round(r.tempo), sos: round(r.sos),
      games: round(r.games, 1), rawGames: team.games ?? null, reliability: round(r.games / (r.games + current.cfg.teamPrior)),
      sample: sample(r.games), model: "D1 Hoops Power Rating v2", rank: r.rank,
      adjORank: r.adjORank, adjDRank: r.adjDRank, tempoRank: r.tempoRank, sosRank: r.sosRank,
    },
  };
});

const ratingModel = {
  name: "D1 Hoops Power Rating", version: "2.0.0",
  method: "Ridge-regularised additive opponent adjustment (offence, defence, tempo) with conference-mean priors, jointly estimated home edge, pooled non-D-I node, and walk-forward out-of-sample predictions.",
  leagueAverage: round(current.mu), leagueTempo: round(current.muT), estimatedHomeEdge: round(current.h),
  homeEdgePointsPerGame: round((current.h * current.muT) / 100, 2),
  gameCoverage: fitGames.length, rankedTeams: rated.length, iterations: current.iterations,
  seasonPrior: priorInfo,
  priors: { teamGames: current.cfg.teamPrior, conferenceTeams: current.cfg.conferencePrior, homeEdge: current.cfg.homeEdgePrior, homeEdgeWeight: current.cfg.homeEdgeWeight, nonD1Weight: current.cfg.nonD1Weight },
  updatedAt: teamPayload.fetchedAt ?? new Date().toISOString(),
};
const nonD1 = rating(current, NON_D1, false);

await writeFile(teamPath, JSON.stringify({ ...teamPayload, ratingModel, teams: outputTeams }, null, 2) + "\n");
await writeFile(modelPath, JSON.stringify({
  ...ratingModel,
  season: 2027,
  pooledNonD1: nonD1.known ? { adjO: round(nonD1.adjO), adjD: round(nonD1.adjD), adjEM: round(nonD1.adjEM), adjT: round(nonD1.adjT) } : null,
  conferenceStrength: null,
  backtest,
  predictions,
}) + "\n");

console.log(`[DHR v2] ${rated.length} teams ranked from ${fitGames.length} completed games in ${current.iterations} iterations.`);
console.log(`[DHR v2] League ${current.mu.toFixed(2)} pts/100, tempo ${current.muT.toFixed(1)}, home edge ${current.h.toFixed(2)} pts/100 (${((current.h * current.muT) / 100).toFixed(2)} pts/game).`);
if (backtest.all) console.log(`[DHR v2] Backtest: ${backtest.all.correct}/${backtest.all.games} (${(backtest.all.accuracy * 100).toFixed(1)}%) straight-up, margin MAE ${backtest.all.marginMAE}, Brier ${backtest.all.brier}.`);
console.log("[DHR v2] Top 10: " + rated.slice(0, 10).map(r => `${teamRecords.find(t => t.teamId === r.teamId)?.team} ${r.adjEM.toFixed(1)}`).join(", "));
