// One college football player's season, as the football pack reads it. Raw season totals
// only: every rate (EPA per dropback, yards per route run, pressure rate...) is derived in
// pack.ts. Offensive linemen are left out on purpose: public box scores have no individual
// OL stats, so there is nothing honest to rank them on.
//
// `null` means the stat doesn't apply to this player (a DB has no passing line), which is
// different from 0 (he did it, zero times). Samples too small to trust are handled by the
// metric `ok` guards in pack.ts, not here.

export type FootballPos = "QB" | "RB" | "WR" | "TE" | "DL" | "LB" | "DB";

export type FootballRow = {
  id: string;
  name: string;
  pos: FootballPos;
  team: { id: string; name: string; short: string; color: string | null; confSlug: string; confName: string };
  /** Games played. This is the exposure that shrinks small samples, and the default floor. */
  games: number;

  // Passing (QBs)
  /** Dropbacks: pass attempts plus sacks taken. */
  pDb: number | null;
  pAtt: number | null;
  pCmp: number | null;
  pYds: number | null;
  pTd: number | null;
  pInt: number | null;
  /** Sacks taken. */
  pSacks: number | null;
  /** Total EPA on dropbacks (a season sum, not per play). */
  pEpa: number | null;
  /** Total air yards on pass attempts. */
  pAir: number | null;

  // Rushing (QBs and RBs)
  rCar: number | null;
  rYds: number | null;
  rTd: number | null;
  /** Total yards after contact. */
  rYac: number | null;
  /** Carries that gained 10+ yards. */
  rRuns10: number | null;
  /** Fumbles lost. */
  rFumL: number | null;
  /** Total rush EPA (a season sum). */
  rEpa: number | null;

  // Receiving (WRs, TEs, and backs who catch passes)
  rcTgt: number | null;
  rcRec: number | null;
  rcYds: number | null;
  rcTd: number | null;
  /** Total yards after catch. */
  rcYac: number | null;
  /** Pass-game routes run. */
  rcRoutes: number | null;
  rcDrops: number | null;
  /** Contested targets: throws with a defender in position to contest. */
  rcCTgt: number | null;
  /** Contested catches. */
  rcCRec: number | null;

  // Defense (DL, LB, DB)
  dTkl: number | null;
  dSolo: number | null;
  dTfl: number | null;
  dSacks: number | null;
  /** Quarterback pressures, including sacks. */
  dPress: number | null;
  /** Pass-rush snaps. Null for DBs, who don't rush the passer. */
  dPassSnaps: number | null;
  dForced: number | null;
  dInt: number | null;
  dPd: number | null;
  /** Targets thrown into his coverage. */
  dTgtA: number | null;
  dCmpA: number | null;
  dYdsA: number | null;
  dMiss: number | null;
};
