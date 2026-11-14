// Deterministic fictional club-soccer rows for tests and the sport lab. Real pages will read a
// data file; these never ship as real players.
import { fakeName, fakeTeams, seeded } from "@/sport-kit/fixtures";
import type { SoccerPos, SoccerRow } from "./types";

/** Per-90 [mean, sd] by position. Outfield stats are zero for keepers, keeper stats zero for outfielders. */
const RATE: Record<string, Record<SoccerPos, [number, number]>> = {
  shots:     { GK: [0, 0], DF: [0.7, 0.3], MF: [1.3, 0.4], FW: [2.6, 0.6] },
  xA:        { GK: [0, 0], DF: [0.07, 0.04], MF: [0.17, 0.07], FW: [0.14, 0.06] },
  keyPasses: { GK: [0, 0], DF: [0.8, 0.3], MF: [1.8, 0.5], FW: [1.1, 0.4] },
  passes:    { GK: [28, 6], DF: [50, 8], MF: [55, 9], FW: [22, 5] },
  prog:      { GK: [1.2, 0.5], DF: [3.6, 1.1], MF: [5.2, 1.2], FW: [2.6, 0.9] },
  carries:   { GK: [0.2, 0.1], DF: [2.2, 0.8], MF: [3.6, 1.0], FW: [2.6, 0.8] },
  boxPass:   { GK: [0, 0], DF: [0.9, 0.4], MF: [2.0, 0.6], FW: [1.6, 0.6] },
  dribbles:  { GK: [0, 0], DF: [1.1, 0.5], MF: [2.4, 0.8], FW: [3.2, 1.0] },
  touchBox:  { GK: [0.3, 0.2], DF: [1.0, 0.4], MF: [2.0, 0.6], FW: [5.0, 1.2] },
  tackles:   { GK: [0.1, 0.1], DF: [1.9, 0.5], MF: [1.6, 0.5], FW: [0.6, 0.3] },
  inter:     { GK: [0.3, 0.2], DF: [1.2, 0.4], MF: [1.0, 0.3], FW: [0.4, 0.2] },
  blocks:    { GK: [0.1, 0.1], DF: [1.0, 0.4], MF: [0.6, 0.3], FW: [0.3, 0.2] },
  recov:     { GK: [1.5, 0.5], DF: [6.8, 1.4], MF: [6.3, 1.3], FW: [3.4, 0.9] },
  aerials:   { GK: [0.3, 0.2], DF: [5.4, 1.4], MF: [3.0, 0.9], FW: [4.4, 1.2] },
  fouls:     { GK: [0.6, 0.3], DF: [1.3, 0.4], MF: [1.3, 0.4], FW: [1.4, 0.4] },
  errors:    { GK: [0.02, 0.02], DF: [0.03, 0.02], MF: [0.03, 0.02], FW: [0.03, 0.02] },
  gkFaced:   { GK: [3.2, 0.5], DF: [0, 0], MF: [0, 0], FW: [0, 0] },
  crosses:   { GK: [1.4, 0.5], DF: [0, 0], MF: [0, 0], FW: [0, 0] },
};

/** Share of aerial duels won, by position. */
const AERIAL_PCT: Record<SoccerPos, number> = { GK: 0.5, DF: 0.55, MF: 0.47, FW: 0.42 };
const round2 = (x: number) => Math.round(x * 100) / 100;

