"use client";
// Live game detail from ESPN's public game summary (the same feed the nightly build reads in
// scripts/lib/espn-pbp.mjs): player box score, team box score, play-by-play and the score flow.
// The game sheet polls it from the browser only while it is open on a live game (every 15 s,
// paused while the tab is hidden, stopped once ESPN says the game is over). Failures are
// silent here: the hook reports `error` and the sheet keeps its static view.
import { useEffect, useRef, useState } from "react";
import type { BoxLine } from "./types";
import { labelFor, type LiveGame, type LiveState } from "./live";
import { elapsedFrom, type FlowPoint } from "./win-prob";

const SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary";
export const LIVE_GAME_POLL_MS = 15_000;
const MAX_BACKOFF_MS = 60_000;

export type StatLine = {
  min: number | null; pts: number | null; reb: number | null; oreb: number | null; dreb: number | null;
  ast: number | null; stl: number | null; blk: number | null; to: number | null; pf: number | null;
  fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null; ftm: number | null; fta: number | null;
};
export type PlayerLine = StatLine & {
  id: string; name: string; short: string; jersey: string | null; pos: string | null;
  starter: boolean; dnp: boolean; reason: string | null; ejected: boolean;
};
export type TeamBox = { teamId: string; abbr: string | null; name: string | null; color: string | null; players: PlayerLine[]; totals: StatLine; team: BoxLine | null };
export type Play = {
  id: string; period: number; clock: string; t: number; text: string;
  /** Team on the play, in OUR orientation. */
  side: "home" | "away" | null;
  scoring: boolean; value: number; home: number; away: number;
};
export type LiveSummary = {
  espnId: string; state: LiveState; statusName: string; completed: boolean;
  period: number; clock: number; displayClock: string; label: string; elapsed: number | null;
  home: number | null; away: number | null; homePeriods: number[] | null; awayPeriods: number[] | null;
  box: { home: TeamBox | null; away: TeamBox | null };
  /** Chronological (oldest first). */
  plays: Play[];
  /** Score after every scoring play, from 0–0: [elapsedSec, home, away]. */
  flow: FlowPoint[];
  /** True when ESPN lists the teams the other way round from our data (scores and plays are already flipped back). */
  swapped: boolean;
};

/** How to line ESPN's home/away up with ours: ESPN team id of our home team, or the current scores. */
export type Orient = { homeTeamId?: string | null; awayTeamId?: string | null; home?: number | null; away?: number | null };

// ---- parsing ---------------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const num = (v: unknown): number | null => {
  if (v == null || v === "" || v === "--") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const pair = (v: unknown): [number | null, number | null] => {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(String(v ?? ""));
  return m ? [Number(m[1]), Number(m[2])] : [null, null];
};

/** "8:41" → 521, "45.3" → 45.3 (ESPN drops the minutes under one minute in some feeds). */
export function clockSeconds(display: unknown): number {
  const s = String(display ?? "0:00").trim();
  if (!s.includes(":")) { const v = Number(s); return Number.isFinite(v) ? v : 0; }
  const [m, sec] = s.split(":").map(Number);
  return (Number.isFinite(m) ? m : 0) * 60 + (Number.isFinite(sec) ? sec : 0);
}

const EMPTY: StatLine = { min: null, pts: null, reb: null, oreb: null, dreb: null, ast: null, stl: null, blk: null, to: null, pf: null, fgm: null, fga: null, tpm: null, tpa: null, ftm: null, fta: null };

// Column lookup by ESPN key first, then by its short label (the feed has used both).
const COLS: Record<string, { keys: string[]; labels: string[] }> = {
  min: { keys: ["minutes"], labels: ["MIN"] },
  fg: { keys: ["fieldGoalsMade-fieldGoalsAttempted"], labels: ["FG"] },
  tp: { keys: ["threePointFieldGoalsMade-threePointFieldGoalsAttempted"], labels: ["3PT", "3P"] },
  ft: { keys: ["freeThrowsMade-freeThrowsAttempted"], labels: ["FT"] },
  oreb: { keys: ["offensiveRebounds"], labels: ["OREB", "OR"] },
  dreb: { keys: ["defensiveRebounds"], labels: ["DREB", "DR"] },
  reb: { keys: ["rebounds", "totalRebounds"], labels: ["REB"] },
  ast: { keys: ["assists"], labels: ["AST"] },
  stl: { keys: ["steals"], labels: ["STL"] },
  blk: { keys: ["blocks"], labels: ["BLK"] },
  to: { keys: ["turnovers"], labels: ["TO"] },
  pf: { keys: ["fouls", "personalFouls"], labels: ["PF"] },
  pts: { keys: ["points"], labels: ["PTS"] },
};

