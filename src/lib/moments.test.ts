// Moment engine: every candidate type from hand-built game states, in both home/away
// orientations, and through ESPN's own payload shapes (scoreboard and summary), including
// ESPN listing the teams the other way round from our data.
import { describe, expect, it } from "vitest";
import { matchEvents, type EspnEvent, type LiveGame } from "./live";
import { parseSummary, type LiveSummary } from "./live-game";
import { bestMoment, biggestRun, excitement, flowStats, gameMoments, playMoments, scoreboardMoments, shooterName, timePhrase, type Moment, type MomentClock } from "./moments";
import type { Game, GameSide } from "./types";
import { elapsedFrom, type FlowPoint } from "./win-prob";

// ---- fixtures ------------------------------------------------------------------------------

const HOME_ESPN = "154", AWAY_ESPN = "253";
const side = (id: string, name: string): GameSide => ({ id, slug: null, name, short: null, logo: null, color: null, conf: null, rank: null, adjEM: null, record: null, score: null, periods: null });
/** Southern Utah at Wake Forest; `wp` = Wake Forest's (home) pregame chance. */
function game(wp = 0.86, margin = 10.7): Game {
  return {
    id: "g1", date: "2026-11-14T21:00:00.000Z", status: "in_progress", neutral: false, confGame: false, venue: null, city: null, state: null, tournament: null,
    home: side("342", "Wake Forest"), away: side("276", "Southern Utah"),
    pred: wp == null ? null : { wp, margin, home: 75, away: 65, tempo: 68 }, watch: 50, upset: null, box: null, espnId: "401909728",
  };
}
/** In-progress clock: half 1/2 or OT 3+, seconds left on the period clock. */
function clock(period: number, left: number, home: number, away: number, extra: Partial<MomentClock> = {}): MomentClock {
  return { state: "in", statusName: "STATUS_IN_PROGRESS", period, clock: left, elapsed: elapsedFrom(period, left), home, away, homePeriods: null, awayPeriods: null, ...extra };
}
const kinds = (ms: Moment[]) => ms.map(m => m.kind);
const find = (ms: Moment[], k: Moment["kind"]) => ms.find(m => m.kind === k);

