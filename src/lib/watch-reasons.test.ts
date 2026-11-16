// Watch reasons: each branch from hand-built games, the priority order between them, and the null case.
import { describe, expect, it } from "vitest";
import { watchReason } from "./watch-reasons";
import type { Game, GameSide, TeamSummary } from "./types";

const side = (slug: string, name: string, short: string, rank: number | null): GameSide => ({
  id: slug, slug, name, short, logo: null, color: null, conf: null, rank, adjEM: null, record: null, score: null, periods: null,
});
/** Home = `home`, away = `away`; `wp` is the home win probability (null = no projection). */
function game(home: GameSide, away: GameSide, wp: number | null, over: Partial<Game> = {}): Game {
  return {
    id: "g", date: "2026-11-14T23:00:00.000Z", status: "scheduled", neutral: false, confGame: false, venue: null, city: null, state: null, tournament: null,
    home, away, pred: wp === null ? null : { wp, margin: (wp - 0.5) * 20, home: 70, away: 65, tempo: 70 },
    watch: 50, upset: null, box: null, ...over,
  };
}
/** Only the fields watchReason reads. */
const team = (slug: string, cw: number, cl: number, rank: number | null = null) => ({ slug, cw, cl, rank }) as unknown as TeamSummary;
const teams = (...list: TeamSummary[]) => new Map(list.map(t => [t.slug, t]));

const none = new Map<string, TeamSummary>();

describe("watchReason", () => {
  it("names both ranks, lower first, when both sides are DHR top 25", () => {
    const g = game(side("mich", "Michigan", "MICH", 11), side("ark", "Arkansas", "ARK", 4), 0.55);
    expect(watchReason(g, none)).toBe("Top-25 clash: No. 4 vs No. 11");
  });

  it("flags an upset watch when a ranked side is the underdog, naming the underdog's chance", () => {
    // Home is unranked and favoured at 0.59; away is ranked 18 and the underdog at 41%.
    const g = game(side("home", "Home U", "HOME", 90), side("away", "Ranked State", "RSU", 18), 0.59);
    expect(watchReason(g, none)).toBe("Upset watch: RSU has a 41% chance");
  });

  it("flags an upset watch when a top-25 favourite is below 62%, naming the unranked underdog", () => {
    // Away is ranked 9 and favoured at 0.56 (home 44%); the underdog is the home side.
    const g = game(side("home", "Home U", "HOME", 120), side("away", "Ranked State", "RSU", 9), 0.44);
    expect(watchReason(g, none)).toBe("Upset watch: HOME has a 44% chance");
  });

  it("does not flag an upset when the top-25 favourite is 62% or more", () => {
    // Home ranked 20 at 0.66; the underdog is unranked, so no upset line. Probability is outside the coin-flip band too.
    const g = game(side("home", "Ranked", "RNK", 20), side("away", "Unranked", "UNR", 150), 0.66);
    expect(watchReason(g, none)).toBeNull();
  });

  it("gives a coin flip for a home win probability between 42% and 58%, away first", () => {
    const g = game(side("home", "Home U", "HOME", 150), side("away", "Away U", "AWAY", 160), 0.52);
    expect(watchReason(g, none)).toBe("Coin flip: 48–52");
  });

  it("names a top-10 side that is on the floor", () => {
    const g = game(side("home", "Houston", "HOU", 3), side("away", "Away U", "AWAY", 160), 0.9);
    expect(watchReason(g, none)).toBe("No. 3 Houston on the floor");
  });

  it("names a conference race when both teams are within 3 conference wins", () => {
    const g = { ...game(side("home", "Home U", "HOME", 150), side("away", "Away U", "AWAY", 160), 0.8), confGame: true };
    const t = teams(team("home", 4, 1), team("away", 2, 2));
    expect(watchReason(g, t)).toBe("Conference race: AWAY 2–2, HOME 4–1");
  });

  it("skips the conference line when the teams are more than 3 wins apart or have not played league games", () => {
    const g = { ...game(side("home", "Home U", "HOME", 150), side("away", "Away U", "AWAY", 160), 0.8), confGame: true };
    expect(watchReason(g, teams(team("home", 6, 0), team("away", 1, 3)))).toBeNull();
    expect(watchReason(g, teams(team("home", 0, 0), team("away", 0, 0)))).toBeNull();
  });

  it("returns null for an unremarkable game", () => {
    const g = game(side("home", "Home U", "HOME", 150), side("away", "Away U", "AWAY", 160), 0.8);
    expect(watchReason(g, none)).toBeNull();
  });

  it("returns null for live, final and postponed games even when a branch would match", () => {
    const base = game(side("home", "Houston", "HOU", 3), side("away", "Ranked", "RNK", 4), 0.5);
    for (const status of ["in_progress", "final", "postponed"]) expect(watchReason({ ...base, status }, none)).toBeNull();
  });
});

describe("watchReason without projections", () => {
  it("never quotes a win chance, and falls through to the next reason the data supports", () => {
    const upset = game(side("home", "Home U", "HOME", 90), side("away", "Ranked State", "RSU", 8), 0.59);
    expect(watchReason(upset, none, { projections: false })).toBe("No. 8 Ranked State on the floor");
    const flip = game(side("home", "Home U", "HOME", 90), side("away", "Away U", "AWAY", 95), 0.5);
    expect(watchReason(flip, none, { projections: false })).toBeNull();
  });
});
