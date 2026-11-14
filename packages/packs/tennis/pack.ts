// Pro tennis sport pack: the stats, filters, ranking recipes and curated charts for singles
// players on the men's and women's tours. The engine lives in src/sport-kit; this file is
// the only tennis-specific part. Every metric is computed here from raw season totals.
import { floorFilter, type FilterDef, type Framework, type Metric, type SportPack, type TeamInfo } from "@sports/kit";
import type { TennisRow } from "./types";

type M = Metric<TennisRow>;

/** Tour options, used when the data hook hasn't supplied lists.tour yet. */
export const TOURS: [string, string][] = [["men", "Men's tour"], ["women", "Women's tour"]];
const tourLabel = (v: string, lists: Record<string, [string, string][]>) => (lists.tour ?? TOURS).find(t => t[0] === v)?.[1] ?? v;

// Small arithmetic helpers. Anything with a missing or zero denominator comes back null.
const pct = (a: number | null, b: number | null) => (a !== null && b !== null && b > 0 ? (a / b) * 100 : null);
const ratio = (a: number | null, b: number | null) => (a !== null && b !== null && b > 0 ? a / b : null);
/** Second-serve points played = service points minus first serves in. */
const secondServes = (r: TennisRow) => (r.servicePoints !== null && r.firstServesIn !== null ? r.servicePoints - r.firstServesIn : null);
/** Return points against a second serve = opponent's service points minus those against a first serve. */
const secondReturns = (r: TennisRow) => (r.returnPoints !== null && r.returnFirstPointsPlayed !== null ? r.returnPoints - r.returnFirstPointsPlayed : null);
/** Dominance ratio: return points won % ÷ service points lost %. Above 1 = wins more on return than it gives up on serve. */
const dominance = (r: TennisRow) => {
  const rpw = ratio(r.returnPointsWon, r.returnPoints), spw = ratio(r.servicePointsWon, r.servicePoints);
  if (rpw === null || spw === null || spw >= 1) return null;
  return rpw / (1 - spw);
};
const serveSample = (r: TennisRow) => (r.servicePoints ?? 0) >= 100;
const returnSample = (r: TennisRow) => (r.returnPoints ?? 0) >= 100;

