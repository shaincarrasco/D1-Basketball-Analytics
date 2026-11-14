// Small data file for the menu panels' live previews (public/data/app/nav-preview.json):
// the top five teams, the next marquee game, the top players by DPR and the projected
// 1 seeds. Built after the rest of the app data; never fails the build.
import { readFile, writeFile } from "node:fs/promises";

const APP = "public/data/app";
const OUT = `${APP}/nav-preview.json`;
const read = async f => JSON.parse(await readFile(`${APP}/${f}`, "utf8"));
const etDay = d => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

try {
  const teams = await read("teams.json");
  const byId = new Map(teams.map(t => [t.id, t]));
  const teamBits = t => ({ name: t.name, short: t.short ?? t.name, slug: t.slug, logo: t.logo ?? null, color: t.color ?? null, rank: t.rank ?? null });

  const top = teams.filter(t => t.rank != null).sort((a, b) => a.rank - b.rank).slice(0, 5)
    .map(t => ({ ...teamBits(t), adjEM: t.adjEM ?? null, record: `${t.w}-${t.l}` }));

  // Next marquee game: today's slate (Eastern) or the next day with games; the most watchable unfinished game.
  let game = null;
  try {
    const index = await read("games/index.json");
    const today = etDay(new Date());
    const days = index.days.filter(d => d.games > 0 && d.day >= today && d.finals < d.games);
    for (const d of days.slice(0, 3)) {
      const file = await read(`games/${d.day}.json`);
      const open = (file.games ?? []).filter(g => g.status !== "final" && g.home?.slug && g.away?.slug);
      const pick = open.sort((a, b) => (b.watch ?? 0) - (a.watch ?? 0))[0];
      if (pick) {
        const side = s => ({ name: s.name, short: s.short ?? s.name, slug: s.slug, logo: s.logo ?? null, color: s.color ?? null, rank: s.rank ?? null, record: s.record ?? null });
        game = { day: d.day, id: pick.id, date: pick.date, status: pick.status, neutral: !!pick.neutral, tv: (pick.tv ?? []).slice(0, 1), home: side(pick.home), away: side(pick.away), wp: pick.pred?.wp ?? null };
        break;
      }
    }
  } catch { /* no games data: the preview shows a link instead */ }

  // Top players by DPR among regulars with a real lineup sample.
  let players = [];
  try {
    const table = await read("players.json");
    const f = Object.fromEntries(table.fields.map((k, i) => [k, i]));
    players = table.rows
      .filter(r => (r[f.min] ?? 0) >= 10 && (r[f.g] ?? 0) >= 2 && (r[f.onPoss] ?? 0) >= 150 && r[f.dpr] != null)
      .sort((a, b) => b[f.dpr] - a[f.dpr]).slice(0, 3)
      .map(r => { const t = byId.get(String(r[f.teamId])); return { id: String(r[f.id]), name: r[f.name], pos: r[f.pos] ?? null, dpr: r[f.dpr], team: t ? teamBits(t) : null }; });
  } catch { /* leave empty */ }

  let seeds = [];
  try {
    const b = await read("bracket.json");
    const line = b.ok ? (b.lines ?? []).find(l => l.seed === 1) : null;
    seeds = (line?.entries ?? []).map(en => { const t = teams.find(x => x.slug === en.teams?.[0]); return t ? { ...teamBits(t), region: en.region ?? null } : null; }).filter(Boolean);
  } catch { /* leave empty */ }

  await writeFile(OUT, JSON.stringify({ built: new Date().toISOString(), top, game, players, seeds }));
  console.log(`[nav-preview] ${top.length} teams, ${game ? "1 game" : "no game"}, ${players.length} players, ${seeds.length} 1 seeds.`);
} catch (error) {
  await writeFile(OUT, JSON.stringify({ built: new Date().toISOString(), top: [], game: null, players: [], seeds: [] })).catch(() => {});
  console.warn("[nav-preview] Could not build the menu previews: " + (error instanceof Error ? error.message : error));
}
