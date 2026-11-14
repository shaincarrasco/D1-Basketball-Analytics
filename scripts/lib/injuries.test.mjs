// node --test scripts/lib/injuries.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, weeksOf } from "./injury-text.mjs";
import { buildInjuries } from "./injuries.mjs";

test("classifies real headline shapes", () => {
  const c = s => classify(s);
  assert.deepEqual([c("UConn's Nik Khamenia to have foot surgery, be rechecked in 6-8 weeks").state, c("UConn's Nik Khamenia to have foot surgery, be rechecked in 6-8 weeks").body, c("UConn's Nik Khamenia to have foot surgery, be rechecked in 6-8 weeks").expected], ["out", "Foot", "6–8 weeks"]);
  assert.equal(c("Kansas' Melvin Council Jr. suffers broken foot, might be out until January").expected, "Until January");
  assert.equal(c("Star guard tears ACL, will miss rest of season").state, "season");
  assert.equal(c("Freeman to miss season after Achilles surgery").state, "season");
  assert.equal(c("Missouri suspends Jaylen Carey for opener").kind, "suspension");
  assert.equal(c("Jordan Scott injures right shoulder in win over Northern Iowa").state, "monitor");
  assert.equal(c("Guard listed as questionable vs. Duke with ankle sprain").state, "questionable");
  assert.equal(c("Forward is day-to-day with a sprained ankle").expected, "Day-to-day");
  assert.equal(c("Wildcats star returns from knee injury in win").state, null);
  assert.equal(c("Wildcats star returns from knee injury in win").returning, true);
  assert.equal(c("Center out indefinitely with concussion").expected, "Indefinite");
  assert.equal(c("Guard has not been cleared by the NCAA, ruled ineligible").kind, "eligibility");
  assert.deepEqual(weeksOf("out two to three weeks"), [2, 3]);
  assert.deepEqual(weeksOf("expected to miss a couple of weeks"), [2, 2]);
  assert.equal(weeksOf("no timeline"), null);
});

// Minimal world: one team, three ESPN-covered games, one rotation player who sat out the last two.
function world(extra = {}) {
  const logFields = ["day", "opp", "oppSlug", "venue", "result", "teamPts", "oppPts", "starter", "min"];
  const days = ["2026-11-03", "2026-11-07", "2026-11-10"];
  return {
    teams: [{ slug: "duke", id: "1", name: "Duke", short: "Duke", conf: "ACC", rank: 3 }],
    espnIdBySlug: new Map([["duke", "150"]]),
    rosters: { 150: [{ id: "a1", name: "Ace Guard" }, { id: "a2", name: "Big Man" }, { id: "a9", name: "Hurt Transfer" }] },
    teamPlayers: () => [
      { pid: "p1", name: "Ace Guard", pos: "G", g: 1, min: 30, pts: 18, reb: 3, ast: 4, dpr: 3, onPoss: 60 },
      { pid: "p2", name: "Big Man", pos: "F", g: 3, min: 25, pts: 10, reb: 8, ast: 1, dpr: 1, onPoss: 160 },
    ],
    logsBySlug: new Map([["duke", { p1: [[days[0], "X", null, "H", "W", 80, 60, 1, 30]], p2: days.map(d => [d, "X", null, "H", "W", 80, 60, 1, 25]) }]]),
    logFields,
    aidByPid: new Map([["p1", "a1"], ["p2", "a2"]]),
    teamDaysByEspn: new Map([["150", days]]),
    teamGames: new Map([["1", days.map((d, i) => ({ day: d, result: i === 2 ? "L" : "W", pts: 70, oppPts: i === 2 ? 75 : 60 }))]]),
    feeds: { articles: {}, athleteNews: {}, teamNews: {}, injuries: [] },
    curated: [{ team: "Duke", name: "Hurt Transfer", status: "Out for season", body: "Achilles", kind: "injury", expected: "Season", detail: "Had Achilles surgery.", reported: "2026-07-02", source: "ESPN", url: "https://example.com/a" }],
    ledger: null,
    now: "2026-11-11T15:00:00Z",
    ...extra,
  };
}

test("merges box scores and curated reports, with impact and with/without", () => {
  const { rows, teamHealth } = buildInjuries(world());
  const ace = rows.find(r => r.name === "Ace Guard");
  assert.equal(ace.state, "missed");
  assert.equal(ace.missed, 2);
  assert.equal(ace.confidence, "inferred");
  assert.deepEqual(ace.ww, { with: [1, 0, 10], without: [1, 1, 2.5] });
  assert.ok(ace.impact.netLoss > 0);
  const hurt = rows.find(r => r.name === "Hurt Transfer");
  assert.equal(hurt.state, "season");
  assert.equal(hurt.yetToPlay, true);
  assert.equal(hurt.source, "manual");
  assert.equal(rows.find(r => r.name === "Big Man"), undefined);
  assert.equal(teamHealth[0].out, 2);
});

test("ledger records new flags, then returns", () => {
  const first = buildInjuries(world());
  assert.ok(first.wire.every(e => e.kind === "new"));
  // Next check: Ace Guard played on Nov 14.
  const w = world({ ledger: first.ledger, now: "2026-11-15T15:00:00Z" });
  w.teamDaysByEspn = new Map([["150", ["2026-11-03", "2026-11-07", "2026-11-10", "2026-11-14"]]]);
  w.logsBySlug.get("duke").p1.push(["2026-11-14", "X", null, "H", "W", 80, 60, 1, 28]);
  w.logsBySlug.get("duke").p2.push(["2026-11-14", "X", null, "H", "W", 80, 60, 1, 25]);
  const second = buildInjuries(w);
  assert.equal(second.rows.find(r => r.name === "Ace Guard"), undefined);
  const back = second.wire.find(e => e.name === "Ace Guard" && e.kind === "returned");
  assert.ok(back, "return event logged");
  assert.equal(second.ledger.players["duke:a1"].stints.at(-1).to, "2026-11-14");
  assert.equal(second.ledger.players["duke:a1"].open, null);
});

