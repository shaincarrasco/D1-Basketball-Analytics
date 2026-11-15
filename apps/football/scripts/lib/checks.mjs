// Acceptance checks printed at the end of a run. Reads the build output; no I/O.

const pick = (xs, n) => {
  const copy = [...xs];
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  return out;
};

/** ESPN's printed end spot in the play text ("to the WMU07"), as the two possible x values. */
const printedEnds = (text) => {
  const m = [...String(text).matchAll(/to the ([A-Z]{2,5})?(\d{1,2})\b/g)].pop();
  if (!m) return null;
  const n = Number(m[2]);
  return [n, 100 - n];
};

export function checkReport(out, dirs) {
  const lines = [];
  const L = (s = "") => lines.push(s);

  L("sanity (5 random games, both teams): box receptions vs parsed rec touches (+-1); box carries vs parsed rush touches (+-2)");
  const byGame = new Map();
  for (const c of out.teamChecks) byGame.set(c.gid, [...(byGame.get(c.gid) ?? []), c]);
  let recBad = 0;
  let rushBad = 0;
  for (const gid of pick([...byGame.keys()], 5)) {
    for (const c of byGame.get(gid)) {
      const dr = c.boxRec - c.parsedRec;
      const dc = c.boxCar - c.parsedRush;
      if (Math.abs(dr) > 1) recBad++;
      if (Math.abs(dc) > 2) rushBad++;
      L(`  game ${gid} team ${c.team}: rec box ${c.boxRec} parsed ${c.parsedRec} (${dr >= 0 ? "+" : ""}${dr}); rush box ${c.boxCar} parsed ${c.parsedRush} (${dc >= 0 ? "+" : ""}${dc})`);
    }
  }
  L(`  failures in sample: receptions ${recBad}, carries ${rushBad}`);
  const allRecBad = out.teamChecks.filter((c) => Math.abs(c.boxRec - c.parsedRec) > 1).length;
  const allRushBad = out.teamChecks.filter((c) => Math.abs(c.boxCar - c.parsedRush) > 2).length;
  L(`  all ${out.teamChecks.length} team-games: reception mismatches (>1) ${allRecBad}, carry mismatches (>2) ${allRushBad}`);

  const scrim = out.allTouches.filter((t) => (t.kind === "rec" || t.kind === "rush") && t.end != null && printedEnds(t.text));
  const ok = scrim.filter((t) => printedEnds(t.text).some((x) => Math.abs(t.end - x) <= 1));
  L(`end spots: ${ok.length}/${scrim.length} rush and reception touches with a printed end spot agree with los + yds (+-1, either side of the 50)`);

  L("touch samples with air yards and YAC (air = spot - los, yac = end - spot):");
  const withSpot = out.allTouches.filter((t) => t.kind === "rec" && t.spot != null && t.end != null);
  for (const t of pick(withSpot, 10)) {
    L(`  los ${t.los} spot ${t.spot} end ${t.end} yds ${t.yds} air ${t.spot - t.los} yac ${t.end - t.spot} | ${t.text.slice(0, 110)}`);
  }

  L(`counts: FBS teams ${out.teams.length}; players ${out.players.rows.length}; diag ${JSON.stringify(out.diag)}`);
  const posCounts = {};
  for (const r of out.players.rows) posCounts[r.pos] = (posCounts[r.pos] ?? 0) + 1;
  L(`  players per position: ${Object.entries(posCounts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  L(`  games per week: ${out.games.weeks.map((w) => `${w.week}:${w.games.length}(${w.games.filter((g) => g.status === "post").length} final)`).join(" ")}`);
  L(`  finished games in this run's scope with cached summaries: ${out.gFiles.size}`);
  L(`  p/ files ${out.pFiles.size}, g/ files ${out.gFiles.size}, sizes: ${dirs.map((d) => `${d.name} ${(d.bytes / 1024 / 1024).toFixed(2)} MB`).join(", ")}`);

  const qb = out.players.rows.filter((r) => r.pos === "QB").sort((a, b) => (b.pAtt ?? 0) - (a.pAtt ?? 0))[0];
  const wr = out.players.rows.filter((r) => r.pos === "WR").sort((a, b) => (b.rcRec ?? 0) - (a.rcRec ?? 0))[0];
  L("sample players.json rows:");
  if (qb) L(`  QB ${JSON.stringify(qb)}`);
  if (wr) {
    L(`  WR ${JSON.stringify(wr)}`);
    const wt = out.pFiles.get(wr.id)?.touches.slice(0, 3) ?? [];
    L(`  first 3 touches of ${wr.name}: ${JSON.stringify(wt)}`);
  }
  return lines;
}
