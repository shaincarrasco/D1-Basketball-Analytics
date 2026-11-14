// College football sport pack: the stats, filters, ranking recipes and curated charts for
// football. The engine lives in src/sport-kit; this file is the only football-specific part.
import { floorFilter, positionFilter, type FilterDef, type Metric, type SportPack } from "@sports/kit";
import type { FootballRow } from "./types";

type M = Metric<FootballRow>;

// Sample guards: a rate only counts once the player has enough of its base to mean something.
const qb50 = (r: FootballRow) => (r.pDb ?? 0) >= 50;
const carries30 = (r: FootballRow) => (r.rCar ?? 0) >= 30;
const targets15 = (r: FootballRow) => (r.rcTgt ?? 0) >= 15;
const contested10 = (r: FootballRow) => (r.rcCTgt ?? 0) >= 10;
const passRush50 = (r: FootballRow) => (r.dPassSnaps ?? 0) >= 50;
const allowed15 = (r: FootballRow) => (r.dTgtA ?? 0) >= 15;
const tackles25 = (r: FootballRow) => (r.dTkl ?? 0) >= 25;

// Derivations. Each returns null rather than NaN or Infinity when the base is missing or zero.
const ratio = (n: number | null, d: number | null) => (n === null || d === null || !d ? null : n / d);
const pct = (n: number | null, d: number | null) => { const x = ratio(n, d); return x === null ? null : x * 100; };
const perGame = (n: number | null, g: number) => (n === null || !g ? null : n / g);
/** Adjusted net yards per attempt. Sack yardage isn't in the box score, so each sack counts as 7 lost yards. */
const anyA = (r: FootballRow) => {
  if (r.pAtt === null || r.pYds === null || r.pTd === null || r.pInt === null || r.pSacks === null) return null;
  return ratio(r.pYds + 20 * r.pTd - 45 * r.pInt - 7 * r.pSacks, r.pAtt + r.pSacks);
};
/** Share of tackles that were missed (tackles + misses are the attempts). */
const missRate = (r: FootballRow) => (r.dTkl === null || r.dMiss === null ? null : pct(r.dMiss, r.dTkl + r.dMiss));

