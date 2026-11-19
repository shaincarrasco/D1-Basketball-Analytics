import { describe, expect, it } from "vitest";
import { isSameTab, normPath, parsePositions, remember, restoreStep, scrollKey, swipeDismiss, tabTopAction } from "./scroll-memory";

describe("scrollKey", () => {
  it("normalises trailing slashes and search", () => {
    expect(scrollKey("/games/", "?d=2026-11-18")).toBe("/games?d=2026-11-18");
    expect(scrollKey("/games", "d=2026-11-18")).toBe("/games?d=2026-11-18");
    expect(scrollKey("/", "")).toBe("/");
    expect(scrollKey("/rankings/", "?")).toBe("/rankings");
    expect(normPath("")).toBe("/");
  });
});

describe("positions", () => {
  it("parses junk safely", () => {
    expect(parsePositions(null)).toEqual({});
    expect(parsePositions("nope")).toEqual({});
    expect(parsePositions("[1,2]")).toEqual({});
    expect(parsePositions('{"/a":120,"/b":"x","/c":-4}')).toEqual({ "/a": 120 });
  });
  it("keeps the newest entries and moves a re-saved key to the end", () => {
    let m = {};
    for (let i = 0; i < 5; i++) m = remember(m, `/p${i}`, i * 100, 3);
    expect(Object.keys(m)).toEqual(["/p2", "/p3", "/p4"]);
    m = remember(m, "/p2", 999.6, 3);
    expect(Object.keys(m)).toEqual(["/p3", "/p4", "/p2"]);
    expect((m as Record<string, number>)["/p2"]).toBe(1000);
  });
});

describe("restoreStep", () => {
  const base = { target: 1500, docHeight: 3000, viewport: 800, current: 0, elapsed: 0 };
  it("does nothing for the top or when already there", () => {
    expect(restoreStep({ ...base, target: 0 })).toBe("done");
    expect(restoreStep({ ...base, current: 1501 })).toBe("done");
  });
  it("scrolls once the page is tall enough", () => {
    expect(restoreStep(base)).toBe("scroll");
  });
  it("waits while the page is still short", () => {
    expect(restoreStep({ ...base, docHeight: 1200, elapsed: 500 })).toBe("wait");
  });
  it("after the timeout scrolls as far as it can, or gives up", () => {
    expect(restoreStep({ ...base, docHeight: 1800, elapsed: 2100 })).toBe("scroll");
    expect(restoreStep({ ...base, docHeight: 800, elapsed: 2100 })).toBe("give-up");
  });
});

describe("tabs", () => {
  it("knows when a tap is on the current page", () => {
    expect(isSameTab("/games", "", "/games/")).toBe(true);
    expect(isSameTab("/", "", "/")).toBe(true);
    expect(isSameTab("/games/", "?d=2026-11-10", "/games/")).toBe(false);
    expect(isSameTab("/games/live/", "", "/games/")).toBe(false);
  });
  it("only scrolls when away from the top", () => {
    expect(tabTopAction(0)).toBe("none");
    expect(tabTopAction(400)).toBe("scroll");
  });
});

describe("swipeDismiss", () => {
  it("needs a downward pull or a flick", () => {
    expect(swipeDismiss(-50, 100)).toBe(false);
    expect(swipeDismiss(40, 400)).toBe(true);
    expect(swipeDismiss(20, 20)).toBe(true);
    expect(swipeDismiss(20, 400)).toBe(false);
    expect(swipeDismiss(8, 5)).toBe(false);
  });
});
