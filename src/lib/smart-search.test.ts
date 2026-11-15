import { describe, expect, it } from "vitest";
import { parseQuery, type SmartTeam } from "./smart-search";

const T = (slug: string, name: string, short: string | null, confSlug: string, confName: string): SmartTeam =>
  ({ slug, name, short, confSlug, confName });
const teams: SmartTeam[] = [
  T("duke", "Duke", "Duke", "acc", "Atlantic Coast Conference"),
  T("north-carolina", "North Carolina", "UNC", "acc", "Atlantic Coast Conference"),
  T("gonzaga", "Gonzaga", "Gonzaga", "wcc", "West Coast Conference"),
  T("kentucky", "Kentucky", "Kentucky", "sec", "Southeastern Conference"),
  T("ohio-state", "Ohio State", "Ohio St.", "big-ten", "Big Ten Conference"),
  T("michigan-state", "Michigan State", "Michigan St.", "big-ten", "Big Ten Conference"),
  T("uconn", "UConn", "UConn", "big-east", "Big East Conference"),
  T("byu", "BYU", "BYU", "mwc", "Mountain West Conference"),
];
const ctx = { teams };
const q = (s: string) => parseQuery(s, ctx);

// Sort keys each view has in players-board.tsx VIEW_STATS. Used to check every emitted sort key.
const VIEW_KEYS: Record<string, string[]> = {
  scoring: ["pts", "tpPct", "ftPct", "ts"],
  impact: ["dpr"],
  efficiency: ["ortg", "ts"],
  advanced: ["usg"],
  playmaking: ["ast"],
  "rebounding-defense": ["reb", "stl", "blk"],
  "shooting-profile": ["dunks"],
};

describe("parseQuery: matchups", () => {
  it("builds a neutral-site matchup from 'X vs Y'", () => {
    const r = q("Duke vs North Carolina");
    expect(r?.href).toBe("/matchup/?a=duke&b=north-carolina&site=n");
    expect(r?.label).toBe("Duke vs North Carolina");
    expect(r?.chips).toEqual([
      { kind: "team", label: "Duke" },
      { kind: "team", label: "North Carolina" },
      { kind: "action", label: "Matchup" },
    ]);
  });
  it("accepts v and versus, and resolves aliases", () => {
    expect(q("unc v duke")?.href).toBe("/matchup/?a=north-carolina&b=duke&site=n");
    expect(q("Zags versus Kentucky")?.href).toBe("/matchup/?a=gonzaga&b=kentucky&site=n");
  });
  it("puts the second team at home for 'X at Y'", () => {
    const r = q("Duke at Ohio State");
    expect(r?.href).toBe("/matchup/?a=duke&b=ohio-state&site=b");
    expect(r?.label).toBe("Duke at Ohio State");
  });
  it("returns null when a side is not a team in the list", () => {
    expect(q("Ohio State vs USC")).toBeNull();
    expect(q("North Carolina vs")).toBeNull();
    expect(q("Duke vs Duke")).toBeNull();
  });
});

describe("parseQuery: team tabs", () => {
  it("opens the roster tab from a short name", () => {
    expect(q("Ohio State roster")?.href).toBe("/teams/ohio-state/?tab=roster");
  });
  it("maps news to the more tab and accepts a possessive", () => {
    expect(q("UNC's news")?.href).toBe("/teams/north-carolina/?tab=more");
  });
  it("matches multi-word names greedily", () => {
    expect(q("north carolina schedule")?.href).toBe("/teams/north-carolina/?tab=schedule");
  });
  it("returns null for a bare team name or a team with an unknown word", () => {
    expect(q("Duke")).toBeNull();
    expect(q("Duke points")).toBeNull();
  });
});

describe("parseQuery: stat leaderboards", () => {
  it("maps a stat with a conference", () => {
    const r = q("best 3pt shooters in the SEC");
    expect(r?.href).toBe("/players/?view=scoring&sort=tpPct&conf=sec");
    expect(r?.label).toBe("3P% leaders · SEC");
    expect(r?.chips).toEqual([{ kind: "stat", label: "3P%" }, { kind: "conf", label: "SEC" }]);
  });
  it("maps a stat with a conference alias and a position", () => {
    const r = q("top rebounders big ten guards");
    expect(r?.href).toBe("/players/?view=rebounding-defense&sort=reb&conf=big-ten&pos=G");
    expect(r?.label).toBe("Rebounds leaders · Big Ten guards");
  });
  it("maps free throws with a position", () => {
    expect(q("free throws ACC forwards")?.href).toBe("/players/?view=scoring&sort=ftPct&conf=acc&pos=F");
  });
  it("maps a stat alone", () => {
    expect(q("steals")?.href).toBe("/players/?view=rebounding-defense&sort=stl");
    expect(q("points")?.href).toBe("/players/?view=scoring&sort=pts");
    expect(q("true shooting")?.href).toBe("/players/?view=efficiency&sort=ts");
  });
  it("maps impact and understands a multi-word conference", () => {
    expect(q("impact in the big east")?.href).toBe("/players/?view=impact&sort=dpr&conf=big-east");
  });
  it("never emits a sort key that its view does not have", () => {
    const queries = ["3pt", "points", "rebounds", "steals", "blocks", "assists", "efficiency", "usage", "impact", "free throws", "dunks", "true shooting"];
    for (const s of queries) {
      const href = q(s)?.href ?? "";
      const params = new URL(href, "https://x.test").searchParams;
      expect(VIEW_KEYS[params.get("view")!], s).toContain(params.get("sort"));
    }
  });
});

describe("parseQuery: no match", () => {
  it("returns null for nonsense", () => {
    expect(q("asdf qwerty")).toBeNull();
    expect(q("")).toBeNull();
    expect(q("   ")).toBeNull();
  });
  it("returns null for a position or conference without a stat", () => {
    expect(q("who are the best guards")).toBeNull();
    expect(q("SEC")).toBeNull();
  });
  it("returns null for a plain player name", () => {
    expect(q("Caleb Wilson")).toBeNull();
  });
});

describe("prospects queries", () => {
  it("top recruits → prospects page", () => {
    expect(parseQuery("top recruits", ctx)?.href).toBe("/players/prospects/");
  });
  it("2028 prospects → that class", () => {
    expect(parseQuery("2028 prospects", ctx)?.href).toBe("/players/prospects/?class=2028");
  });
});

