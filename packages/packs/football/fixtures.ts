// Deterministic fictional college football rows for tests and the sport lab. Real pages will
// load player data from a feed; these never ship as real players. Shapes follow the box
// score and play-by-play fields in types.ts: QBs have passing and some rushing, backs and
// receivers have rushing and receiving, defenders have defense only. Offensive linemen are
// not in the data at all.
import { fakeName, fakeTeams, seeded } from "@sports/kit/fixtures";
import type { FootballPos, FootballRow } from "./types";

type Stats = Omit<FootballRow, "id" | "name" | "pos" | "jersey" | "headshot" | "team" | "games">;

/** Every stat null: a position only fills in the lines that apply to it. */
const NONE: Stats = {
  pAtt: null, pCmp: null, pYds: null, pTd: null, pInt: null, pSacks: null, pSackYds: null,
  pDeepAtt: null, pDeepCmp: null, pAir: null, pAirAtt: null, pFirst: null,
  rCar: null, rYds: null, rTd: null, rLong: null, rRuns10: null, rStuffs: null, rFirst: null, rFumL: null,
  rcTgt: null, rcRec: null, rcYds: null, rcTd: null, rcLong: null, rcAir: null, rcYac: null,
  rcDeepTgt: null, rcDeepRec: null, rcFirst: null,
  dTkl: null, dSolo: null, dTfl: null, dSacks: null, dHur: null, dPd: null, dInt: null, dTd: null,
};

/** A 100-slot position mix: 12% QB, 12% RB, 20% WR, 8% TE, 15% DL, 15% LB, 18% DB. */
const rep = (p: FootballPos, n: number) => Array<FootballPos>(n).fill(p);
const MIX: FootballPos[] = [
  ...rep("QB", 12), ...rep("RB", 12), ...rep("WR", 20), ...rep("TE", 8),
  ...rep("DL", 15), ...rep("LB", 15), ...rep("DB", 18),
];

