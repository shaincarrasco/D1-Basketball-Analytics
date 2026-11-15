// Race to the year-end finals, calculated from this season's main-tour results: for each
// tournament, the round a player reached times that level's official points table.
// Not counted (not in our feed): Challenger/WTA 125/ITF events, qualifying rounds, team events.
import { writeFile } from "node:fs/promises";
import path from "node:path";

// Points for the round a player went out in (or W for the title). Main draw only.
const TABLES = {
  atp: {
    "Grand Slam":       { W: 2000, F: 1300, SF: 800, QF: 400, R16: 200, R32: 100, R64: 50, R128: 10 },
    "ATP Masters 1000": { W: 1000, F: 650, SF: 400, QF: 200, R16: 100, R32: 50, R64: 30, R128: 10 },
    "ATP 500":          { W: 500, F: 330, SF: 200, QF: 100, R16: 50, R32: 25 },
    "ATP 250":          { W: 250, F: 165, SF: 100, QF: 50, R16: 25, R32: 13 },
  },
  wta: {
    "Grand Slam": { W: 2000, F: 1300, SF: 780, QF: 430, R16: 240, R32: 130, R64: 70, R128: 10 },
    "WTA 1000":   { W: 1000, F: 650, SF: 390, QF: 215, R16: 120, R32: 65, R64: 35, R128: 10 },
    "WTA 500":    { W: 500, F: 325, SF: 195, QF: 108, R16: 60, R32: 32 },
    "WTA 250":    { W: 250, F: 163, SF: 98, QF: 54, R16: 30, R32: 1 },
  },
};
const FINALS = {
  atp: { name: "ATP Finals", city: "Turin", race: "Race to Turin", cutoff: /paris/i, slots: 8, slamRule: true },
  wta: { name: "WTA Finals", city: "Riyadh", race: "Race to the WTA Finals", cutoff: /tokyo|guangzhou|pan pacific/i, slots: 8, slamRule: false },
};
const RANK = [[/^final$/i, "F"], [/semi/i, "SF"], [/quarter/i, "QF"], [/round of 16|4th round|fourth/i, "R16"], [/round of 32|3rd round|third/i, "R32"], [/round of 64|2nd round|second/i, "R64"], [/round of 128|1st round|first/i, "R128"]];
const ORDER = ["R128", "R64", "R32", "R16", "QF", "SF", "F", "W"];
const roundOf = (r) => (RANK.find(([re]) => re.test(r)) ?? [null, null])[1];
// Best results that count, as in the official rankings (main-tour events only here).
const COUNT = 18;

function levelKey(tour, level) {
  const t = TABLES[tour];
  if (t[level]) return level;
  if (/grand slam/i.test(level)) return "Grand Slam";
  if (/1000/.test(level)) return tour === "atp" ? "ATP Masters 1000" : "WTA 1000";
  if (/500/.test(level)) return tour === "atp" ? "ATP 500" : "WTA 500";
  if (/250/.test(level)) return tour === "atp" ? "ATP 250" : "WTA 250";
  return null; // finals, team events, exhibitions: not race events
}

export async function writeRace(outDir, perTour, updated) {
  const out = { updated, note: "Calculated from main-tour results (Grand Slams, 1000, 500, 250). Challenger/125/ITF, qualifying and team events are not included." };
  for (const [tour, { records, standings }] of Object.entries(perTour)) {
    const label = tour === "atp" ? "men" : "women", cfg = FINALS[tour];
    // The race closes after the cutoff event (Paris for the men, Tokyo/Guangzhou for the women).
    const cut = records.filter((r) => cfg.cutoff.test(r.event)).reduce((d, r) => (r.date > d ? r.date : d), "");
    const inRace = records.filter((r) => !/qualif/i.test(r.round) && (!cut || r.date <= cut));
    const best = new Map(); // player -> event -> { round, ... }
    const info = new Map();
    for (const r of inRace) {
      const lk = levelKey(tour, r.level); if (!lk) continue;
      for (const [me, won] of [[r.p1, r.winner === 1], [r.p2, r.winner === 2]]) {
        let rd = roundOf(r.round); if (!rd) continue;
        if (rd === "F" && won) rd = "W";
        info.set(me.id, { name: me.name, country: me.country });
        const evs = best.get(me.id) ?? best.set(me.id, new Map()).get(me.id);
        const prev = evs.get(r.eventId);
        // Furthest round reached; a win in a round means they reached the next one.
        const reached = won && rd !== "W" ? ORDER[ORDER.indexOf(rd) + 1] : rd;
        if (!prev || ORDER.indexOf(reached) > ORDER.indexOf(prev.result)) evs.set(r.eventId, { event: r.event, level: lk, surface: r.surface, date: r.date, result: reached });
      }
    }
    const rankOf = new Map((standings ?? []).map((s) => [String(s.team?.player1?.id), s.place]));
    const rows = [...best].map(([id, evs]) => {
      const res = [...evs.values()].map((e) => ({ ...e, pts: TABLES[tour][e.level][e.result] ?? 0 })).sort((a, b) => b.pts - a.pts);
      const counted = res.slice(0, COUNT);
      return {
        id, name: info.get(id).name, country: info.get(id).country, rank: rankOf.get(id) ?? null,
        points: counted.reduce((s, e) => s + e.pts, 0), events: res.length,
        titles: res.filter((e) => e.result === "W").map((e) => e.event),
        slamTitles: res.filter((e) => e.result === "W" && e.level === "Grand Slam").map((e) => e.event),
        results: res.slice(0, COUNT).map(({ event, level, surface, result, pts }) => ({ event, level, surface, result, pts })),
      };
    }).filter((r) => r.points > 0).sort((a, b) => b.points - a.points || b.titles.length - a.titles.length).slice(0, 60);
    rows.forEach((r, i) => (r.place = i + 1));
    // Qualifiers: top N; ATP lets up to two of this year's Slam champions ranked 8-20 take the last spots.
    const q = new Set(rows.slice(0, cfg.slots).map((r) => r.id));
    if (cfg.slamRule) {
      const champs = rows.slice(cfg.slots - 1, 20).filter((r) => r.slamTitles.length && !q.has(r.id)).slice(0, 2);
      for (const c of champs) { const drop = rows.slice(0, cfg.slots).reverse().find((r) => q.has(r.id) && !r.slamTitles.length); if (drop) { q.delete(drop.id); q.add(c.id); } }
    }
    for (const r of rows) r.qualified = q.has(r.id);
    out[label] = { ...cfg, cutoff: undefined, closed: cut || null, rows };
  }
  await writeFile(path.join(outDir, "race.json"), JSON.stringify(out));
  return out;
}
