import { describe, expect, it } from "vitest";
import { canPeek, headlineStats, LONG_PRESS_MS, MOVE_CANCEL_PX, movedTooFar, nextGameText, peekFavKey, peekHref } from "./peek-logic";

describe("peek gesture thresholds", () => {
  it("uses a 450ms hold and a 10px slop", () => {
    expect(LONG_PRESS_MS).toBe(450);
    expect(MOVE_CANCEL_PX).toBe(10);
  });
  it("cancels only past 10px of travel in any direction", () => {
    expect(movedTooFar(0, 0)).toBe(false);
    expect(movedTooFar(10, 0)).toBe(false);
    expect(movedTooFar(6, 8)).toBe(false); // exactly 10
    expect(movedTooFar(0, -11)).toBe(true);
    expect(movedTooFar(8, 8)).toBe(true); // ~11.3 diagonally
  });
  it("only touch and pen can peek", () => {
    expect(canPeek("touch")).toBe(true);
    expect(canPeek("pen")).toBe(true);
    expect(canPeek("mouse")).toBe(false);
  });
});

describe("peek card text", () => {
  const next = { id: "1", date: "2026-11-22T17:00:00Z", opp: "Duke", oppSlug: "duke", oppRank: 4, venue: "A" as const, wp: 0.4 };
  it("writes the next game in Eastern time", () => {
    expect(nextGameText(next)).toBe("Sun, Nov 22 at Duke (No. 4)");
    expect(nextGameText({ ...next, venue: "N", oppRank: null })).toBe("Sun, Nov 22 vs Duke, neutral");
    expect(nextGameText({ ...next, date: "2026-11-23T03:00:00Z", venue: "H" })).toBe("Sun, Nov 22 vs Duke (No. 4)");
    expect(nextGameText(null)).toBeNull();
  });
  it("gives three per-game stats with dashes for missing values", () => {
    expect(headlineStats({ pts: 18.25, reb: null, ast: 4 })).toEqual([
      { label: "PPG", value: "18.3" }, { label: "RPG", value: "—" }, { label: "APG", value: "4.0" },
    ]);
  });
  it("links and follows the right thing", () => {
    const team = { kind: "team" as const, slug: "duke", name: "Duke", logo: null, rank: 1, w: 3, l: 0, confName: "ACC", next: null };
    const player = { kind: "player" as const, id: "p9", name: "A", pos: "G", team: null, stats: [] };
    expect(peekHref(team)).toBe("/teams/duke/");
    expect(peekHref(player)).toBe("/player/?id=p9");
    expect(peekFavKey(team)).toEqual({ kind: "teams", id: "duke" });
    expect(peekFavKey(player)).toEqual({ kind: "players", id: "p9" });
  });
});
