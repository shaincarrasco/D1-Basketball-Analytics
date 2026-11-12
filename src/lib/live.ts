"use client";
// Live scores from ESPN's public scoreboard (it sends Access-Control-Allow-Origin: *).
// The static site is rebuilt once a day; on today's slate this hook overlays the current score,
// clock and status. It polls every 30 s while a game is live or about to tip, pauses while the
// tab is hidden, sleeps until shortly before the next tip otherwise, and fails silently: on any
// error the pages keep showing the static data.
import { useEffect, useMemo, useRef, useState } from "react";
import { useJson } from "./client-data";
import type { Game, TeamSummary } from "./types";
import { elapsedFrom } from "./win-prob";

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
const POLL_MS = 30_000;
const LEAD_MS = 10 * 60_000; // start polling this long before a tip
const STALE_TIP_MS = 4 * 3600_000; // a game this long past tip and still "pre" is probably delayed or off

export type LiveState = "pre" | "in" | "post";
export type LiveGame = {
  espnId: string; state: LiveState; statusName: string; completed: boolean;
  period: number; clock: number; displayClock: string;
  /** Scores and per-period points in OUR home/away orientation (swapped when ESPN lists the teams the other way round). */
  home: number | null; away: number | null; homePeriods: number[] | null; awayPeriods: number[] | null;
  /** Short status for cards: "2nd 8:41", "Half", "End 1st", "Final", "Final · OT". */
  label: string;
  /** Elapsed game seconds (for an in-progress game). */
  elapsed: number | null;
};

type EspnCompetitor = { homeAway: "home" | "away"; team: { id: string }; score?: string; linescores?: { value?: number }[] };
type EspnEvent = {
  id: string; date: string;
  status: { clock?: number; displayClock?: string; period?: number; type: { name: string; state: LiveState; completed: boolean; shortDetail?: string } };
  competitions: { competitors: EspnCompetitor[] }[];
};

const periodName = (p: number) => (p <= 1 ? "1st" : p === 2 ? "2nd" : p === 3 ? "OT" : `${p - 2}OT`);

function labelFor(ev: EspnEvent): string {
  const s = ev.status, p = s.period ?? 0;
  const name = s.type.name;
  if (s.type.state === "in") {
    if (name === "STATUS_HALFTIME") return "Half";
    if (name === "STATUS_END_PERIOD") return `End ${periodName(p)}`;
    return `${periodName(p)} ${s.displayClock ?? ""}`.trim();
  }
  if (s.type.state === "post") {
    if (name === "STATUS_POSTPONED") return "Postponed";
    if (name === "STATUS_CANCELED") return "Canceled";
    return p > 2 ? `Final · ${p === 3 ? "OT" : `${p - 2}OT`}` : "Final";
  }
  if (name === "STATUS_DELAYED") return "Delayed";
  if (name === "STATUS_POSTPONED") return "Postponed";
  return s.type.shortDetail ?? "";
}

const num = (v: string | number | undefined | null) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

function parse(ev: EspnEvent, swap: boolean): LiveGame | null {
  const comp = ev.competitions?.[0]?.competitors ?? [];
  let h = comp.find(c => c.homeAway === "home"), a = comp.find(c => c.homeAway === "away");
  if (!h || !a) return null;
  if (swap) [h, a] = [a, h];
  const state = ev.status.type.state;
  const scored = state !== "pre";
  const lines = (c: EspnCompetitor) => (c.linescores?.length ? c.linescores.map(l => Number(l.value ?? 0)) : null);
  const period = ev.status.period ?? 0, clock = ev.status.clock ?? 0;
  return {
    espnId: ev.id, state, statusName: ev.status.type.name, completed: ev.status.type.completed,
    period, clock, displayClock: ev.status.displayClock ?? "",
    home: scored ? num(h.score) : null, away: scored ? num(a.score) : null,
    homePeriods: scored ? lines(h) : null, awayPeriods: scored ? lines(a) : null,
    label: labelFor(ev),
    elapsed: state === "in" && period > 0 ? elapsedFrom(period, clock) : null,
  };
}