export function fixtures(n = 500): FootballRow[] {
  const rng = seeded(2026);
  const teams = fakeTeams([["test-ten", "Test Ten"], ["mock-twelve", "Mock Twelve"], ["sample-sec", "Sample Conference"]], 6);
  const r = (x: number) => Math.round(x);

  // Passing line for a quarterback over g games.
  const passing = (g: number): Partial<Stats> => {
    const att = r(g * rng.normal(31, 5, 10, 50));
    const sacks = r(att * rng.normal(0.065, 0.02, 0.01, 0.14));
    const ypa = rng.normal(7.3, 1, 3.5, 11);
    const deepAtt = r(att * rng.normal(0.13, 0.04, 0.03, 0.25));
    const airAtt = r(att * rng.normal(0.85, 0.08, 0.5, 1));
    return {
      pAtt: att,
      pCmp: Math.min(att, r(att * rng.normal(0.64, 0.05, 0.42, 0.8))),
      pYds: r(att * ypa),
      pTd: r(att * rng.normal(0.05, 0.015, 0, 0.12)),
      pInt: r(att * rng.normal(0.022, 0.008, 0, 0.06)),
      pSacks: sacks,
      pSackYds: r(sacks * rng.normal(6.4, 0.8, 3, 10)),
      pDeepAtt: deepAtt,
      pDeepCmp: Math.min(deepAtt, r(deepAtt * rng.normal(0.45, 0.1, 0.15, 0.75))),
      pAir: r(airAtt * rng.normal(7.2, 1.1, 3, 11)),
      pAirAtt: airAtt,
      pFirst: r(att * rng.normal(0.23, 0.04, 0.1, 0.4)),
    };
  };

  // Rushing line. Explosive runs rise with yards per carry; stuffs fall as it rises.
  const carrying = (carries: number, ypc: number): Partial<Stats> => ({
    rCar: carries,
    rYds: r(carries * ypc),
    rTd: r(carries * rng.normal(0.04, 0.02, 0)),
    rLong: r(rng.normal(18, 8, 0, 80)),
    rRuns10: r(carries * rng.normal(0.03 + (ypc - 4.5) * 0.025, 0.012, 0.005, 0.2)),
    rStuffs: r(carries * rng.normal(0.18 - (ypc - 4.5) * 0.02, 0.04, 0.02, 0.4)),
    rFirst: r(carries * rng.normal(0.22, 0.05, 0.05, 0.4)),
    rFumL: r(carries * rng.normal(0.006, 0.005, 0)),
  });

  // Receiving line. Catch rate is a share of targets, so catches can never exceed targets.
  // Yards after catch are yards minus air yards, floored at zero.
  const catching = (tgt: number, catchRate: number, ypr: number, aDot: number, deepShare: number): Partial<Stats> => {
    const rec = r(tgt * catchRate);
    const yds = r(rec * ypr);
    const air = r(rec * aDot);
    const deepT = r(tgt * deepShare * rng.normal(1, 0.3, 0.2, 1.8));
    const deepR = Math.min(deepT, r(deepT * rng.normal(0.5, 0.2, 0, 1)));
    return {
      rcTgt: tgt,
      rcRec: rec,
      rcYds: yds,
      rcTd: r(rec * rng.normal(0.06, 0.03, 0)),
      rcLong: r(rng.normal(ypr * 2.5, 8, ypr, 90)),
      rcAir: air,
      rcYac: Math.max(0, yds - air),
      rcDeepTgt: deepT,
      rcDeepRec: deepR,
      rcFirst: Math.min(rec, r(rec * rng.normal(0.42, 0.08, 0.1, 0.8))),
    };
  };

  // Defensive line for a defender over g games. Coverage stats are only the ones the box score carries.
  const defense = (pos: "DL" | "LB" | "DB", g: number): Partial<Stats> => {
    const per = (mean: number, sd: number, lo = 0) => g * rng.normal(mean, sd, lo);
    const tkl = r(pos === "DL" ? per(3, 1, 0.5) : pos === "LB" ? per(7, 1.8, 2) : per(4.5, 1.5, 1));
    return {
      dTkl: tkl,
      dSolo: r(tkl * rng.normal(0.55, 0.08, 0.2, 0.9)),
      dTfl: r(pos === "DL" ? per(0.7, 0.35) : pos === "LB" ? per(0.5, 0.25) : per(0.15, 0.12)),
      dSacks: r(pos === "DL" ? per(0.45, 0.25) : pos === "LB" ? per(0.15, 0.12) : 0),
      dHur: r(pos === "DL" ? per(2.2, 0.9) : pos === "LB" ? per(0.6, 0.3) : per(0.2, 0.15)),
      dPd: r(pos === "DL" ? per(0.05, 0.05) : pos === "LB" ? per(0.2, 0.15) : per(0.8, 0.4)),
      dInt: r(pos === "DL" ? 0 : pos === "LB" ? per(0.05, 0.05) : per(0.2, 0.15)),
      dTd: r(pos === "DB" ? per(0.01, 0.02) : 0),
    };
  };

  return Array.from({ length: n }, (_, i) => {
    const t = teams[i % teams.length];
    const pos = MIX[(i * 37) % MIX.length];
    const g = rng.int(2, 13);
    let s: Partial<Stats>;

    if (pos === "QB") {
      s = { ...passing(g), ...carrying(r(g * rng.normal(3, 1.5, 0, 8)), rng.normal(4.8, 1.5, 1, 12)) };
    } else if (pos === "RB") {
      s = {
        ...carrying(r(g * rng.normal(14, 4, 3, 28)), rng.normal(4.7, 0.7, 2, 8)),
        ...catching(r(g * rng.normal(2.3, 1.1, 0, 7)), rng.normal(0.76, 0.08, 0.4, 1), rng.normal(7.2, 1.2, 2, 14), rng.normal(1.5, 1, -2, 6), 0.03),
      };
    } else if (pos === "WR") {
      s = catching(r(g * rng.normal(6.6, 2.2, 0, 15)), rng.normal(0.62, 0.08, 0.3, 0.9), rng.normal(12.5, 2.5, 6, 22), rng.normal(9.5, 2.5, 2, 18), 0.17);
    } else if (pos === "TE") {
      s = catching(r(g * rng.normal(3, 1.2, 0, 8)), rng.normal(0.66, 0.08, 0.3, 0.95), rng.normal(10, 2.5, 2, 20), rng.normal(6, 2, 0, 14), 0.08);
    } else {
      s = defense(pos, g);
    }

    return {
      ...NONE,
      ...s,
      id: `fb${i}`,
      name: fakeName(i),
      pos,
      jersey: String(rng.int(1, 99)),
      headshot: null,
      team: { id: t.id, name: t.name, short: t.short, abbr: t.short, color: t.color, altColor: null, logo: null, confSlug: t.group, confName: t.groupName },
      games: g,
    };
  });
}