export const METRICS: M[] = [
  // Serve
  { key: "aceRate", label: "Ace rate", short: "Ace%", group: "Serve", unit: "%", ok: serveSample, get: r => pct(r.aces, r.servicePoints), desc: "Aces as a share of service points: serves nobody gets a racket on." },
  { key: "dfRate", label: "Double-fault rate", short: "DF%", group: "Serve", unit: "%", invert: true, ok: serveSample, get: r => pct(r.doubleFaults, r.servicePoints), desc: "Double faults as a share of service points (lower is better)." },
  { key: "firstIn", label: "First serves in", short: "1st in", group: "Serve", unit: "%", ok: serveSample, get: r => pct(r.firstServesIn, r.servicePoints), desc: "Share of service points that start with a first serve landing in." },
  { key: "firstWon", label: "1st-serve points won", short: "1st W%", group: "Serve", unit: "%", ok: r => (r.firstServesIn ?? 0) >= 50, get: r => pct(r.firstServePointsWon, r.firstServesIn), desc: "Share of points won when the first serve goes in." },
  { key: "secondWon", label: "2nd-serve points won", short: "2nd W%", group: "Serve", unit: "%", ok: r => (secondServes(r) ?? 0) >= 50, get: r => pct(r.secondServePointsWon, secondServes(r)), desc: "Share of points won behind the second serve: how well a serve holds up when it is not the first ball." },
  { key: "spw", label: "Service points won", short: "SPW%", group: "Serve", unit: "%", ok: serveSample, get: r => pct(r.servicePointsWon, r.servicePoints), desc: "Share of all points won on their own serve: the single best serve number." },
  { key: "holdPct", label: "Hold %", short: "Hold%", group: "Serve", unit: "%", ok: r => (r.serviceGames ?? 0) >= 20, get: r => pct(r.serviceGamesWon, r.serviceGames), desc: "Share of service games held without being broken." },
  // Return
  { key: "rpw", label: "Return points won", short: "RPW%", group: "Return", unit: "%", ok: returnSample, get: r => pct(r.returnPointsWon, r.returnPoints), desc: "Share of points won when the opponent is serving: the purest return measure." },
  { key: "retFirst", label: "1st-serve return won", short: "1st RW%", group: "Return", unit: "%", ok: r => (r.returnFirstPointsPlayed ?? 0) >= 50, get: r => pct(r.returnFirstPointsWon, r.returnFirstPointsPlayed), desc: "Share of points won against an opponent's first serve." },
  { key: "retSecond", label: "2nd-serve return won", short: "2nd RW%", group: "Return", unit: "%", ok: r => (secondReturns(r) ?? 0) >= 50, get: r => pct(r.returnSecondPointsWon, secondReturns(r)), desc: "Share of points won against an opponent's second serve: where most break chances come from." },
  { key: "breakPct", label: "Break %", short: "Break%", group: "Return", unit: "%", ok: r => (r.returnGames ?? 0) >= 20, get: r => pct(r.returnGamesWon, r.returnGames), desc: "Share of return games won: how often they break serve." },
  { key: "dominance", label: "Dominance ratio", short: "Dom", group: "Return", digits: 2, ok: r => serveSample(r) && returnSample(r), get: dominance, desc: "Return points won % divided by service points lost %. Above 1.00 means they win more on return than they give away on serve." },
  // Pressure
  { key: "bpSaved", label: "Break points saved", short: "BP save%", group: "Pressure", unit: "%", ok: r => (r.breakPointsFaced ?? 0) >= 20, get: r => pct(r.breakPointsSaved, r.breakPointsFaced), desc: "Share of break points faced that were saved (needs 20+ faced)." },
  { key: "bpFacedRate", label: "Break points faced per service game", short: "BPf/SG", group: "Pressure", digits: 2, invert: true, ok: r => (r.serviceGames ?? 0) >= 20, get: r => ratio(r.breakPointsFaced, r.serviceGames), desc: "Break points faced per service game: how often their serve is in trouble (lower is better)." },
  { key: "bpConv", label: "Break points converted", short: "BP conv%", group: "Pressure", unit: "%", ok: r => (r.breakPointChances ?? 0) >= 20, get: r => pct(r.breakPointsConverted, r.breakPointChances), desc: "Share of break-point chances on return that were converted (needs 20+ chances)." },
  { key: "tbWin", label: "Tiebreak win %", short: "TB win%", group: "Pressure", unit: "%", ok: r => (r.tiebreaksPlayed ?? 0) >= 5, get: r => pct(r.tiebreaksWon, r.tiebreaksPlayed), desc: "Share of tiebreaks won (needs 5+ played)." },
  { key: "decWin", label: "Deciding-set win %", short: "Decider%", group: "Pressure", unit: "%", ok: r => (r.decidingSetsPlayed ?? 0) >= 5, get: r => pct(r.decidingSetsWon, r.decidingSetsPlayed), desc: "Share of deciding sets won (needs 5+ played)." },
  // Results
  { key: "winPct", label: "Match win %", short: "Win%", group: "Results", unit: "%", ok: r => r.matches >= 5, get: r => pct(r.wins, r.matches), desc: "Share of matches won (needs 5+ played)." },
  { key: "wins", label: "Match wins", short: "Wins", group: "Results", digits: 0, get: r => r.wins, desc: "Matches won this season." },
  { key: "top10Pct", label: "Win % vs top 10", short: "Top-10%", group: "Results", unit: "%", ok: r => (r.top10Played ?? 0) >= 5, get: r => pct(r.top10Won, r.top10Played), desc: "Share of matches won against top-10 opponents (needs 5+ played)." },
  { key: "top10Won", label: "Wins over the top 10", short: "Top-10 W", group: "Results", digits: 0, get: r => r.top10Won, desc: "Matches won against top-10 opponents." },
  // Surface
  { key: "hardPct", label: "Hard-court win %", short: "Hard%", group: "Surface", unit: "%", ok: r => (r.hardMatches ?? 0) >= 5, get: r => pct(r.hardWins, r.hardMatches), desc: "Share of hard-court matches won (needs 5+ played)." },
  { key: "clayPct", label: "Clay-court win %", short: "Clay%", group: "Surface", unit: "%", ok: r => (r.clayMatches ?? 0) >= 5, get: r => pct(r.clayWins, r.clayMatches), desc: "Share of clay-court matches won (needs 5+ played)." },
  { key: "grassPct", label: "Grass-court win %", short: "Grass%", group: "Surface", unit: "%", ok: r => (r.grassMatches ?? 0) >= 5, get: r => pct(r.grassWins, r.grassMatches), desc: "Share of grass-court matches won (needs 5+ played)." },
  { key: "clayShare", label: "Clay-court share", short: "Clay mix", group: "Surface", unit: "%", ok: r => r.matches >= 5, get: r => pct(r.clayMatches, r.matches), desc: "Share of matches played on clay: how much of their season is red dirt." },
  // Volume
  { key: "matches", label: "Matches played", short: "Matches", group: "Volume", digits: 0, get: r => r.matches, desc: "Matches played this season." },
  { key: "servePts", label: "Service points", short: "Svc pts", group: "Volume", digits: 0, get: r => r.servicePoints, desc: "Points played on their own serve." },
  { key: "tbPlayed", label: "Tiebreaks played", short: "TBs", group: "Volume", digits: 0, get: r => r.tiebreaksPlayed, desc: "Tiebreaks played this season." },
];

