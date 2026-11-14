// One club-soccer player's season: an outfield player or a goalkeeper. Raw season totals only;
// the pack turns them into per-90 rates. GK-only fields are null for outfield players.

export type SoccerPos = "GK" | "DF" | "MF" | "FW";

export type SoccerTeam = {
  id: string;
  name: string;
  short: string;
  color: string | null;
  /** League slug, matches a value in the pack's "league" list. */
  league: string;
  leagueName: string;
};

export type SoccerRow = {
  id: string;
  name: string;
  pos: SoccerPos;
  team: SoccerTeam;
  apps: number;
  starts: number;
  /** Total minutes on the pitch. Exposure for shrinkage and the minimum-minutes filter. */
  minutes: number;

  goals: number;
  npGoals: number;
  penScored: number;
  penAtt: number;
  xG: number;
  npxG: number;
  xA: number;
  assists: number;
  shots: number;
  shotsOt: number;

  keyPasses: number;
  passAtt: number;
  passCmp: number;
  progPasses: number;
  progCarries: number;
  passIntoBox: number;
  dribbleOk: number;
  dribbleAtt: number;
  touchBox: number;

  tacklesWon: number;
  interceptions: number;
  blocks: number;
  recoveries: number;
  aerialWon: number;
  aerialTotal: number;
  fouls: number;
  yellows: number;
  reds: number;
  /** Errors that led to a shot against. */
  errShot: number;

  /** Goalkeepers only: shots on target faced. */
  gkShotsOt: number | null;
  saves: number | null;
  goalsConceded: number | null;
  /** Post-shot xG faced. */
  psxg: number | null;
  cleanSheets: number | null;
  crossesClaimed: number | null;
};
