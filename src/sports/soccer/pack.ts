// Club soccer sport pack: the stats, filters, ranking recipes and curated charts for soccer.
// The engine lives in src/sport-kit; this file is the only soccer-specific part.
import { floorFilter, positionFilter, type FilterDef, type Metric, type SportPack } from "@/sport-kit";
import type { SoccerRow } from "./types";

type M = Metric<SoccerRow>;

/** Per-90 rate: total ÷ minutes × 90, or null when the total is missing or there are no minutes. */
const p90 = (f: (r: SoccerRow) => number | null) => (r: SoccerRow) => {
  const v = f(r);
  return v !== null && r.minutes ? (v / r.minutes) * 90 : null;
};
/** Percentage of one total over another, or null when the denominator is missing or zero. */
const pct = (n: (r: SoccerRow) => number | null, d: (r: SoccerRow) => number | null) => (r: SoccerRow) => {
  const a = n(r), b = d(r);
  return a !== null && b ? (a / b) * 100 : null;
};
const outfield = (r: SoccerRow) => r.pos !== "GK";
const keeper450 = (r: SoccerRow) => r.pos === "GK" && r.minutes >= 450;

export const METRICS: M[] = [
  // Shooting
  { key: "npg90", label: "Non-penalty goals per 90", short: "npG/90", group: "Shooting", digits: 2, ok: outfield, get: p90(r => r.npGoals), desc: "Non-penalty goals per 90 minutes." },
  { key: "npxg90", label: "Non-penalty xG per 90", short: "npxG/90", group: "Shooting", digits: 2, ok: outfield, get: p90(r => r.npxG), desc: "Expected goals from shots, penalties excluded, per 90 minutes: how good the chances were." },
  { key: "finish", label: "Finishing vs xG", short: "Fin v xG", group: "Shooting", sign: true, ok: r => outfield(r) && r.shots >= 10, get: r => r.npGoals - r.npxG, desc: "Non-penalty goals minus non-penalty xG. Positive = scoring more than the chances were worth." },
  { key: "convPct", label: "Non-penalty conversion", short: "Conv%", group: "Shooting", unit: "%", ok: r => outfield(r) && r.shots >= 10, get: pct(r => r.npGoals, r => r.shots - r.penAtt), desc: "Share of non-penalty shots that go in (needs 10+ shots)." },
  { key: "sotPct", label: "Shot accuracy", short: "SoT%", group: "Shooting", unit: "%", ok: r => outfield(r) && r.shots >= 10, get: pct(r => r.shotsOt, r => r.shots), desc: "Share of shots on target (needs 10+ shots)." },
  { key: "shots90", label: "Shots per 90", short: "Sh/90", group: "Shooting", digits: 2, ok: outfield, get: p90(r => r.shots), desc: "Shots per 90 minutes, penalties included: shooting volume." },
  { key: "xgPerShot", label: "xG per shot", short: "xG/shot", group: "Shooting", digits: 2, ok: r => outfield(r) && r.shots >= 10, get: r => (r.shots ? r.xG / r.shots : null), desc: "Average xG of each shot: high = takes good chances, low = shoots from distance (needs 10+ shots)." },
  // Creating
  { key: "xa90", label: "xA per 90", short: "xA/90", group: "Creating", digits: 2, ok: outfield, get: p90(r => r.xA), desc: "Expected assists per 90 minutes: the chances a player creates for teammates." },
  { key: "ast90", label: "Assists per 90", short: "Ast/90", group: "Creating", digits: 2, ok: outfield, get: p90(r => r.assists), desc: "Assists per 90 minutes." },
  { key: "kp90", label: "Key passes per 90", short: "KP/90", group: "Creating", digits: 2, ok: outfield, get: p90(r => r.keyPasses), desc: "Passes that lead directly to a shot, per 90 minutes." },
  { key: "box90", label: "Passes into the box per 90", short: "Box/90", group: "Creating", digits: 2, ok: outfield, get: p90(r => r.passIntoBox), desc: "Completed passes into the penalty area, per 90 minutes." },
  { key: "dribPct", label: "Dribble success", short: "Drb%", group: "Creating", unit: "%", ok: r => outfield(r) && r.dribbleAtt >= 20, get: pct(r => r.dribbleOk, r => r.dribbleAtt), desc: "Share of take-ons that beat the defender (needs 20+ attempts)." },
  { key: "touchBox90", label: "Touches in the box per 90", short: "BoxTch/90", group: "Creating", digits: 2, ok: outfield, get: p90(r => r.touchBox), desc: "Touches inside the opposition penalty area, per 90 minutes." },
  // Progression
  { key: "progP90", label: "Progressive passes per 90", short: "ProgP/90", group: "Progression", digits: 2, get: p90(r => r.progPasses), desc: "Completed passes that move the ball well towards the opposition goal, per 90 minutes." },
  { key: "progC90", label: "Progressive carries per 90", short: "ProgC/90", group: "Progression", digits: 2, get: p90(r => r.progCarries), desc: "Carries that move the ball well towards the opposition goal, per 90 minutes." },
  { key: "passCmp", label: "Pass completion", short: "Cmp%", group: "Progression", unit: "%", ok: r => r.passAtt >= 100, get: pct(r => r.passCmp, r => r.passAtt), desc: "Share of passes completed (needs 100+ attempts)." },
  // Defending
  { key: "tkl90", label: "Tackles won per 90", short: "Tkl/90", group: "Defending", digits: 2, ok: outfield, get: p90(r => r.tacklesWon), desc: "Tackles won per 90 minutes." },
  { key: "int90", label: "Interceptions per 90", short: "Int/90", group: "Defending", digits: 2, get: p90(r => r.interceptions), desc: "Passes intercepted per 90 minutes." },
  { key: "blk90", label: "Blocks per 90", short: "Blk/90", group: "Defending", digits: 2, ok: outfield, get: p90(r => r.blocks), desc: "Shots and passes blocked per 90 minutes." },
  { key: "rec90", label: "Recoveries per 90", short: "Rec/90", group: "Defending", digits: 2, get: p90(r => r.recoveries), desc: "Loose balls won back per 90 minutes." },
  { key: "defAct90", label: "Defensive actions per 90", short: "DefA/90", group: "Defending", digits: 2, ok: outfield, get: r => (r.minutes ? ((r.tacklesWon + r.interceptions + r.blocks) / r.minutes) * 90 : null), desc: "Tackles won, interceptions and blocks combined, per 90 minutes." },
  { key: "foul90", label: "Fouls committed per 90", short: "Fls/90", group: "Defending", digits: 2, invert: true, get: p90(r => r.fouls), desc: "Fouls committed per 90 minutes (lower is better)." },
  { key: "err90", label: "Errors leading to shots per 90", short: "Err/90", group: "Defending", digits: 2, invert: true, get: p90(r => r.errShot), desc: "Mistakes that led to a shot against, per 90 minutes (lower is better)." },
  // Aerial & duels
  { key: "aerialPct", label: "Aerial duels won", short: "Aer%", group: "Aerial & duels", unit: "%", ok: r => outfield(r) && r.aerialTotal >= 20, get: pct(r => r.aerialWon, r => r.aerialTotal), desc: "Share of aerial duels won (needs 20+ contested)." },
  { key: "aerial90", label: "Aerial duels won per 90", short: "Aer/90", group: "Aerial & duels", digits: 2, ok: outfield, get: p90(r => r.aerialWon), desc: "Aerial duels won per 90 minutes: how often a player wins it in the air." },
  // Goalkeeping (keepers only)
  { key: "savePct", label: "Save percentage", short: "Sv%", group: "Goalkeeping", unit: "%", ok: keeper450, get: pct(r => r.saves, r => r.gkShotsOt), desc: "Share of shots on target that are saved (450+ minutes)." },
  { key: "saves90", label: "Saves per 90", short: "Sv/90", group: "Goalkeeping", digits: 2, ok: keeper450, get: p90(r => r.saves), desc: "Saves per 90 minutes (450+ minutes)." },
  { key: "psxgMinusGa90", label: "Goals saved above expected", short: "PSxG-GA", group: "Goalkeeping", digits: 2, sign: true, ok: keeper450, get: r => (r.psxg !== null && r.goalsConceded !== null && r.minutes ? ((r.psxg - r.goalsConceded) / r.minutes) * 90 : null), desc: "Post-shot xG faced minus goals conceded, per 90. Positive = conceding fewer than the shots it faced predicted." },
  { key: "csPct", label: "Clean sheet percentage", short: "CS%", group: "Goalkeeping", unit: "%", ok: r => keeper450(r) && r.starts >= 5, get: pct(r => r.cleanSheets, r => r.starts), desc: "Share of starts that finish with no goals conceded (450+ minutes, 5+ starts)." },
  { key: "crosses90", label: "Crosses claimed per 90", short: "Crs/90", group: "Goalkeeping", digits: 2, ok: keeper450, get: p90(r => r.crossesClaimed), desc: "Crosses the keeper catches or punches clear, per 90 minutes." },
  // Volume
  { key: "minutes", label: "Minutes played", short: "Mins", group: "Volume", digits: 0, get: r => r.minutes, desc: "Total minutes on the pitch this season." },
  { key: "apps", label: "Appearances", short: "Apps", group: "Volume", digits: 0, get: r => r.apps, desc: "Matches appeared in, starts and substitute appearances." },
  { key: "passes90", label: "Passes per 90", short: "Pass/90", group: "Volume", digits: 1, get: p90(r => r.passAtt), desc: "Passes attempted per 90 minutes." },
];

