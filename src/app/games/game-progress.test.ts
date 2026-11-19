import { describe, expect, it } from "vitest";
import { gameProgress, progressFromClock, teamCode, tipCountdown } from "./game-progress";

describe("progressFromClock", () => {
  it("runs 0 to 1 across two 20-minute halves", () => {
    expect(progressFromClock(1, 1200)).toBe(0);
    expect(progressFromClock(1, 600)).toBe(0.25);
    expect(progressFromClock(1, 0)).toBe(0.5); // halftime
    expect(progressFromClock(2, 600)).toBe(0.75);
    expect(progressFromClock(2, 0)).toBe(1);
  });
  it("measures overtime against regulation plus every 5-minute period started", () => {
    expect(progressFromClock(3, 300)).toBeCloseTo(2400 / 2700);
    expect(progressFromClock(3, 0)).toBe(1);
    expect(progressFromClock(4, 150)).toBeCloseTo((2700 + 150) / 3000);
  });
  it("is safe with odd input", () => {
    expect(progressFromClock(0, 1200)).toBe(0);
    expect(progressFromClock(1, 5000)).toBe(0);
    expect(progressFromClock(2, -5)).toBe(1);
    expect(progressFromClock(Number.NaN, 0)).toBe(0);
  });
});

describe("gameProgress", () => {
  it("is full for finals and empty for scheduled games", () => {
    expect(gameProgress({ status: "final" })).toEqual({ phase: "final", value: 1 });
    expect(gameProgress({ status: "scheduled" })).toEqual({ phase: "scheduled", value: 0 });
    expect(gameProgress({ status: "postponed" })).toEqual({ phase: "other", value: null });
  });
  it("reads a live game from the live clock", () => {
    expect(gameProgress({ status: "in_progress" }, { state: "in", period: 2, clock: 600 })).toEqual({ phase: "live", value: 0.75 });
  });
  it("falls back to the score flow, then to unknown", () => {
    expect(gameProgress({ status: "in_progress", flow: [[0, 0, 0], [1800, 40, 38]] })).toEqual({ phase: "live", value: 0.75 });
    expect(gameProgress({ status: "in_progress", flow: [[2550, 70, 70]] }).value).toBeCloseTo(2550 / 2700);
    expect(gameProgress({ status: "in_progress" })).toEqual({ phase: "live", value: null });
  });
});

describe("tipCountdown", () => {
  const now = Date.UTC(2026, 10, 18, 18, 0, 0);
  it("counts down in hours and minutes under a day", () => {
    expect(tipCountdown(now + (2 * 60 + 14) * 60_000, now)).toBe("Tip in 2h 14m");
    expect(tipCountdown(now + 9 * 60_000 + 20_000, now)).toBe("Tip in 10m");
    expect(tipCountdown(now + 3 * 3600_000, now)).toBe("Tip in 3h");
    expect(tipCountdown(now + 30_000, now)).toBe("Tip in 1m");
  });
  it("gives nothing at a day or more out, or once tip time has passed", () => {
    expect(tipCountdown(now + 24 * 3600_000, now)).toBeNull();
    expect(tipCountdown(now, now)).toBeNull();
    expect(tipCountdown(now - 60_000, now)).toBeNull();
  });
});

describe("teamCode", () => {
  it("uses the feed's short code, else initials", () => {
    expect(teamCode({ short: "vill", name: "Villanova" })).toBe("VILL");
    expect(teamCode({ short: null, name: "Miami (OH)-Middletown" })).toBe("MM");
    expect(teamCode({ short: null, name: "Bluefield" })).toBe("BLUE");
  });
});