// ESPN summary builder: a compact play script in OUR orientation, written out the way ESPN would
// send it (optionally with ESPN's home team being our away team).
type Script = [period: number, clock: string, team: "H" | "A" | null, text: string, value?: number][];
type PlayerStats = { name: string; pts: number; reb?: number; ast?: number; blk?: number; stl?: number; fg?: string; tp?: string };
function espnSummary(script: Script, opts: { swap?: boolean; period?: number; clock?: number; state?: "in" | "post"; homePlayers?: PlayerStats[]; awayPlayers?: PlayerStats[] } = {}) {
  const swap = !!opts.swap;
  let h = 0, a = 0;
  const plays = script.map(([period, clk, team, text, value = 0], i) => {
    if (value && team === "H") h += value;
    if (value && team === "A") a += value;
    const teamId = team === "H" ? HOME_ESPN : team === "A" ? AWAY_ESPN : null;
    return {
      id: String(i + 1), sequenceNumber: String(i + 1), text, type: { text: "" }, period: { number: period }, clock: { displayValue: clk },
      scoringPlay: value > 0, scoreValue: value, team: teamId ? { id: teamId } : undefined,
      homeScore: swap ? a : h, awayScore: swap ? h : a,
    };
  });
  const last = script[script.length - 1];
  const period = opts.period ?? last?.[0] ?? 1;
  const clk = opts.clock ?? 300;
  const comp = (id: string, homeAway: "home" | "away", score: number) => ({ id, homeAway, score: String(score), team: { id } });
  const keys = ["minutes", "fieldGoalsMade-fieldGoalsAttempted", "threePointFieldGoalsMade-threePointFieldGoalsAttempted", "freeThrowsMade-freeThrowsAttempted", "offensiveRebounds", "defensiveRebounds", "rebounds", "assists", "steals", "blocks", "turnovers", "fouls", "points"];
  const athletes = (ps: PlayerStats[] = []) => ps.map((p, i) => ({
    athlete: { id: `${p.name}-${i}`, displayName: p.name, shortName: p.name }, starter: true,
    stats: ["30", p.fg ?? "8-15", p.tp ?? "1-3", "2-2", "1", String((p.reb ?? 3) - 1), String(p.reb ?? 3), String(p.ast ?? 1), String(p.stl ?? 0), String(p.blk ?? 0), "1", "2", String(p.pts)],
  }));
  const players = [
    { team: { id: HOME_ESPN }, statistics: [{ keys, athletes: athletes(opts.homePlayers) }] },
    { team: { id: AWAY_ESPN }, statistics: [{ keys, athletes: athletes(opts.awayPlayers) }] },
  ];
  const state = opts.state ?? "in";
  return {
    header: { competitions: [{
      competitors: swap ? [comp(AWAY_ESPN, "home", a), comp(HOME_ESPN, "away", h)] : [comp(HOME_ESPN, "home", h), comp(AWAY_ESPN, "away", a)],
      status: { period, clock: clk, displayClock: `${Math.floor(clk / 60)}:${String(clk % 60).padStart(2, "0")}`, type: { name: state === "in" ? "STATUS_IN_PROGRESS" : "STATUS_FINAL", state, completed: state === "post" } },
    }] },
    plays, boxscore: { players, teams: [] },
  };
}
const parsed = (raw: unknown): LiveSummary => {
  const s = parseSummary(raw, "401909728", { homeTeamId: HOME_ESPN, awayTeamId: AWAY_ESPN });
  if (!s) throw new Error("unparsable fixture");
  return s;
};
/** The same script parsed with ESPN in our orientation and swapped: moments must match. */
function bothWays(script: Script, opts: Parameters<typeof espnSummary>[1] = {}): [LiveSummary, LiveSummary] {
  return [parsed(espnSummary(script, opts)), parsed(espnSummary(script, { ...opts, swap: true }))];
}