const POSITIONS = [
  { key: "GK", label: "Goalkeeper", plural: "Goalkeepers", tone: "good" },
  { key: "DF", label: "Defender", plural: "Defenders", tone: "def" },
  { key: "MF", label: "Midfielder", plural: "Midfielders", tone: "bulb" },
  { key: "FW", label: "Forward", plural: "Forwards", tone: "off" },
] as const;

const entity: SportPack<SoccerRow>["entity"] = {
  id: r => r.id,
  name: r => r.name,
  pos: r => r.pos,
  team: r => ({ name: r.team.name, short: r.team.short, color: r.team.color, group: r.team.league, groupName: r.team.leagueName }),
  href: () => null,
  exposure: r => r.minutes,
};

const FILTERS: FilterDef<SoccerRow>[] = [
  {
    key: "league", label: "League", default: "all", compact: true,
    options: lists => [{ value: "all", label: "All leagues" }, ...(lists.league ?? []).map(([value, label]) => ({ value, label }))],
    test: (r, v) => v === "all" || r.team.league === v,
    describe: (v, lists) => (v === "all" ? null : { noun: `${lists.league?.find(c => c[0] === v)?.[1] ?? v} players` }),
  },
  positionFilter({ positions: [...POSITIONS], entity }),
  floorFilter<SoccerRow>({ key: "min", label: "Minutes", get: r => r.minutes, steps: [0, 270, 450, 900, 1350], default: 450, fmt: n => `${n}+ min`, anyLabel: "Any minutes", suffix: n => `${n}+ min`, compact: true }),
  floorFilter<SoccerRow>({ key: "apps", label: "Appearances", get: r => r.apps, steps: [1, 3, 5, 10], default: 3, fmt: n => `${n}+ apps`, anyLabel: "Any appearances", suffix: n => `${n}+ apps` }),
];

