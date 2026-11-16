import test from "node:test";
import assert from "node:assert/strict";
import { blend, evidenceWeight, totalsById, lastLines, pickD } from "./skills-prior.mjs";

test("blend with d=0 or no last season equals plain shrinkage", () => {
  const base = (10 + 100 * 0.3) / (40 + 100);
  assert.equal(blend({ count: 10, opps: 40, prior: 0.3, k: 100, d: 0, lastCount: 50, lastOpps: 100 }), base);
  assert.equal(blend({ count: 10, opps: 40, prior: 0.3, k: 100, d: 0.5 }), base);
});
test("blend discounts last season", () => {
  const v = blend({ count: 10, opps: 40, lastCount: 30, lastOpps: 80, prior: 0.3, k: 100, d: 0.5 });
  assert.ok(Math.abs(v - (10 + 15 + 30) / (40 + 40 + 100)) < 1e-12);
  // a hot last season pulls the projection up vs no last season
  assert.ok(v > blend({ count: 10, opps: 40, prior: 0.3, k: 100 }));
});
test("evidence weight grows with last-season opportunities", () => {
  assert.ok(evidenceWeight({ opps: 40, lastOpps: 80, k: 100, d: 0.5 }) > evidenceWeight({ opps: 40, k: 100 }));
  assert.equal(evidenceWeight({ opps: 100, k: 100 }), 0.5);
});
test("totals sum two team rows and map stat lines", () => {
  const fields = ["id", "min", "pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "tov"];
  const t = totalsById({ fields, rows: [["7", 100, 50, 20, 40, 5, 15, 8, 10, 4], ["7", 50, 20, 8, 20, 3, 5, 2, 4, 1]] }).get("7");
  assert.equal(t.fga, 60);
  const l = lastLines(t);
  assert.deepEqual([l.tp.n, l.tp.d], [8, 20]);
  assert.deepEqual([l.two.n, l.two.d], [20, 40]);
  assert.deepEqual([l.ft.n, l.ft.d], [10, 14]);
  assert.deepEqual([l.pts.n, l.pts.d], [70, 150]);
  assert.equal(lastLines(null).tp, undefined);
});
test("pickD falls back to 0 unless a discount really lowers error", () => {
  assert.equal(pickD({ 0: 1, 0.25: 1.1, 0.5: 1.2, 0.75: 1.3, 1: 1.4 }), 0);
  assert.equal(pickD({ 0: 1, 0.25: 0.9, 0.5: 0.8, 0.75: 0.85, 1: 0.95 }), 0.5);
});

test("pickD ignores noise-sized gains", () => {
  assert.equal(pickD({ 0: 1, 0.25: 0.999, 0.5: 0.998, 0.75: 1, 1: 1 }), 0);
  assert.equal(pickD({ 0: 1, 0.25: 0.97, 0.5: 0.95, 0.75: 0.96, 1: 0.99 }), 0.5);
});

