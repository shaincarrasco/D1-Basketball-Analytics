// Plain-English definitions for stat labels, shown by the <Explain> popover.
// Wording follows METRICS.md and the methodology page. Anchors (href) only point at
// section ids that exist on /methodology/ (overview, model, dpr, market, glossary).

export type GlossaryEntry = { term: string; short: string; href?: string };

const METHOD = "/methodology/";

const adjo: GlossaryEntry = {
  term: "Adjusted offense (AdjO)",
  short: "Points scored per 100 possessions against an average D-I defense on a neutral floor. Higher is better.",
  href: `${METHOD}#model`,
};
const adjd: GlossaryEntry = {
  term: "Adjusted defense (AdjD)",
  short: "Points allowed per 100 possessions against an average D-I offense on a neutral floor. Lower is better.",
  href: `${METHOD}#model`,
};
const tempo: GlossaryEntry = {
  term: "Tempo (AdjT)",
  short: "Adjusted possessions per 40 minutes against an average-paced opponent. A style measure, not quality. Higher means faster.",
  href: `${METHOD}#model`,
};

export const GLOSSARY: Record<string, GlossaryEntry> = {
  dhr: {
    term: "DHR rating",
    short: "Our opponent-adjusted rating: points per 100 possessions a team would beat an average D-I team by. Not KenPom, Torvik or the NET.",
    href: `${METHOD}#overview`,
  },
  adjo,
  adjd,
  adjem: {
    term: "Adjusted efficiency margin (AdjEM)",
    short: "AdjO minus AdjD: how many points per 100 possessions a team would beat an average D-I team by on a neutral floor.",
    href: `${METHOD}#model`,
  },
  tempo,
  adjt: tempo,
  sos: {
    term: "Strength of schedule (SOS)",
    short: "The average current AdjEM of every opponent played so far. Non-D-I opponents use a pooled rating. It moves as their ratings move.",
    href: `${METHOD}#glossary`,
  },
  efg: {
    term: "Effective FG%",
    short: "(FGM + 0.5 × 3PM) / FGA. Credits a made three as 1.5 twos. On defense it is the opponent's eFG%, where lower is better.",
    href: `${METHOD}#glossary`,
  },
  ts: {
    term: "True shooting %",
    short: "Points per shooting chance: PTS ÷ (2 × (FGA + 0.44 × FTA)). Counts threes and free throws, so it beats FG% for comparing scorers.",
  },
  tov: {
    term: "Turnover rate",
    short: "Turnovers per 100 possessions. Offenses want it low. On defense it is turnovers forced, where higher is better.",
    href: `${METHOD}#glossary`,
  },
  orb: {
    term: "Offensive rebound %",
    short: "ORB / (ORB + opponent DRB): the share of available offensive rebounds. On defense it is the opponent's rate, where lower is better.",
    href: `${METHOD}#glossary`,
  },
  ftr: {
    term: "Free-throw rate",
    short: "FTA / FGA: how often a team gets to the free-throw line. On defense, lower is better.",
    href: `${METHOD}#glossary`,
  },
  "3p": {
    term: "3-point %",
    short: "Three-point field-goal percentage. On defense, it is the opponents' three-point percentage.",
    href: `${METHOD}#glossary`,
  },
  "3pa": {
    term: "3PA share",
    short: "Share of field-goal attempts taken from three. Mostly a style marker. On defense, a low number means threes are kept down.",
    href: `${METHOD}#glossary`,
  },
  "2p": {
    term: "2-point %",
    short: "Two-point field-goal percentage. On defense, it is the opponents' two-point percentage.",
  },
  ft: {
    term: "Free-throw %",
    short: "Share of free throws made.",
  },
  ast: {
    term: "Assisted makes",
    short: "Share of made field goals that were assisted.",
    href: `${METHOD}#glossary`,
  },
  blk: {
    term: "Block rate",
    short: "Blocks per opponent two-point attempt.",
    href: `${METHOD}#glossary`,
  },
  stl: {
    term: "Steal rate",
    short: "Steals per 100 opponent possessions.",
    href: `${METHOD}#glossary`,
  },
  paint: {
    term: "Paint share",
    short: "Share of a team's points scored in the paint.",
    href: `${METHOD}#glossary`,
  },
  eff: {
    term: "Points per 100 (raw)",
    short: "Points scored per 100 estimated possessions, from season totals. Not adjusted for opponents or venue, so it is not AdjO.",
  },
  defeff: {
    term: "Points allowed per 100 (raw)",
    short: "Opponent points per 100 estimated possessions, from season totals. Not adjusted for opponents, so it is not AdjD. Lower is better.",
  },
  usage: {
    term: "Usage (USG%)",
    short: "Share of team possessions a player uses while he is on the floor.",
    href: `${METHOD}#dpr`,
  },
  ortg: {
    term: "Offensive rating (ORtg)",
    short: "Oliver offensive rating: points produced per 100 possessions a player uses. Higher is better.",
    href: `${METHOD}#dpr`,
  },
  drtg: {
    term: "Defensive rating (DRtg)",
    short: "Points allowed per 100 possessions while a player is on the floor. Lower is better.",
    href: `${METHOD}#dpr`,
  },
  dpr: {
    term: "Player rating (DPR)",
    short: "Estimated points per 100 possessions a player adds over an average D-I player, offense and defense separately. The ± band is its standard error.",
    href: `${METHOD}#dpr`,
  },
  porpag: {
    term: "PORPAG",
    short: "Points over replacement per adjusted game: offensive value above a replacement-level player.",
  },
  ws: {
    term: "Win shares (WS)",
    short: "An estimate of how many team wins a player's offense and defense produced so far, from box-score stats (provider-supplied).",
  },
  ws40: {
    term: "Win shares per 40 (WS/40)",
    short: "Win shares scaled to 40 minutes, so part-time and full-time players can be compared.",
  },
  quadrant: {
    term: "DHR quadrant",
    short: "An unofficial NET-style bucket for a game, set by the opponent's DHR rank and the venue. Not the NCAA selection committee's quadrant.",
    href: `${METHOD}#glossary`,
  },
  ats: {
    term: "Against the spread (ATS)",
    short: "Record against the pregame spread ESPN showed, as wins–losses–pushes. A push is a tie against the line.",
    href: `${METHOD}#market`,
  },
  watchability: {
    term: "Watchability",
    short: "0–100 score for upcoming games: 55% team quality (both AdjEM percentiles) and 45% how close the win probability is to even.",
    href: `${METHOD}#glossary`,
  },
};

