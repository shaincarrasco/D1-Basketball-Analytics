export type Team = {
  id: string; name: string; conference: string; wins: number; losses: number;
  adjO: number; adjD: number; net: number; tempo: number; sos: number;
};
export type Player = {
  id: string; name: string; team: string; position: string; year: string;
  mpg: number; ppg: number; rpg: number; apg: number; usage: number;
  efg: number; ts: number; bpm: number; impact: number;
};
export type Game = {
  id: string; date: string; away: string; home: string;
  awayScore?: number; homeScore?: number; status: "scheduled" | "live" | "final";
};
export type DataStatus = {
  mode: "demo" | "live"; provider: string; updatedAt: string; note: string;
};