export const FRAMEWORKS: SportPack<SoccerRow>["frameworks"] = [
  { key: "overall", label: "Overall", blurb: "All-round view: chance quality and creation first, then progression and ball-winning.",
    weights: [["npxg90", 15], ["xa90", 15], ["progP90", 10], ["passCmp", 10], ["tkl90", 10], ["int90", 10], ["aerialPct", 10], ["rec90", 10]] },
  { key: "finisher", label: "Finisher", blurb: "Goals from non-penalty chances: scoring rate, finishing against xG, conversion and accuracy.",
    weights: [["npg90", 30], ["finish", 25], ["convPct", 20], ["sotPct", 15], ["xgPerShot", 10]] },
  { key: "creator", label: "Creator", blurb: "Chances made for teammates: expected assists, key passes and passes into the box.",
    weights: [["xa90", 35], ["kp90", 25], ["box90", 20], ["ast90", 10], ["passCmp", 10]] },
  { key: "progressor", label: "Progressor", blurb: "Moves the ball forward with passes and carries, and keeps it while doing so.",
    weights: [["progP90", 35], ["progC90", 30], ["passCmp", 15], ["dribPct", 10], ["touchBox90", 10]] },
  { key: "ballWinner", label: "Ball winner", blurb: "Wins the ball back: tackles, interceptions, recoveries, and fouls kept down.",
    weights: [["tkl90", 30], ["int90", 25], ["rec90", 20], ["defAct90", 15], ["foul90", 10]] },
  { key: "aerial", label: "Aerial", blurb: "Wins it in the air: duels won, volume of aerial success, and blocks.",
    weights: [["aerialPct", 40], ["aerial90", 40], ["blk90", 20]] },
  { key: "fullback", label: "Full-back", blurb: "Defends and progresses from the flank: carries, crosses into the box, tackles and recoveries.",
    weights: [["progC90", 20], ["box90", 15], ["tkl90", 20], ["passCmp", 15], ["xa90", 15], ["rec90", 15]] },
  { key: "boxToBox", label: "Box-to-box", blurb: "Involved at both ends: progression, ball-winning and touches in the box.",
    weights: [["progP90", 20], ["progC90", 15], ["tkl90", 15], ["int90", 15], ["dribPct", 10], ["passCmp", 10], ["touchBox90", 15]] },
  { key: "goalkeeper", label: "Goalkeeper", blurb: "Shot-stopping against expectation, clean sheets and command of the box. Only keepers are ranked here.",
    weights: [["savePct", 35], ["psxgMinusGa90", 35], ["csPct", 15], ["crosses90", 15]] },
];

