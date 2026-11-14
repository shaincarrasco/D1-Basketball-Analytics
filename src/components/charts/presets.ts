// The chart gallery: curated "who stands out" charts. Each is a spec, so any of them
// opens in the builder for remixing.
import { spec, type ChartSpec } from "./spec";

export type Preset = { id: string; section: string; blurb: string; spec: ChartSpec; /** Compare charts: fill ids with the top players by this metric. */ topBy?: string };

export const SECTIONS = ["Scoring", "Shooting", "Playmaking", "Defense & boards", "Impact"] as const;

export const PRESETS: Preset[] = [
  { id: "usage-efficiency", section: "Scoring", blurb: "The classic: who carries a big load and still scores efficiently.",
    spec: spec({ x: "usg", y: "ts", title: "Load vs efficiency", quads: ["Efficient role players", "Efficient stars", "Quiet nights", "Volume over value"] }) },
  { id: "scoring-rate", section: "Scoring", blurb: "Scoring per 40 minutes against true shooting. Dot size is minutes per game.",
    spec: spec({ x: "pts40", y: "ts", size: "min", title: "Bucket getters", quads: ["Efficient finishers", "Elite scorers", "", "Volume scorers"] }) },
  { id: "self-creators", section: "Scoring", blurb: "Made shots nobody set up for them, against scoring rate. Top right = makes his own offense.",
    spec: spec({ x: "selfCreate", y: "pts40", title: "Self-creators", quads: ["Fed scorers", "Shot creators", "Play finishers", "Creates, rarely scores"] }) },
  { id: "line-merchants", section: "Scoring", blurb: "Who gets to the line, and who cashes in once there.",
    spec: spec({ x: "ftr", y: "ftPct", title: "Free-throw merchants", quads: ["Good touch, rarely fouled", "Foul magnets who convert", "", "Fouled, leaves points"] }) },
  { id: "pts40-leaders", section: "Scoring", blurb: "Scoring rate leaders: points per 40 minutes.", spec: spec({ type: "bars", x: "pts40", title: "Points per 40 leaders" }) },
  { id: "ts-swarm", section: "Scoring", blurb: "Every rotation player's true shooting, guards to centers.", spec: spec({ type: "swarm", x: "ts", labels: 9, color: "pos" }) },

  { id: "snipers", section: "Shooting", blurb: "Three-point volume against accuracy (10+ attempts).",
    spec: spec({ x: "tpa40", y: "tpPct", title: "Snipers", quads: ["Picky shooters", "Volume snipers", "", "Volume, cold so far"] }) },
  { id: "rim-finishers", section: "Shooting", blurb: "How often they live at the rim and how well they finish there.",
    spec: spec({ x: "rimShare", y: "rimPct", title: "Paint finishers", quads: ["Efficient when they get there", "Rim wreckers", "Perimeter players", "Attacks, misses"] }) },
  { id: "touch", section: "Shooting", blurb: "Free-throw % is the best early read on shooting touch. Here it is against three-point %.",
    spec: spec({ x: "ftPct", y: "tpPct", title: "Shooting touch", quads: ["Hot from three", "Pure shooters", "", "Touch says threes will come"] }) },
  { id: "dunk-leaders", section: "Shooting", blurb: "Dunks made this season.", spec: spec({ type: "bars", x: "dunks", title: "Dunk leaders", pool: { minMin: 10 } }) },

  { id: "floor-generals", section: "Playmaking", blurb: "Assist volume against ball security.",
    spec: spec({ x: "ast40", y: "astTov", title: "Floor generals", quads: ["Safe hands", "Elite creators", "", "High-risk creators"] }) },
  { id: "creator-scorer", section: "Playmaking", blurb: "Scoring rate against assist rate: who does both? Colored by position.",
    spec: spec({ x: "pts40", y: "ast40", color: "pos", title: "Score or create", quads: ["Pass-first", "Do-it-all engines", "", "Score-first"] }) },
  { id: "ast-leaders", section: "Playmaking", blurb: "Assists per 40 minutes.", spec: spec({ type: "bars", x: "ast40", title: "Assist rate leaders" }) },

  { id: "disruptors", section: "Defense & boards", blurb: "Steals against blocks per 40. Colored by position.",
    spec: spec({ x: "stl40", y: "blk40", color: "pos", title: "Disruptors", quads: ["Shot blockers", "Do-everything defenders", "", "Pickpockets"] }) },
  { id: "glass", section: "Defense & boards", blurb: "Offensive rebound % against defensive boards per 40.",
    spec: spec({ x: "orbPct", y: "drb40", color: "pos", title: "Glass cleaners", quads: ["Defensive rebounders", "Own both ends of the glass", "", "Crash the offensive glass"] }) },
  { id: "stocks-leaders", section: "Defense & boards", blurb: "Steals + blocks per 40 minutes.", spec: spec({ type: "bars", x: "stocks40", title: "Stocks leaders" }) },
  { id: "reb-swarm", section: "Defense & boards", blurb: "Rebounding rate across the whole sport, split by position.", spec: spec({ type: "swarm", x: "reb40", labels: 9, color: "pos" }) },

  { id: "two-way", section: "Impact", blurb: "Offensive vs defensive DPR from lineup data. Needs 150+ on-court possessions, so the field grows as the season goes.",
    spec: spec({ x: "dprO", y: "dprD", title: "Two-way impact", pool: { minMin: 10 }, quads: ["Defense first", "Two-way stars", "Hurting both ends", "Offense first"] }) },
  { id: "dpr-leaders", section: "Impact", blurb: "Overall DPR: points per 100 possessions better than an average D-I player.", spec: spec({ type: "bars", x: "dpr", title: "DPR leaders", pool: { minMin: 10 } }) },
  { id: "box-vs-lineup", section: "Impact", blurb: "Box-score value (PORPAG) against lineup impact (DPR). Off the diagonal = the box score and the lineups disagree.",
    spec: spec({ x: "porpag", y: "dpr", title: "Box score vs lineups", pool: { minMin: 10 }, quads: ["Lineups love him", "Stars by any measure", "", "Box-score heroes"] }) },
  { id: "top-dpr-compare", section: "Impact", blurb: "The top three players by DPR, side by side on ten percentiles.", topBy: "dpr",
    spec: spec({ type: "profile", title: "", pool: { minMin: 15 } }) },
];