// Display labels (lowercased, single-spaced) that do not match a GLOSSARY key directly.
const LABELS: Record<string, string> = {
  offense: "adjo",
  defense: "adjd",
  tempo: "tempo",
  "effective fg%": "efg",
  "efg%": "efg",
  "turnover rate": "tov",
  "turnovers forced": "tov",
  "offensive rebound %": "orb",
  "offensive rebound rate": "orb",
  "or%": "orb",
  "free-throw rate": "ftr",
  "ft rate": "ftr",
  "3-point %": "3p",
  "3p%": "3p",
  "3pa share (style)": "3pa",
  "3pa share": "3pa",
  "2-point %": "2p",
  "2p%": "2p",
  "free-throw %": "ft",
  "ft%": "ft",
  "assisted makes": "ast",
  "ast%": "ast",
  "block rate": "blk",
  "blk%": "blk",
  "steal rate": "stl",
  "stl%": "stl",
  "paint points share (style)": "paint",
  "paint share": "paint",
  "points per 100 (raw)": "eff",
  "points allowed per 100 (raw)": "defeff",
  "usg%": "usage",
  "usage": "usage",
  "ortg": "ortg",
  "drtg": "drtg",
  "dhr": "dhr",
  "ws/40": "ws40",
  "strength of schedule": "sos",
};

function get(key: string): GlossaryEntry | undefined {
  return Object.prototype.hasOwnProperty.call(GLOSSARY, key) ? GLOSSARY[key] : undefined;
}

/** Entry by glossary id (case-insensitive). */
export function getGlossary(id: string): GlossaryEntry | undefined {
  return get(id.trim().toLowerCase());
}

/**
 * Entry for a display label such as "Effective FG%" or "Opponent OR%".
 * An "Opponent " prefix is stripped so the base definition is reused.
 */
export function lookupGlossary(label: string): GlossaryEntry | undefined {
  let k = label.trim().toLowerCase().replace(/\s+/g, " ");
  k = k.replace(/^opponents?(?:['’]s?)?\s+/, "");
  const key = Object.prototype.hasOwnProperty.call(LABELS, k) ? LABELS[k] : k;
  return get(key);
}
