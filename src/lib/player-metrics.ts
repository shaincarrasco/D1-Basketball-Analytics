"use client";
// One catalog of player metrics for the rankings frameworks, the chart gallery and the
// chart builder. Every metric knows how to read itself off a PlayerRow, whether lower is
// better, and the sample it needs before it counts (small samples are left out of pools
// and charts rather than shown as outliers).
import { useMemo } from "react";
import { useJson } from "@/lib/client-data";
import { playerRows } from "@/lib/players";
import type { PlayerTable, TeamSummary } from "@/lib/types";
import { derive, DPR_MIN_POSS, MIN_ATT, type PlayerRow, type Pos } from "@/app/players/player-stats";

export type MetricGroup = "Impact" | "Scoring" | "Shooting" | "Playmaking" | "Rebounding" | "Defense" | "Volume";
export type Metric = {
  key: string; label: string; short: string; group: MetricGroup; desc: string;
  get: (r: PlayerRow) => number | null;
  /** Lower is better (turnovers, fouls, DRtg). */
  invert?: boolean;
  /** Sample needed before the value is trusted. */
  ok?: (r: PlayerRow) => boolean;
  digits?: number; unit?: string; sign?: boolean;
};

const per40 = (v: number | null, r: PlayerRow) => (v !== null && r.min ? (v / r.min) * 40 : null);
const fga = (n: number) => (r: PlayerRow) => (r.fga ?? 0) * 1 >= n;
const enoughPoss = (r: PlayerRow) => (r.onPoss ?? 0) >= DPR_MIN_POSS;

