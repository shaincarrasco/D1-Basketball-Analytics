"use client";
// Live post-game ratings. The pipeline refreshes ratings hourly at best (and GitHub often runs it
// late), so the browser closes the gap itself: it finds games ESPN shows as final that the published
// ratings don't include yet, adds them to the exact inputs the pipeline used (dhr-input.json), and
// refits DHR with the same model code. Rankings, records, ratings and schedules then reflect every
// final within a minute or two. The next pipeline run publishes the same results officially.
import { useEffect, useState } from "react";
import { fit, rating, NON_D1, type FitGame, type Model } from "../../scripts/lib/rating-model.mjs";
import { loadJson } from "./client-data";
import { etToday } from "./format";
import { matchEvents, type EspnEvent } from "./live";
import type { Game, GameDay, TeamSummary } from "./types";

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
const SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary";
const REFRESH_MS = 3 * 60_000;

type Input = {
  v: 1; builtAt: string; through: string | null; confs: string[];
  teams: [string, number][];
  seasonPrior: Record<string, [number, number]> | null;
  warm: { h: number; r: Record<string, [number, number, number]> };
  games: [string, string, string, number, number, 0 | 1, number, number, number, number, number][];
};

/** A result the published ratings don't include yet, in our home/away orientation. */
export type LiveFinal = { id: string; day: string; game: Game; homePts: number; awayPts: number };
export type LiveTeam = {
  adjO: number; adjD: number; adjEM: number; adjT: number; sos: number | null;
  rank: number; adjORank: number; adjDRank: number; adjTRank: number; sosRank: number | null;
  ratedGames: number;
  /** Results added on top of the published record. */
  dw: number; dl: number; dcw: number; dcl: number;
};
export type LiveRatings = { finals: LiveFinal[]; teams: Map<string, LiveTeam>; at: number };

// ---------- shared store (one computation per page view, refreshed while games are on) ----------
let current: LiveRatings | null = null;
let running: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let signature = "";
const listeners = new Set<(r: LiveRatings | null) => void>();
const emit = () => listeners.forEach(l => l(current));

const days = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); ; d = new Date(d.getTime() + 864e5)) {
    const s = d.toISOString().slice(0, 10);
    if (s > to) break;
    out.push(s);
    if (out.length > 7) break; // never scan more than a week of gap
  }
  return out;
};

async function espnDay(day: string): Promise<EspnEvent[]> {
  const res = await fetch(`${SCOREBOARD}?dates=${day.replace(/-/g, "")}&groups=50&limit=500`, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { events?: EspnEvent[] }).events ?? [];
}

