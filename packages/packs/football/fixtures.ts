// Deterministic fictional college football rows for tests and the sport lab. Real pages will
// load player data from a feed; these never ship as real players. Shapes follow the box
// score: QBs have passing and some rushing, backs and receivers have rushing and receiving,
// defenders have defense only. Offensive linemen are not in the data at all.
import { fakeName, fakeTeams, seeded } from "@sports/kit/fixtures";
import type { FootballPos, FootballRow } from "./types";

type Stats = Omit<FootballRow, "id" | "name" | "pos" | "team" | "games">;

/** Every stat null: a position only fills in the lines that apply to it. */
const NONE: Stats = {
  pDb: null, pAtt: null, pCmp: null, pYds: null, pTd: null, pInt: null, pSacks: null, pEpa: null, pAir: null,
  rCar: null, rYds: null, rTd: null, rYac: null, rRuns10: null, rFumL: null, rEpa: null,
  rcTgt: null, rcRec: null, rcYds: null, rcTd: null, rcYac: null, rcRoutes: null, rcDrops: null, rcCTgt: null, rcCRec: null,
  dTkl: null, dSolo: null, dTfl: null, dSacks: null, dPress: null, dPassSnaps: null, dForced: null, dInt: null, dPd: null, dTgtA: null, dCmpA: null, dYdsA: null, dMiss: null,
};

/** A 100-slot position mix: 12% QB, 14% RB, 21% WR, 8% TE, 16% DL, 16% LB, 13% DB. */
const rep = (p: FootballPos, n: number) => Array<FootballPos>(n).fill(p);
const MIX: FootballPos[] = [
  ...rep("QB", 12), ...rep("RB", 14), ...rep("WR", 21), ...rep("TE", 8),
  ...rep("DL", 16), ...rep("LB", 16), ...rep("DB", 13),
];

