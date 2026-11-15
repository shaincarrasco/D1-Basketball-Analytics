// Per-player season files (p/<id>.json) and a tournament list (events.json) for the
// player pages' by-tournament / by-surface charts and the tournaments page.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { estimateMatch } from "./model.mjs";

const r1 = (v) => Math.round(v * 10) / 10;
// Compact per-match stat keys (estimated service/return points, counts are exact).
const pick = (s, st) => ({
  sp: r1(s.servicePoints), fi: r1(s.firstServesIn), fw: r1(s.firstServePointsWon), sw: r1(s.secondServePointsWon),
  rp: r1(s.returnPoints), rw: r1(s.returnPointsWon), rf: r1(s.returnFirstPointsPlayed), rfw: r1(s.returnFirstPointsWon), rsw: r1(s.returnSecondPointsWon),
  sg: r1(s.serviceGames), sgw: r1(s.serviceGamesWon), bpf: s.breakPointsFaced, bps: s.breakPointsSaved,
  rg: r1(s.returnGames), rgw: r1(s.returnGamesWon), bpc: s.breakPointChances, bpv: s.breakPointsConverted,
  ac: st.aces, df: st.df,
});

export async function writeSeasonFiles(outDir, perTour) {
  const byPlayer = new Map();
  const events = new Map();
  for (const [tour, { records }] of Object.entries(perTour)) {
    const label = tour === "atp" ? "men" : "women";
    for (const rec of records) {
      const est = estimateMatch(rec);
      const ek = `${tour}-${rec.eventId}`;
      const e = events.get(ek) ?? { id: ek, tour: label, name: rec.event, level: rec.level, surface: rec.surface, start: rec.date, end: rec.date, matches: 0, final: null };
      e.matches++; if (rec.date < e.start) e.start = rec.date; if (rec.date > e.end) e.end = rec.date;
      if (/^final$/i.test(rec.round)) {
        const w = rec.winner === 1 ? rec.p1 : rec.p2, l = rec.winner === 1 ? rec.p2 : rec.p1;
        const wg = rec.winner === 1 ? rec.g1 : rec.g2, lg = rec.winner === 1 ? rec.g2 : rec.g1;
        e.final = { winner: { id: w.id, name: w.name }, runnerUp: { id: l.id, name: l.name }, score: wg.map((g, i) => `${g}-${lg[i]}`).join(" ") };
      }
      events.set(ek, e);
      for (const [me, opp, won, mine, theirs, side] of [[rec.p1, rec.p2, rec.winner === 1, rec.g1, rec.g2, est.p1], [rec.p2, rec.p1, rec.winner === 2, rec.g2, rec.g1, est.p2]]) {
        const list = byPlayer.get(me.id) ?? byPlayer.set(me.id, []).get(me.id);
        list.push({ d: rec.date, ev: rec.event, eid: ek, lv: rec.level, sf: rec.surface, rd: rec.round, oid: opp.id, opp: opp.name, ork: opp.place ?? null, w: won, sc: mine.map((g, i) => `${g}-${theirs[i]}`).join(" "), s: pick(side, me.st) });
      }
    }
  }
  const dir = path.join(outDir, "p");
  await mkdir(dir, { recursive: true });
  for (const [id, list] of byPlayer) {
    list.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    await writeFile(path.join(dir, `${id}.json`), JSON.stringify({ id, matches: list }));
  }
  const ev = [...events.values()].sort((a, b) => (a.start < b.start ? 1 : -1));
  await writeFile(path.join(outDir, "events.json"), JSON.stringify({ events: ev }));
  return { players: byPlayer.size, events: ev.length };
}