/** A scoring script from a list of [team, points] with plausible clock times in one half. */
function baskets(period: number, startLeft: number, list: ["H" | "A", number][], step = 30): Script {
  return list.map(([t, v], i) => {
    const left = Math.max(0, startLeft - i * step);
    return [period, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`, t, `${t === "H" ? "Hunter Sallis" : "Dominique Ford"} made ${v === 3 ? "Three Point Jumper" : "Layup"}.`, v];
  });
}

// ---- helpers -------------------------------------------------------------------------------

describe("timePhrase", () => {
  it("says where the game is in plain words", () => {
    expect(timePhrase({ period: 1, clock: 400 })).toBe("in the first half");
    expect(timePhrase({ period: 1, clock: 0, statusName: "STATUS_HALFTIME" })).toBe("at halftime");
    expect(timePhrase({ period: 2, clock: 581 })).toBe("with 9 minutes left");
    expect(timePhrase({ period: 2, clock: 61 })).toBe("with 1 minute left");
    expect(timePhrase({ period: 2, clock: 47.2 })).toBe("with 48 seconds left");
    expect(timePhrase({ period: 3, clock: 130 })).toBe("with 2 minutes left in overtime");
    expect(timePhrase({ period: 4, clock: 130 })).toBe("with 2 minutes left in double overtime");
    expect(timePhrase({ period: 2, clock: 0, statusName: "STATUS_END_PERIOD" })).toBe("at the end of regulation");
  });
  it("finds the shooter in ESPN play text", () => {
    expect(shooterName("Marcus Holloway made Three Point Jumper. Assisted by Eli Brandt.")).toBe("Marcus Holloway");
    expect(shooterName("Foul on Eli Brandt.")).toBeNull();
  });
});

// ---- scoreboard moments --------------------------------------------------------------------

describe("upset brewing", () => {
  it("away underdog leading in the second half, labelled as our pregame chance", () => {
    const m = find(scoreboardMoments(game(0.86), clock(2, 581, 50, 56)), "upset")!;
    expect(m.text).toBe("Upset brewing: Southern Utah (14% our pregame chance) leads by 6 with 9 minutes left");
    expect(m.side).toBe("away");
    expect(m.model).toBe(true);
  });
  it("home underdog leading (the other orientation)", () => {
    const m = find(scoreboardMoments(game(0.2, -9), clock(2, 300, 61, 55)), "upset")!;
    expect(m.body).toBe("Wake Forest (20% our pregame chance) leads by 6 with 5 minutes left");
    expect(m.side).toBe("home");
  });
  it("not when the favourite leads, the dog was over 40%, or it's the first five minutes", () => {
    expect(find(scoreboardMoments(game(0.86), clock(2, 581, 60, 50)), "upset")).toBeUndefined();
    expect(find(scoreboardMoments(game(0.55, 2), clock(2, 581, 50, 56)), "upset")).toBeUndefined();
    expect(find(scoreboardMoments(game(0.86), clock(1, 1080, 2, 5)), "upset")).toBeUndefined();
  });
  it("a bigger, later upset scores higher", () => {
    const early = find(scoreboardMoments(game(0.65, 4), clock(1, 600, 20, 22)), "upset")!;
    const late = find(scoreboardMoments(game(0.92, 15), clock(2, 120, 60, 68)), "upset")!;
    expect(late.score).toBeGreaterThan(early.score);
  });
});

describe("comeback from the line score", () => {
  it("home down 12 at the half, now ahead", () => {
    const m = find(scoreboardMoments(game(0.5, 0), clock(2, 400, 55, 52, { homePeriods: [25, 30], awayPeriods: [37, 15] })), "comeback")!;
    expect(m.body).toBe("Wake Forest trailed by 12 at the half and now leads by 3");
    expect(m.side).toBe("home");
  });
  it("away down 9 at the half, now tied", () => {
    const m = find(scoreboardMoments(game(0.5, 0), clock(2, 400, 60, 60, { homePeriods: [40, 20], awayPeriods: [31, 29] })), "comeback")!;
    expect(m.body).toBe("Southern Utah trailed by 9 at the half and has tied it at 60");
  });
  it("not at halftime itself, and not for a team still behind", () => {
    expect(find(scoreboardMoments(game(0.5, 0), clock(1, 0, 40, 28, { statusName: "STATUS_HALFTIME", homePeriods: [40], awayPeriods: [28] })), "comeback")).toBeUndefined();
    expect(find(scoreboardMoments(game(0.5, 0), clock(2, 400, 50, 52, { homePeriods: [25, 25], awayPeriods: [37, 15] })), "comeback")).toBeUndefined();
  });
});

describe("overtime", () => {
  it("names the regulation tie and the current leader", () => {
    const m = find(scoreboardMoments(game(0.4, -2.8), clock(3, 80, 74, 72, { homePeriods: [30, 38, 6], awayPeriods: [35, 33, 4] })), "overtime")!;
    expect(m.text).toBe("Overtime: Tied at 68 after regulation; now Wake Forest leads by 2 with 1 minute left");
    expect(m.score).toBeGreaterThanOrEqual(82);
  });
  it("double overtime, away ahead, no line score", () => {
    const m = find(scoreboardMoments(game(0.4, -2.8), clock(4, 200, 80, 83)), "overtime")!;
    expect(m.text).toBe("Double overtime: Southern Utah leads by 3 with 3 minutes left");
    expect(m.side).toBe("away");
  });
});

describe("one-possession game late", () => {
  it("home by 2 with 48 seconds left", () => {
    const m = find(scoreboardMoments(game(0.5, 0), clock(2, 48, 70, 68)), "close")!;
    expect(m.text).toBe("One-possession game: Wake Forest leads by 2 with 48 seconds left");
  });
  it("tied, and away by 3", () => {
    expect(find(scoreboardMoments(game(0.5, 0), clock(2, 100, 64, 64)), "close")!.body).toBe("Tied at 64 with 1 minute left");
    expect(find(scoreboardMoments(game(0.5, 0), clock(2, 200, 61, 64)), "close")!.body).toBe("Southern Utah leads by 3 with 3 minutes left");
  });
  it("not with more than five minutes left or a four-point game", () => {
    expect(find(scoreboardMoments(game(0.5, 0), clock(2, 301, 70, 68)), "close")).toBeUndefined();
    expect(find(scoreboardMoments(game(0.5, 0), clock(2, 60, 72, 68)), "close")).toBeUndefined();
  });
});

describe("blowout", () => {
  it("favourite by 25", () => {
    const m = find(scoreboardMoments(game(0.86), clock(2, 720, 80, 55)), "blowout")!;
    expect(m.text).toBe("Blowout: Wake Forest leads Southern Utah by 25 with 12 minutes left");
    expect(m.score).toBeLessThan(35);
  });
  it("an underdog up 20 is an upset, not a blowout", () => {
    const ms = scoreboardMoments(game(0.86), clock(2, 720, 50, 72));
    expect(kinds(ms)).toContain("upset");
    expect(kinds(ms)).not.toContain("blowout");
  });
});

describe("win-chance swing vs pregame", () => {
  it("away side's chance up from 45% before tip", () => {
    const m = find(scoreboardMoments(game(0.55, 2), clock(2, 600, 45, 60)), "swing")!;
    expect(m.body).toMatch(/^Our model has Southern Utah at 9\d% to win, up from 45% before tip$/);
    expect(m.model).toBe(true);
  });
  it("home side, and nothing for a small move", () => {
    expect(find(scoreboardMoments(game(0.45, -2), clock(2, 600, 60, 45)), "swing")!.side).toBe("home");
    expect(find(scoreboardMoments(game(0.55, 2), clock(2, 600, 50, 49)), "swing")).toBeUndefined();
  });
  it("is folded into an upset for the same team", () => {
    const ms = scoreboardMoments(game(0.86), clock(2, 300, 50, 60));
    expect(kinds(ms)).toContain("upset");
    expect(kinds(ms)).not.toContain("swing");
  });
});

describe("scoreboard input from ESPN in either orientation", () => {
  const ev = (swap: boolean): EspnEvent => {
    const H = { homeAway: "home" as const, team: { id: HOME_ESPN }, score: "50", linescores: [{ value: 30 }, { value: 20 }] };
    const A = { homeAway: "away" as const, team: { id: AWAY_ESPN }, score: "56", linescores: [{ value: 28 }, { value: 28 }] };
    return {
      id: "401909728", date: "2026-11-14T21:00Z",
      status: { clock: 581, displayClock: "9:41", period: 2, type: { name: "STATUS_IN_PROGRESS", state: "in", completed: false } },
      competitions: [{ competitors: swap ? [{ ...A, homeAway: "home" }, { ...H, homeAway: "away" }] : [H, A] }],
    };
  };
  const ids = new Map([["342", HOME_ESPN], ["276", AWAY_ESPN]]);
  it("gives the same upset line", () => {
    for (const swap of [false, true]) {
      const live = matchEvents([game(0.86)], [ev(swap)], ids).get("g1") as LiveGame;
      expect(live.home).toBe(50);
      expect(find(scoreboardMoments(game(0.86), live), "upset")!.body).toBe("Southern Utah (14% our pregame chance) leads by 6 with 9 minutes left");
    }
  });
});

// ---- play-by-play moments ------------------------------------------------------------------

describe("scoring runs", () => {
  // Wake Forest down 4 (6–10), then 12 straight, then a Southern Utah basket.
  const script: Script = [
    ...baskets(1, 1100, [["A", 2], ["H", 2], ["A", 3], ["H", 2], ["A", 3], ["H", 2], ["A", 2]]),
    ...baskets(1, 860, [["H", 3], ["H", 2], ["H", 2], ["H", 3], ["H", 2]]),
    ...baskets(1, 700, [["A", 2]]),
  ];
  it("12–0 that flipped the lead, either ESPN orientation", () => {
    for (const s of bothWays(script, { period: 1, clock: 600 })) {
      const m = find(playMoments(game(0.5, 0), s), "run")!;
      expect(m.text).toBe("12–0 run: Wake Forest turned a 4-point deficit into an 8-point lead");
      expect(m.side).toBe("home");
    }
  });
  it("an ongoing run uses 'has' and outranks a finished one", () => {
    const live = script.slice(0, -1);
    const [s] = bothWays(live, { period: 1, clock: 680 });
    const m = find(playMoments(game(0.5, 0), s), "run")!;
    expect(m.body).toBe("Wake Forest has turned a 4-point deficit into an 8-point lead");
    const done = find(playMoments(game(0.5, 0), bothWays(script, { period: 1, clock: 600 })[0]), "run")!;
    expect(m.score).toBeGreaterThan(done.score);
  });
  it("16–2 by the away team (a free throw then 15–2), cutting a deficit", () => {
    // Home builds a 20-point lead three points at a time (no run: Southern Utah answers each time), then 15–2.
    const flow: FlowPoint[] = [[0, 0, 0]];
    let h = 0, a = 0, t = 0;
    for (let i = 0; i < 10; i++) { h += 3; flow.push([t += 30, h, a]); a += 1; flow.push([t += 30, h, a]); }
    for (const [s, v] of [["A", 2], ["A", 3], ["A", 2], ["H", 2], ["A", 3], ["A", 3], ["A", 2]] as const) { if (s === "H") h += v; else a += v; flow.push([t += 30, h, a]); }
    flow.push([t += 30, h + 3, a]);
    const r = biggestRun(flow)!;
    expect([r.side, r.for, r.against, r.before, r.after]).toEqual(["away", 16, 2, -21, -7]);
    const s: LiveSummary = { ...bothWays([], { period: 1, clock: 300 })[0], flow, elapsed: 900, period: 1, clock: 300, home: h + 3, away: a };
    expect(find(playMoments(game(0.5, 0), s), "run")!.text).toBe("16–2 run: Southern Utah cut a 21-point deficit to 7");
  });
  it("needs 10+ points with the other side held to a fifth of that", () => {
    expect(biggestRun([[0, 0, 0], [30, 2, 0], [60, 4, 0], [90, 7, 0], [120, 9, 0]])).toBeNull(); // 9–0
    expect(biggestRun([[0, 0, 0], [30, 3, 0], [60, 6, 0], [90, 6, 3], [120, 8, 3], [150, 11, 3]])).toBeNull(); // 11–3
  });
});

describe("lead changes and ties", () => {
  it("counts swaps of the lead and returns to level", () => {
    const many: FlowPoint[] = [[0, 0, 0]];
    for (let i = 1; i <= 10; i++) many.push([i * 100, i % 2 ? i * 2 + 1 : i * 2, i % 2 ? i * 2 : i * 2 + 1]);
    expect(flowStats(many)).toMatchObject({ leadChanges: 9, ties: 0 });
    const s: LiveSummary = { ...bothWays([], { period: 2, clock: 600 })[0], flow: many, elapsed: 1800, period: 2, clock: 600, home: 20, away: 21 };
    const m = find(playMoments(game(0.5, 0), s), "lead-changes")!;
    expect(m.text).toBe("Back and forth: 9 lead changes so far");
    const tied: FlowPoint[] = [...many, [1100, 21, 21], [1150, 23, 21]];
    expect(flowStats(tied)).toMatchObject({ leadChanges: 10, ties: 1 });
  });
});

describe("largest comeback so far", () => {
  it("home was down 17, now up 3 (and wins over the line-score version)", () => {
    const flow: FlowPoint[] = [[0, 0, 0], [200, 0, 10], [500, 5, 22], [1100, 20, 30], [1600, 40, 40], [1900, 55, 52]];
    const base = bothWays([], { period: 2, clock: 500 })[0];
    const s: LiveSummary = { ...base, flow, elapsed: 1900, period: 2, clock: 500, home: 55, away: 52, homePeriods: [20, 35], awayPeriods: [30, 22] };
    const live = clock(2, 500, 55, 52, { homePeriods: [20, 35], awayPeriods: [30, 22] });
    const all = gameMoments(game(0.5, 0), live, s);
    const cb = all.filter(m => m.kind === "comeback");
    expect(cb).toHaveLength(1);
    expect(cb[0].body).toBe("Wake Forest was down 17 and now leads by 3");
    expect(cb[0].source).toBe("plays");
  });
  it("away side, tied", () => {
    const flow: FlowPoint[] = [[0, 0, 0], [400, 14, 2], [900, 20, 8], [1500, 40, 40]];
    const s: LiveSummary = { ...bothWays([], { period: 2, clock: 900 })[0], flow, elapsed: 1500, period: 2, clock: 900, home: 40, away: 40 };
    expect(find(playMoments(game(0.5, 0), s), "comeback")!.body).toBe("Southern Utah was down 12 and has tied it at 40");
  });
  it("uses the fresher scoreboard for 'now leads by'", () => {
    const flow: FlowPoint[] = [[0, 0, 0], [500, 5, 22], [1800, 50, 50]];
    const s: LiveSummary = { ...bothWays([], { period: 2, clock: 600 })[0], flow, elapsed: 1800, period: 2, clock: 600, home: 50, away: 50 };
    expect(find(playMoments(game(0.5, 0), s, clock(2, 560, 54, 50)), "comeback")!.body).toBe("Wake Forest was down 17 and now leads by 4");
  });
});

describe("big individual games", () => {
  const opts = (p: PlayerStats, home = true) => ({ period: 2, clock: 560, ...(home ? { homePlayers: [p] } : { awayPlayers: [p] }) });
  it("points so far with time left, either orientation", () => {
    for (const s of bothWays([], opts({ name: "Donovan Dent", pts: 24, fg: "9-14" }, false))) {
      const m = playMoments(game(0.5, 0), s).find(x => x.kind === "player")!;
      expect(m.text).toBe("Donovan Dent has 24 points on 9-of-14 shooting with 9 minutes left");
      expect(m.side).toBe("away");
    }
  });
  it("five or more threes", () => {
    const [s] = bothWays([], opts({ name: "Tyrese Bowman", pts: 21, tp: "6-8", fg: "7-10" }));
    expect(playMoments(game(0.5, 0), s).find(x => x.kind === "player")!.body).toBe("Tyrese Bowman has made 6 threes (6 of 8) for 21 points");
  });
  it("double-double and triple-double", () => {
    const [s] = bothWays([], opts({ name: "Kofi Mensah", pts: 14, reb: 11 }));
    expect(playMoments(game(0.5, 0), s).find(x => x.kind === "player")!.body).toBe("Kofi Mensah has a double-double: 14 points and 11 rebounds");
    const [t] = bothWays([], opts({ name: "Kofi Mensah", pts: 14, reb: 11, ast: 10 }));
    const m = playMoments(game(0.5, 0), t).find(x => x.kind === "player")!;
    expect(m.body).toBe("Kofi Mensah has a triple-double: 14 points, 11 rebounds and 10 assists");
    expect(m.score).toBeGreaterThanOrEqual(80);
  });
  it("blocks", () => {
    const [s] = bothWays([], opts({ name: "Graham Oduya", pts: 8, blk: 6 }));
    expect(playMoments(game(0.5, 0), s).find(x => x.kind === "player")!.body).toBe("Graham Oduya has 6 blocks");
  });
  it("nothing for an ordinary line", () => {
    const [s] = bothWays([], opts({ name: "Ben Arroyo", pts: 12, reb: 6 }));
    expect(playMoments(game(0.5, 0), s).find(x => x.kind === "player")).toBeUndefined();
  });
});

describe("dunks", () => {
  const dunk = (left: string, who = "Baye Ndongo", text = "made Dunk."): Script[number] => [2, left, "H", `${who} ${text}`, 2];
  it("three by one team inside three minutes, with an alley-oop", () => {
    const script: Script = [dunk("9:40"), [2, "9:10", "A", "Dominique Ford made Layup.", 2], dunk("8:30", "Jaeden Mustaf", "made Alley Oop Dunk Shot."), dunk("7:20")];
    for (const s of bothWays(script, { period: 2, clock: 420 })) {
      const m = find(playMoments(game(0.5, 0), s), "dunks")!;
      expect(m.text).toBe("Dunk streak: Wake Forest has 3 dunks in 3 minutes, including an alley-oop");
      expect(m.side).toBe("home");
    }
  });
  it("not for three dunks spread across the half", () => {
    const [s] = bothWays([dunk("19:00"), dunk("12:00"), dunk("5:00")], { period: 2, clock: 200 });
    expect(find(playMoments(game(0.5, 0), s), "dunks")).toBeUndefined();
  });
});

describe("buzzer-beaters", () => {
  it("a three at the end of the first half that took the lead, either orientation", () => {
    const script: Script = [...baskets(1, 200, [["H", 2], ["A", 3], ["H", 2], ["A", 2]]), [1, "0:00", "A", "Marcus Holloway made Three Point Jumper. Assisted by Eli Brandt.", 3], [1, "0:00", null, "End of 1st half"]];
    for (const s of bothWays(script, { period: 2, clock: 1100 })) {
      const m = find(playMoments(game(0.5, 0), s), "buzzer")!;
      expect(m.text).toBe("Buzzer-beater: Marcus Holloway's three at the end of the first half gave Southern Utah a 4-point lead");
      expect(m.side).toBe("away");
    }
  });
  it("tying layup to end regulation, and free throws at 0:00 don't count", () => {
    const script: Script = [...baskets(2, 30, [["A", 2]]), [2, "0.4", "H", "Hunter Sallis made Layup.", 2], [2, "0:00", "A", "Dominique Ford made Free Throw 1 of 2.", 1]];
    const [s] = bothWays(script, { period: 3, clock: 290 });
    const bz = playMoments(game(0.5, 0), s).filter(m => m.kind === "buzzer");
    expect(bz).toHaveLength(1);
    expect(bz[0].body).toBe("Hunter Sallis's layup at the end of regulation tied the game at 2");
    expect(bz[0].score).toBeGreaterThanOrEqual(80);
  });
});

// ---- ranking and sorting -------------------------------------------------------------------

describe("ranking", () => {
  it("nothing for a game that isn't live", () => {
    expect(bestMoment(game(), { ...clock(2, 0, 70, 60), state: "post" })).toBeNull();
    expect(bestMoment(game(), null)).toBeNull();
    expect(bestMoment(game(), { ...clock(1, 1200, 0, 0), state: "pre" })).toBeNull();
  });
  it("overtime beats a 25-point night; a close finish beats a blowout", () => {
    const ot = clock(3, 100, 74, 72);
    const [s] = bothWays([], { period: 3, clock: 100, homePlayers: [{ name: "Hunter Sallis", pts: 25 }] });
    expect(bestMoment(game(0.5, 0), ot, s)!.kind).toBe("overtime");
    expect(bestMoment(game(0.5, 0), clock(2, 30, 70, 69))!.kind).toBe("close");
  });
  it("falls back to scoreboard moments without a summary", () => {
    expect(bestMoment(game(0.86), clock(2, 581, 50, 56), null)!.kind).toBe("upset");
  });
  it("live view order: overtime > close and late > upset brewing > even first half > blowout", () => {
    const ot = excitement(game(0.4, -2.8), clock(3, 80, 74, 72));
    const close = excitement(game(0.6, 3), clock(2, 60, 70, 69));
    const upset = excitement(game(0.86), clock(2, 581, 50, 56));
    const early = excitement(game(0.55, 2), clock(1, 900, 12, 12));
    const blowout = excitement(game(0.86), clock(2, 720, 80, 55));
    expect(ot).toBeGreaterThan(close);
    expect(close).toBeGreaterThan(upset);
    expect(upset).toBeGreaterThan(early);
    expect(early).toBeGreaterThan(blowout);
    expect(excitement(game(), { ...clock(2, 0, 70, 60), state: "post" })).toBe(0);
  });
});
