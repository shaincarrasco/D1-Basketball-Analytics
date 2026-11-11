// Build-time data access for server components (static export reads these during `next build`).
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Conference, Meta, PlayerTable, TeamDetail, TeamSummary } from "./types";

const ROOT = path.join(process.cwd(), "public", "data", "app");
const cache = new Map<string, unknown>();
function load<T>(file: string): T {
  if (!cache.has(file)) cache.set(file, JSON.parse(readFileSync(path.join(ROOT, file), "utf8")));
  return cache.get(file) as T;
}

export const getMeta = () => load<Meta>("meta.json");
export const getTeams = () => load<TeamSummary[]>("teams.json");
export const getConferences = () => load<Conference[]>("conferences.json");
export const getPlayers = () => load<PlayerTable>("players.json");
export const getTeam = (slug: string) => getTeams().find(t => t.slug === slug) ?? null;
export const getTeamDetail = (slug: string) => load<TeamDetail>(`team/${slug}.json`);

export const getGameIndex = () => load<import("./types").GameIndex>("games/index.json");
export const getGameDay = (day: string) => load<import("./types").GameDay>(`games/${day}.json`);
/** Every game in the season (build-time only; ~6k rows). */
export const getAllGames = () => getGameIndex().days.flatMap(d => getGameDay(d.day).games.map(g => ({ ...g, day: d.day })));