const entity: SportPack<TennisRow>["entity"] = {
  id: r => r.id,
  name: r => r.name,
  pos: () => null,
  team: (r): TeamInfo => ({ name: r.country.name, short: r.country.short, color: r.country.color, group: r.tour, groupName: tourLabel(r.tour, {}) }),
  href: () => null,
  exposure: r => r.matches,
};

const FILTERS: FilterDef<TennisRow>[] = [
  {
    key: "tour", label: "Tour", default: "all", compact: true,
    options: lists => [{ value: "all", label: "Both tours" }, ...(lists.tour ?? TOURS).map(([value, label]) => ({ value, label }))],
    test: (r, v) => v === "all" || r.tour === v,
    describe: (v, lists) => (v === "all" ? null : { noun: `${tourLabel(v, lists)} players` }),
  },
  floorFilter<TennisRow>({ key: "mp", label: "Matches", get: r => r.matches, steps: [0, 5, 10, 15, 20], default: 10, fmt: n => `${n}+ matches`, anyLabel: "Any matches", suffix: n => `${n}+ matches`, compact: true }),
];

export const FRAMEWORKS: Framework[] = [
  { key: "overall", label: "Overall", blurb: "All-round view: serve and return points, dominance on return, holds and breaks, and results including against the top 10.",
    weights: [["spw", 15], ["rpw", 15], ["dominance", 15], ["holdPct", 10], ["breakPct", 10], ["winPct", 15], ["top10Pct", 10], ["tbWin", 5], ["bpSaved", 5]] },
  { key: "bigServer", label: "Big server", blurb: "Serve first: aces, first-serve and second-serve points won, holds, and few double faults.",
    weights: [["aceRate", 25], ["firstWon", 20], ["secondWon", 15], ["holdPct", 20], ["dfRate", 10], ["spw", 10]] },
  { key: "returner", label: "Returner", blurb: "Return games: points won on both first and second serves, break rate, and dominance.",
    weights: [["rpw", 30], ["retFirst", 20], ["retSecond", 20], ["breakPct", 20], ["dominance", 10]] },
  { key: "clutch", label: "Clutch", blurb: "Pressure: break points saved and converted, tiebreaks, deciding sets, and how often service games get in trouble.",
    weights: [["bpSaved", 30], ["bpConv", 20], ["tbWin", 25], ["decWin", 15], ["bpFacedRate", 10]] },
  { key: "clay", label: "Clay", blurb: "Clay-court results, with how much of the season is played on clay and return strength to back it up.",
    weights: [["clayPct", 60], ["clayShare", 10], ["rpw", 15], ["holdPct", 15]] },
  { key: "grass", label: "Grass", blurb: "Grass-court results, built on the serve: holds, aces and first-serve points won.",
    weights: [["grassPct", 50], ["aceRate", 20], ["firstWon", 15], ["holdPct", 15]] },
  { key: "hard", label: "Hard", blurb: "Hard-court results, with service and return points won as the base.",
    weights: [["hardPct", 60], ["spw", 20], ["rpw", 20]] },
  { key: "giantKiller", label: "Giant killer", blurb: "Wins against the top 10, how many of them, and the overall win rate that goes with them.",
    weights: [["top10Pct", 50], ["top10Won", 30], ["winPct", 20]] },
  { key: "consistency", label: "Consistency", blurb: "Steady week in, week out: match win rate, points won on both sides, holds, and few double faults.",
    weights: [["winPct", 30], ["spw", 20], ["rpw", 20], ["dfRate", 15], ["holdPct", 15]] },
];

