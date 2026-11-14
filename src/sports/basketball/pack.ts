// College basketball sport pack: the stats, filters, ranking recipes and curated charts
// behind /charts/, /charts/build/ and /players/rankings/. The engine lives in
// src/sport-kit; this file is the only basketball-specific part.
import { DPR_MIN_POSS, MIN_ATT, type PlayerRow } from "@/app/players/player-stats";
import { floorFilter, positionFilter, type FilterDef, type Metric, type SportPack } from "@sports/kit";

type M = Metric<PlayerRow>;
const per40 = (v: number | null, r: PlayerRow) => (v !== null && r.min ? (v / r.min) * 40 : null);
const fga = (n: number) => (r: PlayerRow) => (r.fga ?? 0) >= n;
const enoughPoss = (r: PlayerRow) => (r.onPoss ?? 0) >= DPR_MIN_POSS;

export const METRICS: M[] = [
  // Impact
  { key: "dpr", label: "DPR impact", short: "DPR", group: "Impact", sign: true, ok: enoughPoss, get: r => r.dpr, desc: "Points per 100 possessions better than an average D-I player, from lineup data (adjusted plus-minus shrunk toward a box-score prior)." },
  { key: "dprO", label: "Offensive DPR", short: "O-DPR", group: "Impact", sign: true, ok: enoughPoss, get: r => r.dprO, desc: "Points per 100 possessions added on offense." },
  { key: "dprD", label: "Defensive DPR", short: "D-DPR", group: "Impact", sign: true, ok: enoughPoss, get: r => r.dprD, desc: "Points per 100 possessions saved on defense (positive = good)." },
  { key: "porpag", label: "PORPAG", short: "PORPAG", group: "Impact", get: r => r.porpag, desc: "Points over replacement per adjusted game: offensive value above a replacement player." },
  { key: "ws40", label: "Win shares / 40", short: "WS/40", group: "Impact", digits: 3, get: r => r.ws40, desc: "Win shares per 40 minutes." },
  { key: "net", label: "Net rating", short: "Net", group: "Impact", sign: true, get: r => r.net, desc: "Offensive rating minus defensive rating." },
  { key: "ortg", label: "Offensive rating", short: "ORtg", group: "Impact", get: r => r.ortg, desc: "Points produced per 100 possessions used." },
  // Scoring
  { key: "pts", label: "Points per game", short: "PPG", group: "Scoring", get: r => r.pts, desc: "Points per game." },
  { key: "pts40", label: "Points / 40", short: "PTS/40", group: "Scoring", get: r => r.pts40, desc: "Points per 40 minutes: scoring rate independent of playing time." },
  { key: "usg", label: "Usage rate", short: "USG%", group: "Scoring", unit: "%", get: r => r.usg, desc: "Share of team possessions used while on the floor." },
  { key: "ts", label: "True shooting", short: "TS%", group: "Scoring", unit: "%", ok: r => (r.fga ?? 0) + (r.fta ?? 0) >= 20, get: r => r.ts, desc: "Points per shooting possession, free throws included." },
  { key: "efg", label: "Effective FG%", short: "eFG%", group: "Scoring", unit: "%", ok: fga(20), get: r => r.efg, desc: "Field-goal % with threes counted 1.5×." },
  { key: "ftr", label: "Free-throw rate", short: "FTr", group: "Scoring", ok: fga(MIN_ATT.fg), get: r => r.ftr, desc: "Free-throw attempts per 100 field-goal attempts: how often he gets to the line." },
  { key: "selfCreate", label: "Unassisted shot share", short: "Unast'd%", group: "Scoring", unit: "%", ok: r => (r.fgm ?? 0) >= 6, get: r => (r.astd === null ? null : 100 - r.astd), desc: "Share of made shots that were NOT assisted. High = creates his own shot." },
  { key: "dunks", label: "Dunks", short: "Dunks", group: "Scoring", digits: 0, get: r => r.dunks, desc: "Total dunks made this season." },
  // Shooting
  { key: "tpPct", label: "3-point %", short: "3P%", group: "Shooting", unit: "%", ok: r => (r.tpa ?? 0) >= 10, get: r => r.tpPct, desc: "Three-point percentage (needs 10+ attempts)." },
  { key: "tpa40", label: "3-point attempts / 40", short: "3PA/40", group: "Shooting", get: r => per40(r.tpa !== null && r.g ? r.tpa / r.g : null, r), desc: "Three-point attempts per 40 minutes: shooting volume." },
  { key: "tpaRate", label: "3-point attempt rate", short: "3PA rate", group: "Shooting", unit: "%", ok: fga(MIN_ATT.fg), get: r => r.tpaRate, desc: "Share of field-goal attempts taken from three." },
  { key: "ftPct", label: "Free-throw %", short: "FT%", group: "Shooting", unit: "%", ok: r => (r.fta ?? 0) >= 10, get: r => r.ftPct, desc: "Free-throw percentage (needs 10+ attempts). A strong signal of shooting touch." },
  { key: "rimPct", label: "FG% at the rim", short: "Rim FG%", group: "Shooting", unit: "%", ok: r => (r.rimA ?? 0) >= 10, get: r => r.rimPct, desc: "Field-goal % on dunks, layups and tip-ins (needs 10+ attempts)." },
  { key: "rimShare", label: "Shots at the rim", short: "Rim share", group: "Shooting", unit: "%", ok: r => (r.shots ?? 0) >= MIN_ATT.fg, get: r => r.rimShare, desc: "Share of shots taken at the rim." },
  { key: "midPct", label: "Mid-range FG%", short: "Mid FG%", group: "Shooting", unit: "%", ok: r => (r.midA ?? 0) >= 10, get: r => r.midPct, desc: "Field-goal % on two-point jumpers (needs 10+ attempts)." },
  // Playmaking
  { key: "ast40", label: "Assists / 40", short: "AST/40", group: "Playmaking", get: r => r.ast40, desc: "Assists per 40 minutes." },
  { key: "ast", label: "Assists per game", short: "APG", group: "Playmaking", get: r => r.ast, desc: "Assists per game." },
  { key: "astTov", label: "Assist-to-turnover", short: "AST/TO", group: "Playmaking", digits: 2, ok: r => ((r.ast ?? 0) + (r.tov ?? 0)) * (r.g ?? 0) >= 8, get: r => r.astTov, desc: "Assists per turnover: ball security for creators." },
  { key: "tov40", label: "Turnovers / 40", short: "TOV/40", group: "Playmaking", invert: true, get: r => per40(r.tov, r), desc: "Turnovers per 40 minutes (lower is better)." },
  // Rebounding
  { key: "reb40", label: "Rebounds / 40", short: "REB/40", group: "Rebounding", get: r => r.reb40, desc: "Rebounds per 40 minutes." },
  { key: "reb", label: "Rebounds per game", short: "RPG", group: "Rebounding", get: r => r.reb, desc: "Rebounds per game." },
  { key: "orbPct", label: "Offensive rebound %", short: "OR%", group: "Rebounding", unit: "%", get: r => r.orbPct, desc: "Share of available offensive rebounds grabbed while on the floor." },
  { key: "orb40", label: "Offensive boards / 40", short: "ORB/40", group: "Rebounding", get: r => per40(r.orb, r), desc: "Offensive rebounds per 40 minutes." },
  { key: "drb40", label: "Defensive boards / 40", short: "DRB/40", group: "Rebounding", get: r => per40(r.drb, r), desc: "Defensive rebounds per 40 minutes." },
  // Defense
  { key: "stocks40", label: "Stocks / 40", short: "STK/40", group: "Defense", get: r => r.stocks40, desc: "Steals + blocks per 40 minutes." },
  { key: "stl40", label: "Steals / 40", short: "STL/40", group: "Defense", get: r => per40(r.stl, r), desc: "Steals per 40 minutes." },
  { key: "blk40", label: "Blocks / 40", short: "BLK/40", group: "Defense", get: r => per40(r.blk, r), desc: "Blocks per 40 minutes." },
  { key: "drtg", label: "Defensive rating", short: "DRtg", group: "Defense", invert: true, get: r => r.drtg, desc: "Points allowed per 100 possessions while on the floor (lower is better)." },
  { key: "pf40", label: "Fouls / 40", short: "PF/40", group: "Defense", invert: true, get: r => per40(r.pf, r), desc: "Personal fouls per 40 minutes (lower is better)." },
  // Volume
  { key: "min", label: "Minutes per game", short: "MPG", group: "Volume", get: r => r.min, desc: "Minutes per game." },
  { key: "fgaG", label: "Shots per game", short: "FGA", group: "Volume", get: r => r.fgaG, desc: "Field-goal attempts per game." },
  { key: "onPoss", label: "On-court possessions", short: "Poss", group: "Volume", digits: 0, get: r => r.onPoss, desc: "On-court possessions tracked in play-by-play." },
];

