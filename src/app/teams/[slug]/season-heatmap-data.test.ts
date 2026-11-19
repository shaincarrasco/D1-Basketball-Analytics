import { describe, expect, it } from "vitest";
import type { TeamGame } from "@/lib/types";
import type { LiveFinal } from "@/lib/live-ratings";
import { buildSeasonCalendar, marginLevel, seasonSummary, summaryText, weekdayMon, withLiveFinals } from "./season-heatmap-data";

let n = 0;
function game(day: string, pts: number | null, oppPts: number | null, extra: Partial<TeamGame> = {}): TeamGame {
  const result = pts == null || oppPts == null ? null : pts > oppPts ? "W" : "L";
  return {
    id: String(++n), date: `${day}T23:00:00.000Z`, day, status: result ? "final" : "scheduled", venue: "H",
    opp: "Opp", oppId: null, oppSlug: null, oppRank: null, oppConf: null, d1: true, conf: false,
    pts, oppPts, result, wp: null, projPts: null, projOppPts: null, offEff: null, defEff: null, pace: null, perf: null, quad: null,
    ...extra,
  };
}

describe("weekdayMon", () => {
  it("counts from Monday", () => {
    expect(weekdayMon("2026-11-02")).toBe(0); // Monday
    expect(weekdayMon("2026-11-08")).toBe(6); // Sunday
  });
});

describe("marginLevel", () => {
  it("steps at 5 and 12", () => {
    expect([1, 5, 6, 12, 13, 40].map(marginLevel)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe("buildSeasonCalendar", () => {
  it("returns null without games", () => {
    expect(buildSeasonCalendar([])).toBeNull();
  });

  it("spans Monday of the first game week to Sunday of the last game week", () => {
    const cal = buildSeasonCalendar([
      game("2026-11-04", 80, 70), // Wed
      game("2026-11-10", 60, 61), // Tue next week
      game("2026-12-02", null, null), // upcoming, Wed
    ])!;
    expect(cal.weeks[0][0].day).toBe("2026-11-02");
    expect(cal.weeks.at(-1)![6].day).toBe("2026-12-06");
    expect(cal.weeks).toHaveLength(5);
    expect(cal.weeks.every(w => w.length === 7)).toBe(true);
    const wed = cal.weeks[0][2];
    expect(wed).toMatchObject({ kind: "win", level: 2, gi: 0, row: 2, col: 0 });
    expect(cal.weeks[1][1]).toMatchObject({ kind: "loss", level: 1, gi: 1 });
    expect(cal.weeks[4][2]).toMatchObject({ kind: "upcoming", level: 0, gi: 2 });
    expect(cal.weeks[0][0]).toMatchObject({ kind: "none", game: null, gi: -1 });
    expect(cal.games.map(c => c.day)).toEqual(["2026-11-04", "2026-11-10", "2026-12-02"]);
    expect(cal.recentCol).toBe(1);
  });

  it("orders games by date even if given out of order", () => {
    const cal = buildSeasonCalendar([game("2026-11-20", 70, 50), game("2026-11-05", 70, 69)])!;
    expect(cal.games.map(c => c.day)).toEqual(["2026-11-05", "2026-11-20"]);
    expect(cal.games[1].level).toBe(3);
  });

  it("marks live and postponed games", () => {
    const cal = buildSeasonCalendar([game("2026-11-05", null, null, { status: "in_progress" }), game("2026-11-07", null, null, { status: "postponed" })])!;
    expect(cal.games.map(c => c.kind)).toEqual(["live", "off"]);
    expect(cal.recentCol).toBe(0);
  });

  it("labels months on the first week starting in them, dropping a crowded first label", () => {
    const cal = buildSeasonCalendar([game("2026-11-25", 70, 60), game("2027-01-15", null, null)])!;
    // Weeks start Nov 23, Nov 30, Dec 7 … Jan 11. Nov 23 and Nov 30 are both November.
    expect(cal.months.map(m => m.label)).toEqual(["Nov", "Dec", "Jan"]);
    expect(cal.months[1].col).toBe(2);
    const crowded = buildSeasonCalendar([game("2026-11-26", 70, 60), game("2026-12-20", null, null)])!;
    // Weeks start Nov 23 (Nov), Nov 30 (Nov), Dec 7 (Dec): kept. Starting Nov 30 alone would crowd.
    expect(crowded.months[0]).toEqual({ col: 0, label: "Nov" });
    const tight = buildSeasonCalendar([game("2026-11-30", 70, 60), game("2026-12-20", null, null)])!;
    expect(tight.months).toEqual([{ col: 1, label: "Dec" }]);
  });
});

describe("seasonSummary", () => {
  it("counts record, close games and the longest win streak in date order", () => {
    const s = seasonSummary([
      game("2026-11-10", 70, 68), game("2026-11-03", 50, 60), game("2026-11-12", 80, 60),
      game("2026-11-15", 75, 74), game("2026-11-18", 60, 63), game("2026-11-20", 90, 50), game("2026-12-01", null, null),
    ]);
    expect(s).toEqual({ w: 4, l: 2, closeW: 2, closeL: 1, longestWin: 3 });
    expect(summaryText(s)).toBe("4–2 · 2–1 in games decided by 5 or fewer · longest win streak 3");
  });

  it("drops parts with nothing to say", () => {
    expect(summaryText(seasonSummary([]))).toBe("No games played yet");
    expect(summaryText(seasonSummary([game("2026-11-03", 50, 70)]))).toBe("0–1");
  });
});

describe("withLiveFinals", () => {
  it("fills in results that finished after the refresh, from this team's side", () => {
    const g = game("2026-11-05", null, null, { id: "g1" });
    const finals = [{ id: "g1", day: "2026-11-05", homePts: 60, awayPts: 72, game: { home: { slug: "us" } } }] as unknown as LiveFinal[];
    expect(withLiveFinals([g], finals, "us")[0]).toMatchObject({ result: "L", pts: 60, oppPts: 72, status: "final" });
    expect(withLiveFinals([g], finals, "them")[0]).toMatchObject({ result: "W", pts: 72, oppPts: 60 });
    expect(withLiveFinals([g], null, "us")[0]).toBe(g);
  });
});
