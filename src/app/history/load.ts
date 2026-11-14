// Build-time reads of the cached past seasons (public/data/history/<season>.json).
// Missing folder or files simply mean "not fetched yet": callers show an honest empty state.
import "server-only";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { HistorySeason, ProgramSeason, SeasonInfo } from "@/lib/history";

const DIR = path.join(process.cwd(), "public", "data", "history");
let cache: HistorySeason[] | null = null;

/** Every cached season, newest first. Unreadable files are skipped. */
export function getHistorySeasons(): HistorySeason[] {
  if (cache) return cache;
  let files: string[] = [];
  try { files = readdirSync(DIR).filter(f => /^\d{4}\.json$/.test(f)); } catch { files = []; }
  cache = files.flatMap(f => {
    try {
      const d = JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as HistorySeason;
      return Array.isArray(d.teams) && d.teams.length && d.season === Number(f.slice(0, 4)) ? [d] : [];
    } catch { return []; }
  }).sort((a, b) => b.season - a.season);
  return cache;
}

export function getSeasonIndex(): SeasonInfo[] {
  return getHistorySeasons().map(s => ({
    season: s.season, label: s.label, teamCount: s.teamCount,
    champion: s.ncaaChampion === null ? null : s.teams.find(t => t.id === s.ncaaChampion)?.team ?? null,
  }));
}

/** One program's seasons, newest first (only seasons where it was rated). */
export function getProgramHistory(teamId: string | number): ProgramSeason[] {
  const id = Number(teamId);
  return getHistorySeasons().flatMap(s => {
    const team = s.teams.find(t => t.id === id);
    return team ? [{ season: s.season, label: s.label, teamCount: s.teamCount, team }] : [];
  });
}