test("a curated absence clears itself once the player logs minutes", () => {
  const w = world();
  w.curated[0].name = "Ace Guard"; w.curated[0].reported = "2026-10-20";
  const { rows } = buildInjuries(w);
  assert.equal(rows.find(r => r.name === "Ace Guard").source, "box"); // he played Nov 3, so the curated note is stale
});

test("a reported reason sticks after the article ages out of the feed", () => {
  const w = world();
  w.feeds = { ...w.feeds, articles: { x: { headline: "Ace Guard out 4-6 weeks with hand fracture", url: "https://example.com/x", published: "2026-11-08T12:00:00Z" } }, athleteNews: { a1: ["x"] } };
  const first = buildInjuries(w);
  assert.equal(first.rows.find(r => r.name === "Ace Guard").body, "Hand");
  const w2 = world({ ledger: first.ledger, now: "2026-12-05T15:00:00Z" }); // article gone, still hasn't played
  const row = buildInjuries(w2).rows.find(r => r.name === "Ace Guard");
  assert.equal(row.source, "news");
  assert.equal(row.expected, "4–6 weeks");
  assert.ok(row.eta);
});

test("review regressions: classifier", () => {
  const c = s => classify(s);
  assert.equal(c("X out 4-6 weeks, expected to return in January").state, "out");
  assert.equal(c("X tears ACL, could return for NCAA tournament").state, "season");
  assert.equal(c("X still not cleared to return").returning, false);
  assert.equal(c("X won't be available vs. Duke").returning, false);
  assert.equal(c("NCAA grants X waiver, eligible immediately").state, null);
  assert.equal(c("X reinstated after suspension").state, null);
  assert.equal(c("Head coach: X questionable with illness").body, "Illness");
  assert.equal(c("X suspended, won't face Kentucky").body, null);
  assert.equal(c("X returns after missing three games with ankle injury").state, null);
  assert.equal(c("X back from suspension").returning, true);
});

function withHeadline(headline, published, extra = {}) {
  const w = world(extra);
  w.feeds = { ...w.feeds, articles: { h: { headline, url: "https://example.com/h", published } }, athleteNews: { a1: ["h"], a2: ["h"] } };
  return w;
}

test("review regressions: a teammate tagged in the story doesn't inherit the injury", () => {
  const { rows } = buildInjuries(withHeadline("Ace Guard out 4-6 weeks; Big Man to start", "2026-11-11T02:00:00Z"));
  assert.equal(rows.find(r => r.name === "Big Man"), undefined);
  assert.equal(rows.find(r => r.name === "Ace Guard").expected, "4–6 weeks");
});

test("review regressions: an old headline doesn't come back when a returned player sits once", () => {
  // Big Man played every game through Nov 10; headline from Nov 1 is stale even if he sits Nov 14.
  const w = withHeadline("Big Man out 2-3 weeks with ankle sprain", "2026-11-01T15:00:00Z", { now: "2026-11-15T15:00:00Z" });
  w.teamDaysByEspn = new Map([["150", ["2026-11-03", "2026-11-07", "2026-11-10", "2026-11-14"]]]);
  const big = buildInjuries(w).rows.find(r => r.name === "Big Man");
  assert.equal(big.source, "box");
  assert.equal(big.expected, null);
});

test("review regressions: an expiring 'hurt in the win' note is cleared, not a return", () => {
  const first = buildInjuries(withHeadline("Big Man injures shoulder in win over X", "2026-11-10T23:00:00Z"));
  assert.equal(first.rows.find(r => r.name === "Big Man").state, "monitor");
  const w = world({ ledger: first.ledger, now: "2026-11-20T15:00:00Z" });
  w.teamDaysByEspn = new Map([["150", ["2026-11-03", "2026-11-07", "2026-11-10", "2026-11-14"]]]);
  w.logsBySlug.get("duke").p2.push(["2026-11-14", "X", null, "H", "W", 80, 60, 1, 25]);
  const ev = buildInjuries(w).ledger.players["duke:a2"].events.at(-1);
  assert.equal(ev.kind, "cleared");
});

test("review regressions: a weaker follow-up doesn't downgrade a season-ending report", () => {
  const w = world();
  w.feeds = { ...w.feeds, articles: {
    a: { headline: "Ace Guard tears ACL, out for season", url: "https://e.com/a", published: "2026-11-08T15:00:00Z" },
    b: { headline: "Ace Guard undergoes surgery", url: "https://e.com/b", published: "2026-11-10T15:00:00Z" },
  }, athleteNews: { a1: ["b", "a"] } };
  assert.equal(buildInjuries(w).rows.find(r => r.name === "Ace Guard").state, "season");
});

test("review regressions: unchanged data leaves the ledger untouched", () => {
  const first = buildInjuries(world());
  const again = buildInjuries(world({ ledger: first.ledger, now: "2026-11-11T16:00:00Z" }));
  assert.equal(again.ledger.updated, first.ledger.updated);
  assert.ok(first.wire.every(e => e.seed && e.stint));
});
