// Season calendars (this season plus past seasons) with champions, for the calendar,
// tournament and past-results pages. Match-level results and order of play are loaded by the
// browser straight from theScore (it allows cross-origin requests).
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getJson } from "./http.mjs";
import { surfaceOf } from "./model.mjs";

// theScore season ids by tour (season = calendar year of the tournaments).
const PAST = { atp: { 2025: 37, 2024: 36, 2023: 33 }, wta: { 2025: 38, 2024: 35, 2023: 34 } };
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const person = (t) => (t?.player1 ? { id: String(t.player1.id), name: `${t.player1.first_name} ${t.player1.last_name}`.trim() } : null);
const isSingles = (e) => !/doubles/i.test(e.match_type ?? "") && !/doubles/i.test(e.name);

function compact(tour, e) {
  return {
    id: `${tour}-${e.id}`, sid: e.id, name: e.name, level: e.tournament_type ?? "", surface: surfaceOf(e.ground_type), indoor: /indoor/.test(e.ground_type ?? ""),
    start: iso(e.start_date), end: iso(e.end_date), status: e.event_status, location: e.location || null, country: e.country?.name ?? e.country ?? null,
    purse: e.purse || null, draw: e.number_competitors ?? null, winner: person(e.winner), previous: person(e.previous_champion),
  };
}

export async function writeCalendar(outDir, updated) {
  const out = { updated, tours: {} };
  for (const tour of ["atp", "wta"]) {
    const seasons = [];
    const current = await getJson(`/${tour}/events`);
    const year = Number(iso(current.find((e) => e.start_date)?.end_date)?.slice(0, 4)) || new Date().getFullYear();
    seasons.push({ year, events: current.filter(isSingles).map((e) => compact(tour, e)) });
    for (const [y, sid] of Object.entries(PAST[tour])) {
      try {
        const evs = await getJson(`/${tour}/events?season_id=${sid}`);
        if (Array.isArray(evs)) seasons.push({ year: Number(y), events: evs.filter(isSingles).map((e) => compact(tour, e)) });
      } catch { /* a missing past season just isn't shown */ }
    }
    for (const s of seasons) s.events.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
    out.tours[tour === "atp" ? "men" : "women"] = seasons.sort((a, b) => b.year - a.year);
  }
  // The feed leaves some finished events without a champion; our own match data has the final.
  try {
    const finals = new Map(JSON.parse(await readFile(path.join(outDir, "events.json"), "utf8")).events.map((e) => [e.id, e.final]));
    for (const ss of Object.values(out.tours)) for (const e of ss[0].events) {
      const f = finals.get(e.id);
      if (f) { e.final = f.score; if (!e.winner) e.winner = f.winner; e.runnerUp = f.runnerUp; }
    }
  } catch { /* events.json missing: champions come from the feed only */ }
  await writeFile(path.join(outDir, "calendar.json"), JSON.stringify(out));
  return out;
}
