import { describe, expect, it } from "vitest";
import { defaultDay, factValue, pctPair, pickOf, pickRight, siteNotes, stateOf, surfaceKey, winnerOf, type DMatch } from "./deuce";

const player = (id: string, name: string) => ({ id, name, country: null, baseline_id: null, elo: null, rank: null });
const match = (o: Partial<DMatch>): DMatch => ({
  id: "1", date: "2026-11-16T13:00:00Z", tour: "ATP", level: "250", tournament: "T", surface: "Indoor Hard", round: "R1",
  status: "scheduled", score: null, winner: null, p1: player("espn:1", "A B"), p2: player("espn:2", "C D"),
  p1_prob: 0.6, p2_prob: 0.4, set_probs: null, low_data: false, brief: false, ...o,
});

describe("deuce helpers", () => {
  it("reads finished matches and whether the pick was right", () => {
    expect(stateOf(match({ status: "final" }))).toBe("done");
    expect(stateOf(match({ status: "finished" }))).toBe("done");
    expect(stateOf(match({ status: "live" }))).toBe("live");
    expect(pickRight(match({ status: "finished", winner: "p1" }))).toBe(true);
    expect(pickRight(match({ status: "finished", winner: "espn:2" }))).toBe(false);
    expect(pickRight(match({ status: "scheduled", winner: null }))).toBeNull();
    expect(winnerOf(match({ winner: "espn:2" }))).toBe("p2");
  });
  it("has no pick on a 50-50 or a missing probability", () => {
    expect(pickOf({ p1_prob: 0.5, p2_prob: 0.5 })).toBeNull();
    expect(pickOf({ p1_prob: null, p2_prob: null })).toBeNull();
    expect(pickOf({ p1_prob: null, p2_prob: 0.7 })).toBe("p2");
  });
  it("shows percentages that add to 100 and never a fake certainty", () => {
    expect(pctPair({ p1_prob: 0.515, p2_prob: 0.485 })).toEqual(["52%", "48%"]);
    expect(pctPair({ p1_prob: 0.998, p2_prob: 0.002 })).toEqual([">99%", "<1%"]);
    expect(pctPair({ p1_prob: null, p2_prob: null })).toEqual(["—", "—"]);
  });
  it("treats null as missing", () => {
    expect(factValue(null)).toBe("—");
    expect(factValue(0)).toBe("0");
    expect(factValue(true)).toBe("Yes");
  });
  it("maps surfaces, picks the opening day, and drops betting notes", () => {
    expect(surfaceKey("Indoor Hard")).toBe("hard");
    expect(surfaceKey(null)).toBe("other");
    expect(defaultDay(["2026-11-14", "2026-11-17"], "2026-11-16")).toBe("2026-11-17");
    expect(defaultDay(["2026-11-14", "2026-11-15"], "2026-11-16")).toBe("2026-11-15");
    expect(siteNotes(["Walk-forward splits.", "Betting: flat $1 stakes.", "No odds in the database."])).toEqual(["Walk-forward splits."]);
  });
});
