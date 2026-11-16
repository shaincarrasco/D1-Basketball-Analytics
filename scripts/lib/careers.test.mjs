// node --test scripts/lib/careers.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { compactSeason, careersFor, prospectRow, classRanks, CAREER_FIELDS, PROSPECT_FIELDS } from "./careers.mjs";

const isD1 = c => c !== "D2";
const prov = (o = {}) => ({
  athleteId: 1, teamId: 72, team: "Duke", conference: "ACC", position: "G", games: 30, starts: 28, minutes: 900, points: 450,
  rebounds: { total: 120 }, assists: 90, steals: 30, blocks: 6, turnovers: 45,
  fieldGoals: { made: 160, attempted: 340 }, threePointFieldGoals: { made: 60, attempted: 160 }, freeThrows: { made: 70, attempted: 80 },
  offensiveRating: 118.34, defensiveRating: 101.2, usage: 24.4, trueShootingPct: 0.589, ...o,
});

test("compactSeason keeps rows with integer ids (filter optional) and stores TS% on 0–100", () => {
  assert.equal(compactSeason([prov(), prov({ athleteId: 2, conference: "WAC" })], 2022).rows.length, 2);
  assert.equal(compactSeason([prov()], 2022).rows[0][23], 58.9);
  const s = compactSeason([prov(), prov({ athleteId: 2, conference: "D2" }), prov({ athleteId: "x" }), null], 2026, isD1);
  assert.equal(s.season, 2026);
  assert.equal(s.rows.length, 1);
  assert.equal(s.rows[0][0], "1");
});

test("careersFor builds per-game rows for wanted players, oldest first, skipping 0-game seasons", () => {
  const a = compactSeason([prov(), prov({ athleteId: 9 })], 2025, isD1);
  const b = compactSeason([prov({ teamId: 99, team: "Kansas", games: 10, minutes: 200, points: 80 }), prov({ athleteId: 3, games: 0 })], 2026, isD1);
  const m = careersFor([b, a], new Set(["1", "3"]));
  assert.deepEqual([...m.keys()], ["1"]);
  const rows = m.get("1");
  assert.equal(rows.length, 2);
  const f = Object.fromEntries(CAREER_FIELDS.map((k, i) => [k, i]));
  assert.equal(rows[0][f.season], 2025);
  assert.equal(rows[0][f.ppg], 15);
  assert.equal(rows[0][f.mpg], 30);
  assert.equal(rows[0][f.fgPct], 47.1);
  assert.equal(rows[0][f.tpPct], 37.5);
  assert.equal(rows[0][f.ts], 60); // 450 / (2 × (340 + 0.44 × 80)) = 59.97
  assert.equal(rows[1][f.team], "Kansas");
  assert.equal(rows[1][f.ppg], 8);
});

test("shooting % needs 10 attempts", () => {
  const s = compactSeason([prov({ threePointFieldGoals: { made: 3, attempted: 5 } })], 2026, isD1);
  const f = Object.fromEntries(CAREER_FIELDS.map((k, i) => [k, i]));
  assert.equal(careersFor([s], new Set(["1"])).get("1")[0][f.tpPct], null);
});

test("prospectRow: committed vs uncommitted never uses the high school as college", () => {
  const f = Object.fromEntries(PROSPECT_FIELDS.map((k, i) => [k, i]));
  const c = prospectRow({ name: " A B ", ranking: 3, stars: 5, rating: 0.99, position: "SF", school: "Prolific Prep", city: "Napa", stateProvince: "CA", height: 79.4, weight: 205, committedTo: { id: 72, name: "Duke" } }, 2027);
  assert.equal(c[f.name], "A B");
  assert.equal(c[f.college], "Duke");
  assert.equal(c[f.teamId], "72");
  assert.equal(c[f.hs], "Prolific Prep");
  assert.equal(c[f.ht], 79);
  const u = prospectRow({ name: "C D", school: "Montverde", committedTo: null }, 2028);
  assert.equal(u[f.college], null);
  assert.equal(u[f.teamId], null);
  assert.equal(u[f.hs], "Montverde");
  assert.equal(prospectRow({ ranking: 1 }, 2027), null);
});