export const tennis: SportPack<TennisRow> = {
  id: "tennis",
  name: "Pro tennis",
  brand: "BASELINE",
  filePrefix: "tennis",
  nouns: { player: "player", players: "players", pool: "tour players", pronoun: "they" },
  entity,
  positions: [],
  groups: { label: "Tour", list: "tour" },
  metrics: METRICS,
  metricGroups: ["Serve", "Return", "Pressure", "Results", "Surface", "Volume"],
  filters: FILTERS,
  frameworks: FRAMEWORKS,
  tiers: [{ min: 97, label: "Elite" }, { min: 90, label: "Excellent" }, { min: 75, label: "Very good" }, { min: 50, label: "Solid" }, { min: 0, label: "Developing" }],
  ranking: { minCoverage: 0.6, shrinkK: 8, shrinkUnit: "matches" },
  charts: {
    defaultX: "spw", defaultY: "rpw",
    profileMetrics: ["aceRate", "dfRate", "firstWon", "secondWon", "holdPct", "rpw", "retFirst", "retSecond", "breakPct", "bpSaved", "tbWin", "winPct", "top10Pct", "dominance"],
    sections: ["Serve", "Return", "Pressure", "Results & surfaces", "Compare"],
    presets: [
      { id: "serve-vs-return", section: "Serve", blurb: "Service points won against return points won. Top right is complete; bottom right is serve only. Colored by tour.",
        spec: { x: "spw", y: "rpw", color: "group", title: "Serve vs return", quads: ["Return-first grinders", "Complete players", "Neither end holds", "Serve-bots"] } },
      { id: "ace-vs-df", section: "Serve", blurb: "Aces against double faults. Up and right is a weapon that does not cost points.",
        spec: { x: "aceRate", y: "dfRate", title: "Weapons vs liabilities", quads: ["Safe, quiet serves", "Aces, no fear", "Neither weapon nor safety", "Bombs and blow-ups"] } },
      { id: "hold-vs-break", section: "Serve", blurb: "Hold % against break %: the two halves of the service game story, on one chart.",
        spec: { x: "holdPct", y: "breakPct", title: "Holds and breaks", quads: ["Breaks, but drops serve", "Dominant both ways", "Stuck in neutral", "Holds, rarely breaks"] } },
      { id: "ace-leaders", section: "Serve", blurb: "Ace rate leaders: aces as a share of service points.", spec: { type: "bars", x: "aceRate", title: "Ace rate leaders" } },
      { id: "serve-swarm", section: "Serve", blurb: "Every qualified player's service points won, from the top of the tour to the bottom.", spec: { type: "swarm", x: "spw", labels: 9 } },

      { id: "return-split", section: "Return", blurb: "Return points won against first serves against second serves. Top right returns anything.",
        spec: { x: "retFirst", y: "retSecond", title: "First vs second-serve returns", quads: ["Feasts on second serves", "Returns anything", "Struggles on both", "Only the first serve"] } },
      { id: "dominance-leaders", section: "Return", blurb: "Dominance ratio: return points won % against service points lost %. Above 1.00 means they win more on return than they give away.",
        spec: { type: "bars", x: "dominance", title: "Dominance leaders" } },
      { id: "break-leaders", section: "Return", blurb: "Share of return games won.", spec: { type: "bars", x: "breakPct", title: "Break % leaders" } },

      { id: "small-moments", section: "Pressure", blurb: "Break points saved against tiebreak win %: who survives the small moments.",
        spec: { x: "bpSaved", y: "tbWin", title: "Small moments", quads: ["Tiebreak artists, leaky BPs", "Cool under fire", "Crumbles under pressure", "Saves breaks, loses tiebreaks"] } },
      { id: "trouble-and-rescue", section: "Pressure", blurb: "How often service games get into trouble against how often the trouble gets fixed. Fewer break points faced sits to the right.",
        spec: { x: "bpFacedRate", y: "bpSaved", title: "Trouble and rescue", quads: ["Lives dangerously, saves it", "Rarely in trouble, always saves", "Trouble and no rescue", "Quiet, but cracks when it counts"] } },
      { id: "deciders", section: "Pressure", blurb: "Tiebreak win % against deciding-set win %. Top right is the big-match player.",
        spec: { x: "tbWin", y: "decWin", title: "Big-match players", quads: ["Decider specialists", "Big-match players", "Losing the close ones", "Tiebreak only"] } },
      { id: "bp-conversion-leaders", section: "Pressure", blurb: "Break-point conversion on return, among players with 20+ chances.", spec: { type: "bars", x: "bpConv", title: "Break-point conversion leaders" } },

      { id: "win-vs-top10", section: "Results & surfaces", blurb: "Match win % against win % vs the top 10. Colored by tour.",
        spec: { x: "top10Pct", y: "winPct", color: "group", title: "Giant killers", quads: ["Solid, stalls against the top 10", "Wins everywhere", "Struggling across the board", "Giant killers, inconsistent"] } },
      { id: "clay-vs-grass", section: "Results & surfaces", blurb: "Win % on clay against win % on grass. Colored by tour.",
        spec: { x: "clayPct", y: "grassPct", color: "group", title: "Surface specialists", quads: ["Grass specialists", "Surface all-rounders", "Neither surface", "Clay specialists"] } },
      { id: "clay-leaders", section: "Results & surfaces", blurb: "Win % on clay, among players with 5+ clay matches.", spec: { type: "bars", x: "clayPct", title: "Clay-court leaders" } },

      { id: "top-compare", section: "Compare", blurb: "The top three players by match win % (15+ matches), side by side on fourteen metrics.", topBy: "winPct",
        spec: { type: "profile", title: "", pool: { mp: "15" } } },
    ],
  },
};