export const METRICS: Metric[] = [
  // Impact
  { key: "dpr", label: "DPR impact", short: "DPR", group: "Impact", sign: true, ok: enoughPoss, get: r => r.dpr, desc: "Points per 100 possessions better than an average D-I player, from lineup data (adjusted plus-minus shrunk toward a box-score prior)." },
  { key: "dprO", label: "Offensive DPR", short: "O-DPR", group: "Impact", sign: true, ok: enoughPoss, get: r => r.dprO, desc: "Points per 100 possessions added on offense." },
  { key: "dprD", label: "Defensive DPR", short: "D-DPR", group: "Impact", sign: true, ok: enoughPoss, get: r => r.dprD, desc: "Points per 100 possessions saved on defense (positive = good)." },
  { key: "porpag", label: "PORPAG", short: "PORPAG", group: "Impact", get: r => r.porpag, desc: "Points over replacement per adjusted game: offensive value above a replacement player." },
  { key: "ws40", label: "Win shares / 40", short: "WS/40", group: "Impact", digits: 3, get: r => r.ws40, desc: "Win shares per 40 minutes." },
  { key: "net", label: "Net rating", short: "Net", group: "Impact", sign: true, get: r => r.net, desc: "Offensive rating minus defensive rating." },
  { key: "ortg", label: "Offensive rating", short: "ORtg", group: "Impact", get: r => r.ortg, desc: "Points produced per 100 possessions used." },
  // Scoring
  { key: "pts", label: "Points per game", short: "PPG", group: "Scoring", get: r => r.pts, desc: "Points per game." },
  { key: "pts40", label: "Points / 40", short: "PTS/40", group: "Scoring", get: r => r.pts40, desc: "Points per 40 minutes: scoring rate independent of playing time." },
  { key: "usg", label: "Usage rate", short: "USG%", group: "Scoring", unit: "%", get: r => r.usg, desc: "Share of team possessions used while on the floor." },
  { key: "ts", label: "True shooting", short: "TS%", group: "Scoring", unit: "%", ok: r => (r.fga ?? 0) + (r.fta ?? 0) >= 20, get: r => r.ts, desc: "Points per shooting possession, free throws included." },
  { key: "efg", label: "Effective FG%", short: "eFG%", group: "Scoring", unit: "%", ok: fga(20), get: r => r.efg, desc: "Field-goal % with threes counted 1.5×." },
  { key: "ftr", label: "Free-throw rate", short: "FTr", group: "Scoring", ok: fga(MIN_ATT.fg), get: r => r.ftr, desc: "Free-throw attempts per 100 field-goal attempts: how often he gets to the line." },
  { key: "selfCreate", label: "Unassisted shot share", short: "Unast'd%", group: "Scoring", unit: "%", ok: r => (r.fgm ?? 0) >= 6, get: r => (r.astd === null ? null : 100 - r.astd), desc: "Share of made shots that were NOT assisted. High = creates his own shot." },
  { key: "dunks", label: "Dunks", short: "Dunks", group: "Scoring", digits: 0, get: r => r.dunks, desc: "Total dunks made this season." },
  // Shooting
  { key: "tpPct", label: "3-point %", short: "3P%", group: "Shooting", unit: "%", ok: r => (r.tpa ?? 0) >= 10, get: r => r.tpPct, desc: "Three-point percentage (needs 10+ attempts)." },
  { key: "tpa40", label: "3-point attempts / 40", short: "3PA/40", group: "Shooting", get: r => per40(r.tpa !== null && r.g ? r.tpa / r.g : null, r), desc: "Three-point attempts per 40 minutes: shooting volume." },
  { key: "tpaRate", label: "3-point attempt rate", short: "3PA rate", group: "Shooting", unit: "%", ok: fga(MIN_ATT.fg), get: r => r.tpaRate, desc: "Share of field-goal attempts taken from three." },
  { key: "ftPct", label: "Free-throw %", short: "FT%", group: "Shooting", unit: "%", ok: r => (r.fta ?? 0) >= 10, get: r => r.ftPct, desc: "Free-throw percentage (needs 10+ attempts). A strong signal of shooting touch." },
  { key: "rimPct", label: "FG% at the rim", short: "Rim FG%", group: "Shooting", unit: "%", ok: r => (r.rimA ?? 0) >= 10, get: r => r.rimPct, desc: "Field-goal % on dunks, layups and tip-ins (needs 10+ attempts)." },
  { key: "rimShare", label: "Shots at the rim", short: "Rim share", group: "Shooting", unit: "%", ok: r => (r.shots ?? 0) >= MIN_ATT.fg, get: r => r.rimShare, desc: "Share of shots taken at the rim." },
  { key: "midPct", label: "Mid-range FG%", short: "Mid FG%", group: "Shooting", unit: "%", ok: r => (r.midA ?? 0) >= 10, get: r => r.midPct, desc: "Field-goal % on two-point jumpers (needs 10+ attempts)." },
  // Playmaking
  { key: "ast40", label: "Assists / 40", short: "AST/40", group: "Playmaking", get: r => r.ast40, desc: "Assists per 40 minutes." },
  { key: "ast", label: "Assists per game", short: "APG", group: "Playmaking", get: r => r.ast, desc: "Assists per game." },
  { key: "astTov", label: "Assist-to-turnover", short: "AST/TO", group: "Playmaking", digits: 2, ok: r => ((r.ast ?? 0) + (r.tov ?? 0)) * (r.g ?? 0) >= 8, get: r => r.astTov, desc: "Assists per turnover: ball security for creators." },
  { key: "tov40", label: "Turnovers / 40", short: "TOV/40", group: "Playmaking", invert: true, get: r => per40(r.tov, r), desc: "Turnovers per 40 minutes (lower is better)." },
  // Rebounding
  { key: "reb40", label: "Rebounds / 40", short: "REB/40", group: "Rebounding", get: r => r.reb40, desc: "Rebounds per 40 minutes." },
  { key: "reb", label: "Rebounds per game", short: "RPG", group: "Rebounding", get: r => r.reb, desc: "Rebounds per game." },
  { key: "orbPct", label: "Offensive rebound %", short: "OR%", group: "Rebounding", unit: "%", get: r => r.orbPct, desc: "Share of available offensive rebounds grabbed while on the floor." },
  { key: "orb40", label: "Offensive boards / 40", short: "ORB/40", group: "Rebounding", get: r => per40(r.orb, r), desc: "Offensive rebounds per 40 minutes." },
  { key: "drb40", label: "Defensive boards / 40", short: "DRB/40", group: "Rebounding", get: r => per40(r.drb, r), desc: "Defensive rebounds per 40 minutes." },
  // Defense
  { key: "stocks40", label: "Stocks / 40", short: "STK/40", group: "Defense", get: r => r.stocks40, desc: "Steals + blocks per 40 minutes." },
  { key: "stl40", label: "Steals / 40", short: "STL/40", group: "Defense", get: r => per40(r.stl, r), desc: "Steals per 40 minutes." },
  { key: "blk40", label: "Blocks / 40", short: "BLK/40", group: "Defense", get: r => per40(r.blk, r), desc: "Blocks per 40 minutes." },
  { key: "drtg", label: "Defensive rating", short: "DRtg", group: "Defense", invert: true, get: r => r.drtg, desc: "Points allowed per 100 possessions while on the floor (lower is better)." },
  { key: "pf40", label: "Fouls / 40", short: "PF/40", group: "Defense", invert: true, get: r => per40(r.pf, r), desc: "Personal fouls per 40 minutes (lower is better)." },
  // Volume
  { key: "min", label: "Minutes per game", short: "MPG", group: "Volume", get: r => r.min, desc: "Minutes per game." },
  { key: "fgaG", label: "Shots per game", short: "FGA", group: "Volume", get: r => r.fgaG, desc: "Field-goal attempts per game." },
  { key: "onPoss", label: "On-court possessions", short: "Poss", group: "Volume", digits: 0, get: r => r.onPoss, desc: "On-court possessions tracked in play-by-play." },
];
export const METRIC = Object.fromEntries(METRICS.map(m => [m.key, m])) as Record<string, Metric>;
export const METRIC_GROUPS: MetricGroup[] = ["Impact", "Scoring", "Shooting", "Playmaking", "Rebounding", "Defense", "Volume"];

