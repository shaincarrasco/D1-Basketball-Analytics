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
  next: { id: string; date: string; opp: string; oppSlug: string | null; oppRank: number | null; venue: Venue; wp: number | null; tv?: string[] | null } | null;
  /** ESPN team id (for live scores from ESPN's public scoreboard). */
  espnId: string | null;
  /** Against-the-spread record [W, L, P] vs the pregame line ESPN shows. */
  ats: [number, number, number];
  /** Season simulation (10,000 runs): expected wins, 10th/90th percentile wins, conference title share, P(20+ wins). */
  sim: { wins: number; p10: number; p90: number; confWins: number; title: number; outright: number; win20: number } | null;
  /** AP / Coaches poll position this week. */
  ap?: PollSpot | null; coaches?: PollSpot | null;
  /** Players currently flagged unavailable (ESPN injury list or missing from recent box scores). */
  unavailable?: number;
  /** Injury load: players out, limited, share of minutes missing, estimated rating lost (points per 100). */
  health?: { out: number; missing: number; limited: number; minShare: number; netLoss: number } | null;
};
export type PollSpot = { rank: number; prev: number | null; pts: number | null; fpv: number | null };
/** A credited link to an outside article (headline, link, time and publisher only). */
export type Article = { h: string; url: string; t: string; kind: string; src: string; by: string | null };
/** Normalised availability state, most to least serious. "missed" = inferred from box scores; "monitor" = hurt or in the news, no absence yet. */
export type InjuryState = "season" | "out" | "doubtful" | "questionable" | "dtd" | "missed" | "monitor";
/** confirmed = ESPN's official list; reported = a credited news report; inferred = box scores only (reason unknown). */
export type InjuryConfidence = "confirmed" | "reported" | "inferred";
export type InjurySource = "espn" | "manual" | "news" | "box";
/**
 * One current absence (built by scripts/lib/injuries.mjs). Every row says where it came from.
 * `pid` is null for roster players with no stats line yet (link those to the team page).
 */
export type Availability = {
  key: string; pid: string | null; aid: string | null; name: string; pos: string | null;
  state: InjuryState; status: string; kind: "injury" | "illness" | "suspension" | "eligibility" | "personal" | "unknown";
  /** Body part ("Knee", "ACL", "Illness"…), expected absence ("Season", "6–8 weeks", "Until January", "Indefinite"…), estimated return window [from, to] (yyyy-mm-dd). */
  body: string | null; expected: string | null; eta: [string, string] | null; weeks?: [number, number] | null;
  detail: string | null; since: string | null; source: InjurySource; url: string | null; publisher: string | null; confidence: InjuryConfidence;
  /** Consecutive team games missed (ESPN box scores), last game played, games played, never played this season. */
  missed: number; lastPlayed: string | null; gp: number; yetToPlay: boolean;
  /** mpg/ppg…; minShare = share of the team's 200 player-minutes; netLoss ≈ team rating lost, points per 100 possessions (0 unless he's out). */
  impact: { mpg: number | null; ppg: number | null; rpg: number | null; apg: number | null; minShare: number | null; dpr: number | null; netLoss: number | null };
  /** Team record and average margin with / without him: [W, L, avg margin]. */
  ww: { with: [number, number, number | null]; without: [number, number, number | null] } | null;
};
export type InjuryRow = Availability & { slug: string; team: string; conf: string; rank: number | null };
/** A change in the injury ledger. kind: new flag, got worse, improved, other update, back in the lineup, or dropped off the list. */
export type InjuryEvent = {
  t: string; kind: "new" | "worse" | "better" | "update" | "returned" | "cleared";
  state: InjuryState | null; status: string; from?: string | null; body: string | null; detail: string | null; url: string | null; source: InjurySource;
};
export type WireEvent = InjuryEvent & { key: string; pid: string | null; name: string; slug: string; team: string; conf: string | null; rank: number | null; netLoss: number | null };
/** Team health: players out (missing = the subset inferred from box scores, reason not reported; limited: questionable / day-to-day), share of minutes missing, estimated rating lost per 100, points per game lost. */
export type TeamHealth = { slug: string; team: string; conf: string; rank: number | null; out: number; missing: number; limited: number; minShare: number; netLoss: number; ppgLost: number };
/** Official availability report pages (conference games / NCAA tournament only). */
export type ReportLink = { conf: string; url: string | null; note: string | null; verified?: boolean };
export type InjuryFile = { checked: string; rows: InjuryRow[]; teams: TeamHealth[]; wire: WireEvent[]; links: ReportLink[] };
/** Season-long injury history for one player (team detail file). */
export type InjuryLogEntry = {
  key: string; pid: string | null; name: string; open: boolean; events: InjuryEvent[];
  stints: { from: string; to: string | null; state: InjuryState; body: string | null; kind: string | null; missed: number }[];
};
export type NewsFile = {
  fetchedAt: string | null; league: Article[]; pollDate: string | null;
  polls: Record<"ap" | "coaches", { rank: number; prev: number | null; pts: number | null; fpv: number | null; slug: string | null; name: string | null; dhr: number | null; w: number | null; l: number | null }[]>;
};

