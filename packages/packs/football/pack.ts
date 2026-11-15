// College football sport pack: the stats, filters, ranking recipes and curated charts for
// football. The engine lives in src/sport-kit; this file is the only football-specific part.
// Every metric is derived here from the raw season totals in types.ts.
import { floorFilter, positionFilter, type FilterDef, type Framework, type Metric, type SportPack } from "@sports/kit";
import type { FootballRow } from "./types";

type M = Metric<FootballRow>;

// Sample guards: a rate only counts once the player has enough of its base to mean something.
const att50 = (r: FootballRow) => (r.pAtt ?? 0) >= 50;
const deep10 = (r: FootballRow) => (r.pDeepAtt ?? 0) >= 10;
const carries30 = (r: FootballRow) => (r.rCar ?? 0) >= 30;
const targets15 = (r: FootballRow) => (r.rcTgt ?? 0) >= 15;
const deepTargets5 = (r: FootballRow) => (r.rcDeepTgt ?? 0) >= 5;
const tackles25 = (r: FootballRow) => (r.dTkl ?? 0) >= 25;

// Derivations. Each returns null rather than NaN or Infinity when the base is missing or zero.
const ratio = (n: number | null, d: number | null) => (n === null || d === null || !d ? null : n / d);
const pct = (n: number | null, d: number | null) => { const x = ratio(n, d); return x === null ? null : x * 100; };
const perGame = (n: number | null, g: number) => (n === null || !g ? null : n / g);
/** Sum of stat lines. Null only when every line is missing (the stat doesn't apply to this player). */
const plus = (...xs: (number | null)[]) => (xs.every(x => x === null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0));
/** Dropbacks: pass attempts plus sacks taken. */
const dropbacks = (r: FootballRow) => plus(r.pAtt, r.pSacks);
/** Adjusted net yards per attempt: sack yards count against him, and each sack counts as an attempt. */
const anyA = (r: FootballRow) => {
  if (r.pAtt === null || r.pYds === null || r.pTd === null || r.pInt === null || r.pSacks === null || r.pSackYds === null) return null;
  return ratio(r.pYds + 20 * r.pTd - 45 * r.pInt - r.pSackYds, r.pAtt + r.pSacks);
};
/** Tackles for loss, passes defended and interceptions: the plays that change a drive without a tackle. */
const havoc = (r: FootballRow) => plus(r.dTfl, r.dPd, r.dInt);

