import { describe, expect, it } from "vitest";
import { dragOffset, lockAxis, nearEdge, neighbourDays, swipeDirection } from "./swipe-days-logic";

describe("lockAxis", () => {
  it("waits inside the slop", () => {
    expect(lockAxis(5, 4)).toBeNull();
  });
  it("locks sideways only when horizontal movement clearly dominates", () => {
    expect(lockAxis(30, 5)).toBe("x");
    expect(lockAxis(-30, 10)).toBe("x");
  });
  it("hands diagonal and vertical moves to the page's scroll", () => {
    expect(lockAxis(15, 12)).toBe("y");
    expect(lockAxis(2, 30)).toBe("y");
    expect(lockAxis(15, 10)).toBe("y");
  });
});

describe("swipeDirection", () => {
  it("swipe left goes to the next day, right to the previous", () => {
    expect(swipeDirection(-90, 10)).toBe("next");
    expect(swipeDirection(90, -10)).toBe("prev");
  });
  it("ignores short swipes", () => {
    expect(swipeDirection(-60, 0)).toBeNull();
    expect(swipeDirection(40, 0)).toBeNull();
  });
  it("ignores swipes that drift too far vertically", () => {
    expect(swipeDirection(-90, 61)).toBeNull();
    expect(swipeDirection(-90, 59)).toBe("next");
  });
});

describe("dragOffset", () => {
  it("follows closely when there is a day that way", () => {
    expect(dragOffset(100, true)).toBeCloseTo(85);
    expect(dragOffset(-100, true)).toBeCloseTo(-85);
  });
  it("barely moves past the first or last day", () => {
    expect(Math.abs(dragOffset(300, false))).toBeLessThan(40);
    expect(dragOffset(-300, false)).toBeLessThan(0);
    expect(dragOffset(0, false)).toBeCloseTo(0);
  });
});

describe("neighbourDays", () => {
  const days = [{ day: "2026-11-10" }, { day: "2026-11-12" }, { day: "2026-11-13" }];
  it("steps to the listed days either side", () => {
    expect(neighbourDays(days, "2026-11-12")).toEqual({ prev: "2026-11-10", next: "2026-11-13" });
  });
  it("has nothing past the ends", () => {
    expect(neighbourDays(days, "2026-11-10")).toEqual({ prev: null, next: "2026-11-12" });
    expect(neighbourDays(days, "2026-11-13")).toEqual({ prev: "2026-11-12", next: null });
  });
  it("finds the nearest listed days for an unlisted day", () => {
    expect(neighbourDays(days, "2026-11-11")).toEqual({ prev: "2026-11-10", next: "2026-11-12" });
    expect(neighbourDays(days, "2026-12-01")).toEqual({ prev: "2026-11-13", next: null });
  });
});

describe("nearEdge", () => {
  it("leaves the screen edges to the browser", () => {
    expect(nearEdge(5, 390)).toBe(true);
    expect(nearEdge(380, 390)).toBe(true);
    expect(nearEdge(200, 390)).toBe(false);
  });
});