/** The five high-major leagues (ACC, Big Ten, Big 12, SEC, Big East), as conference slugs. */
export const HIGH_MAJOR = new Set(["acc", "big-ten", "big-12", "sec", "big-east"]);
export const HIGH_MAJOR_LABEL = "High-major (ACC, B1G, B12, SEC, BE)";

const POSITIONS = [
  { key: "G", label: "Guard", plural: "Guards", tone: "def" },
  { key: "F", label: "Forward", plural: "Forwards", tone: "bulb" },
  { key: "C", label: "Center", plural: "Centers", tone: "off" },
] as const;

const entity: SportPack<PlayerRow>["entity"] = {
  id: r => r.id,
  name: r => r.name,
  pos: r => r.posN,
  team: r => (r.team ? { name: r.team.name, short: r.team.short, logo: r.team.logo, color: r.team.color, altColor: r.team.altColor, group: r.team.confSlug, groupName: r.team.confName } : null),
  href: r => `/player/?id=${r.id}`,
  exposure: r => (r.min ?? 0) * (r.g ?? 0),
};

// URL keys (conf, pos, min, g, st) match the original basketball links, so shared links keep working.
const FILTERS: FilterDef<PlayerRow>[] = [
  {
    key: "conf", label: "Conference", default: "all", compact: true,
    options: lists => [{ value: "all", label: "All of D-I" }, { value: "high-major", label: HIGH_MAJOR_LABEL }, ...(lists.conf ?? []).map(([value, label]) => ({ value, label }))],
    test: (r, v) => v === "all" || (v === "high-major" ? HIGH_MAJOR.has(r.team?.confSlug ?? "") : r.team?.confSlug === v),
    describe: (v, lists) => (v === "all" ? null : { noun: `${v === "high-major" ? "High-major" : lists.conf?.find(c => c[0] === v)?.[1] ?? v} players` }),
  },
  positionFilter({ positions: [...POSITIONS], entity }),
  floorFilter<PlayerRow>({ key: "min", label: "Minutes", get: r => r.min, steps: [0, 10, 15, 20, 25, 30], default: 15, fmt: n => `${n}+ mpg`, anyLabel: "Any minutes", suffix: n => `${n}+ mpg`, compact: true }),
  floorFilter<PlayerRow>({ key: "g", label: "Games", get: r => r.g, steps: [1, 2, 3, 4, 5], default: 2, fmt: n => `${n}+ games`, anyLabel: "Any games", suffix: n => `${n}+ games` }),
  {
    key: "st", label: "Recruits", default: "any",
    options: [{ value: "any", label: "Anyone" }, { value: "4", label: "4★ and 5★" }, { value: "3", label: "3★+" }, { value: "none", label: "Unranked" }],
    test: (r, v) => v === "any" || (v === "none" ? !r.stars : (r.stars ?? 0) >= Number(v)),
    describe: v => (v === "any" ? null : { suffix: v === "none" ? "unranked recruits" : `${v}★+ recruits` }),
  },
];