/** Possessions from ESPN's team box (FGA − ORB + TOV + 0.475·FTA, both sides averaged); cached per game. */
async function possessions(espnId: string): Promise<number | null> {
  const key = `d1h-poss-${espnId}`;
  try { const hit = sessionStorage.getItem(key); if (hit) return Number(hit) || null; } catch { /* storage unavailable */ }
  try {
    const res = await fetch(`${SUMMARY}?event=${espnId}`);
    if (!res.ok) return null;
    const body = await res.json() as { boxscore?: { teams?: { statistics?: { name: string; displayValue: string }[] }[] } };
    const sides = (body.boxscore?.teams ?? []).map(t => {
      const v = (n: string) => t.statistics?.find(s => s.name === n)?.displayValue ?? "";
      const pair = (n: string) => v(n).split("-").map(Number);
      const fga = pair("fieldGoalsMade-fieldGoalsAttempted")[1], fta = pair("freeThrowsMade-freeThrowsAttempted")[1];
      const orb = Number(v("offensiveRebounds")), tov = Number(v("turnovers"));
      return [fga, fta, orb, tov].every(Number.isFinite) && fga > 0 ? fga - orb + tov + 0.475 * fta : null;
    }).filter((p): p is number => p !== null);
    if (sides.length !== 2) return null;
    const poss = Math.round(((sides[0] + sides[1]) / 2) * 10) / 10;
    try { sessionStorage.setItem(key, String(poss)); } catch { /* ignore */ }
    return poss;
  } catch { return null; }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

async function compute(): Promise<{ result: LiveRatings | null; pending: boolean }> {
  const input = await loadJson<Input>("dhr-input.json");
  if (input.v !== 1 || !input.through) return { result: null, pending: false };
  const included = new Set(input.games.map(g => g[0]));
  const today = etToday();
  const finals: LiveFinal[] = [];
  let pending = false;

  for (const day of days(input.through, today)) {
    const [slate, events] = await Promise.all([
      loadJson<GameDay>(`games/${day}.json`).catch(() => null),
      espnDay(day).catch(() => [] as EspnEvent[]),
    ]);
    if (!slate?.games.length) continue;
    const live = matchEvents(slate.games, events, new Map());
    for (const g of slate.games) {
      if (included.has(g.id) || g.status === "postponed" || g.status === "canceled") continue;
      const l = live.get(g.id);
      const done = l?.state === "post" && l.completed && l.statusName !== "STATUS_POSTPONED" && l.statusName !== "STATUS_CANCELED";
      const staticFinal = g.status === "final" && g.home.score != null && g.away.score != null;
      if (done && l.home != null && l.away != null) finals.push({ id: g.id, day, game: g, homePts: l.home, awayPts: l.away });
      else if (staticFinal) finals.push({ id: g.id, day, game: g, homePts: g.home.score!, awayPts: g.away.score! });
      else if (day === today && g.status !== "final") pending = true;
    }
  }
  if (!finals.length) return { result: { finals, teams: new Map(), at: Date.now() }, pending };

  // Same game rows as the pipeline: D-I teams by id, every non-D-I opponent pooled, half weight without a box score.
  const confs = input.confs;
  const confOfTeam = new Map(input.teams.map(([id, c]) => [id, confs[c]]));
  const node = (side: Game["home"]) => (side.slug && side.id && confOfTeam.has(side.id) ? side.id : NON_D1);
  const poss = await pool(finals, 4, f => (f.game.espnId ? possessions(f.game.espnId) : Promise.resolve(null)));
  const games: FitGame[] = input.games.map(g => ({
    gameId: g[0], date: "", homeId: g[1], awayId: g[2],
    homeConf: g[3] >= 0 && confs[g[3]] !== NON_D1 ? confs[g[3]] : null, awayConf: g[4] >= 0 && confs[g[4]] !== NON_D1 ? confs[g[4]] : null,
    neutral: g[5] === 1, homePts: g[6], awayPts: g[7], poss: g[8], minutes: g[9], weight: g[10],
  }));
  finals.forEach((f, i) => {
    const h = node(f.game.home), a = node(f.game.away);
    if (h === NON_D1 && a === NON_D1) return;
    const nonD1 = h === NON_D1 || a === NON_D1;
    games.push({
      gameId: f.id, date: f.game.date, homeId: h, awayId: a,
      homeConf: h === NON_D1 ? null : confOfTeam.get(h) ?? null, awayConf: a === NON_D1 ? null : confOfTeam.get(a) ?? null,
      neutral: f.game.neutral, homePts: f.homePts, awayPts: f.awayPts,
      poss: poss[i] ?? 69, minutes: 40, weight: (nonD1 ? 0.5 : 1) * (poss[i] ? 1 : 0.5),
    });
  });

  const warm = {
    h: input.warm.h,
    O: new Map(Object.entries(input.warm.r).map(([k, v]) => [k, v[0]])),
    D: new Map(Object.entries(input.warm.r).map(([k, v]) => [k, v[1]])),
    T: new Map(Object.entries(input.warm.r).map(([k, v]) => [k, v[2]])),
  };
  const seasonPrior = input.seasonPrior ? new Map(Object.entries(input.seasonPrior).map(([k, [O, D]]) => [k, { O, D }])) : undefined;
  const model: Model = fit(games, { warm, seasonPrior });

  // Ratings, ranks and schedule strength exactly as build-power-ratings computes them.
  type Row = { id: string; adjO: number; adjD: number; adjEM: number; adjT: number; sos: number | null; n: number } & Record<string, number | string | null>;
  const oppsOf = new Map<string, string[]>();
  for (const g of games) {
    if (!oppsOf.has(g.homeId)) oppsOf.set(g.homeId, []);
    if (!oppsOf.has(g.awayId)) oppsOf.set(g.awayId, []);
    oppsOf.get(g.homeId)!.push(g.awayId); oppsOf.get(g.awayId)!.push(g.homeId);
  }
  const rows: Row[] = [];
  for (const [id] of input.teams) {
    const r = rating(model, id, true);
    if (!r.known) continue;
    const opps = oppsOf.get(id) ?? [];
    const sos = opps.length ? opps.reduce((s, o) => s + rating(model, o, o !== NON_D1).adjEM, 0) / opps.length : null;
    rows.push({ id, adjO: r.adjO, adjD: r.adjD, adjEM: r.adjEM, adjT: r.adjT, sos, n: r.n });
  }
  const rankBy = (key: string, dir: 1 | -1) => [...rows].filter(r => r[key] != null).sort((a, b) => dir * ((a[key] as number) - (b[key] as number))).forEach((r, i) => { r[`${key}Rank`] = i + 1; });
  rankBy("adjEM", -1); rankBy("adjO", -1); rankBy("adjD", 1); rankBy("adjT", -1); rankBy("sos", -1);

  const delta = new Map<string, { dw: number; dl: number; dcw: number; dcl: number }>();
  const bump = (id: string | null, won: boolean, conf: boolean) => {
    if (!id) return;
    const d = delta.get(id) ?? { dw: 0, dl: 0, dcw: 0, dcl: 0 };
    if (won) { d.dw++; if (conf) d.dcw++; } else { d.dl++; if (conf) d.dcl++; }
    delta.set(id, d);
  };
  for (const f of finals) {
    if (f.homePts === f.awayPts) continue;
    const homeWon = f.homePts > f.awayPts;
    if (f.game.home.slug) bump(f.game.home.id, homeWon, f.game.confGame);
    if (f.game.away.slug) bump(f.game.away.id, !homeWon, f.game.confGame);
  }
  const r1 = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
  const teams = new Map<string, LiveTeam>();
  for (const r of rows) {
    teams.set(r.id, {
      adjO: r1(r.adjO), adjD: r1(r.adjD), adjEM: r1(r.adjEM, 2), adjT: r1(r.adjT), sos: r.sos == null ? null : r1(r.sos, 2),
      rank: r.adjEMRank as number, adjORank: r.adjORank as number, adjDRank: r.adjDRank as number, adjTRank: r.adjTRank as number, sosRank: (r.sosRank as number) ?? null,
      ratedGames: r.n, ...(delta.get(r.id) ?? { dw: 0, dl: 0, dcw: 0, dcl: 0 }),
    });
  }
  return { result: { finals, teams, at: Date.now() }, pending };
}

function run() {
  if (running) return running;
  running = compute()
    .then(({ result, pending }) => {
      const sig = result ? result.finals.map(f => `${f.id}:${f.homePts}-${f.awayPts}`).join(",") : "";
      if (sig !== signature || !current) { signature = sig; current = result; emit(); }
      if (timer) clearTimeout(timer);
      // Keep checking while today's games are still to finish.
      if (pending) timer = setTimeout(() => { timer = null; if (!document.hidden) run(); }, REFRESH_MS);
    })
    .catch(() => { /* static data stays as published */ })
    .finally(() => { running = null; });
  return running;
}

/** Live ratings for every rated team, or null until computed / when nothing new has finished. */
export function useLiveRatings(): LiveRatings | null {
  const [r, setR] = useState<LiveRatings | null>(current);
  useEffect(() => {
    listeners.add(setR);
    if (current) setR(current); else run();
    const onVisible = () => { if (!document.hidden && !running && !timer) run(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { listeners.delete(setR); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return r && r.finals.length ? r : null;
}

/** A team summary with the live rating, rank and record laid over the published one. */
export function withLiveTeam(t: TeamSummary, live: LiveRatings | null): TeamSummary {
  const l = live?.teams.get(t.id);
  if (!l) return t;
  return {
    ...t,
    adjO: l.adjO, adjD: l.adjD, adjEM: l.adjEM, adjT: l.adjT, sos: l.sos ?? t.sos,
    rank: l.rank, adjORank: l.adjORank, adjDRank: l.adjDRank, adjTRank: l.adjTRank, sosRank: l.sosRank ?? t.sosRank,
    w: t.w + l.dw, l: t.l + l.dl, cw: t.cw + l.dcw, cl: t.cl + l.dcl,
  };
}

/** Teams with live ratings applied, re-sorted by live rank, plus each team's published rank for movement arrows. */
export function useLiveTeams(teams: TeamSummary[]) {
  const live = useLiveRatings();
  const [out, setOut] = useState<{ teams: TeamSummary[]; prevRank: Map<string, number | null> }>({ teams, prevRank: new Map() });
  useEffect(() => {
    if (!live) { setOut({ teams, prevRank: new Map() }); return; }
    const prevRank = new Map(teams.map(t => [t.id, t.rank]));
    const next = teams.map(t => withLiveTeam(t, live)).sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.name.localeCompare(b.name));
    setOut({ teams: next, prevRank });
  }, [teams, live]);
  return { ...out, live };
}
