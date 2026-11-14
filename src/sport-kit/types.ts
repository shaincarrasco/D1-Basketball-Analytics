// The sport kit contract. Everything sport-specific (stats, positions, filters, ranking
// recipes, curated charts, wording) lives in a SportPack. The engine (percentiles,
// rankings, chart specs, chart rendering, URL encoding) only ever talks to this contract,
// so adding tennis, soccer or football means writing a pack, not touching the engine.
//
// R is the sport's row type: one player (or team) with whatever fields the pack reads.

/** Theme colour slots a position can use. Mapped to palette colours at render time. */
export type Tone = "def" | "bulb" | "off" | "good" | "hot" | "bad" | "ink" | "mute";

export type Metric<R> = {
  /** Stable id, used in URLs. Never rename once shipped (old links would break). */
  key: string;
  label: string;
  /** Column / axis abbreviation, ≤ 9 characters. */
  short: string;
  /** Must be one of the pack's metricGroups. */
  group: string;
  /** One or two sentences a fan understands. */
  desc: string;
  get: (r: R) => number | null;
  /** Lower is better (turnovers, fouls, errors, goals conceded). Charts flip the axis so better is always up/right. */
  invert?: boolean;
  /** Sample guard: return false and the value is treated as missing (left out of pools, charts and blends). */
  ok?: (r: R) => boolean;
  digits?: number;
  unit?: "%" | "";
  /** Show + on positive values (impact numbers, plus-minus). */
  sign?: boolean;
};

export type Position = { key: string; label: string; plural: string; tone: Tone };

/** What the charts need to know about a player's team (or country, or club). */
export type TeamInfo = {
  name: string;
  short: string;
  logo?: string | null;
  color?: string | null;
  altColor?: string | null;
  /** Grouping slug (conference, league, tour) — matches a value in the pack's group list. */
  group?: string | null;
  groupName?: string | null;
};

export type Option = { value: string; label: string };
/** Lists that only exist once data loads (conferences, leagues, countries), as [value, label]. */
export type Lists = Record<string, [string, string][]>;
/** A player pool: one string value per filter key. */
export type Pool = Record<string, string>;

export type FilterDef<R> = {
  /** Key in the Pool and the URL parameter name. Must not collide with RESERVED_PARAMS. */
  key: string;
  label: string;
  options: Option[] | ((lists: Lists) => Option[]);
  default: string;
  /** Does this row pass the filter at this value? Called for every row, so return true for "everyone". */
  test: (r: R, value: string) => boolean;
  /**
   * How this filter reads in a chart subtitle. `noun` replaces the pool noun ("Big Ten players"),
   * `suffix` is appended ("15+ mpg"). Return null to say nothing.
   */
  describe?: (value: string, lists: Lists) => { noun?: string; suffix?: string } | null;
  /** Show in the compact filter bar above the chart gallery. */
  compact?: boolean;
};

export type Framework = { key: string; label: string; blurb: string; weights: [string, number][] };
export type Tier = { min: number; label: string };

export type ChartType = "scatter" | "bars" | "swarm" | "profile";
export type ColorBy = "team" | "pos" | "group";

export type ChartSpec = {
  type: ChartType;
  x: string; y: string;
  /** Dot size for scatters: "" = fixed. */
  size: string;
  color: ColorBy;
  /** Group (conference, league…) to light up when color = "group". */
  hiGroup: string;
  pool: Pool;
  /** How many standouts to label. */
  labels: number;
  /** Ids to always highlight (or to compare, for profiles). */
  ids: string[];
  /** Metrics shown in a profile. */
  metrics: string[];
  /** Quadrant captions: top-left, top-right, bottom-left, bottom-right. */
  quads: [string, string, string, string];
  title: string;
  /** Leaders: how many bars. */
  n: number;
  /** Swarm: split rows by position. */
  split: boolean;
};

export type SpecInput = Omit<Partial<ChartSpec>, "pool"> & { pool?: Pool };

export type Preset = {
  id: string;
  /** Must be one of the pack's chart sections. */
  section: string;
  blurb: string;
  spec: SpecInput;
  /** Compare charts: fill ids with the top three in the pool by this metric. */
  topBy?: string;
};

export type SportPack<R> = {
  /** Slug: "basketball", "tennis". */
  id: string;
  /** "College basketball". */
  name: string;
  /** Credit drawn on every exported chart ("D1 HOOPS"). */
  brand: string;
  /** Download file prefix ("d1hoops"). */
  filePrefix: string;
  nouns: {
    player: string; players: string;
    /** The whole population, used in subtitles: "D-I players". */
    pool: string;
    /** "he", "she", "they" — for "Where he ranks". */
    pronoun: string;
  };
  entity: {
    id: (r: R) => string;
    name: (r: R) => string;
    /** Position key (one of `positions`), or null. */
    pos: (r: R) => string | null;
    team: (r: R) => TeamInfo | null;
    /** Profile page link, or null when there is none. */
    href: (r: R) => string | null;
    /** Total playing time (minutes, matches, snaps). Shrinks small samples and sorts search results. */
    exposure: (r: R) => number;
  };
  /** Empty for sports without positions (tennis): position splits are then hidden. */
  positions: Position[];
  /** Optional grouping used for "light up a conference/league". */
  groups?: { label: string; list: string };
  metrics: Metric<R>[];
  metricGroups: string[];
  filters: FilterDef<R>[];
  frameworks: Framework[];
  tiers: Tier[];
  ranking: {
    /** Share of a framework's weight a player must have real stats for (0–1). */
    minCoverage: number;
    /** Blend is pulled toward average by exposure / (exposure + shrinkK). */
    shrinkK: number;
    /** Word for the exposure unit in help text: "minutes", "matches", "snaps". */
    shrinkUnit: string;
    /** Pool overrides for the player-page "where he ranks" block. */
    profilePool?: Pool;
  };
  charts: {
    defaultX: string; defaultY: string;
    profileMetrics: string[];
    sections: string[];
    presets: Preset[];
  };
};

/** What a sport's data hook returns. */
export type SportData<R> = { rows: R[]; lists: Lists; ready: boolean; error: string | null; retry: () => void };

/** URL parameters the engine owns. Filter keys must avoid these. */
export const RESERVED_PARAMS = ["t", "x", "y", "sz", "q", "c", "hc", "lb", "ids", "m", "ti", "n", "sp", "fw", "w", "rel", "raw", "sport", "view"] as const;
