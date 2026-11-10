export type Team = {
  id: string; name: string; shortName: string; conference: string;
  wins: number; losses: number; record: string;
  adjOffense: number; adjDefense: number; netRating: number; pace: number;
  sos: number;
};
export type Player = {
  id: string; name: string; teamName: string; position: string; year: string;
  minutes: number; points: number; rebounds: number; assists: number;
  usage: number; efg: number; ts: number; bpm: number; impact: number;
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
