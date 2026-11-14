// Types for model.mjs (the lineup lab model, shared with scripts/build-lineup-lab.mjs).

/** One player as the lineup lab sees him (see LAB_FIELDS in src/lib/lineup-lab.ts). */
export type LabPlayer = {
  id: string; n: string; t: string; pos: "G" | "F" | "C" | null; ht: number | null; mpg: number; g: number;
  /** DPR offense / defense (points per 100 vs an average D-I player; positive is good on both), its SE, on-court possessions. */
  o: number; d: number; se: number | null; op: number;
  /** Projected skills (display units): 3P%, 3PA per 40 (this season), FT%, AST%, TOV%, USG%, OR%, DR%, BLK%, STL%. */
  tp: number | null; tpa40: number | null; ft: number | null; ast: number | null; tov: number | null; usg: number | null;
  orb: number | null; drb: number | null; blk: number | null; stl: number | null;
};

export type FitAdjustment = { key: "spacing" | "handling" | "usage" | "rim" | "boards"; label: string; side: "off" | "def"; value: number; detail: string };
export type LabWarning = { key: string; level: "high" | "mid" | "low" | "info"; text: string };
export type LineupTraits = {
  shooters: LabPlayer[]; handlers: LabPlayer[]; bigs: LabPlayer[]; guards: number;
  usg: number; drb: number; orb: number; blocker: LabPlayer | null; maxBlk: number; avgHt: number | null; teams: number;
};
export type LineupProjection = {
  base: { off: number; def: number };
  adjustments: FitAdjustment[];
  fit: { off: number; def: number; total: number };
  off: number; def: number; net: number; se: number;
  ptsFor: number; ptsAgainst: number;
  warnings: LabWarning[];
};

export declare const RULES: {
  shooter: { tp: number; tpa40: number };
  spacing: number[];
  handler: { ast: number };
  handling: number[];
  usage: { low: number; high: number; lowPer: number; highPer: number };
  rim: { good: number; ok: number; none: number; thin: number; elite: number; eliteBonus: number };
  boards: { low: number; high: number; lowPer: number; highPer: number; min: number; max: number };
  big: { ht: number };
  smallSample: number;
};
export declare function isShooter(p: LabPlayer): boolean;
export declare function isHandler(p: LabPlayer): boolean;
export declare function isBig(p: LabPlayer): boolean;
export declare function traits(players: LabPlayer[]): LineupTraits;
export declare function fitAdjustments(players: LabPlayer[]): FitAdjustment[];
export declare function warnings(players: LabPlayer[]): LabWarning[];
export declare function projectLineup(players: LabPlayer[], eff: number): LineupProjection;
export declare function observedSd(poss: number): number | null;
export declare function htText(ht: number | null): string;
