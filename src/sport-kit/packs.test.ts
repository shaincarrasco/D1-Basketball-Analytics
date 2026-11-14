// Conformance suite: runs against EVERY folder in src/sports/ that has an index.ts exporting
// { pack, fixtures }. A new sport is covered the moment its folder exists.
import { describe, expect, it } from "vitest";
import {
  decodeSpec, defaultSpec, encodeSpec, inPool, makeSpec, metricIndex, poolText, rankPool, resolvePreset,
  tierOf, val, validatePack, withDefaults, type SportPack,
} from "@/sport-kit";

type Mod = { pack: SportPack<unknown>; fixtures: () => unknown[] };
const loaders = import.meta.glob<Mod>("../sports/*/index.ts");
/** SPORT=tennis npm test — check one pack only. */
const only = process.env.SPORT;
const sports = await Promise.all(
  Object.entries(loaders).filter(([path]) => !only || path.split("/")[2] === only).map(async ([path, load]) => ({ dir: path.split("/")[2], ...(await load()) })),
);

it("finds the sport packs", () => {
  expect(sports.map(s => s.dir)).toContain(only ?? "basketball");
});

describe.each(sports)("$dir pack", ({ dir, pack, fixtures }) => {
  const rows = fixtures();
  const M = metricIndex(pack);

  it("folder name matches pack id", () => expect(pack.id).toBe(dir));
  it("passes validatePack with its fixtures", () => expect(validatePack(pack, rows)).toEqual([]));
  it("fixtures are plentiful, unique and fictional-looking", () => {
    expect(rows.length).toBeGreaterThanOrEqual(80);
    const ids = rows.map(r => pack.entity.id(r));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("default pool keeps a usable share of the fixtures", () => {
    const pool = withDefaults(pack);
    expect(rows.filter(r => inPool(pack, pool, r)).length).toBeGreaterThanOrEqual(30);
    expect(poolText(pack, pool, {})).toMatch(/\w/);
  });
  it("every metric has real values in the fixtures", () => {
    for (const m of pack.metrics) {
      const n = rows.filter(r => val(m, r) !== null).length;
      expect(n, `metric ${m.key} has ${n} qualified rows`).toBeGreaterThanOrEqual(10);
    }
  });
  it("every framework ranks a reasonable field, best first", () => {
    for (const f of pack.frameworks) {
      for (const rel of ["all", "pos"] as const) {
        const ranked = rankPool(pack, rows, withDefaults(pack), f.weights, rel, true);
        expect(ranked.length, `${f.key}/${rel}`).toBeGreaterThanOrEqual(15);
        for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].blend).toBeGreaterThanOrEqual(ranked[i].blend);
        expect(tierOf(pack, ranked[0].standing)).toBe(pack.tiers[0].label);
      }
    }
  });
  it("every preset resolves to a chart with data", () => {
    for (const p of pack.charts.presets) {
      const s = resolvePreset(pack, p, rows);
      const pool = rows.filter(r => inPool(pack, s.pool, r));
      if (s.type === "profile") { expect(s.ids.length, p.id).toBe(3); continue; }
      const withX = pool.filter(r => val(M[s.x], r) !== null);
      const withBoth = s.type === "scatter" ? withX.filter(r => val(M[s.y], r) !== null) : withX;
      expect(withBoth.length, `preset ${p.id}`).toBeGreaterThanOrEqual(10);
    }
  });
  it("chart specs survive a URL round trip", () => {
    const presets = pack.charts.presets.map(p => makeSpec(pack, p.spec));
    for (const s of [defaultSpec(pack), ...presets]) {
      const back = decodeSpec(pack, encodeSpec(pack, s));
      expect(back.type).toBe(s.type);
      expect(back.pool).toEqual(s.pool);
      if (s.type !== "profile") expect(back.x).toBe(s.x);
      if (s.type === "scatter") { expect(back.y).toBe(s.y); expect(back.quads).toEqual(s.quads); }
      expect(back.title).toBe(s.title);
    }
  });
  it("garbage URLs fall back to defaults instead of breaking", () => {
    const s = decodeSpec(pack, "t=nope&x=notametric&c=zzz&lb=9999&pos=🏀&n=abc");
    const d = defaultSpec(pack);
    expect(s.type).toBe(d.type);
    expect(s.x).toBe(d.x);
    expect(s.labels).toBe(40);
  });
});
