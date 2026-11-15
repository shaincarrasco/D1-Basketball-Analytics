// A player's season file (p/<id>.json) and the sums the player page charts are drawn from.
export type MatchStats = { sp: number; fi: number; fw: number; sw: number; rp: number; rw: number; rf: number; rfw: number; rsw: number; sg: number; sgw: number; bpf: number; bps: number; rg: number; rgw: number; bpc: number; bpv: number; ac: number; df: number };
export type SeasonMatch = { d: string; ev: string; eid: string; lv: string; sf: string; rd: string; oid: string; opp: string; ork: number | null; w: boolean; sc: string; s: MatchStats };
export type Season = { id: string; matches: SeasonMatch[] };

export type Totals = MatchStats & { n: number; wins: number };
export function sum(ms: SeasonMatch[]): Totals {
  const t = { n: ms.length, wins: 0, sp: 0, fi: 0, fw: 0, sw: 0, rp: 0, rw: 0, rf: 0, rfw: 0, rsw: 0, sg: 0, sgw: 0, bpf: 0, bps: 0, rg: 0, rgw: 0, bpc: 0, bpv: 0, ac: 0, df: 0 } as Totals;
  for (const m of ms) { if (m.w) t.wins++; for (const k of Object.keys(m.s) as (keyof MatchStats)[]) t[k] += m.s[k] ?? 0; }
  return t;
}
export const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
export const spw = (t: MatchStats) => ratio(t.fw + t.sw, t.sp);
export const rpw = (t: MatchStats) => ratio(t.rw, t.rp);

export const SURFACES = ["hard", "clay", "grass"] as const;
export const surfaceColor = (s: string) => `var(--${(SURFACES as readonly string[]).includes(s) ? s : "other"})`;

const ROUND: [RegExp, string, number][] = [
  [/^final$/i, "F", 9], [/semi/i, "SF", 8], [/quarter/i, "QF", 7], [/round of 16|4th round|fourth/i, "R16", 6], [/round of 32|3rd round|third/i, "R32", 5],
  [/round of 64|2nd round|second/i, "R64", 4], [/round of 128|1st round|first/i, "R128", 3], [/round robin/i, "RR", 6], [/qualif/i, "Q", 1],
];
const roundInfo = (r: string) => ROUND.find(([re]) => re.test(r)) ?? [/./, r.slice(0, 4), 2] as const;
export type Event = { eid: string; name: string; level: string; surface: string; start: string; matches: SeasonMatch[]; result: string; wins: number; losses: number };
/** Group matches into tournaments in date order; result = "W" for a title, else the furthest round reached. */
export function events(ms: SeasonMatch[]): Event[] {
  const m = new Map<string, SeasonMatch[]>();
  for (const x of ms) (m.get(x.eid) ?? m.set(x.eid, []).get(x.eid)!).push(x);
  return [...m.values()].map(list => {
    const last = list.reduce((a, b) => (roundInfo(b.rd)[2] >= roundInfo(a.rd)[2] ? b : a));
    const won = list.filter(x => x.w).length;
    const result = /^final$/i.test(last.rd) && last.w ? "W" : roundInfo(last.rd)[1];
    return { eid: list[0].eid, name: list[0].ev, level: list[0].lv, surface: list[0].sf, start: list[0].d, matches: list, result, wins: won, losses: list.length - won };
  }).sort((a, b) => a.start.localeCompare(b.start));
}
export const pct = (v: number | null, d = 0) => (v === null ? "—" : `${(v * 100).toFixed(d)}%`);