export const METRICS: M[] = [
  // Passing. Lines apply to QBs. Rate guards need 50+ attempts.
  { key: "cmpPct", label: "Completion %", short: "Cmp%", group: "Passing", unit: "%", ok: att50, get: r => pct(r.pCmp, r.pAtt), desc: "Share of pass attempts completed." },
  { key: "ypa", label: "Yards per attempt", short: "Y/Att", group: "Passing", ok: att50, get: r => ratio(r.pYds, r.pAtt), desc: "Passing yards per attempt, sacks not counted." },
  { key: "anyA", label: "Adjusted net yards per attempt", short: "ANY/A", group: "Passing", ok: att50, get: anyA, desc: "Yards per attempt with credit for touchdowns, a penalty for picks, and sack yards taken off (each sack counts as an attempt)." },
  { key: "tdRate", label: "Touchdown rate", short: "TD%", group: "Passing", unit: "%", ok: att50, get: r => pct(r.pTd, r.pAtt), desc: "Touchdown passes per 100 attempts." },
  { key: "intRate", label: "Interception rate", short: "INT%", group: "Passing", unit: "%", invert: true, ok: att50, get: r => pct(r.pInt, r.pAtt), desc: "Interceptions per 100 attempts (lower is better)." },
  { key: "sackRate", label: "Sack rate", short: "Sk%", group: "Passing", unit: "%", invert: true, ok: att50, get: r => pct(r.pSacks, dropbacks(r)), desc: "Share of dropbacks that ended in a sack (lower is better)." },
  // Deep passing. Depth is measured on the throws where the spot was recorded.
  { key: "deepRate", label: "Deep attempt rate", short: "Deep%", group: "Deep passing", unit: "%", ok: att50, get: r => pct(r.pDeepAtt, r.pAtt), desc: "Share of pass attempts thrown deep." },
  { key: "deepCmp", label: "Deep completion %", short: "DpCmp%", group: "Deep passing", unit: "%", ok: deep10, get: r => pct(r.pDeepCmp, r.pDeepAtt), desc: "Share of deep attempts completed (needs 10+ deep attempts)." },
  { key: "avgDepth", label: "Average throw depth", short: "Depth", group: "Deep passing", digits: 1, ok: att50, get: r => ratio(r.pAir, r.pAirAtt), desc: "Average air yards on his throws, where the spot was recorded: how far downfield he attacks." },
  // Rushing. Rate guards need 30+ carries.
  { key: "ypc", label: "Yards per carry", short: "Y/Car", group: "Rushing", ok: carries30, get: r => ratio(r.rYds, r.rCar), desc: "Rushing yards per carry." },
  { key: "explRun", label: "Explosive run rate", short: "Expl%", group: "Rushing", unit: "%", ok: carries30, get: r => pct(r.rRuns10, r.rCar), desc: "Share of carries that gain 10 or more yards." },
  { key: "stuffRate", label: "Stuff rate", short: "Stuff%", group: "Rushing", unit: "%", invert: true, ok: carries30, get: r => pct(r.rStuffs, r.rCar), desc: "Share of carries stopped for no gain or a loss (lower is better)." },
  { key: "rushFirst", label: "Rushing first-down rate", short: "Rush1st%", group: "Rushing", unit: "%", ok: carries30, get: r => pct(r.rFirst, r.rCar), desc: "Share of carries that gained a first down." },
  { key: "rushYpg", label: "Rushing yards per game", short: "Rush/G", group: "Rushing", digits: 1, get: r => perGame(r.rYds, r.games), desc: "Rushing yards per game." },
  // Receiving. Rate guards need 15+ targets.
  { key: "catchRate", label: "Catch rate", short: "Catch%", group: "Receiving", unit: "%", ok: targets15, get: r => pct(r.rcRec, r.rcTgt), desc: "Share of his targets that he caught." },
  { key: "ypt", label: "Yards per target", short: "Y/Tgt", group: "Receiving", ok: targets15, get: r => ratio(r.rcYds, r.rcTgt), desc: "Receiving yards per target, including incompletions." },
  { key: "airPerCatch", label: "Air yards per catch", short: "AY/Rec", group: "Receiving", digits: 1, ok: targets15, get: r => ratio(r.rcAir, r.rcRec), desc: "How far past the line of scrimmage his catches were caught, on average. High means he works downfield." },
  { key: "yacRec", label: "Yards after catch per catch", short: "YAC/R", group: "Receiving", digits: 1, ok: targets15, get: r => ratio(r.rcYac, r.rcRec), desc: "Yards gained after the catch, per reception: what he adds once he has the ball." },
  { key: "deepTgtShare", label: "Deep target share", short: "DeepTgt%", group: "Receiving", unit: "%", ok: targets15, get: r => pct(r.rcDeepTgt, r.rcTgt), desc: "Share of his targets that were thrown deep." },
  { key: "deepCatch", label: "Deep catch rate", short: "DeepC%", group: "Receiving", unit: "%", ok: deepTargets5, get: r => pct(r.rcDeepRec, r.rcDeepTgt), desc: "Share of deep targets he caught (needs 5+ deep targets)." },
  { key: "rcFirstPerTgt", label: "First downs per target", short: "1st/Tgt", group: "Receiving", digits: 2, ok: targets15, get: r => ratio(r.rcFirst, r.rcTgt), desc: "Receiving first downs per target: how often his targets move the chains." },
  { key: "rcYpg", label: "Receiving yards per game", short: "Rec/G", group: "Receiving", digits: 1, get: r => perGame(r.rcYds, r.games), desc: "Receiving yards per game." },
  // Defense. Tackling-share guards need 25+ tackles.
  { key: "tklG", label: "Tackles per game", short: "TKL/G", group: "Defense", digits: 1, get: r => perGame(r.dTkl, r.games), desc: "Total tackles per game." },
  { key: "soloShare", label: "Solo tackle share", short: "Solo%", group: "Defense", unit: "%", ok: tackles25, get: r => pct(r.dSolo, r.dTkl), desc: "Share of his tackles made alone, rather than assisted (needs 25+ tackles)." },
  { key: "tflG", label: "Tackles for loss per game", short: "TFL/G", group: "Defense", digits: 2, get: r => perGame(r.dTfl, r.games), desc: "Tackles that stop a runner behind the line of scrimmage, per game." },
  { key: "sacksG", label: "Sacks per game", short: "Sk/G", group: "Defense", digits: 2, get: r => perGame(r.dSacks, r.games), desc: "Sacks per game." },
  { key: "hurG", label: "Quarterback hurries per game", short: "Hur/G", group: "Defense", digits: 2, get: r => perGame(r.dHur, r.games), desc: "Quarterback hurries per game: pressures that did not end in a sack." },
  { key: "pdG", label: "Passes defended per game", short: "PD/G", group: "Defense", digits: 2, get: r => perGame(r.dPd, r.games), desc: "Passes broken up or deflected per game." },
  { key: "dInt", label: "Interceptions", short: "INT", group: "Defense", digits: 0, get: r => r.dInt, desc: "Passes he intercepted this season." },
  { key: "havocG", label: "Havoc plays per game", short: "Havoc/G", group: "Defense", digits: 2, get: r => perGame(havoc(r), r.games), desc: "Tackles for loss, passes defended and interceptions combined, per game." },
  // Volume (no guards: these are counts, not rates)
  { key: "games", label: "Games played", short: "G", group: "Volume", digits: 0, get: r => r.games, desc: "Games with at least one stat this season." },
  { key: "passYpg", label: "Passing yards per game", short: "Pass/G", group: "Volume", digits: 1, get: r => perGame(r.pYds, r.games), desc: "Passing yards per game." },
  { key: "scrimYpg", label: "Scrimmage yards per game", short: "Scrim/G", group: "Volume", digits: 1, get: r => perGame(plus(r.rYds, r.rcYds), r.games), desc: "Rushing plus receiving yards per game." },
  { key: "touchG", label: "Touches per game", short: "Tch/G", group: "Volume", digits: 1, get: r => perGame(plus(r.rCar, r.rcRec), r.games), desc: "Carries plus receptions per game: how often the ball is in his hands." },
  { key: "totalTd", label: "Total touchdowns", short: "TDs", group: "Volume", digits: 0, get: r => plus(r.pTd, r.rTd, r.rcTd, r.dTd), desc: "Touchdowns scored this season: passing, rushing, receiving and defensive." },
];

