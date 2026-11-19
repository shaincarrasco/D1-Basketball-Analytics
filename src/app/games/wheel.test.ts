import { describe, expect, it } from "vitest";
import { WHEEL, anchorIndex, flickTarget, rubberBand, wheelPose } from "./wheel";

describe("wheelPose", () => {
  it("puts the centre day flat, full size and fully visible", () => {
    const p = wheelPose(0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(p.rotate).toBeCloseTo(0);
    expect(p.scale).toBe(1);
    expect(p.opacity).toBe(1);
  });
  it("curves and fades days symmetrically toward the edges", () => {
    const r = wheelPose(1), l = wheelPose(-1);
    expect(r.x).toBeCloseTo(-l.x);
    expect(r.y).toBeCloseTo(l.y);
    expect(r.y).toBeGreaterThan(0);
    expect(r.rotate).toBeCloseTo(WHEEL.degPerDay);
    expect(Math.abs(r.x - WHEEL.step)).toBeLessThan(1);
    expect(wheelPose(2).opacity).toBeLessThan(r.opacity);
    expect(wheelPose(WHEEL.reach + 1).opacity).toBeCloseTo(0);
    expect(wheelPose(10).scale).toBe(0.7);
  });
});

describe("rubberBand", () => {
  it("passes positions in range and resists past the ends", () => {
    expect(rubberBand(3, 0, 9)).toBe(3);
    expect(rubberBand(-3, 0, 9)).toBeCloseTo(-0.99);
    expect(rubberBand(12, 0, 9)).toBeCloseTo(9.99);
  });
});

describe("flickTarget", () => {
  it("rounds a slow release to the nearest day", () => {
    expect(flickTarget(4.4, 0, 10)).toBe(4);
    expect(flickTarget(4.6, 0, 10)).toBe(5);
  });
  it("carries a fast flick several days and clamps at the ends", () => {
    expect(flickTarget(4, 20, 30)).toBe(8);
    expect(flickTarget(4, -20, 30)).toBe(0);
    expect(flickTarget(28, 40, 30)).toBe(29);
    expect(flickTarget(0, 0, 0)).toBe(0);
  });
});

describe("anchorIndex", () => {
  const days = ["2026-11-03", "2026-11-05", "2026-11-09"];
  it("finds the day, or the next listed one for a day without games", () => {
    expect(anchorIndex(days, "2026-11-05")).toBe(1);
    expect(anchorIndex(days, "2026-11-06")).toBe(2);
    expect(anchorIndex(days, "2026-11-01")).toBe(0);
    expect(anchorIndex(days, "2026-12-01")).toBe(2);
    expect(anchorIndex([], "2026-12-01")).toBe(0);
  });
});
