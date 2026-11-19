import { describe, expect, it } from "vitest";
import { PULL, pullArmed, pullDistance, readPull, updatedAgo } from "./pull-refresh";

describe("pullDistance", () => {
  it("does not move for upward or no travel", () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(-40)).toBe(0);
    expect(pullDistance(Number.NaN)).toBe(0);
  });
  it("follows most of the finger at first, with resistance", () => {
    const d = pullDistance(20);
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(20);
  });
  it("grows with travel but never passes the maximum", () => {
    expect(pullDistance(200)).toBeGreaterThan(pullDistance(100));
    expect(pullDistance(10_000)).toBeLessThan(PULL.max);
  });
  it("arms after a deliberate pull, not a nudge", () => {
    expect(pullArmed(pullDistance(40))).toBe(false);
    expect(pullArmed(pullDistance(220))).toBe(true);
  });
});

describe("readPull", () => {
  it("waits inside the slop", () => {
    expect(readPull(3, 4)).toBeNull();
  });
  it("reads a mostly downward move as a pull", () => {
    expect(readPull(4, 20)).toBe("pull");
  });
  it("leaves upward and sideways moves alone", () => {
    expect(readPull(0, -20)).toBe("other");
    expect(readPull(20, 10)).toBe("other");
    expect(readPull(-15, 15)).toBe("other");
  });
});

describe("updatedAgo", () => {
  it("reads naturally at every scale", () => {
    expect(updatedAgo(-500)).toBe("Updated just now");
    expect(updatedAgo(3_000)).toBe("Updated just now");
    expect(updatedAgo(12_400)).toBe("Updated 12s ago");
    expect(updatedAgo(59_999)).toBe("Updated 59s ago");
    expect(updatedAgo(3 * 60_000 + 5_000)).toBe("Updated 3 min ago");
    expect(updatedAgo(2 * 3600_000 + 1)).toBe("Updated 2 hr ago");
  });
});