function columnIndex(group: Json): Record<string, number> {
  const keys: string[] = Array.isArray(group?.keys) ? group.keys : [];
  const labels: string[] = (Array.isArray(group?.names) ? group.names : Array.isArray(group?.labels) ? group.labels : []).map((l: string) => String(l).toUpperCase());
  const out: Record<string, number> = {};
  for (const [k, c] of Object.entries(COLS)) {
    let i = keys.findIndex(x => c.keys.includes(x));
    if (i < 0) i = labels.findIndex(x => c.labels.includes(x));
    if (i >= 0) out[k] = i;
  }
  return out;
}

function statLine(stats: unknown[] | undefined, idx: Record<string, number>): StatLine {
  if (!Array.isArray(stats) || !stats.length) return { ...EMPTY };
  const at = (k: string) => (idx[k] == null ? undefined : stats[idx[k]]);
  const [fgm, fga] = pair(at("fg")), [tpm, tpa] = pair(at("tp")), [ftm, fta] = pair(at("ft"));
  const oreb = num(at("oreb")), dreb = num(at("dreb"));
  return {
    min: num(at("min")), pts: num(at("pts")), reb: num(at("reb")) ?? (oreb != null && dreb != null ? oreb + dreb : null), oreb, dreb,
    ast: num(at("ast")), stl: num(at("stl")), blk: num(at("blk")), to: num(at("to")), pf: num(at("pf")),
    fgm, fga, tpm, tpa, ftm, fta,
  };
}

/** Sum of the player lines (null when no player has the stat). */
export function sumLines(lines: StatLine[]): StatLine {
  const out: StatLine = { ...EMPTY };
  for (const k of Object.keys(EMPTY) as (keyof StatLine)[]) {
    let any = false, s = 0;
    for (const l of lines) if (l[k] != null) { any = true; s += l[k]!; }
    out[k] = any ? s : null;
  }
  return out;
}

const teamStat = (stats: Json[], ...names: string[]) => {
  for (const n of names) {
    const s = stats.find(x => x?.name === n);
    if (s) return s.displayValue ?? s.value;
  }
  return undefined;
};

/** ESPN's team statistics block as our BoxLine (team-level numbers the player lines don't carry). */
function teamBoxLine(t: Json): BoxLine | null {
  const stats: Json[] = Array.isArray(t?.statistics) ? t.statistics : [];
  if (!stats.length) return null;
  const [fgm, fga] = pair(teamStat(stats, "fieldGoalsMade-fieldGoalsAttempted"));
  const [tpm, tpa] = pair(teamStat(stats, "threePointFieldGoalsMade-threePointFieldGoalsAttempted"));
  const [ftm, fta] = pair(teamStat(stats, "freeThrowsMade-freeThrowsAttempted"));
  return {
    fgm, fga, tpm, tpa, ftm, fta,
    orb: num(teamStat(stats, "offensiveRebounds")), drb: num(teamStat(stats, "defensiveRebounds")),
    ast: num(teamStat(stats, "assists")), stl: num(teamStat(stats, "steals")), blk: num(teamStat(stats, "blocks")),
    tov: num(teamStat(stats, "totalTurnovers", "turnovers")),
    paint: num(teamStat(stats, "pointsInPaint")), fastBreak: num(teamStat(stats, "fastBreakPoints")), offTov: num(teamStat(stats, "turnoverPoints")),
    poss: null, largestLead: num(teamStat(stats, "largestLead")),
  };
}

function teamBox(players: Json, teamStats: Json): TeamBox | null {
  const group = players?.statistics?.[0];
  if (!group) return null;
  const idx = columnIndex(group);
  const lines: PlayerLine[] = (Array.isArray(group.athletes) ? group.athletes : []).map((a: Json, i: number) => {
    const ath = a?.athlete ?? {};
    const line = statLine(a?.stats, idx);
    const dnp = !!a?.didNotPlay || !Array.isArray(a?.stats) || a.stats.length === 0;
    return {
      ...line, id: String(ath.id ?? `${ath.displayName ?? "p"}-${i}`), name: String(ath.displayName ?? ath.shortName ?? "Unknown"),
      short: String(ath.shortName ?? ath.displayName ?? "Unknown"), jersey: ath.jersey != null ? String(ath.jersey) : null,
      pos: ath.position?.abbreviation ?? null, starter: !!a?.starter, dnp, reason: a?.reason ? String(a.reason) : null, ejected: !!a?.ejected,
    };
  });
  const summed = sumLines(lines.filter(l => !l.dnp));
  // ESPN's own totals row when it parses; any stat it leaves blank falls back to the players' sum.
  const espn = statLine(group.totals, idx);
  const totals = { ...summed } as StatLine;
  for (const k of Object.keys(EMPTY) as (keyof StatLine)[]) if (espn[k] != null) totals[k] = espn[k];
  const team = players?.team ?? {};
  return {
    teamId: String(team.id ?? ""), abbr: team.abbreviation ?? null, name: team.shortDisplayName ?? team.displayName ?? null,
    color: team.color ?? null, players: lines, totals, team: teamBoxLine(teamStats),
  };
}