export const FRAMEWORKS: SportPack<PlayerRow>["frameworks"] = [
  { key: "overall", label: "Overall", blurb: "Our all-in-one view: lineup impact first, then efficient production across the box score.",
    weights: [["dpr", 30], ["porpag", 15], ["ts", 10], ["usg", 10], ["ws40", 10], ["ast40", 7], ["reb40", 6], ["stocks40", 6], ["astTov", 6]] },
  { key: "scorer", label: "Scorer", blurb: "Volume and efficiency: points per 40, true shooting, usage, getting to the line and making his own shot.",
    weights: [["pts40", 35], ["ts", 30], ["usg", 15], ["ftr", 10], ["selfCreate", 10]] },
  { key: "shooter", label: "Shooter", blurb: "Three-point accuracy and volume, with free-throw % as the touch check.",
    weights: [["tpPct", 35], ["tpa40", 25], ["ftPct", 25], ["efg", 15]] },
  { key: "playmaker", label: "Playmaker", blurb: "Assist rate and ball security, with offensive rating so empty assists don't win.",
    weights: [["ast40", 40], ["astTov", 35], ["ortg", 15], ["usg", 10]] },
  { key: "defender", label: "Defender", blurb: "Defensive lineup impact, steals and blocks, on-court defensive rating, and staying out of foul trouble.",
    weights: [["dprD", 40], ["stocks40", 30], ["drtg", 20], ["pf40", 10]] },
  { key: "rim", label: "Rim protector", blurb: "Blocks, defensive boards and finishing at the rim.",
    weights: [["blk40", 40], ["drb40", 25], ["rimPct", 20], ["dprD", 15]] },
  { key: "rebounder", label: "Rebounder", blurb: "Rebounding rate on both ends of the floor.",
    weights: [["reb40", 40], ["orbPct", 35], ["drb40", 25]] },
  { key: "twoway", label: "Two-way", blurb: "Equal parts offensive and defensive lineup impact, backed by box-score activity.",
    weights: [["dprO", 35], ["dprD", 35], ["ts", 10], ["stocks40", 10], ["ast40", 10]] },
  { key: "3andD", label: "3-and-D", blurb: "Spaces the floor and guards: three-point shooting plus defensive impact and activity.",
    weights: [["tpPct", 25], ["tpa40", 20], ["dprD", 30], ["stocks40", 25]] },
  { key: "glue", label: "Glue guy", blurb: "Wins without the ball: efficient, safe, active on defense and the glass, and lineups are better with him.",
    weights: [["dpr", 30], ["ts", 15], ["astTov", 15], ["stocks40", 15], ["reb40", 15], ["tov40", 10]] },
];