test("classRanks ranks per year by rating points", () => {
  const rows = [
    prospectRow({ name: "a", stars: 5, rating: 0.99, committedTo: { id: 1, name: "X" } }, 2027),
    prospectRow({ name: "b", stars: 4, rating: 0.95, committedTo: { id: 1, name: "X" } }, 2027),
    prospectRow({ name: "c", stars: 5, rating: 0.995, committedTo: { id: 2, name: "Y" } }, 2027),
    prospectRow({ name: "d", stars: 3, rating: 0.85, committedTo: { id: 2, name: "Y" } }, 2028),
    prospectRow({ name: "e", stars: 4, rating: 0.9 }, 2027),
  ];
  const r = classRanks(rows);
  const x = r.find(s => s.teamId === "1" && s.year === 2027);
  assert.equal(x.commits, 2);
  assert.equal(x.five, 1);
  assert.equal(x.rank, 1);
  assert.equal(r.find(s => s.teamId === "2" && s.year === 2027).rank, 2);
  assert.equal(r.find(s => s.year === 2028).rank, 1);
  assert.equal(r.length, 3);
});

test("season helpers roll over in August", async () => {
  const { seasonFor, pastSeasons, openClasses, settledClasses } = await import("./careers.mjs");
  assert.equal(seasonFor(new Date(Date.UTC(2026, 10, 15))), 2027);
  assert.equal(seasonFor(new Date(Date.UTC(2027, 6, 31))), 2027);
  assert.equal(seasonFor(new Date(Date.UTC(2027, 7, 1))), 2028);
  assert.deepEqual(pastSeasons(2027), [2022, 2023, 2024, 2025, 2026]);
  assert.deepEqual(openClasses(2027), [2027, 2028]);
  assert.deepEqual(settledClasses(2028).at(-1), 2027);
});

test("gz cache round-trips and falls back to plain json", async () => {
  const { mkdtemp, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { readGzJson, writeGzJson } = await import("./gz-json.mjs");
  const dir = await mkdtemp(`${tmpdir()}/gz-`);
  await writeGzJson(`${dir}/a`, { x: [1, 2] });
  assert.deepEqual(await readGzJson(`${dir}/a`), { x: [1, 2] });
  await writeFile(`${dir}/b.json`, JSON.stringify({ y: 1 }));
  assert.deepEqual(await readGzJson(`${dir}/b`), { y: 1 });
  assert.equal(await readGzJson(`${dir}/missing`), null);
});

test("hand-kept prospects: parse, validate, merge over the feed", async () => {
  const { manualProspectRow, mergeProspects, heightInches, prospectRow, PROSPECT_FIELDS: F } = await import("./careers.mjs");
  const f = Object.fromEntries(F.map((k, i) => [k, i]));
  assert.equal(heightInches("6-10"), 82);
  assert.equal(heightInches(`6'7"`), 79);
  assert.equal(heightInches(80.4), 80);
  assert.equal(heightInches("tall"), null);
  assert.equal(manualProspectRow({ name: "X" }).row, null);
  assert.match(manualProspectRow({ name: "X" }).why, /class year/);
  const m = manualProspectRow({ year: 2027, name: "Jay Doe", rank: 4, stars: 5, height: "6-9", committedTo: "Duke", city: "Austin", state: "TX" }).row;
  assert.equal(m[f.college], "Duke");
  assert.equal(m[f.ht], 81);
  const feed = [prospectRow({ name: "Jay Doe", ranking: 6, stars: 5, school: "Dynamic Prep", committedTo: null }, 2027), prospectRow({ name: "Other Kid", ranking: 9 }, 2027)];
  const out = mergeProspects(feed, [m, manualProspectRow({ year: 2027, name: "New Name", rank: 50 }).row]);
  assert.equal(out.length, 3);
  const jay = out.find(r => r[f.name] === "Jay Doe");
  assert.equal(jay[f.rank], 4);
  assert.equal(jay[f.college], "Duke");
  assert.equal(jay[f.hs], "Dynamic Prep"); // kept from the feed where the hand entry is empty
  assert.equal(feed[0][f.rank], 6); // input not mutated
});
