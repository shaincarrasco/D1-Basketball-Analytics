// Roster position abbreviations to the football pack's positions. Anything not listed (OL, K, P, LS, ATH...)
// returns null and is decided from the player's stats in build.mjs.
const MAP = {
  QB: "QB",
  RB: "RB", FB: "RB", HB: "RB",
  WR: "WR",
  TE: "TE",
  DE: "DL", DT: "DL", NT: "DL", DL: "DL", EDGE: "DL",
  LB: "LB", ILB: "LB", OLB: "LB", MLB: "LB",
  CB: "DB", S: "DB", FS: "DB", SS: "DB", DB: "DB", NB: "DB",
};

export const mapRosterPos = (abbr) => MAP[abbr] ?? null;