const POSITIONS = [
  { key: "QB", label: "Quarterback", plural: "Quarterbacks", tone: "bulb" },
  { key: "RB", label: "Running back", plural: "Running backs", tone: "good" },
  { key: "WR", label: "Wide receiver", plural: "Wide receivers", tone: "hot" },
  { key: "TE", label: "Tight end", plural: "Tight ends", tone: "off" },
  { key: "DL", label: "Defensive line", plural: "Defensive linemen", tone: "def" },
  { key: "LB", label: "Linebacker", plural: "Linebackers", tone: "ink" },
  { key: "DB", label: "Defensive back", plural: "Defensive backs", tone: "bad" },
] as const;

const entity: SportPack<FootballRow>["entity"] = {
  id: r => r.id,
  name: r => r.name,
  pos: r => r.pos,
  team: r => ({ name: r.team.name, short: r.team.short, logo: r.team.logo, color: r.team.color, altColor: r.team.altColor, group: r.team.confSlug, groupName: r.team.confName }),
  href: () => null,
  exposure: r => r.games,
};

const FILTERS: FilterDef<FootballRow>[] = [
  {
    key: "conf", label: "Conference", default: "all", compact: true,
    options: lists => [{ value: "all", label: "All of FBS" }, ...(lists.conf ?? []).map(([value, label]) => ({ value, label }))],
    test: (r, v) => v === "all" || r.team.confSlug === v,
    describe: (v, lists) => (v === "all" ? null : { noun: `${lists.conf?.find(c => c[0] === v)?.[1] ?? v} players` }),
  },
  positionFilter<FootballRow>({ positions: [...POSITIONS], entity }),
  floorFilter<FootballRow>({ key: "gp", label: "Games", get: r => r.games, steps: [1, 3, 5, 8], default: 3, fmt: n => `${n}+ games`, anyLabel: "Any games", suffix: n => `${n}+ games` }),
];

