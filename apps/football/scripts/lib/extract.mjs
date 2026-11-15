// Turns one ESPN game summary into the compact cache record (data-cache/games/<id>.json).
// Only what the build needs: teams, box-score lines for the football groups, and drive/play fields.
// Play spots are kept as ESPN's raw yardsToEndzone plus the team that owns the spot; build.mjs converts them.
const BOX_GROUPS = ["passing", "rushing", "receiving", "fumbles", "defensive", "interceptions"];
const CLOCK = /^\(\d{1,2}:\d{2}\)\s*/;

export function extractGame(sum, meta) {
  const comp = sum.header.competitions[0];
  const side = (ha) => {
    const c = comp.competitors.find((x) => x.homeAway === ha);
    return { id: String(c.team.id), abbr: c.team.abbreviation, score: Number(c.score) };
  };

  const box = {};
  for (const tp of sum.boxscore?.players ?? []) {
    const labels = {};
    const players = new Map();
    for (const g of tp.statistics ?? []) {
      if (!BOX_GROUPS.includes(g.name)) continue;
      labels[g.name] = g.labels;
      for (const a of g.athletes ?? []) {
        const ath = a.athlete;
        const id = String(ath.id);
        if (id.startsWith("-")) continue; // ESPN's team total row (negative id), not a player
        if (!players.has(id)) {
          players.set(id, { id, name: ath.displayName, jersey: ath.jersey ?? null, hs: ath.headshot?.href ?? null, s: {} });
        }
        players.get(id).s[g.name] = a.stats;
      }
    }
    box[String(tp.team.id)] = { labels, players: [...players.values()] };
  }

  const drives = (sum.drives?.previous ?? []).map((d) => ({
    team: d.team?.id == null ? null : String(d.team.id),
    start: d.start?.text ?? null,
    end: d.end?.text ?? null,
    result: d.result ?? null,
    yards: d.yards ?? null,
    plays: (d.plays ?? []).map((p) => ({
      q: p.period?.number ?? null,
      clock: p.clock?.displayValue ?? null,
      text: (p.text ?? "").replace(CLOCK, "").trim(),
      type: p.type?.text ?? null,
      down: p.start?.down ?? null,
      dist: p.start?.distance ?? null,
      sY: p.start?.yardsToEndzone ?? null,
      sT: p.start?.team?.id == null ? null : String(p.start.team.id),
      eY: p.end?.yardsToEndzone ?? null,
      eT: p.end?.team?.id == null ? null : String(p.end.team.id),
      ePos: p.end?.possessionText ?? null,
      yds: p.statYardage ?? null,
      score: p.scoringPlay === true,
    })),
  }));

  return {
    v: 1,
    id: meta.id,
    season: meta.season,
    week: meta.week,
    seasontype: meta.seasontype,
    date: meta.date,
    home: side("home"),
    away: side("away"),
    box,
    drives,
  };
}
