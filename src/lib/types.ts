export type Team = {
  id: string; name: string; shortName: string; conference: string;
  wins: number; losses: number; record: string;
  adjOffense: number; adjDefense: number; netRating: number; pace: number;
  sos: number;
};
export type Player = {
  id: string; name: string; teamName: string; position: string; year: string;
  conference?: string | null; games?: number | null; starts?: number | null;
  minutes: number | null; points: number | null; rebounds: number | null; assists: number | null;
  steals?: number | null; blocks?: number | null; turnovers?: number | null;
  usage: number | null; efg: number | null; ts: number | null; bpm: number | null; impact: number | null;
  offensiveRating?: number | null; defensiveRating?: number | null; netRating?: number | null;
  assistsTurnoverRatio?: number | null; offensiveReboundPct?: number | null;
  fieldGoals?: { pct?: number | null; attempted?: number | null; made?: number | null } | null;
  twoPointFieldGoals?: { pct?: number | null; attempted?: number | null; made?: number | null } | null;
  threePointFieldGoals?: { pct?: number | null; attempted?: number | null; made?: number | null } | null;
  freeThrows?: { pct?: number | null; attempted?: number | null; made?: number | null } | null;
  winShares?: { totalPer40?: number | null; total?: number | null; defensive?: number | null; offensive?: number | null } | null;
  fouls?: number | null;
  freeThrowRate?: number | null;
  sourceStats?: Record<string, unknown>;
};
export type Game = {
  id: string; date: string; awayTeam: string; homeTeam: string;
  awayScore?: number; homeScore?: number;
  status: "scheduled" | "live" | "final"; conferenceGame?: boolean;
};
export type MetricDefinition = {
  key: string; label: string; description: string; unit: string;
  higherIsBetter: boolean; formula: string; caveat: string;
};
export type DataStatus = {
  mode: "demo" | "live"; provider: string; updatedAt: string; note: string;
};

export type ProviderResult<T> = {
  data: T[];
  provider: string;
  fetchedAt: string;
  status: "available" | "unavailable" | "error";
  season: number;
  warnings: string[];
};


export type TeamSeasonRecord = {
  teamId?: number | null;
  team: string;
  conference?: string | null;
  games?: number | null;
  wins?: number | null;
  losses?: number | null;
  pace?: number | null;
  teamStats?: Record<string, unknown>;
  opponentStats?: Record<string, unknown>;
  adjusted?: {
    offensiveRating?: number | null;
    defensiveRating?: number | null;
    netRating?: number | null;
    rankings?: Record<string, number> | null;
  } | null;
  srsRating?: number | null;
  eloRating?: number | null;
  sosRating?: number | null;
  gameStats?: Array<Record<string, unknown>>;
};
