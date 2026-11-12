// Contracts for the compact data layer built by scripts/build-app-data.mjs.

export type Profile = {
  eff: number | null; efg: number | null; tov: number | null; orb: number | null; ftr: number | null;
  threeRate: number | null; threePct: number | null; twoPct: number | null; ftPct: number | null;
  astRate: number | null; blkRate: number | null; stlRate: number | null;
  paintShare: number | null; fastBreakShare: number | null;
};
export type ProfileKey = keyof Profile;
export type Venue = "H" | "A" | "N";

export type TeamSummary = {
  id: string; slug: string; name: string; short: string; mascot: string | null; logo: string | null;
  /** ESPN primary / alternate team colours (hex), when published. */
  color: string | null; altColor: string | null;
  conf: string; confName: string; confSlug: string;
  w: number; l: number; cw: number; cl: number; streak: string | null;
  rank: number | null; adjEM: number | null; adjO: number | null; adjD: number | null; adjT: number | null; sos: number | null;
  adjORank: number | null; adjDRank: number | null; adjTRank: number | null; sosRank: number | null;
  sample: string; ratedGames: number;
  off: Profile | null; def: Profile | null;
  offRanks?: Partial<Record<ProfileKey, number>>; defRanks?: Partial<Record<ProfileKey, number>>;
  /** Opponent- and venue-adjusted efficiency margin for each completed D-I game, in order. */
  perf: number[];
  last: { r: "W" | "L"; m: number }[];
  /** [wins, losses] for DHR quadrants 1–4 (unofficial, NET-style cutoffs). */
  quads: [number, number][];
  close: [number, number];
  projW: number; projL: number; projCW: number; projCL: number;
  next: { id: string; date: string; opp: string; oppSlug: string | null; oppRank: number | null; venue: Venue; wp: number | null } | null;
};

export type TeamGame = {
  id: string; date: string; day: string; status: string; venue: Venue;
  opp: string; oppId: string | null; oppSlug: string | null; oppRank: number | null; oppConf: string | null; d1: boolean;
  conf: boolean; pts: number | null; oppPts: number | null; result: "W" | "L" | null;
  /** Pregame win probability (walk-forward; only uses games before this date). */
  wp: number | null; projPts: number | null; projOppPts: number | null;
  offEff: number | null; defEff: number | null; pace: number | null; perf: number | null; quad: number | null;
};

/** Columnar player table. Use `playerRows()` to turn it into objects. */
export type PlayerTable = { fields: PlayerField[]; rows: (string | number | null)[][] };
export type PlayerField = keyof Player;
export type Player = {
  id: string; name: string; teamId: string; pos: string | null; g: number | null; gs: number | null; min: number | null;
  pts: number | null; reb: number | null; orb: number | null; drb: number | null; ast: number | null; stl: number | null; blk: number | null;
  tov: number | null; pf: number | null; usg: number | null; ortg: number | null; drtg: number | null; net: number | null;
  porpag: number | null; efg: number | null; ts: number | null; fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null;
  ftm: number | null; fta: number | null; ws: number | null; ws40: number | null; orbPct: number | null; ftr: number | null;
  /** Shot profile: rim = dunks + layups + tip-ins, mid = two-point jumpers, thr = three-point jumpers (attempts / makes). */
  rimA: number | null; rimM: number | null; midA: number | null; midM: number | null; thrA: number | null; thrM: number | null;
  astd: number | null; dunks: number | null;
};

export type TeamDetail = {
  id: string; games: TeamGame[]; roster: PlayerTable["rows"];
  perGame: TeamPerGame | null; oppPerGame: TeamPerGame | null;
  /** Per-player game logs (ESPN box scores) keyed by player id; columns named by logFields. */
  logFields?: string[];
  logs?: Record<string, (string | number | null)[][]>;
  bios?: Record<string, PlayerBio>;
};
export type PlayerBio = { jersey: string | null; pos: string | null; ht: string | null; wt: number | null; year: string | null; home: string | null };
export type TeamPerGame = { pts: number | null; reb: number | null; ast: number | null; tov: number | null; stl: number | null; blk: number | null; paint: number | null; fastBreak: number | null };

export type GameSide = {
  id: string | null; slug: string | null; name: string; short: string | null; logo: string | null; color: string | null; conf: string | null;
  rank: number | null; adjEM: number | null; record: string | null; score: number | null; periods: number[] | null;
};
export type BoxLine = {
  fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null; ftm: number | null; fta: number | null;
  orb: number | null; drb: number | null; ast: number | null; stl: number | null; blk: number | null; tov: number | null;
  paint: number | null; fastBreak: number | null; offTov: number | null; poss: number | null; largestLead: number | null;
};
export type Game = {
  id: string; date: string; status: "scheduled" | "in_progress" | "final" | string; neutral: boolean; confGame: boolean;
  venue: string | null; city: string | null; state: string | null; tournament: string | null;
  home: GameSide; away: GameSide;
  /** Pregame projection from the home side: wp = home win probability, margin = home − away. */
  pred: { wp: number; margin: number; home: number; away: number; tempo: number } | null;
  /** 0–100: 55% team quality (both teams' AdjEM percentiles), 45% projected closeness. */
  watch: number | null;
  /** Winner's pregame win probability when it was below 35%. */
  upset: number | null;
  box: { home: BoxLine | null; away: BoxLine | null } | null;
};
export type GameDay = { day: string; games: Game[] };
export type GameIndex = { days: { day: string; games: number; finals: number }[] };

export type Conference = {
  slug: string; name: string; code: string; teams: string[]; size: number; rank: number;
  avgEM: number | null; avgO: number | null; avgD: number | null; avgT: number | null; topEM: number | null;
  ncW: number; ncL: number; best: string | null;
};

export type Calibration = { bin: string; games: number; expected: number | null; actual: number | null };
export type BacktestBlock = { games: number; correct: number; accuracy: number; marginMAE: number; brier: number; logLoss: number; calibration: Calibration[] } | null;
export type Meta = {
  season: number; seasonLabel: string; provider: string;
  updated: { teams: string | null; players: string | null; games: string | null; built: string };
  counts: { teams: number; ratedTeams: number; players: number; games: number; finals: number };
  model: {
    name: string; version: string; method: string; leagueAverage: number; leagueTempo: number; estimatedHomeEdge: number;
    homeEdgePointsPerGame: number; gameCoverage: number; rankedTeams: number;
    seasonPrior: { season: number | null; provider: string | null; teams: number } | null;
    priors: { teamGames: number; seasonPriorWeight?: number; seasonRegression?: number; conferenceTeams: number; homeEdge: number; homeEdgeWeight: number; nonD1Weight: number };
    pooledNonD1: { adjO: number; adjD: number; adjEM: number; adjT: number } | null;
    backtest: { description: string; all: BacktestBlock; seasoned: BacktestBlock; seasonedRule: string };
  };
  leagueProfile: Partial<Profile>;
};
