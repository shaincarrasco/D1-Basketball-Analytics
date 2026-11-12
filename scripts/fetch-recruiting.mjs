// Recruiting star ratings for current college players (high-school classes 2022–2026)
// from College Basketball Data. Non-fatal; output joins to players by athlete id or name + school.
import { writeFile } from "node:fs/promises";

const key = process.env.CBBD_API_KEY;
if (!key) { console.warn("[recruiting] CBBD_API_KEY missing; skipping."); process.exit(0); }
const classes = [2022, 2023, 2024, 2025, 2026];
const out = [];
for (const year of classes) {
  try {
    const url = new URL("https://api.collegebasketballdata.com/recruiting/players");
    url.searchParams.set("year", String(year));
    const res = await fetch(url, { headers: { Authorization: "Bearer " + key, Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error("unexpected payload");
    if (year === classes[0] && rows[0]) console.log("[recruiting] sample row:", JSON.stringify(rows[0]).slice(0, 800));
    const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
    for (const r of rows) {
      out.push({
        year, athleteId: r.athleteId ?? r.athlete_id ?? null, name: r.name ?? null,
        stars: num(r.stars), rating: num(r.rating), ranking: num(r.ranking),
        position: r.position ?? null, school: r.committedTo?.name ?? r.committedTo ?? r.school ?? null,
        schoolId: r.committedTo?.id ?? r.committedToId ?? null, sourceId: r.sourceId ?? r.id ?? null,
      });
    }
    console.log(`[recruiting] ${year}: ${rows.length} recruits`);
  } catch (error) {
    console.warn(`[recruiting] ${year} failed: ${error instanceof Error ? error.message : error}`);
  }
}
if (out.length) {
  await writeFile("public/data/recruiting.json", JSON.stringify({ provider: "College Basketball Data /recruiting/players", fetchedAt: new Date().toISOString(), classes, players: out }) + "\n");
  console.log(`[recruiting] saved ${out.length} recruits`);
}