export const FRAMEWORKS: Framework[] = [
  { key: "quarterback", label: "Quarterback", blurb: "The passer's all-round view: adjusted net yards per attempt first, then completions, touchdowns and ball security.",
    weights: [["anyA", 30], ["cmpPct", 15], ["ypa", 10], ["tdRate", 15], ["intRate", 15], ["sackRate", 15]] },
  { key: "deepThreat", label: "Deep threat (QB)", blurb: "Throws deep often and completes them: deep completion %, average throw depth and how much of the attack goes long.",
    weights: [["deepCmp", 35], ["avgDepth", 25], ["deepRate", 20], ["ypa", 20]] },
  { key: "runningBack", label: "Running back", blurb: "Efficient, explosive running that is hard to stop: yards per carry, explosive runs, few stuffs and first downs.",
    weights: [["ypc", 30], ["explRun", 25], ["stuffRate", 25], ["rushFirst", 20]] },
  { key: "workhorse", label: "Workhorse", blurb: "The volume back: touches per game, rushing yards per game and a clean yards-per-carry average.",
    weights: [["touchG", 40], ["rushYpg", 35], ["ypc", 25]] },
  { key: "receiver", label: "Receiver", blurb: "Efficiency per target, and what he does after the catch.",
    weights: [["ypt", 35], ["catchRate", 25], ["yacRec", 20], ["rcFirstPerTgt", 20]] },
  { key: "deepThreatWr", label: "Deep threat (WR)", blurb: "Gets targeted deep and wins those throws: deep target share, deep catch rate and air yards per catch.",
    weights: [["deepTgtShare", 35], ["deepCatch", 25], ["airPerCatch", 25], ["ypt", 15]] },
  { key: "possession", label: "Possession", blurb: "Catches what he is thrown and moves the chains: catch rate and first downs per target.",
    weights: [["catchRate", 60], ["rcFirstPerTgt", 40]] },
  { key: "passRusher", label: "Pass rusher", blurb: "Pressure on the quarterback: sacks, hurries and tackles for loss.",
    weights: [["sacksG", 35], ["hurG", 35], ["tflG", 30]] },
  { key: "ballHawk", label: "Ball hawk", blurb: "Takes the ball away: interceptions, passes defended and havoc plays.",
    weights: [["dInt", 40], ["pdG", 40], ["havocG", 20]] },
  { key: "tackler", label: "Tackler", blurb: "Gets ball carriers down: tackle volume, solo share and tackles for loss.",
    weights: [["tklG", 40], ["soloShare", 30], ["tflG", 30]] },
];