export function fixtures(n = 260): SoccerRow[] {
  const rng = seeded(77);
  const teams = fakeTeams([["prem-test", "Premier Test League"], ["liga-test", "Liga Test"], ["serie-test", "Serie Test"]], 6);
  return Array.from({ length: n }, (_, i) => {
    const t = teams[i % teams.length];
    // 25-slot cycle: 3 keepers, 8 defenders, 8 midfielders, 6 forwards (12 / 32 / 32 / 24%).
    const slot = i % 25;
    const pos: SoccerPos = slot < 3 ? "GK" : slot < 11 ? "DF" : slot < 19 ? "MF" : "FW";
    const gk = pos === "GK";

    const apps = gk ? rng.int(12, 36) : Math.round(rng.normal(22, 9, 1, 38));
    const starts = Math.min(apps, Math.round(apps * rng.normal(gk ? 0.92 : 0.7, 0.12, 0, 1)));
    const minutes = Math.round(starts * rng.normal(82, 6, 50, 90) + (apps - starts) * rng.normal(20, 8, 3, 40));
    const n90 = minutes / 90;

    const rate = (k: string) => { const [m, s] = RATE[k][pos]; return Math.max(0, rng.normal(m, s)) * n90; };
    const count = (k: string) => Math.round(rate(k));

    // Shooting: penalties are part of shots and goals, but not of npxG.
    const shots = count("shots");
    const shotsOt = Math.min(shots, Math.round(shots * rng.normal(0.36, 0.08, 0, 0.8)));
    const penAtt = shots && rng.next() < 0.1 ? Math.min(shots, rng.int(1, 5)) : 0;
    const penScored = Math.min(penAtt, shotsOt, Math.round(penAtt * rng.normal(0.78, 0.2, 0, 1)));
    const xgPerShot = gk ? 0 : rng.normal(pos === "FW" ? 0.13 : pos === "MF" ? 0.085 : 0.07, 0.02, 0.03, 0.4);
    const npShots = shots - penAtt;
    const npxG = round2(npShots * xgPerShot);
    const xG = round2(npxG + penAtt * 0.76);
    const npGoals = Math.min(npShots, shotsOt - penScored, Math.max(0, Math.round(npxG * rng.normal(1, 0.22, 0.5, 1.5))));

    const xA = round2(rate("xA"));
    const assists = Math.max(0, Math.round(xA * rng.normal(0.9, 0.35, 0, 2)));

    // Passing and carrying: completed passes can't exceed attempts, progressive passes can't exceed completions.
    const passAtt = count("passes");
    const passCmp = Math.round(passAtt * rng.normal(gk ? 0.62 : pos === "FW" ? 0.77 : pos === "MF" ? 0.85 : 0.84, 0.04, 0.5, 0.97));
    const progPasses = Math.min(passCmp, count("prog"));
    const keyPasses = Math.min(passCmp, count("keyPasses"));
    const progCarries = count("carries");
    const passIntoBox = count("boxPass");

    const dribbleAtt = count("dribbles");
    const dribbleOk = Math.round(dribbleAtt * rng.normal(0.55, 0.1, 0.1, 0.85));
    const touchBox = count("touchBox");

    // Defending and duels.
    const tacklesWon = count("tackles");
    const interceptions = count("inter");
    const blocks = count("blocks");
    const recoveries = count("recov");
    const aerialTotal = count("aerials");
    const aerialWon = Math.min(aerialTotal, Math.round(aerialTotal * rng.normal(AERIAL_PCT[pos], 0.07, 0.1, 0.9)));
    const fouls = count("fouls");
    const yellows = Math.round(fouls * rng.normal(0.2, 0.08, 0));
    const reds = rng.next() < 0.04 ? 1 : 0;
    const errShot = count("errors");

    // Keeper-only fields: null for outfield players.
    const gkShotsOt = gk ? count("gkFaced") : null;
    const saves = gkShotsOt === null ? null : Math.min(gkShotsOt, Math.round(gkShotsOt * rng.normal(0.71, 0.06, 0.5, 0.92)));
    const goalsConceded = gkShotsOt === null || saves === null ? null : gkShotsOt - saves;
    const psxg = gkShotsOt === null ? null : round2(gkShotsOt * rng.normal(0.31, 0.04, 0.2, 0.45));
    const cleanSheets = gk ? Math.min(starts, Math.round(starts * rng.normal(0.35, 0.08, 0.1, 0.6))) : null;
    const crossesClaimed = gk ? count("crosses") : null;

    return {
      id: `sc${i}`,
      name: fakeName(i),
      pos,
      team: { id: t.id, name: t.name, short: t.short, color: t.color, league: t.group, leagueName: t.groupName },
      apps, starts, minutes,
      goals: npGoals + penScored, npGoals, penScored, penAtt, xG, npxG, xA, assists, shots, shotsOt,
      keyPasses, passAtt, passCmp, progPasses, progCarries, passIntoBox, dribbleOk, dribbleAtt, touchBox,
      tacklesWon, interceptions, blocks, recoveries, aerialWon, aerialTotal, fouls, yellows, reds, errShot,
      gkShotsOt, saves, goalsConceded, psxg, cleanSheets, crossesClaimed,
    };
  });
}
