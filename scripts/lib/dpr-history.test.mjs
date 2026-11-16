import test from "node:test";
import assert from "node:assert/strict";
import { appendSnapshot, change, emptyHistory, MAX_DATES } from "./dpr-history.mjs";

const e = (id, dpr) => ({ id, dpr, dprO: dpr / 2, dprD: dpr / 2 });

test("appends and rounds to one decimal", () => {
  const h = appendSnapshot(emptyHistory(), "2026-11-01", [e("a", 1.234)]);
  assert.deepEqual(h.dates, ["2026-11-01"]);
  assert.deepEqual(h.players.a, [[1.2, 0.6, 0.6]]);
});

test("same date is idempotent and replaces", () => {
  let h = appendSnapshot(emptyHistory(), "2026-11-01", [e("a", 1), e("b", 2)]);
  h = appendSnapshot(h, "2026-11-01", [e("a", 3)]);
  assert.equal(h.dates.length, 1);
  assert.equal(h.players.a[0][0], 3);
  assert.equal(h.players.b, undefined);
  assert.deepEqual(appendSnapshot(h, "2026-11-01", [e("a", 3)]), h);
});

test("keeps at most 120 dates, dropping the oldest", () => {
  let h = emptyHistory();
  for (let i = 0; i < MAX_DATES + 5; i++) h = appendSnapshot(h, new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), [e("a", i)]);
  assert.equal(h.dates.length, MAX_DATES);
  assert.equal(h.players.a.length, MAX_DATES);
  assert.equal(h.players.a[0][0], 5);
});

test("change uses closest snapshot at or before the window", () => {
  let h = emptyHistory();
  h = appendSnapshot(h, "2026-10-01", [e("a", 1)]);
  h = appendSnapshot(h, "2026-10-14", [e("a", 2)]);
  h = appendSnapshot(h, "2026-10-20", [e("a", 3)]);
  h = appendSnapshot(h, "2026-11-15", [e("a", 5)]);
  // target = 2026-10-16 -> closest at or before is 10-14
  assert.deepEqual(change(h, "a", 30), { from: 2, to: 5, delta: 3, since: "2026-10-14" });
});

test("change falls back to the oldest snapshot and reports since", () => {
  let h = appendSnapshot(emptyHistory(), "2026-11-10", [e("a", 1)]);
  h = appendSnapshot(h, "2026-11-15", [e("a", 0.5)]);
  assert.deepEqual(change(h, "a", 30), { from: 1, to: 0.5, delta: -0.5, since: "2026-11-10" });
});

test("change is null with a single snapshot or unknown player", () => {
  const h = appendSnapshot(emptyHistory(), "2026-11-10", [e("a", 1)]);
  assert.equal(change(h, "a"), null);
  assert.equal(change(h, "zzz"), null);
});

test("players missing on some dates", () => {
  let h = appendSnapshot(emptyHistory(), "2026-10-01", [e("a", 1)]);
  h = appendSnapshot(h, "2026-10-10", [e("b", 1)]);
  h = appendSnapshot(h, "2026-11-15", [e("a", 2), e("b", 4)]);
  assert.equal(change(h, "a").since, "2026-10-01");
  assert.equal(change(h, "b").delta, 3);
});
