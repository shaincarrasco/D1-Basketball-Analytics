import { describe, expect, it } from "vitest";
import type { LiveGame } from "@/lib/live";
import type { Game, GameSide } from "@/lib/types";
import { loopCopies, tickerItems } from "./score-ticker-items";

const side = (name: string, score: number | null): GameSide => ({
  id: name, slug: name.toLowerCase(), name, short: name.slice(0, 4).toUpperCase(), logo: null, color: null, conf: null,
  rank: null, adjEM: null, record: null, score, periods: null,
});
const game = (id: string, status: string, away: number | null, home: number | null, watch = 0): Game => ({
  id, date: "2026-11-18T23:00:00Z", status, neutral: false, confGame: false, venue: null, city: null, state: null, tournament: null,
  home: side(`Home${id}`, home), away: side(`Away${id}`, away), pred: null, watch, upset: null, box: null,
});
const liveGame = (over: Partial<LiveGame>): LiveGame => ({
  espnId: "x", state: "in", statusName: "STATUS_IN_PROGRESS", completed: false, period: 2, clock: 501, displayClock: "8:21",
  home: 40, away: 38, homePeriods: null, awayPeriods: null, label: "2nd 8:21", elapsed: null, ...over,
});

describe("tickerItems", () => {
  it("keeps live games and finals, drops scheduled ones, live first then by watch", () => {
    const games = [
      game("a", "final", 70, 65, 10),
      game("b", "scheduled", null, null, 99),
      game("c", "final", 60, 80, 50),
      game("d", "scheduled", null, null, 5),
    ];
    const live = new Map([["d", liveGame({ home: 22, away: 25 })]]);
    const items = tickerItems(games, live);
    expect(items.map(i => i.id)).toEqual(["d", "c", "a"]);
    expect(items[0]).toMatchObject({ live: true, status: "2nd 8:21", away: { score: 25 }, home: { score: 22 }, awayWon: true });
    expect(items[1]).toMatchObject({ live: false, status: "Final", awayWon: false });
  });

  it("uses ESPN's final label (overtime) and drops games without both scores", () => {
    const games = [game("a", "in_progress", null, null), game("b", "scheduled", null, null)];
    const live = new Map([["b", liveGame({ state: "post", statusName: "STATUS_FINAL", completed: true, label: "Final · OT", home: 81, away: 79 })]]);
    const items = tickerItems(games, live);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "b", live: false, status: "Final · OT" });
  });

  it("returns nothing when no game has started", () => {
    expect(tickerItems([game("a", "scheduled", null, null)], new Map())).toEqual([]);
  });
});

describe("loopCopies", () => {
  it("covers the viewport with at least one extra copy", () => {
    expect(loopCopies(0, 390)).toBe(0);
    expect(loopCopies(1200, 390)).toBe(1);
    expect(loopCopies(300, 390)).toBe(2);
    expect(loopCopies(100, 1000)).toBe(10);
  });
});
