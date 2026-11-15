// One college football player's season, as the football pack reads it. Raw season totals
// only; every rate is derived in pack.ts. Box-score fields come from ESPN game summaries;
// fields marked (pbp) are counted from play-by-play text, which records each pass's depth
// (short/deep), direction (left/middle/right) and the spot it was caught or thrown to.
// Offensive linemen and specialists are left out: there are no individual stats to rank.
//
// `null` means the stat doesn't apply to this player (a DB has no passing line), which is
// different from 0 (he did it, zero times).

export type FootballPos = "QB" | "RB" | "WR" | "TE" | "DL" | "LB" | "DB";

export type FootballRow = {
  /** ESPN athlete id. */
  id: string;
  name: string;
  pos: FootballPos;
  jersey: string | null;
  headshot: string | null;
  team: { id: string; name: string; short: string; abbr: string; color: string | null; altColor: string | null; logo: string | null; confSlug: string; confName: string };
  /** Games with at least one stat. The exposure that shrinks small samples, and the default floor. */
  games: number;

  // Passing
  pAtt: number | null;
  pCmp: number | null;
  pYds: number | null;
  pTd: number | null;
  pInt: number | null;
  /** Sacks taken and yards lost to them (pbp). */
  pSacks: number | null;
  pSackYds: number | null;
  /** Passes thrown deep (pbp: "pass ... deep ..."), and deep completions. */
  pDeepAtt: number | null;
  pDeepCmp: number | null;
  /** Air yards to the catch or throw spot on attempts where the spot is recorded (pbp), and how many such attempts. */
  pAir: number | null;
  pAirAtt: number | null;
  /** Passing first downs (pbp). */
  pFirst: number | null;

  // Rushing
  rCar: number | null;
  rYds: number | null;
  rTd: number | null;
  rLong: number | null;
  /** Carries of 10+ yards, carries for no gain or a loss, and rushing first downs (pbp). */
  rRuns10: number | null;
  rStuffs: number | null;
  rFirst: number | null;
  /** Fumbles lost (any touch). */
  rFumL: number | null;

  // Receiving
  /** Targets: completions plus incompletions thrown to him (pbp). */
  rcTgt: number | null;
  rcRec: number | null;
  rcYds: number | null;
  rcTd: number | null;
  rcLong: number | null;
  /** Air yards (line of scrimmage to catch spot) and yards after catch on his receptions (pbp). */
  rcAir: number | null;
  rcYac: number | null;
  /** Deep targets and deep receptions, and receiving first downs (pbp). */
  rcDeepTgt: number | null;
  rcDeepRec: number | null;
  rcFirst: number | null;

  // Defense
  dTkl: number | null;
  dSolo: number | null;
  dTfl: number | null;
  dSacks: number | null;
  /** Quarterback hurries. */
  dHur: number | null;
  dPd: number | null;
  dInt: number | null;
  dTd: number | null;
};
