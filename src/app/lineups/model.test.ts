import { describe, expect, it } from "vitest";
import { projectLineup, verdict, warnings, type LabPlayer } from "./model.mjs";

const player = (id: string, over: Partial<LabPlayer> = {}): LabPlayer => ({
  id, n: `Player ${id}`, t: "team", pos: "G", ht: 76, mpg: 30, g: 3, o: 6, d: 6, se: 2, op: 300,
  tp: 36, tpa40: 6, ft: 75, ast: 20, tov: 15, usg: 20, orb: 4, drb: 14, blk: 4.5, stl: 2, ...over,
});

describe("lineup lab model", () => {
  const five = ["a", "b", "c", "d", "e"].map(id => player(id));

  it("scales the rating sum by the reality check but leaves fit adjustments alone", () => {
    const raw = projectLineup(five, 104);
    const cal = projectLineup(five, 104, 0.4);
    expect(raw.base.off + raw.base.def).toBe(60);
    expect(cal.raw).toBeCloseTo(raw.net, 6);
    expect(cal.net).toBeCloseTo(0.4 * 60 + raw.fit.total, 6);
    expect(cal.off + cal.def).toBeCloseTo(cal.net, 6);
    expect(cal.ptsFor).toBeCloseTo(104 + cal.off, 6);
  });

  it("grades against the reference list", () => {
    const ref = Array.from({ length: 100 }, (_, i) => i - 50); // -50 … 49
    expect(verdict(60, ref)).toMatchObject({ label: "Elite", beyond: true, tone: "good" });
    expect(verdict(46, ref).label).toBe("Elite");
    expect(verdict(31, ref).label).toBe("Very good");
    expect(verdict(15, ref)).toMatchObject({ label: "Good", beyond: false });
    expect(verdict(-5, ref).label).toBe("Average");
    expect(verdict(-49.5, ref)).toMatchObject({ label: "Weak", tone: "bad" });
    expect(verdict(3, []).pct).toBeNull();
  });

  it("gives every warning a short title and flags five bigs", () => {
    const bigs = five.map(p => ({ ...p, pos: "C" as const, ht: 84, tp: 20, ast: 5 }));
    const w = warnings(bigs);
    expect(w.map(x => x.key)).toEqual(expect.arrayContaining(["handler", "spacing", "bigs", "guards"]));
    for (const x of w) expect(x.title.length).toBeGreaterThan(0);
    expect(w.find(x => x.key === "bigs")?.title).toBe("Five bigs");
  });
});