export const METRICS: M[] = [
  // Passing. Lines apply to QBs. Rate guards need 50+ dropbacks.
  { key: "epaDb", label: "EPA per dropback", short: "EPA/DB", group: "Passing", sign: true, digits: 2, ok: qb50, get: r => ratio(r.pEpa, r.pDb), desc: "Expected points added per dropback: how much each throw or sack moved his team's scoring chances. Above zero is good." },
  { key: "cmpPct", label: "Completion %", short: "Cmp%", group: "Passing", unit: "%", ok: qb50, get: r => pct(r.pCmp, r.pAtt), desc: "Share of pass attempts completed." },
  { key: "ypa", label: "Yards per attempt", short: "Y/Att", group: "Passing", ok: qb50, get: r => ratio(r.pYds, r.pAtt), desc: "Passing yards per attempt, sacks not counted." },
  { key: "anyA", label: "Adjusted net yards per attempt", short: "ANY/A", group: "Passing", ok: qb50, get: anyA, desc: "Yards per attempt with credit for touchdowns, a penalty for picks, and sacks as 7 lost yards each (approximate; sack yardage is not in the box score)." },
  { key: "tdRate", label: "Touchdown rate", short: "TD%", group: "Passing", unit: "%", ok: qb50, get: r => pct(r.pTd, r.pAtt), desc: "Touchdown passes per 100 attempts." },
  { key: "intRate", label: "Interception rate", short: "INT%", group: "Passing", unit: "%", invert: true, ok: qb50, get: r => pct(r.pInt, r.pAtt), desc: "Interceptions per 100 attempts (lower is better)." },
  { key: "sackRate", label: "Sack rate", short: "Sk%", group: "Passing", unit: "%", invert: true, ok: qb50, get: r => pct(r.pSacks, r.pDb), desc: "Share of dropbacks that ended in a sack (lower is better)." },
  { key: "airYpa", label: "Air yards per attempt", short: "AY/Att", group: "Passing", ok: qb50, get: r => ratio(r.pAir, r.pAtt), desc: "How far downfield his throws travel, on average. High means he attacks deep." },
  // Rushing. Rate guards need 30+ carries.
  { key: "ypc", label: "Yards per carry", short: "Y/Car", group: "Rushing", ok: carries30, get: r => ratio(r.rYds, r.rCar), desc: "Rushing yards per carry." },
  { key: "yacc", label: "Yards after contact per carry", short: "YAC/C", group: "Rushing", ok: carries30, get: r => ratio(r.rYac, r.rCar), desc: "Yards gained after first contact, per carry: what he adds on his own." },
  { key: "explRun", label: "Explosive run rate", short: "Expl%", group: "Rushing", unit: "%", ok: carries30, get: r => pct(r.rRuns10, r.rCar), desc: "Share of carries that gain 10 or more yards." },
  { key: "rushEpa", label: "Rush EPA per carry", short: "RshEPA", group: "Rushing", sign: true, digits: 2, ok: carries30, get: r => ratio(r.rEpa, r.rCar), desc: "Expected points added per carry: how much his runs help the offense score." },
  { key: "fumRate", label: "Fumbles lost rate", short: "Fum%", group: "Rushing", unit: "%", invert: true, ok: carries30, get: r => pct(r.rFumL, r.rCar), desc: "Fumbles lost per 100 carries (lower is better)." },
  // Receiving. Rate guards need 15+ targets.
  { key: "ypt", label: "Yards per target", short: "Y/Tgt", group: "Receiving", ok: targets15, get: r => ratio(r.rcYds, r.rcTgt), desc: "Receiving yards per target, including drops and incompletions." },
  { key: "yprr", label: "Yards per route run", short: "YPRR", group: "Receiving", digits: 2, ok: targets15, get: r => ratio(r.rcYds, r.rcRoutes), desc: "Receiving yards per route run: efficiency that doesn't depend on how often he is thrown to." },
  { key: "catchRate", label: "Catch rate", short: "Catch%", group: "Receiving", unit: "%", ok: targets15, get: r => pct(r.rcRec, r.rcTgt), desc: "Share of targets he caught." },
  { key: "yacRec", label: "Yards after catch per reception", short: "YAC/R", group: "Receiving", ok: targets15, get: r => ratio(r.rcYac, r.rcRec), desc: "Yards gained after the catch, per reception: how much he creates once he has the ball." },
  { key: "dropRate", label: "Drop rate", short: "Drop%", group: "Receiving", unit: "%", invert: true, ok: targets15, get: r => pct(r.rcDrops, r.rcTgt), desc: "Drops per 100 targets (lower is better)." },
  { key: "contCatch", label: "Contested catch rate", short: "Cont%", group: "Receiving", unit: "%", ok: contested10, get: r => pct(r.rcCRec, r.rcCTgt), desc: "Share of contested targets he caught, with a defender in position to break it up (needs 10+)." },
  // Pass rush. Guards need 50+ pass-rush snaps.
  { key: "pressRate", label: "Pressure rate", short: "Press%", group: "Pass rush", unit: "%", ok: passRush50, get: r => pct(r.dPress, r.dPassSnaps), desc: "Share of pass-rush snaps that pressured the quarterback, sacks included." },
  { key: "sacksG", label: "Sacks per game", short: "Sk/G", group: "Pass rush", digits: 2, ok: passRush50, get: r => perGame(r.dSacks, r.games), desc: "Sacks per game." },
  { key: "sackSnap", label: "Sacks per pass-rush snap", short: "Sk/Snap", group: "Pass rush", unit: "%", ok: passRush50, get: r => pct(r.dSacks, r.dPassSnaps), desc: "Share of pass-rush snaps that ended in a sack." },
  // Coverage. Guards need 15+ targets allowed.
  { key: "cmpAllowed", label: "Completion % allowed", short: "Cmp% A", group: "Coverage", unit: "%", invert: true, ok: allowed15, get: r => pct(r.dCmpA, r.dTgtA), desc: "Share of targets into his coverage that were completed (lower is better)." },
  { key: "ypTa", label: "Yards per target allowed", short: "Y/TgtA", group: "Coverage", invert: true, ok: allowed15, get: r => ratio(r.dYdsA, r.dTgtA), desc: "Yards allowed per target in his coverage (lower is better)." },
  { key: "covInt", label: "Interceptions per 100 targets", short: "INT/100", group: "Coverage", ok: allowed15, get: r => pct(r.dInt, r.dTgtA), desc: "Interceptions per 100 targets thrown into his coverage." },
  { key: "pdG", label: "Passes defended per game", short: "PD/G", group: "Coverage", digits: 2, ok: allowed15, get: r => perGame(r.dPd, r.games), desc: "Passes broken up or deflected per game." },
  // Tackling. Miss and solo guards need 25+ tackles.
  { key: "tklG", label: "Tackles per game", short: "TKL/G", group: "Tackling", get: r => perGame(r.dTkl, r.games), desc: "Total tackles per game." },
  { key: "tflG", label: "Tackles for loss per game", short: "TFL/G", group: "Tackling", digits: 2, get: r => perGame(r.dTfl, r.games), desc: "Tackles that stop a runner behind the line of scrimmage, per game." },
  { key: "missRate", label: "Missed tackle rate", short: "Miss%", group: "Tackling", unit: "%", invert: true, ok: tackles25, get: missRate, desc: "Share of tackle attempts he missed (lower is better)." },
  { key: "soloShare", label: "Solo tackle share", short: "Solo%", group: "Tackling", unit: "%", ok: tackles25, get: r => pct(r.dSolo, r.dTkl), desc: "Share of his tackles made alone, rather than assisted." },
  // Volume (no guards: these are counts, not rates)
  { key: "games", label: "Games played", short: "G", group: "Volume", digits: 0, get: r => r.games, desc: "Games played this season." },
  { key: "dbG", label: "Dropbacks per game", short: "DB/G", group: "Volume", get: r => perGame(r.pDb, r.games), desc: "Pass dropbacks per game: how much the offense leans on him as a passer." },
  { key: "carG", label: "Carries per game", short: "Car/G", group: "Volume", get: r => perGame(r.rCar, r.games), desc: "Rushing attempts per game." },
  { key: "tgtG", label: "Targets per game", short: "Tgt/G", group: "Volume", get: r => perGame(r.rcTgt, r.games), desc: "Passes thrown his way per game." },
  { key: "rushSnapsG", label: "Pass-rush snaps per game", short: "PRS/G", group: "Volume", get: r => perGame(r.dPassSnaps, r.games), desc: "Pass-rush snaps per game: how much he is on the field to rush the passer." },
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
  team: r => ({ name: r.team.name, short: r.team.short, color: r.team.color, group: r.team.confSlug, groupName: r.team.confName }),
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

export const FRAMEWORKS: SportPack<FootballRow>["frameworks"] = [
  { key: "quarterback", label: "Quarterback", blurb: "The passer's all-in-one: expected points per dropback first, then yards, touchdowns and ball security.",
    weights: [["epaDb", 30], ["anyA", 20], ["cmpPct", 10], ["ypa", 10], ["tdRate", 10], ["intRate", 10], ["sackRate", 10]] },
  { key: "accuracy", label: "Accuracy", blurb: "Completion and depth with the picks kept low: who puts the ball where it should go.",
    weights: [["cmpPct", 40], ["airYpa", 20], ["ypa", 20], ["intRate", 20]] },
  { key: "runningBack", label: "Running back", blurb: "Efficient, explosive running with yards after contact and ball security.",
    weights: [["rushEpa", 25], ["yacc", 25], ["ypc", 20], ["explRun", 15], ["fumRate", 15]] },
  { key: "receiver", label: "Receiver", blurb: "Efficiency per route and per target, with what he does after the catch.",
    weights: [["yprr", 30], ["ypt", 20], ["yacRec", 20], ["catchRate", 15], ["dropRate", 15]] },
  { key: "reliableHands", label: "Reliable hands", blurb: "Catches what is thrown to him, drops little, and wins the contested ones.",
    weights: [["catchRate", 40], ["dropRate", 30], ["contCatch", 30]] },
  { key: "passRusher", label: "Pass rusher", blurb: "Pressure on the quarterback, sacks, and tackles for loss.",
    weights: [["pressRate", 35], ["sacksG", 25], ["sackSnap", 20], ["tflG", 20]] },
  { key: "coverage", label: "Coverage", blurb: "Limits completions and yards when he is the target: tight coverage, measured by what the offense got.",
    weights: [["cmpAllowed", 30], ["ypTa", 30], ["covInt", 20], ["pdG", 20]] },
  { key: "ballHawk", label: "Ball hawk", blurb: "Takes the ball away: interceptions, passes broken up, and tackles around the ball.",
    weights: [["covInt", 45], ["pdG", 35], ["tklG", 20]] },
  { key: "runStopper", label: "Run stopper", blurb: "Gets runners down: tackles for loss, tackle volume, secure tackling.",
    weights: [["tflG", 30], ["tklG", 25], ["missRate", 20], ["soloShare", 25]] },
];

export const football: SportPack<FootballRow> = {
  id: "football",
  name: "College football",
  brand: "GRIDIRON",
  filePrefix: "cfb",
  nouns: { player: "player", players: "players", pool: "FBS players", pronoun: "he" },
  entity,
  positions: [...POSITIONS],
  groups: { label: "Conference", list: "conf" },
  metrics: METRICS,
  metricGroups: ["Passing", "Rushing", "Receiving", "Pass rush", "Coverage", "Tackling", "Volume"],
  filters: FILTERS,
  frameworks: FRAMEWORKS,
  tiers: [{ min: 97, label: "Elite" }, { min: 90, label: "Excellent" }, { min: 75, label: "Very good" }, { min: 50, label: "Solid" }, { min: 0, label: "Developing" }],
  ranking: { minCoverage: 0.6, shrinkK: 4, shrinkUnit: "games" },
  charts: {
    defaultX: "ypa", defaultY: "epaDb",
    profileMetrics: ["epaDb", "cmpPct", "ypa", "anyA", "tdRate", "intRate", "sackRate", "airYpa", "ypc", "yprr", "pressRate", "tklG"],
    sections: ["Passing", "Rushing & receiving", "Pass rush", "Coverage & tackling", "Compare"],
    presets: [
      { id: "epa-sacks", section: "Passing", blurb: "Sack rate against EPA per dropback. Right = clean pocket (lower sack rate is better).",
        spec: { x: "sackRate", y: "epaDb", title: "Sacks taken vs EPA", pool: { pos: "QB" }, quads: ["Efficient despite sacks", "Clean and efficient", "Sacked and inefficient", "Safe, not productive"] } },
      { id: "accuracy-depth", section: "Passing", blurb: "How far downfield the throws go against completion %.",
        spec: { x: "airYpa", y: "cmpPct", title: "Depth vs accuracy", pool: { pos: "QB" }, quads: ["Accurate, short-area", "Accurate and deep", "Short and off-target", "Chucks it, misses it"] } },
      { id: "ypa-ints", section: "Passing", blurb: "Yards per attempt against interception rate. Up = fewer picks.",
        spec: { x: "ypa", y: "intRate", title: "Efficiency vs turnovers", pool: { pos: "QB" }, quads: ["Careful, short gains", "Efficient and careful", "Short and sloppy", "Explosive, turnover-prone"] } },
      { id: "anya-leaders", section: "Passing", blurb: "Adjusted net yards per attempt, the all-in-one passing efficiency number.",
        spec: { type: "bars", x: "anyA", title: "Adjusted net yards per attempt leaders", pool: { pos: "QB" } } },

      { id: "rush-efficiency", section: "Rushing & receiving", blurb: "Explosive run rate against rush EPA per carry, for running backs.",
        spec: { x: "explRun", y: "rushEpa", title: "Explosive and efficient", pool: { pos: "RB" }, quads: ["Efficient, few big runs", "Explosive and efficient", "Stuck in the mud", "Boom or bust"] } },
      { id: "contact-yards", section: "Rushing & receiving", blurb: "Yards after contact against fumbles lost. Up = fewer fumbles.",
        spec: { x: "yacc", y: "fumRate", title: "Contact and ball security", pool: { pos: "RB" }, quads: ["Safe, little contact gain", "Tough and careful", "Fumbles, little contact gain", "Gains through contact, fumbles"] } },
      { id: "rb-leaders", section: "Rushing & receiving", blurb: "Rush EPA per carry: which backs help the offense score on the ground.",
        spec: { type: "bars", x: "rushEpa", title: "Rushing EPA per carry leaders", pool: { pos: "RB" } } },
      { id: "receiver-yprr", section: "Rushing & receiving", blurb: "Catch rate against yards per route run, for wide receivers.",
        spec: { x: "yprr", y: "catchRate", title: "Reliable and explosive", pool: { pos: "WR" }, quads: ["Reliable, little upside", "Reliable and explosive", "Short and inconsistent", "Big plays, catches less"] } },
      { id: "hands-drops", section: "Rushing & receiving", blurb: "Contested catch rate against drop rate (up = fewer drops). Covers every receiving position.",
        spec: { x: "contCatch", y: "dropRate", title: "Contested catches vs drops", quads: ["Safe hands, few contested", "Wins contested and holds on", "Drops, few contested", "Wins contested, drops some"] } },

      { id: "pass-rush-press", section: "Pass rush", blurb: "Pressure rate against sacks per pass-rush snap, for defensive linemen.",
        spec: { x: "pressRate", y: "sackSnap", title: "Pressure vs sacks", pool: { pos: "DL" }, quads: ["Finishes, rarely pressures", "Pressure and sacks", "Quiet pass rush", "Pressures, no finish"] } },
      { id: "sacks-leaders", section: "Pass rush", blurb: "Sacks per game across every defender who rushes the passer.",
        spec: { type: "bars", x: "sacksG", title: "Sacks per game leaders" } },

      { id: "coverage-quads", section: "Coverage & tackling", blurb: "Yards allowed per target against completions allowed, for defensive backs. Both axes: up and right = tighter.",
        spec: { x: "ypTa", y: "cmpAllowed", title: "Coverage: completions and yards", pool: { pos: "DB" }, quads: ["Few completions, gives up yards", "Tight on everything", "Gives up catches and yards", "Gives up catches, few yards"] } },
      { id: "ballhawks", section: "Coverage & tackling", blurb: "Passes defended per game against interceptions per 100 targets.",
        spec: { x: "pdG", y: "covInt", title: "Ball hawks", pool: { pos: "DB" }, quads: ["Picks, few breakups", "Ball hawks", "Quiet on the ball", "Breakups, no picks"] } },
      { id: "tackle-swarm", section: "Coverage & tackling", blurb: "Tackles per game for every defender, split by position. Tackling is the one stat the defensive positions share.",
        spec: { type: "swarm", x: "tklG", labels: 9, color: "pos", title: "Tackles per game, all defenders" } },
      { id: "run-stop", section: "Coverage & tackling", blurb: "Tackles for loss against missed-tackle rate, for linebackers. Up = fewer misses.",
        spec: { x: "tflG", y: "missRate", title: "Run stoppers", pool: { pos: "LB" }, quads: ["Secure, rarely in the backfield", "Secure stops in the backfield", "Misses, rarely in the backfield", "Disrupts backfield, misses some"] } },
      { id: "tfl-leaders", section: "Coverage & tackling", blurb: "Tackles for loss per game across every defender.",
        spec: { type: "bars", x: "tflG", title: "Tackles for loss per game leaders" } },

      { id: "qb-profile", section: "Compare", blurb: "The top three quarterbacks by EPA per dropback, side by side on percentiles.", topBy: "epaDb",
        spec: { type: "profile", title: "", pool: { pos: "QB" } } },
    ],
  },
};
