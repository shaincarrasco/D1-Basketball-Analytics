// The validator must actually catch the mistakes a new pack is likely to make.
import { describe, expect, it } from "vitest";
import { pack as basketball, fixtures } from "@/sports/basketball";
import { decodeSpec, decodeWeights, encodeSpec, makeSpec, rankPool, sanitizePool, validatePack, withDefaults, type SportPack } from "@/sport-kit";
import type { PlayerRow } from "@/app/players/player-stats";

const broken = (patch: (p: SportPack<PlayerRow>) => void) => {
  const p: SportPack<PlayerRow> = structuredClone({ ...basketball, metrics: [], filters: [], entity: undefined as never });
  Object.assign(p, { metrics: basketball.metrics, filters: basketball.filters, entity: basketball.entity });
  patch(p);
  return validatePack(p).join("\n");
};

describe("validatePack catches", () => {
  it("framework weights on unknown stats", () => expect(broken(p => { p.frameworks = [{ key: "x", label: "X", blurb: "", weights: [["nope", 10]] }]; })).toMatch(/unknown metric "nope"/));
  it("presets in unknown sections", () => expect(broken(p => { p.charts.presets = [{ ...p.charts.presets[0], section: "Nowhere" }]; })).toMatch(/section "Nowhere"/));
  it("filter keys that collide with engine URL params", () => expect(broken(p => { p.filters = [...p.filters, { ...p.filters[0], key: "t" }]; })).toMatch(/collides/));
  it("long quadrant captions", () => expect(broken(p => { p.charts.presets = [{ ...p.charts.presets[0], spec: { ...p.charts.presets[0].spec, quads: ["x".repeat(40), "", "", ""] } }]; })).toMatch(/longer than 32/));
  it("unsorted tiers", () => expect(broken(p => { p.tiers = [{ min: 50, label: "A" }, { min: 90, label: "B" }, { min: 0, label: "C" }]; })).toMatch(/sorted/));
  it("metrics in undeclared groups", () => expect(broken(p => { p.metricGroups = p.metricGroups.slice(1); })).toMatch(/isn't in metricGroups/));
});

describe("basketball compatibility", () => {
  it("decodes chart links made before the sport kit", () => {
    const s = decodeSpec(basketball, "t=scatter&x=tpa40&y=tpPct&c=conf&hc=big-ten&conf=sec&pos=G&min=10&g=3&st=4&q=A|B|C|D&ti=Old");
    expect(s).toMatchObject({ type: "scatter", x: "tpa40", y: "tpPct", color: "group", hiGroup: "big-ten", title: "Old", quads: ["A", "B", "C", "D"] });
    expect(s.pool).toEqual({ conf: "sec", pos: "G", min: "10", g: "3", st: "4" });
  });
  it("still writes the same URL keys for pools", () => {
    const qs = encodeSpec(basketball, makeSpec(basketball, { pool: { conf: "acc", pos: "C", min: "20" } }));
    expect(qs).toContain("conf=acc"); expect(qs).toContain("pos=C"); expect(qs).toContain("min=20");
  });
  it("shrinks small samples toward average", () => {
    const rows = fixtures();
    const w = basketball.frameworks[0].weights, pool = withDefaults(basketball);
    const raw = rankPool(basketball, rows, pool, w, "all", false), adj = rankPool(basketball, rows, pool, w, "all", true);
    const spread = (xs: { blend: number }[]) => Math.max(...xs.map(x => Math.abs(x.blend - 0.5)));
    expect(spread(adj)).toBeLessThan(spread(raw));
  });
});

describe("hostile or stale links", () => {
  it("ignore prototype keys like constructor and __proto__", () => {
    const s = decodeSpec(basketball, "x=constructor&y=__proto__&m=toString,ts");
    expect(s.x).toBe(basketball.charts.defaultX);
    expect(s.y).toBe(basketball.charts.defaultY);
    expect(s.metrics).toEqual(["ts"]);
    expect(decodeWeights(basketball, "constructor:10,toString:5")).toBeNull();
  });
  it("drop duplicate stats, weights and ids", () => {
    expect(decodeWeights(basketball, "ts:10,ts:20,usg:5")).toEqual([["ts", 10], ["usg", 5]]);
    expect(decodeSpec(basketball, "ids=a,a,b&m=ts,ts").ids).toEqual(["a", "b"]);
  });
  it("reset unknown conferences once data has loaded", () => {
    const lists = { conf: [["sec", "SEC"]] as [string, string][] };
    const bad = withDefaults(basketball, { conf: "bogus", min: "20" });
    expect(sanitizePool(basketball, bad, lists)).toEqual({ ...bad, conf: "all" });
    const ok = withDefaults(basketball, { conf: "sec" });
    expect(sanitizePool(basketball, ok, lists)).toBe(ok);
  });
});