const linescores = (c: Json): number[] | null =>
  Array.isArray(c?.linescores) && c.linescores.length ? c.linescores.map((l: Json) => num(l?.value ?? l?.displayValue) ?? 0) : null;

/** Parse an ESPN summary payload into our orientation. Returns null when the payload isn't usable. */
export function parseSummary(sum: Json, espnId: string, orient: Orient = {}): LiveSummary | null {
  const comp = sum?.header?.competitions?.[0];
  const comps: Json[] = comp?.competitors ?? [];
  const eh = comps.find(c => c?.homeAway === "home"), ea = comps.find(c => c?.homeAway === "away");
  if (!eh || !ea) return null;
  const ehId = String(eh.id ?? eh.team?.id ?? ""), eaId = String(ea.id ?? ea.team?.id ?? "");
  const ehScore = num(eh.score), eaScore = num(ea.score);

  // Orientation: by team id when we know ours, else by the scores (ESPN home score = our away score).
  let swapped = false;
  if (orient.homeTeamId || orient.awayTeamId) swapped = (!!orient.awayTeamId && ehId === String(orient.awayTeamId)) || (!!orient.homeTeamId && eaId === String(orient.homeTeamId));
  else if (orient.home != null && orient.away != null && ehScore != null && eaScore != null && ehScore !== eaScore)
    swapped = ehScore === orient.away && eaScore === orient.home && orient.home !== orient.away;
  const side = (teamId: unknown): "home" | "away" | null => {
    const id = String(teamId ?? "");
    const espnSide = id === ehId ? "home" : id === eaId ? "away" : null;
    if (!espnSide) return null;
    return swapped ? (espnSide === "home" ? "away" : "home") : espnSide;
  };

  // Plays. ESPN occasionally reports play scores with home/away reversed (see espn-pbp.mjs);
  // detect it from the last scored play against the header scores.
  const rawPlays: Json[] = Array.isArray(sum?.plays) ? sum.plays : [];
  const lastScored = [...rawPlays].reverse().find(p => p?.homeScore != null && p?.awayScore != null);
  const playsReversed = lastScored != null && ehScore != null && eaScore != null && ehScore !== eaScore &&
    Number(lastScored.homeScore) === eaScore && Number(lastScored.awayScore) === ehScore;
  const plays: Play[] = [];
  const flow: FlowPoint[] = [[0, 0, 0]];
  let lastH = 0, lastA = 0; // ESPN orientation
  for (let i = 0; i < rawPlays.length; i++) {
    const p = rawPlays[i];
    const period = num(p?.period?.number) ?? 1;
    const clock = String(p?.clock?.displayValue ?? "0:00");
    const t = Math.max(0, elapsedFrom(period, clockSeconds(clock)));
    let h = p?.homeScore == null ? lastH : Number(playsReversed ? p.awayScore : p.homeScore);
    let a = p?.awayScore == null ? lastA : Number(playsReversed ? p.homeScore : p.awayScore);
    if (!Number.isFinite(h)) h = lastH;
    if (!Number.isFinite(a)) a = lastA;
    const changed = h !== lastH || a !== lastA;
    const [oh, oa] = swapped ? [a, h] : [h, a];
    if (changed) flow.push([t, oh, oa]);
    lastH = h; lastA = a;
    plays.push({
      id: String(p?.id ?? p?.sequenceNumber ?? i), period, clock, t, text: String(p?.text ?? p?.type?.text ?? ""),
      side: side(p?.team?.id), scoring: !!p?.scoringPlay || changed, value: num(p?.scoreValue) ?? 0, home: oh, away: oa,
    });
  }

  // Box score: boxscore.players / boxscore.teams, matched to sides by team id.
  const bp: Json[] = Array.isArray(sum?.boxscore?.players) ? sum.boxscore.players : [];
  const bt: Json[] = Array.isArray(sum?.boxscore?.teams) ? sum.boxscore.teams : [];
  const box: LiveSummary["box"] = { home: null, away: null };
  for (const p of bp) {
    const s = side(p?.team?.id);
    if (!s) continue;
    box[s] = teamBox(p, bt.find(t => String(t?.team?.id) === String(p?.team?.id)));
  }

  // Status. The summary header carries the status type; period and clock fall back to the last play.
  const st = comp?.status ?? sum?.header?.status ?? {};
  const type = st.type ?? {};
  const state: LiveState = type.state === "in" || type.state === "post" ? type.state : "pre";
  const lastPlay = plays[plays.length - 1];
  const period = num(st.period) ?? lastPlay?.period ?? 0;
  const displayClock = String(st.displayClock ?? lastPlay?.clock ?? "");
  const clock = num(st.clock) ?? clockSeconds(displayClock);
  const label = labelFor({ status: { clock, displayClock, period, type: { name: String(type.name ?? ""), state, completed: !!type.completed, shortDetail: type.shortDetail } } });
  const [hc, ac] = swapped ? [ea, eh] : [eh, ea];
  const scored = state !== "pre";
  return {
    espnId, state, statusName: String(type.name ?? ""), completed: !!type.completed, period, clock, displayClock, label,
    elapsed: state === "in" && period > 0 ? elapsedFrom(period, clock) : null,
    home: scored ? num(hc.score) ?? (lastPlay ? lastPlay.home : null) : null,
    away: scored ? num(ac.score) ?? (lastPlay ? lastPlay.away : null) : null,
    homePeriods: scored ? linescores(hc) : null, awayPeriods: scored ? linescores(ac) : null,
    box, plays, flow, swapped,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The summary as a scoreboard-style LiveGame, so the sheet's header and line score can use it. */
export function summaryAsLive(s: LiveSummary): LiveGame {
  return {
    espnId: s.espnId, state: s.state, statusName: s.statusName, completed: s.completed, period: s.period, clock: s.clock,
    displayClock: s.displayClock, home: s.home, away: s.away, homePeriods: s.homePeriods, awayPeriods: s.awayPeriods,
    label: s.label, elapsed: s.elapsed,
  };
}

/** How far along a live state is (post beats any clock), for picking the fresher of two feeds. */
export const progressOf = (l: Pick<LiveGame, "state" | "elapsed"> | null | undefined) =>
  !l ? -1 : l.state === "post" ? Infinity : l.state === "in" ? l.elapsed ?? 0 : -1;

// ---- hook --------------------------------------------------------------------------------------

export type LiveGameMode = "poll" | "once" | null;
export type LiveGameState = { data: LiveSummary | null; loading: boolean; error: boolean; updated: number | null; reload: () => void };

/**
 * ESPN summary for one game. `poll`: fetch now and every 15 s while the tab is visible, until
 * ESPN reports the game over. `once`: a single fetch. null: nothing. Never throws.
 */
export function useLiveGame(espnId: string | null | undefined, mode: LiveGameMode, orient: Orient): LiveGameState {
  const [data, setData] = useState<LiveSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [updated, setUpdated] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const orientRef = useRef(orient);
  orientRef.current = orient;
  const dataRef = useRef<LiveSummary | null>(null);

  useEffect(() => {
    if (!espnId || !mode) return;
    if (dataRef.current?.espnId === espnId && dataRef.current.state === "post") return; // final already loaded
    let alive = true, fails = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ctrl: AbortController | null = null;

    const schedule = () => {
      if (!alive || mode !== "poll" || document.hidden) return;
      if (dataRef.current?.state === "post") return; // game over: stop polling
      timer = setTimeout(tick, fails ? Math.min(MAX_BACKOFF_MS, LIVE_GAME_POLL_MS * 2 ** fails) : LIVE_GAME_POLL_MS);
    };
    const tick = async () => {
      timer = null;
      if (!alive || (mode === "poll" && document.hidden)) return;
      ctrl?.abort();
      const c = new AbortController();
      ctrl = c;
      setLoading(true);
      try {
        const res = await fetch(`${SUMMARY}?event=${encodeURIComponent(espnId)}`, { signal: c.signal, cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const parsed = parseSummary(await res.json(), espnId, orientRef.current);
        if (!parsed) throw new Error("unusable summary");
        if (!alive) return;
        dataRef.current = parsed;
        fails = 0;
        setData(parsed);
        setError(false);
        setUpdated(Date.now());
      } catch {
        if (!alive || c.signal.aborted) return;
        fails++;
        setError(true);
      } finally {
        if (alive && ctrl === c) setLoading(false);
      }
      schedule();
    };
    const onVis = () => {
      if (document.hidden) { if (timer) clearTimeout(timer); timer = null; ctrl?.abort(); }
      else if (!timer) tick();
    };
    if (mode === "poll") document.addEventListener("visibilitychange", onVis);
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [espnId, mode, attempt]);

  return { data, loading, error, updated, reload: () => setAttempt(a => a + 1) };
}

// ---- many games (the Live view) -----------------------------------------------------------------

/** Live view: how often each live game's summary is refreshed. */
export const LIVE_LIST_POLL_MS = 50_000;
/** Live view: at most this many summary requests at once. */
export const LIVE_LIST_MAX_IN_FLIGHT = 4;
/** A summary fetched this recently is skipped when the list restarts (a game joins or leaves). */
const LIST_FRESH_MS = 20_000;
/** After repeated failures a game sits out up to this many rounds (about 5 minutes). */
const LIST_MAX_SKIP = 5;

export type SummaryTarget = { id: string; espnId: string; orient: Orient };
export type SummaryEntry = { data: LiveSummary; at: number };

/**
 * ESPN summaries for a list of live games (the games hub's Live view). While `enabled`, fetches
 * every target now and then every 50 s, at most four requests in flight; pauses while the tab is
 * hidden (aborting what's in flight) and resumes on return; aborts everything when disabled or
 * unmounted. A game whose summary fails sits out 1, 3, then 5 rounds before it's tried again.
 * Failures are silent: the map simply has no (or an older) entry for that game. Keyed by our game id.
 */
export function useLiveSummaries(targets: SummaryTarget[], enabled: boolean): Map<string, SummaryEntry> {
  const [data, setData] = useState<Map<string, SummaryEntry>>(new Map());
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const dataRef = useRef(data);
  dataRef.current = data;
  // Restart only when the set of games changes, not on every scoreboard refresh.
  const key = targets.map(t => `${t.id}:${t.espnId}`).sort().join(",");

  useEffect(() => {
    if (!enabled || !key) return;
    let alive = true, running = false, again = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ctrls = new Set<AbortController>();
    const fails = new Map<string, { n: number; skip: number }>();

    const schedule = () => {
      if (alive && !document.hidden && !timer) timer = setTimeout(round, LIVE_LIST_POLL_MS);
    };
    const fetchOne = async (t: SummaryTarget) => {
      const c = new AbortController();
      ctrls.add(c);
      try {
        const res = await fetch(`${SUMMARY}?event=${encodeURIComponent(t.espnId)}`, { signal: c.signal, cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const parsed = parseSummary(await res.json(), t.espnId, t.orient);
        if (!parsed) throw new Error("unusable summary");
        if (!alive) return;
        fails.delete(t.id);
        setData(prev => new Map(prev).set(t.id, { data: parsed, at: Date.now() }));
      } catch {
        if (!alive || c.signal.aborted) return;
        const n = (fails.get(t.id)?.n ?? 0) + 1;
        fails.set(t.id, { n, skip: Math.min(LIST_MAX_SKIP, 2 ** (n - 1) - 1) });
      } finally {
        ctrls.delete(c);
      }
    };
    const round = async (first = false) => {
      timer = null;
      if (!alive || document.hidden) return;
      if (running) { again = true; return; }
      running = true;
      const now = Date.now();
      const queue = targetsRef.current.filter(t => {
        const f = fails.get(t.id);
        if (f && f.skip > 0) { f.skip--; return false; }
        const have = dataRef.current.get(t.id);
        return !(first && have && have.data.espnId === t.espnId && now - have.at < LIST_FRESH_MS);
      });
      let next = 0;
      const worker = async () => {
        while (alive && !document.hidden && next < queue.length) await fetchOne(queue[next++]);
      };
      await Promise.all(Array.from({ length: Math.min(LIVE_LIST_MAX_IN_FLIGHT, queue.length) }, worker));
      running = false;
      if (again && alive && !document.hidden) { again = false; round(); return; }
      again = false;
      schedule();
    };
    const onVis = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        timer = null;
        for (const c of ctrls) c.abort();
      } else if (!timer) round();
    };
    document.addEventListener("visibilitychange", onVis);
    round(true);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      for (const c of ctrls) c.abort();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, key]);

  return data;
}