export type TeamGame = {
  id: string; date: string; day: string; status: string; venue: Venue;
  opp: string; oppId: string | null; oppSlug: string | null; oppRank: number | null; oppConf: string | null; d1: boolean;
  conf: boolean; pts: number | null; oppPts: number | null; result: "W" | "L" | null;
  /** Pregame win probability (walk-forward; only uses games before this date). */
  wp: number | null; projPts: number | null; projOppPts: number | null;
  offEff: number | null; defEff: number | null; pace: number | null; perf: number | null; quad: number | null;
  /** Pregame spread from this team's perspective (negative = favoured) and the against-the-spread result. */
  line?: number; ats?: "W" | "L" | "P";
  /** TV / streaming outlets (ESPN listings). */
  tv?: string[];
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
  /** DPR: regularised adjusted plus-minus (points per 100 possessions vs average), offence, defence (positive = good), standard error, on-court possessions, rank (≥150 possessions). */
  dpr: number | null; dprO: number | null; dprD: number | null; dprSE: number | null; onPoss: number | null;
  /** High-school recruiting: stars (2–5), national rank, class year. */
  stars: number | null; recRank: number | null; recYear: number | null;
  dprRank: number | null;
};

/** One past season for one player (per-game values), columns named by TeamDetail.careerFields. */
export type CareerRow = (string | number | null)[];
/** High-school prospect, columns named by ProspectFile.fields / TeamDetail.prospectFields. */
export type ProspectRow = (string | number | null)[];
export type TeamClass = { teamId: string; slug: string | null; year: number; commits: number; five: number; four: number; avgRating: number | null; points: number; rank: number };
export type ProspectFile = { provider: string; years: number[]; fields: string[]; rows: ProspectRow[]; classes: TeamClass[] };

export type TeamDetail = {
  id: string; games: TeamGame[]; roster: PlayerTable["rows"];
  /** Prior D-I seasons for current roster players (College Basketball Data, cached once per season). */
  careerFields?: string[];
  career?: Record<string, CareerRow[]>;
  /** Committed high-school prospects (open classes) and this program's class rank per year. */
  prospectFields?: string[];
  incoming?: ProspectRow[];
  classRank?: TeamClass[];
  perGame: TeamPerGame | null; oppPerGame: TeamPerGame | null;
  /** Per-player game logs (ESPN box scores) keyed by player id; columns named by logFields. */
  logFields?: string[];
  logs?: Record<string, (string | number | null)[][]>;
  bios?: Record<string, PlayerBio>;
  news?: Article[];
  availability?: Availability[];
  /** Every player with an injury history this season (current and past absences). */
  injuryLog?: InjuryLogEntry[];
  /** Articles that tag each player (provider player id -> articles). */
  playerNews?: Record<string, Article[]>;
  /** Field names for `roster` rows (same as players.json). */
  rosterFields?: PlayerField[];
  /** Season simulation win-total distribution: probability of finishing with from, from+1, … wins. */
  winHist?: { from: number; counts: number[] } | null;
  /** Shot locations (ESPN coordinates: x 0–50 ft across, y ft out from the basket line). off/def = [x, y, made, value]; byPid = [x, y, made, value, kind J/L/D/T/H, assisted, day]. */
  shots?: { off: [number, number, number, number][]; def: [number, number, number, number][]; byPid: Record<string, [number, number, number, number, string, number, string][]> } | null;
  /** Five-man units by minutes (≥2 min): provider player ids, minutes, points for/against, possessions, net per 100. */
  lineups?: { pids: string[]; min: number; pf: number; pa: number; poss: number; net: number }[];
  /** On/off per player: minutes on, net per 100 on and off the floor, possessions on. */
  onOff?: Record<string, { min: number; onNet: number; offNet: number | null; poss: number }>;
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
  /** ESPN event id (live scores), pregame line (home perspective, negative = home favoured), score flow [elapsedSec, home, away]. */
  espnId?: string | null;
  /** Where to watch, from ESPN's listings: outlet name, "TV" | "Streaming" | null, market ("National", "Home", "Away"). */
  tv?: { name: string; type: string | null; market: string | null }[] | null;
  /** Previews and recaps for this game (credited links). */
  articles?: Article[] | null;
  line?: { spread: number; total: number | null; provider: string | null } | null;
  flow?: [number, number, number][] | null;
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
  market: { games: number; modelMAE: number; lineMAE: number; atsW: number; atsL: number; atsP: number; note: string } | null;
  sims: { sims: number; remainingGames: number; method: string } | null;
  /** D-I field-goal attempts/makes by shot zone (see lib/shots.ts). */
  shotZones: import("./shots").ZoneStats | null;
  dpr: { players: number; rows: number; lambda: number; method: string } | null;
};
