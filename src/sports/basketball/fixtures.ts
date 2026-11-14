// Deterministic fictional basketball rows for tests and the sport lab. Real pages use
// useBasketball() (public/data/players.json); these never ship as real players.
import { derive, type PlayerRow } from "@/app/players/player-stats";
import type { Player, TeamSummary } from "@/lib/types";
import { fakeName, fakeTeams, seeded } from "@/sport-kit/fixtures";

export function fixtures(n = 160): PlayerRow[] {
  const rng = seeded(41);
  const teams = fakeTeams([["east-test", "East Test League"], ["west-test", "West Test League"], ["north-test", "North Test League"]]);
  return Array.from({ length: n }, (_, i) => {
    const t = teams[i % teams.length];
    const pos = rng.pick(["PG", "SG", "SF", "PF", "C"]);
    const big = pos === "PF" || pos === "C";
    const g = rng.int(3, 12), min = rng.normal(22, 7, 4, 38);
    const fga = Math.round(g * min * rng.normal(0.32, 0.08, 0.1)), fgm = Math.round(fga * rng.normal(big ? 0.52 : 0.44, 0.06, 0.2, 0.75));
    const tpa = big ? Math.round(fga * rng.normal(0.08, 0.06, 0)) : Math.round(fga * rng.normal(0.42, 0.12, 0)), tpm = Math.round(tpa * rng.normal(0.34, 0.07, 0, 0.6));
    const fta = Math.round(fga * rng.normal(0.32, 0.12, 0)), ftm = Math.round(fta * rng.normal(0.72, 0.09, 0.3, 0.98));
    const rimA = Math.round((fga - tpa) * rng.normal(big ? 0.65 : 0.4, 0.1, 0, 1)), midA = Math.max(0, fga - tpa - rimA);
    const pts = (2 * (fgm - tpm) + 3 * tpm + ftm) / g;
    const per = (rate: number, sd: number) => Math.max(0, rng.normal(rate, sd)) * min / 40;
    const onPoss = Math.round(g * min * 1.75);
    const dprO = rng.normal(0, 2.4), dprD = rng.normal(0, 2.0);
    const p: Player = {
      id: `bb${i}`, name: fakeName(i), teamId: t.id, pos, g, gs: Math.min(g, rng.int(0, g)), min,
      pts, reb: per(big ? 11 : 6, 2), orb: per(big ? 3.5 : 1.2, 0.8), drb: per(big ? 7.5 : 4.5, 1.5), ast: per(big ? 1.8 : 4.5, 1.6),
      stl: per(1.4, 0.5), blk: per(big ? 2.2 : 0.4, 0.5), tov: per(2.6, 0.8), pf: per(3.2, 0.9),
      usg: rng.normal(20, 4.5, 8, 36), ortg: rng.normal(106, 10, 70, 140), drtg: rng.normal(103, 6, 85, 125), net: null, porpag: rng.normal(1.6, 1.4, -2),
      efg: fga ? ((fgm + 0.5 * tpm) / fga) * 100 : null, ts: fga + fta ? (pts * g / (2 * (fga + 0.44 * fta))) * 100 : null,
      fgm, fga, tpm, tpa, ftm, fta, ws: null, ws40: rng.normal(0.11, 0.05), orbPct: rng.normal(big ? 9 : 3, 2, 0), ftr: fga ? (fta / fga) * 100 : null,
      rimA, rimM: Math.round(rimA * rng.normal(0.6, 0.08, 0.2, 0.95)), midA, midM: Math.round(midA * rng.normal(0.38, 0.07, 0.1, 0.7)), thrA: tpa, thrM: tpm,
      astd: rng.normal(55, 18, 0, 100), dunks: big ? rng.int(0, 15) : rng.int(0, 3),
      dpr: dprO + dprD, dprO, dprD, dprSE: 2, onPoss, stars: rng.pick([null, null, 3, 4, 5]), recRank: null, recYear: null, dprRank: null,
    };
    p.net = p.ortg !== null && p.drtg !== null ? p.ortg - p.drtg : null;
    const team = { id: t.id, name: t.name, short: t.short, color: t.color, altColor: null, logo: null, confSlug: t.group, confName: t.groupName } as unknown as TeamSummary;
    return derive(p, team);
  });
}