export const basketball: SportPack<PlayerRow> = {
  id: "basketball",
  name: "College basketball",
  brand: "D1 HOOPS",
  filePrefix: "d1hoops",
  nouns: { player: "player", players: "players", pool: "D-I players", pronoun: "he" },
  entity,
  positions: [...POSITIONS],
  groups: { label: "Conference", list: "conf", short: "Conf" },
  metrics: METRICS,
  metricGroups: ["Impact", "Scoring", "Shooting", "Playmaking", "Rebounding", "Defense", "Volume"],
  filters: FILTERS,
  frameworks: FRAMEWORKS,
  tiers: [{ min: 97, label: "Elite" }, { min: 90, label: "Excellent" }, { min: 75, label: "Very good" }, { min: 50, label: "Solid" }, { min: 0, label: "Developing" }],
  ranking: { minCoverage: 0.6, shrinkK: 60, shrinkUnit: "minutes", profilePool: { min: "10" } },
  charts: {
    defaultX: "usg", defaultY: "ts",
    profileMetrics: ["dpr", "pts40", "ts", "tpPct", "ast40", "astTov", "reb40", "stocks40", "ftr", "usg"],
    sections: ["Scoring", "Shooting", "Playmaking", "Defense & boards", "Impact"],
    presets: [
      { id: "usage-efficiency", section: "Scoring", blurb: "The classic: who carries a big load and still scores efficiently.",
        spec: { x: "usg", y: "ts", title: "Load vs efficiency", quads: ["Efficient role players", "Efficient stars", "Quiet nights", "Volume over value"] } },
      { id: "scoring-rate", section: "Scoring", blurb: "Scoring per 40 minutes against true shooting. Dot size is minutes per game.",
        spec: { x: "pts40", y: "ts", size: "min", title: "Bucket getters", quads: ["Efficient finishers", "Elite scorers", "", "Volume scorers"] } },
      { id: "self-creators", section: "Scoring", blurb: "Made shots nobody set up for them, against scoring rate. Top right = makes his own offense.",
        spec: { x: "selfCreate", y: "pts40", title: "Self-creators", quads: ["Fed scorers", "Shot creators", "Play finishers", "Creates, rarely scores"] } },
      { id: "line-merchants", section: "Scoring", blurb: "Who gets to the line, and who cashes in once there.",
        spec: { x: "ftr", y: "ftPct", title: "Free-throw merchants", quads: ["Good touch, rarely fouled", "Foul magnets who convert", "", "Fouled, leaves points"] } },
      { id: "pts40-leaders", section: "Scoring", blurb: "Scoring rate leaders: points per 40 minutes.", spec: { type: "bars", x: "pts40", title: "Points per 40 leaders" } },
      { id: "ts-swarm", section: "Scoring", blurb: "Every rotation player's true shooting, guards to centers.", spec: { type: "swarm", x: "ts", labels: 9, color: "pos" } },

      { id: "snipers", section: "Shooting", blurb: "Three-point volume against accuracy (10+ attempts).",
        spec: { x: "tpa40", y: "tpPct", title: "Snipers", quads: ["Picky shooters", "Volume snipers", "", "Volume, cold so far"] } },
      { id: "rim-finishers", section: "Shooting", blurb: "How often they live at the rim and how well they finish there.",
        spec: { x: "rimShare", y: "rimPct", title: "Paint finishers", quads: ["Efficient when they get there", "Rim wreckers", "Perimeter players", "Attacks, misses"] } },
      { id: "touch", section: "Shooting", blurb: "Free-throw % is the best early read on shooting touch. Here it is against three-point %.",
        spec: { x: "ftPct", y: "tpPct", title: "Shooting touch", quads: ["Hot from three", "Pure shooters", "", "Touch says threes will come"] } },
      { id: "dunk-leaders", section: "Shooting", blurb: "Dunks made this season.", spec: { type: "bars", x: "dunks", title: "Dunk leaders", pool: { min: "10" } } },

      { id: "floor-generals", section: "Playmaking", blurb: "Assist volume against ball security.",
        spec: { x: "ast40", y: "astTov", title: "Floor generals", quads: ["Safe hands", "Elite creators", "", "High-risk creators"] } },
      { id: "creator-scorer", section: "Playmaking", blurb: "Scoring rate against assist rate: who does both? Colored by position.",
        spec: { x: "pts40", y: "ast40", color: "pos", title: "Score or create", quads: ["Pass-first", "Do-it-all engines", "", "Score-first"] } },
      { id: "ast-leaders", section: "Playmaking", blurb: "Assists per 40 minutes.", spec: { type: "bars", x: "ast40", title: "Assist rate leaders" } },

      { id: "disruptors", section: "Defense & boards", blurb: "Steals against blocks per 40. Colored by position.",
        spec: { x: "stl40", y: "blk40", color: "pos", title: "Disruptors", quads: ["Shot blockers", "Do-everything defenders", "", "Pickpockets"] } },
      { id: "glass", section: "Defense & boards", blurb: "Offensive rebound % against defensive boards per 40.",
        spec: { x: "orbPct", y: "drb40", color: "pos", title: "Glass cleaners", quads: ["Defensive rebounders", "Own both ends of the glass", "", "Crash the offensive glass"] } },
      { id: "stocks-leaders", section: "Defense & boards", blurb: "Steals + blocks per 40 minutes.", spec: { type: "bars", x: "stocks40", title: "Stocks leaders" } },
      { id: "reb-swarm", section: "Defense & boards", blurb: "Rebounding rate across the whole sport, split by position.", spec: { type: "swarm", x: "reb40", labels: 9, color: "pos" } },

      { id: "two-way", section: "Impact", blurb: "Offensive vs defensive DPR from lineup data. Needs 150+ on-court possessions, so the field grows as the season goes.",
        spec: { x: "dprO", y: "dprD", title: "Two-way impact", pool: { min: "10" }, quads: ["Defense first", "Two-way stars", "Hurting both ends", "Offense first"] } },
      { id: "dpr-leaders", section: "Impact", blurb: "Overall DPR: points per 100 possessions better than an average D-I player.", spec: { type: "bars", x: "dpr", title: "DPR leaders", pool: { min: "10" } } },
      { id: "box-vs-lineup", section: "Impact", blurb: "Box-score value (PORPAG) against lineup impact (DPR). Off the diagonal = the box score and the lineups disagree.",
        spec: { x: "porpag", y: "dpr", title: "Box score vs lineups", pool: { min: "10" }, quads: ["Lineups love him", "Stars by any measure", "", "Box-score heroes"] } },
      { id: "top-dpr-compare", section: "Impact", blurb: "The top three players by DPR, side by side on ten percentiles.", topBy: "dpr",
        spec: { type: "profile", title: "", pool: { min: "15" } } },
    ],
  },
};
