import type { Game, Player, ProviderResult, Team } from "../types";

const BASE = "https://api.collegebasketballdata.com";
function headers() {
  const key = process.env.CBBD_API_KEY;
  if (!key) throw new Error("CBBD_API_KEY is not configured");
  return { Authorization: `Bearer ${key}`, Accept: "application/json" };
}
async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { headers: headers(), next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(`CBBD request failed (${response.status})`);
  return response.json() as Promise<T>;
}
// Raw provider payloads intentionally remain unknown until a verified schema mapper is implemented.
export async function fetchCbbdTeams(season: number): Promise<ProviderResult<Team>> {
  const raw = await request<unknown[]>(`/teams?season=${season}`);
  return { data: [], provider: "College Basketball Data", fetchedAt: new Date().toISOString(), status: "unavailable", season, warnings: [`Received ${raw.length} raw team records; schema mapping must be validated against the provider's current docs before exposing live data.`] };
}
export async function fetchCbbdPlayers(season: number): Promise<ProviderResult<Player>> {
  const raw = await request<unknown[]>(`/stats/player/season?season=${season}`);
  return { data: [], provider: "College Basketball Data", fetchedAt: new Date().toISOString(), status: "unavailable", season, warnings: [`Received ${raw.length} raw player records; schema mapping is not yet validated.`] };
}
export async function fetchCbbdGames(season: number): Promise<ProviderResult<Game>> {
  const raw = await request<unknown[]>(`/games?season=${season}`);
  return { data: [], provider: "College Basketball Data", fetchedAt: new Date().toISOString(), status: "unavailable", season, warnings: [`Received ${raw.length} raw game records; schema mapping is not yet validated.`] };
}