/** Match ESPN events to our games: Game.espnId first, then the teams' ESPN ids (either orientation), then one known team. */
export function matchEvents(games: Game[], events: EspnEvent[], espnByTeam: Map<string, string>): Map<string, LiveGame> {
  const byId = new Map(events.map(e => [e.id, e]));
  const byPair = new Map<string, EspnEvent>();
  const byTeam = new Map<string, EspnEvent[]>();
  for (const e of events) {
    const c = e.competitions?.[0]?.competitors ?? [];
    const h = c.find(x => x.homeAway === "home")?.team.id, a = c.find(x => x.homeAway === "away")?.team.id;
    if (h && a) byPair.set(`${h}:${a}`, e);
    for (const t of [h, a]) if (t) byTeam.set(t, [...(byTeam.get(t) ?? []), e]);
  }
  const homeOf = (e: EspnEvent) => e.competitions?.[0]?.competitors.find(x => x.homeAway === "home")?.team.id;
  const out = new Map<string, LiveGame>();
  for (const g of games) {
    const h = g.home.id ? espnByTeam.get(g.home.id) : undefined;
    const a = g.away.id ? espnByTeam.get(g.away.id) : undefined;
    let ev: EspnEvent | undefined = g.espnId ? byId.get(g.espnId) : undefined;
    if (!ev && h && a) ev = byPair.get(`${h}:${a}`) ?? byPair.get(`${a}:${h}`);
    if (!ev) {
      const known = h ?? a;
      const list = known ? byTeam.get(known) ?? [] : [];
      if (list.length === 1) ev = list[0];
    }
    if (!ev) continue;
    // Orientation: swapped when ESPN's home team is our away team (or isn't our home team).
    const eh = homeOf(ev);
    const swap = h ? eh !== h : a ? eh === a : false;
    const lg = parse(ev, swap);
    if (lg) out.set(g.id, lg);
  }
  return out;
}

/** Our game with the live score, status and line score laid over it. Static finals are kept as they are. */
export function withLive(g: Game, l: LiveGame | undefined): Game {
  if (!l || g.status === "final") return g;
  let status = g.status;
  if (l.state === "in") status = "in_progress";
  else if (l.state === "post") status = l.statusName === "STATUS_POSTPONED" ? "postponed" : l.statusName === "STATUS_CANCELED" ? "canceled" : "final";
  else if (l.statusName === "STATUS_POSTPONED") status = "postponed";
  else if (l.state === "pre") status = "scheduled";
  if (l.state === "pre") return { ...g, status };
  return {
    ...g, status,
    home: { ...g.home, score: l.home ?? g.home.score, periods: l.homePeriods ?? g.home.periods },
    away: { ...g.away, score: l.away ?? g.away.score, periods: l.awayPeriods ?? g.away.periods },
  };
}

const espnDate = (day: string) => day.replace(/-/g, "");

/**
 * Live overlay for one day's games. Pass `day` only when it is today (Eastern); otherwise it
 * does nothing. Returns the matched live states keyed by our game id.
 */
export function useLiveScores(day: string | null, games: Game[] | null) {
  const [byGame, setByGame] = useState<Map<string, LiveGame>>(new Map());
  const [updated, setUpdated] = useState<number | null>(null);
  const needTeams = !!day && !!games?.some(g => !g.espnId);
  const teams = useJson<TeamSummary[]>(needTeams ? "teams.json" : null);
  const espnByTeam = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams.data ?? []) if (t.espnId) m.set(t.id, t.espnId);
    return m;
  }, [teams.data]);
  const ready = !!day && !!games?.length && (!needTeams || teams.status !== "loading");

  const latest = useRef(byGame);
  latest.current = byGame;

  useEffect(() => {
    setByGame(new Map());
    setUpdated(null);
  }, [day]);

  useEffect(() => {
    if (!ready || !day || !games) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ctrl: AbortController | null = null;
    let alive = true;

    const nextDelay = (): number | null => {
      const now = Date.now();
      const live = latest.current;
      let soonest = Infinity;
      for (const g of games) {
        const l = live.get(g.id);
        if (l?.state === "in") return POLL_MS;
        const done = l ? l.state === "post" : g.status === "final" || g.status === "postponed" || g.status === "canceled";
        if (done) continue;
        if (g.status === "in_progress" && !l) return POLL_MS;
        const tip = new Date(g.date).getTime();
        if (!Number.isFinite(tip)) continue;
        if (tip - now <= LEAD_MS && now - tip <= STALE_TIP_MS) return POLL_MS;
        if (tip > now) soonest = Math.min(soonest, tip);
      }
      return Number.isFinite(soonest) ? Math.max(POLL_MS, soonest - LEAD_MS - now) : null;
    };

    const schedule = () => {
      if (!alive || document.hidden) return;
      const d = nextDelay();
      if (d != null) timer = setTimeout(tick, d);
    };

    const tick = async () => {
      timer = null;
      if (!alive || document.hidden) return;
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const res = await fetch(`${SCOREBOARD}?dates=${espnDate(day)}&groups=50&limit=500`, { signal: ctrl.signal, cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { events?: EspnEvent[] };
        if (!alive) return;
        const m = matchEvents(games, body.events ?? [], espnByTeam);
        latest.current = m;
        setByGame(m);
        setUpdated(Date.now());
      } catch {
        // Silent: keep whatever we had (static data or the last good poll).
      }
      schedule();
    };

    const onVis = () => {
      if (document.hidden) { if (timer) clearTimeout(timer); timer = null; ctrl?.abort(); }
      else if (!timer) tick();
    };
    document.addEventListener("visibilitychange", onVis);
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ready, day, games, espnByTeam]);

  const anyLive = useMemo(() => [...byGame.values()].some(l => l.state === "in"), [byGame]);
  return { byGame, updated, anyLive, hasData: updated != null };
}