export function fixtures(n = 420): FootballRow[] {
  const rng = seeded(2026);
  const teams = fakeTeams([["test-ten", "Test Ten"], ["mock-twelve", "Mock Twelve"], ["sample-sec", "Sample Conference"]], 6);
  const r = (x: number) => Math.round(x);

  // Rushing line from carries and yards per carry.
  const rush = (carries: number, ypc: number): Partial<Stats> => ({
    rCar: carries, rYds: r(carries * ypc), rTd: r(carries * rng.normal(0.05, 0.02, 0)),
    rYac: r(carries * ypc * rng.normal(0.55, 0.08, 0.2, 0.9)), rRuns10: r(carries * rng.normal(0.06, 0.02, 0)),
    rFumL: r(carries * rng.normal(0.008, 0.006, 0)), rEpa: carries * ((ypc - 4.6) * 0.05 + rng.normal(0, 0.05)),
  });

  // Receiving line. Catch rate is a share of targets, so catches can never exceed targets.
  const receiving = (g: number, tgt: number, catchRate: number, ypr: number, routesPerGame: number): Partial<Stats> => {
    const rec = r(tgt * catchRate), cTgt = r(tgt * rng.normal(0.22, 0.06, 0));
    return {
      rcTgt: tgt, rcRec: rec, rcYds: r(rec * ypr), rcTd: r(rec * rng.normal(0.06, 0.03, 0)),
      rcYac: r(rec * rng.normal(4.6, 1.4, 0)), rcRoutes: r(g * routesPerGame), rcDrops: r(tgt * rng.normal(0.04, 0.02, 0)),
      rcCTgt: cTgt, rcCRec: r(cTgt * rng.normal(0.47, 0.15, 0, 1)),
    };
  };

  return Array.from({ length: n }, (_, i) => {
    const t = teams[i % teams.length];
    const pos = MIX[(i * 37) % MIX.length];
    const g = rng.int(2, 13);
    let s: Partial<Stats>;

    if (pos === "QB") {
      const att = r(g * rng.normal(31, 5, 10, 50));
      const sacks = r(att * rng.normal(0.065, 0.02, 0.01, 0.14));
      const ypa = rng.normal(7.3, 1, 3.5, 11);
      const dbk = att + sacks;
      s = {
        pDb: dbk, pAtt: att, pCmp: Math.min(att, r(att * rng.normal(0.64, 0.05, 0.42, 0.8))), pYds: r(att * ypa),
        pTd: r(att * rng.normal(0.05, 0.015, 0, 0.12)), pInt: r(att * rng.normal(0.022, 0.008, 0, 0.06)), pSacks: sacks,
        pEpa: dbk * (0.1 + (ypa - 7.3) * 0.04 + rng.normal(0, 0.12)), pAir: r(att * rng.normal(7.2, 1.1, 3, 11)),
        ...rush(r(g * rng.normal(1.6, 1, 0, 4)), rng.normal(4.6, 1.5, 1, 12)),
      };
    } else if (pos === "RB") {
      s = {
        ...rush(r(g * rng.normal(13.5, 4, 3, 28)), rng.normal(4.7, 0.7, 2, 8)),
        ...receiving(g, r(g * rng.normal(2.3, 1.1, 0, 7)), rng.normal(0.76, 0.08, 0.4, 1), 7.2, 18),
      };
    } else if (pos === "WR") {
      s = receiving(g, r(g * rng.normal(6.6, 2.2, 0, 15)), rng.normal(0.62, 0.08, 0.3, 0.9), rng.normal(12.5, 2.5, 3, 25), rng.normal(30, 5, 15, 45));
    } else if (pos === "TE") {
      s = receiving(g, r(g * rng.normal(3, 1.2, 0, 8)), rng.normal(0.66, 0.08, 0.3, 0.95), rng.normal(10, 2.5, 2, 20), rng.normal(22, 5, 10, 32));
    } else {
      // Defenders. Pass-rush snaps are null for DBs; coverage lines are null for DLs.
      const tkl = r(g * (pos === "DL" ? rng.normal(3, 1, 0.5, 7) : pos === "LB" ? rng.normal(7, 1.8, 2, 12) : rng.normal(5, 1.6, 1, 9)));
      const sacks = pos === "DL" ? r(g * rng.normal(0.45, 0.25, 0)) : pos === "LB" ? r(g * rng.normal(0.15, 0.12, 0)) : 0;
      const passSnaps = pos === "DB" ? null : r(g * (pos === "DL" ? rng.normal(24, 7, 5, 40) : rng.normal(10, 4, 0, 25)));
      const press = passSnaps === null ? null : Math.max(sacks, r(passSnaps * (pos === "DL" ? rng.normal(0.11, 0.03, 0.02, 0.25) : rng.normal(0.08, 0.03, 0, 0.2))));
      const tgtA = pos === "DL" ? null : r(g * (pos === "LB" ? rng.normal(3, 1.2, 0) : rng.normal(4.8, 1.6, 0)));
      const cmpA = tgtA === null ? null : Math.min(tgtA, r(tgtA * rng.normal(0.64, 0.08, 0.3, 0.9)));
      const ydsA = tgtA === null || cmpA === null ? null : Math.max(cmpA, r(tgtA * rng.normal(7, 1.3, 2, 12)));
      s = {
        dTkl: tkl, dSolo: r(tkl * rng.normal(0.55, 0.08, 0.2, 0.9)), dMiss: r(tkl * rng.normal(0.12, 0.04, 0.02)),
        dTfl: r(g * (pos === "DL" ? rng.normal(0.7, 0.35, 0) : pos === "LB" ? rng.normal(0.5, 0.25, 0) : rng.normal(0.15, 0.12, 0))),
        dSacks: sacks, dPress: press, dPassSnaps: passSnaps, dForced: r(g * rng.normal(0.04, 0.04, 0)),
        dInt: pos === "DL" ? 0 : r(g * (pos === "DB" ? rng.normal(0.2, 0.15, 0) : rng.normal(0.04, 0.04, 0))),
        dPd: pos === "DL" ? 0 : r(g * (pos === "DB" ? rng.normal(0.8, 0.4, 0) : rng.normal(0.2, 0.15, 0))),
        dTgtA: tgtA, dCmpA: cmpA, dYdsA: ydsA,
      };
    }

    return {
      ...NONE,
      ...s,
      id: `fb${i}`,
      name: fakeName(i),
      pos,
      team: { id: t.id, name: t.name, short: t.short, color: t.color, confSlug: t.group, confName: t.groupName },
      games: g,
    };
  });
}