export const soccer: SportPack<SoccerRow> = {
  id: "soccer",
  name: "Club soccer",
  brand: "THE XI",
  filePrefix: "soccer",
  nouns: { player: "player", players: "players", pool: "league players", pronoun: "they" },
  entity,
  positions: [...POSITIONS],
  groups: { label: "League", list: "league" },
  metrics: METRICS,
  metricGroups: ["Shooting", "Creating", "Progression", "Defending", "Aerial & duels", "Goalkeeping", "Volume"],
  filters: FILTERS,
  frameworks: FRAMEWORKS,
  tiers: [{ min: 97, label: "Elite" }, { min: 90, label: "Excellent" }, { min: 75, label: "Very good" }, { min: 50, label: "Solid" }, { min: 0, label: "Developing" }],
  ranking: { minCoverage: 0.6, shrinkK: 900, shrinkUnit: "minutes" },
  charts: {
    defaultX: "npxg90", defaultY: "xa90",
    profileMetrics: ["npxg90", "npg90", "xa90", "kp90", "progP90", "progC90", "passCmp", "dribPct", "tkl90", "int90", "aerialPct", "blk90"],
    sections: ["Finishing", "Creating", "Progression", "Defense & aerials", "Goalkeepers"],
    presets: [
      { id: "finishers", section: "Finishing", blurb: "Non-penalty goals against non-penalty xG. Top left = scoring more than the chances were worth.",
        spec: { x: "npxg90", y: "npg90", title: "Goals against chances", quads: ["Scoring above xG", "Clinical, chance-heavy", "Quiet", "Wasting chances"] } },
      { id: "shot-selection", section: "Finishing", blurb: "Shot volume against conversion. Top left = few shots, most of them go in.",
        spec: { x: "shots90", y: "convPct", title: "Shot selection", quads: ["Picky and accurate", "Volume and accuracy", "Quiet", "Shoots a lot, scores little"] } },
      { id: "shot-quality", section: "Finishing", blurb: "Average chance quality against shot accuracy.",
        spec: { x: "xgPerShot", y: "sotPct", title: "Shot quality against accuracy", quads: ["Accurate, poor chances", "Accurate, good chances", "Speculative shooting", "Good chances, off target"] } },
      { id: "npg-leaders", section: "Finishing", blurb: "Non-penalty goals per 90 minutes, leaders first.", spec: { type: "bars", x: "npg90", title: "Non-penalty goals per 90 leaders" } },
      { id: "top-attackers", section: "Finishing", blurb: "The top three players by non-penalty xG per 90, side by side on the profile metrics.", topBy: "npxg90",
        spec: { type: "profile", title: "", pool: { min: "900" } } },

      { id: "creators", section: "Creating", blurb: "Expected goals against expected assists. Top left = creates chances without finishing them.",
        spec: { x: "npxg90", y: "xa90", title: "Attacking balance", quads: ["Pure creators", "Complete attackers", "Passengers", "Pure finishers"] } },
      { id: "passers", section: "Creating", blurb: "Pass completion against progressive passing. Colored by position.",
        spec: { x: "passCmp", y: "progP90", color: "pos", title: "Safe or progressive?", quads: ["Safe and static", "Safe and progressive", "Loose and static", "Progressive but loose"] } },
      { id: "xa-leaders", section: "Creating", blurb: "Expected assists per 90 minutes, at least 900 minutes.", spec: { type: "bars", x: "xa90", title: "Expected assists per 90 leaders", pool: { min: "900" } } },
      { id: "dribblers", section: "Creating", blurb: "Take-on success against progressive carries. Colored by position.",
        spec: { x: "dribPct", y: "progC90", color: "pos", title: "Ball carriers", quads: ["Carries, rarely beats", "Carries and beats", "Quiet on the ball", "Beats defenders, rarely carries"] } },

      { id: "progression", section: "Progression", blurb: "Progressive passes against progressive carries. Colored by position.",
        spec: { x: "progC90", y: "progP90", color: "pos", title: "Progression profile", quads: ["Passes it forward", "Carries and passes forward", "Quiet", "Carries forward, rarely passes"] } },
      { id: "prog-leaders", section: "Progression", blurb: "Progressive passes per 90 minutes, leaders first.", spec: { type: "bars", x: "progP90", title: "Progressive passes per 90 leaders" } },
      { id: "carry-swarm", section: "Progression", blurb: "Progressive carries per 90 for every player, split by position.", spec: { type: "swarm", x: "progC90", labels: 9, color: "pos" } },
      { id: "defenders-on-ball", section: "Progression", blurb: "Defenders only: how far they carry the ball against how safely they pass it.",
        spec: { x: "progC90", y: "passCmp", pool: { pos: "DF" }, title: "Defenders on the ball", quads: ["Safe, static", "Safe and progressive", "Loose and static", "Progressive, loose"] } },

      { id: "ball-winners", section: "Defense & aerials", blurb: "Interceptions against tackles won per 90. Colored by position.",
        spec: { x: "tkl90", y: "int90", color: "pos", title: "Ball winners", quads: ["Interceptors", "Ball winners", "Quiet", "Tacklers"] } },
      { id: "aerial-duels", section: "Defense & aerials", blurb: "Defenders only: aerial duels won per 90 against the share they win.",
        spec: { x: "aerial90", y: "aerialPct", pool: { pos: "DF" }, title: "Aerial dominance", quads: ["Efficient, low volume", "Dominant in the air", "Quiet", "Contests and loses"] } },
      { id: "defensive-leaders", section: "Defense & aerials", blurb: "Tackles, interceptions and blocks per 90, at least 900 minutes.", spec: { type: "bars", x: "defAct90", title: "Defensive actions per 90 leaders", pool: { min: "900" } } },

      { id: "shot-stopping", section: "Goalkeepers", blurb: "Goals saved above expectation against save percentage. Keepers only.",
        spec: { x: "psxgMinusGa90", y: "savePct", pool: { pos: "GK" }, title: "Shot-stopping", quads: ["Good save %, still leaks", "Elite shot-stopping", "Struggling", "Saves above xG, low save %"] } },
      { id: "keepers-clean-sheets", section: "Goalkeepers", blurb: "Clean sheet percentage against goals saved above expectation. Keepers only.",
        spec: { x: "csPct", y: "psxgMinusGa90", pool: { pos: "GK" }, title: "Clean sheets against shot-stopping", quads: ["Clean sheets, shaky saves", "Elite on both", "Leaky, below expectation", "Good saves, leaky defence"] } },
      { id: "keeper-leaders", section: "Goalkeepers", blurb: "Post-shot xG faced minus goals conceded, per 90. Keepers only.", spec: { type: "bars", x: "psxgMinusGa90", title: "Goals saved above expected", pool: { pos: "GK" } } },
    ],
  },
};