/** The metric's value if its sample is big enough, else null. */
export const val = (m: Metric, r: PlayerRow) => (m.ok && !m.ok(r) ? null : m.get(r));

export function fmtMetric(m: Metric, v: number | null) {
  if (v === null || !Number.isFinite(v)) return "—";
  const d = m.digits ?? 1;
  const s = Math.abs(v).toFixed(d);
  return (m.sign ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : "") + s + (m.unit === "%" ? "%" : "");
}

/** Every D-I player joined to his team, with derived rates. */
export function usePlayers() {
  const players = useJson<PlayerTable>("players.json");
  const teams = useJson<TeamSummary[]>("teams.json");
  const rows = useMemo<PlayerRow[]>(() => {
    if (!players.data || !teams.data) return [];
    const byId = new Map(teams.data.map(t => [t.id, t]));
    return playerRows(players.data, players.data.rows).map(p => derive(p, byId.get(p.teamId) ?? null));
  }, [players.data, teams.data]);
  const confs = useMemo(() => [...new Map((teams.data ?? []).map(t => [t.confSlug, t.confName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [teams.data]);
  const error = players.error ?? teams.error;
  return { rows, confs, ready: !!players.data && !!teams.data, error, retry: () => { players.retry(); teams.retry(); } };
}

/** Pool filters shared by rankings and charts. */
export type PoolFilter = { conf: string; pos: "all" | Pos; minMin: number; minG: number; stars: "any" | "4" | "3" | "none" };
export const DEFAULT_POOL: PoolFilter = { conf: "all", pos: "all", minMin: 15, minG: 2, stars: "any" };
export const inPool = (f: PoolFilter, r: PlayerRow) =>
  (r.min ?? 0) >= f.minMin && (r.g ?? 0) >= f.minG &&
  (f.conf === "all" || (f.conf === "high-major" ? HIGH_MAJOR.has(r.team?.confSlug ?? "") : r.team?.confSlug === f.conf)) &&
  (f.pos === "all" || r.posN === f.pos) &&
  (f.stars === "any" || (f.stars === "none" ? !r.stars : (r.stars ?? 0) >= Number(f.stars)));

/** The five high-major leagues (ACC, Big Ten, Big 12, SEC, Big East), as conference slugs. */
export const HIGH_MAJOR = new Set(["acc", "big-ten", "big-12", "sec", "big-east"]);
export const HIGH_MAJOR_LABEL = "High-major (ACC, B1G, B12, SEC, BE)";

export const MIN_OPTS = [0, 10, 15, 20, 25, 30];
export const G_OPTS = [1, 2, 3, 4, 5];