export const football: SportPack<FootballRow> = {
  id: "football",
  name: "College football",
  brand: "GRIDIRON",
  filePrefix: "cfb",
  nouns: { player: "player", players: "players", pool: "FBS players", pronoun: "he" },
  entity,
  positions: [...POSITIONS],
  groups: { label: "Conference", list: "conf", short: "Conf" },
  metrics: METRICS,
  metricGroups: ["Passing", "Deep passing", "Rushing", "Receiving", "Defense", "Volume"],
  filters: FILTERS,
  frameworks: FRAMEWORKS,
  tiers: [{ min: 97, label: "Elite" }, { min: 90, label: "Excellent" }, { min: 75, label: "Very good" }, { min: 50, label: "Solid" }, { min: 0, label: "Developing" }],
  ranking: { minCoverage: 0.6, shrinkK: 4, shrinkUnit: "games" },
  charts: {
    defaultX: "touchG", defaultY: "scrimYpg",
    profileMetrics: ["cmpPct", "ypa", "anyA", "tdRate", "intRate", "sackRate", "deepRate", "deepCmp", "avgDepth", "ypc", "explRun", "rushYpg"],
    sections: ["Passing", "Rushing", "Receiving", "Defense", "Compare"],
    presets: [
      { id: "sack-any", section: "Passing", blurb: "Sack rate against adjusted net yards per attempt. Right = cleaner pocket (lower sack rate is better).",
        spec: { x: "sackRate", y: "anyA", title: "Sacks taken vs adjusted net yards", pool: { pos: "QB" }, quads: ["Sacked, still efficient", "Clean and efficient", "Sacked and inefficient", "Clean, not productive"] } },
      { id: "accuracy-depth", section: "Passing", blurb: "How far downfield the throws go against completion %.",
        spec: { x: "avgDepth", y: "cmpPct", title: "Depth vs accuracy", pool: { pos: "QB" }, quads: ["Accurate, short-area", "Accurate and deep", "Short and off-target", "Chucks it, misses it"] } },
      { id: "ypa-ints", section: "Passing", blurb: "Yards per attempt against interception rate. Up = fewer picks.",
        spec: { x: "ypa", y: "intRate", title: "Efficiency vs turnovers", pool: { pos: "QB" }, quads: ["Careful, short gains", "Efficient and careful", "Short and sloppy", "Explosive, turnover-prone"] } },
      { id: "deep-passers", section: "Passing", blurb: "Deep attempt rate against deep completion %. Up = more deep throws land.",
        spec: { x: "deepRate", y: "deepCmp", title: "Deep throws that land", pool: { pos: "QB" }, quads: ["Accurate, rarely goes deep", "Deep and accurate", "Short and off-target", "Deep and off-target"] } },
      { id: "anya-leaders", section: "Passing", blurb: "Adjusted net yards per attempt, the all-round passing efficiency number.",
        spec: { type: "bars", x: "anyA", title: "Adjusted net yards per attempt leaders", pool: { pos: "QB" } } },

      { id: "rush-efficiency", section: "Rushing", blurb: "Explosive run rate against stuff rate, for running backs. Up = fewer stuffs.",
        spec: { x: "explRun", y: "stuffRate", title: "Explosive and hard to stop", pool: { pos: "RB" }, quads: ["Safe, few big runs", "Explosive, hard to stop", "Stuffed, few big runs", "Big runs, stuffed often"] } },
      { id: "rb-leaders", section: "Rushing", blurb: "Yards per carry: which backs gain the most on each run.",
        spec: { type: "bars", x: "ypc", title: "Yards per carry leaders", pool: { pos: "RB" } } },
      { id: "touch-swarm", section: "Rushing", blurb: "Touches per game for every skill player, split by position. Carries and catches are the one volume stat the offense shares.",
        spec: { type: "swarm", x: "touchG", labels: 9, color: "pos", title: "Touches per game, all skill players" } },

      { id: "air-yac", section: "Receiving", blurb: "Air yards per catch against yards after catch per catch, for wide receivers.",
        spec: { x: "airPerCatch", y: "yacRec", title: "Depth and what comes after", pool: { pos: "WR" }, quads: ["Short, makes plays after", "Deep, makes plays after", "Short, little after catch", "Deep, little after catch"] } },
      { id: "deep-wr", section: "Receiving", blurb: "Deep target share against deep catch rate, for wide receivers.",
        spec: { x: "deepTgtShare", y: "deepCatch", title: "Deep targets and deep catches", pool: { pos: "WR" }, quads: ["Few deep, catches them", "Deep targets, catches them", "Few deep, misses them", "Deep targets, misses them"] } },
      { id: "catch-chains", section: "Receiving", blurb: "Catch rate against first downs per target, for every receiving position. Up and right = reliable and moves the chains.",
        spec: { x: "catchRate", y: "rcFirstPerTgt", title: "Catch rate vs chain-moving", quads: ["Hard to catch, moves chains", "Reliable and moves chains", "Quiet and unreliable", "Reliable, few chains"] } },

      { id: "pass-rush", section: "Defense", blurb: "Sacks per game against quarterback hurries per game, for defensive linemen.",
        spec: { x: "sacksG", y: "hurG", title: "Sacks vs hurries", pool: { pos: "DL" }, quads: ["Hurries, few sacks", "Sacks and pressure", "Quiet rush", "Sacks, few hurries"] } },
      { id: "sacks-leaders", section: "Defense", blurb: "Sacks per game across every defender who rushes the passer.",
        spec: { type: "bars", x: "sacksG", title: "Sacks per game leaders" } },
      { id: "db-ballhawk", section: "Defense", blurb: "Passes defended per game against interceptions, for defensive backs.",
        spec: { x: "pdG", y: "dInt", title: "Ball hawks", pool: { pos: "DB" }, quads: ["Picks, few breakups", "Ball hawks", "Quiet on the ball", "Breakups, no picks"] } },
      { id: "tackle-swarm", section: "Defense", blurb: "Tackles per game for every defender, split by position. Tackling is the one stat the defensive positions share.",
        spec: { type: "swarm", x: "tklG", labels: 9, color: "pos", title: "Tackles per game, all defenders" } },
      { id: "run-stop", section: "Defense", blurb: "Tackles for loss per game against solo tackle share, for linebackers. Up = more tackles made alone.",
        spec: { x: "tflG", y: "soloShare", title: "Run stoppers", pool: { pos: "LB" }, quads: ["Solo, rarely in backfield", "Solo stops in backfield", "Assisted, rarely in backfield", "Assisted stops in backfield"] } },

      { id: "qb-profile", section: "Compare", blurb: "The top three quarterbacks by adjusted net yards per attempt, side by side on percentiles.", topBy: "anyA",
        spec: { type: "profile", title: "", pool: { pos: "QB" } } },
    ],
  },
};
