// Fetches last season's provider-adjusted team ratings once per season to use as
// a regressed preseason prior for DHR. Non-fatal: without it DHR falls back to
// conference-mean priors.
import { readFile, writeFile } from "node:fs/promises";

const priorSeason = 2026;
const path = "public/data/prior-ratings.json";
const key = process.env.CBBD_API_KEY;
try {
  const existing = JSON.parse(await readFile(path, "utf8"));
  if (existing.season === priorSeason && (existing.teams ?? []).length > 200) {
    console.log(`[prior] ${existing.teams.length} ${priorSeason} ratings already cached.`);
    process.exit(0);
  }
} catch { /* not cached yet */ }
if (!key) { console.warn("[prior] CBBD_API_KEY missing; skipping preseason prior."); process.exit(0); }
try {
  const url = new URL("https://api.collegebasketballdata.com/ratings/adjusted");
  url.searchParams.set("season", String(priorSeason));
  const response = await fetch(url, { headers: { Authorization: "Bearer " + key, Accept: "application/json" } });
  if (!response.ok) throw new Error("HTTP " + response.status);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("unexpected payload");
  const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const teams = rows.map(r => ({
    teamId: r.teamId ?? null, team: r.team ?? null, conference: r.conference ?? null,
    offensiveRating: num(r.offensiveRating ?? r.adjO ?? r.adjOffense),
    defensiveRating: num(r.defensiveRating ?? r.adjD ?? r.adjDefense),
    netRating: num(r.netRating ?? r.adjEM ?? r.adjNetRating),
  })).filter(r => r.teamId != null && r.offensiveRating !== null && r.defensiveRating !== null);
  if (teams.length < 200) throw new Error(`only ${teams.length} usable rows`);
  await writeFile(path, JSON.stringify({ provider: "College Basketball Data /ratings/adjusted", season: priorSeason, fetchedAt: new Date().toISOString(), teams }, null, 1) + "\n");
  console.log(`[prior] Saved ${teams.length} ${priorSeason} adjusted ratings as the DHR preseason prior.`);
} catch (error) {
  console.warn("[prior] Could not fetch preseason prior; DHR will use conference-mean priors. " + (error instanceof Error ? error.message : error));
}
