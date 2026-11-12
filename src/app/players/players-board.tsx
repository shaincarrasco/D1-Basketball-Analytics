"use client";
// Player leaderboards: preset column sets, filters, percentile heat, URL state.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import DataTable, { type Column } from "@/components/data-table";
import TeamLogo from "@/components/team-logo";
import { ErrorState, Loading } from "@/components/states";
import { useJson } from "@/lib/client-data";
import { fmt, heatPct, signed } from "@/lib/format";
import { playerRows } from "@/lib/players";
import type { PlayerTable, TeamSummary } from "@/lib/types";
import { derive, DPR_MIN_POSS, makePool, MIN_ATT, POS_WORD, recruitText, starGlyphs, type PlayerRow, type Pos } from "./player-stats";
import { followRowLink, ROW_LINK_CLASS } from "./row-link";

const VIEWS = ["Scoring", "Impact", "Efficiency", "Playmaking", "Rebounding & defense", "Shooting profile", "Advanced"] as const;
type View = (typeof VIEWS)[number];
const slugOf = (v: View) => v.toLowerCase().replace(/&/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
const MIN_OPTS = [0, 10, 15, 20, 25];
const G_OPTS = [1, 2, 3, 4];
const POS_OPTS: Pos[] = ["G", "F", "C"];
const POSS_OPTS = [0, 50, 100, DPR_MIN_POSS, 250, 400];
const STAR_OPTS = [["any", "Any"], ["5", "5★"], ["4", "4★+"], ["3", "3★+"], ["none", "Unranked"]] as const;
type StarFilter = (typeof STAR_OPTS)[number][0];
const starOk = (f: StarFilter, s: number | null) => f === "any" || (f === "none" ? !s : (s ?? 0) >= Number(f));

/** A heat-tinted stat column. `ok` gates small samples out of the tint pool and dims the value. */
type Stat = {
  key: string; label: string; title: string; get: (r: PlayerRow) => number | null;
  digits?: number; invert?: boolean; ok?: (r: PlayerRow) => boolean; heat?: boolean; group?: "off" | "def"; unit?: string;
  /** Show a sign (+/−): ratings centred on average. */
  sign?: boolean;
};

const S = {
  g: { key: "g", label: "G", title: "Games played", get: r => r.g, digits: 0, heat: false },
  min: { key: "min", label: "MPG", title: "Minutes per game", get: r => r.min, heat: false },
  pts: { key: "pts", label: "PTS", title: "Points per game", get: r => r.pts, group: "off" },
  pts40: { key: "pts40", label: "PTS/40", title: "Points per 40 minutes", get: r => r.pts40, group: "off" },
  fgPct: { key: "fgPct", label: "FG%", title: `Field-goal % (tint needs ${MIN_ATT.fg}+ attempts)`, get: r => r.fgPct, ok: r => (r.fga ?? 0) >= MIN_ATT.fg, group: "off" },
  tpPct: { key: "tpPct", label: "3P%", title: `Three-point % (tint needs ${MIN_ATT.three}+ attempts)`, get: r => r.tpPct, ok: r => (r.tpa ?? 0) >= MIN_ATT.three, group: "off" },
  ftPct: { key: "ftPct", label: "FT%", title: `Free-throw % (tint needs ${MIN_ATT.ft}+ attempts)`, get: r => r.ftPct, ok: r => (r.fta ?? 0) >= MIN_ATT.ft, group: "off" },
  efg: { key: "efg", label: "eFG%", title: "Effective field-goal %: threes count 1.5×", get: r => r.efg, ok: r => (r.fga ?? 0) >= MIN_ATT.fg, group: "off" },
  ts: { key: "ts", label: "TS%", title: "True shooting %: points per shooting possession, free throws included", get: r => r.ts, ok: r => (r.fga ?? 0) + (r.fta ?? 0) >= MIN_ATT.fg, group: "off" },
  tpaRate: { key: "tpaRate", label: "3PA rate", title: "Share of field-goal attempts taken from three", get: r => r.tpaRate, ok: r => (r.fga ?? 0) >= MIN_ATT.fg, heat: false },
  ftr: { key: "ftr", label: "FTr", title: "Free-throw rate: free-throw attempts per 100 field-goal attempts", get: r => r.ftr, ok: r => (r.fga ?? 0) >= MIN_ATT.fg, group: "off" },
  usg: { key: "usg", label: "USG%", title: "Usage: share of team possessions used while on the floor", get: r => r.usg, heat: false },
  ortg: { key: "ortg", label: "ORtg", title: "Offensive rating: points produced per 100 possessions used", get: r => r.ortg, group: "off" },
  drtg: { key: "drtg", label: "DRtg", title: "Defensive rating: points allowed per 100 possessions while on the floor (lower is better)", get: r => r.drtg, invert: true, group: "def" },
  net: { key: "net", label: "Net", title: "ORtg minus DRtg", get: r => r.net },
  porpag: { key: "porpag", label: "PORPAG", title: "Points over replacement per adjusted game: offensive value above a replacement player", get: r => r.porpag, group: "off" },
  ws: { key: "ws", label: "WS", title: "Win shares to date", get: r => r.ws, digits: 2 },
  ws40: { key: "ws40", label: "WS/40", title: "Win shares per 40 minutes", get: r => r.ws40, digits: 3 },
  ast: { key: "ast", label: "AST", title: "Assists per game", get: r => r.ast, group: "off" },
  ast40: { key: "ast40", label: "AST/40", title: "Assists per 40 minutes", get: r => r.ast40, group: "off" },
  tov: { key: "tov", label: "TOV", title: "Turnovers per game (lower is better)", get: r => r.tov, invert: true },
  astTov: { key: "astTov", label: "AST/TO", title: "Assists per turnover", get: r => r.astTov, digits: 2, group: "off" },
  astd: { key: "astd", label: "Ast'd%", title: "Share of the player's made shots that were assisted. Low = creates his own shot.", get: r => r.astd, heat: false },
  reb: { key: "reb", label: "REB", title: "Rebounds per game", get: r => r.reb },
  orb: { key: "orb", label: "ORB", title: "Offensive rebounds per game", get: r => r.orb, group: "off" },
  drb: { key: "drb", label: "DRB", title: "Defensive rebounds per game", get: r => r.drb, group: "def" },
  orbPct: { key: "orbPct", label: "OR%", title: "Offensive rebound %: share of available offensive boards grabbed", get: r => r.orbPct, group: "off" },
  reb40: { key: "reb40", label: "REB/40", title: "Rebounds per 40 minutes", get: r => r.reb40 },
  stl: { key: "stl", label: "STL", title: "Steals per game", get: r => r.stl, group: "def" },
  blk: { key: "blk", label: "BLK", title: "Blocks per game", get: r => r.blk, group: "def" },
  stocks40: { key: "stocks40", label: "STK/40", title: "Steals + blocks per 40 minutes", get: r => r.stocks40, group: "def" },
  pf: { key: "pf", label: "PF", title: "Personal fouls per game (lower is better)", get: r => r.pf, invert: true },
  fgaG: { key: "fgaG", label: "FGA", title: "Field-goal attempts per game", get: r => r.fgaG, heat: false },
  rimShare: { key: "rimShare", label: "Rim%", title: "Share of shots at the rim (dunks, layups, tip-ins)", get: r => r.rimShare, ok: r => (r.shots ?? 0) >= MIN_ATT.fg, heat: false },
  midShare: { key: "midShare", label: "Mid%", title: "Share of shots that are two-point jumpers", get: r => r.midShare, ok: r => (r.shots ?? 0) >= MIN_ATT.fg, heat: false },
  thrShare: { key: "thrShare", label: "3pt%", title: "Share of shots that are threes", get: r => r.thrShare, ok: r => (r.shots ?? 0) >= MIN_ATT.fg, heat: false },
  rimPct: { key: "rimPct", label: "Rim FG%", title: `FG% at the rim (tint needs ${MIN_ATT.zone}+ attempts)`, get: r => r.rimPct, ok: r => (r.rimA ?? 0) >= MIN_ATT.zone, group: "off" },
  midPct: { key: "midPct", label: "Mid FG%", title: `FG% on two-point jumpers (tint needs ${MIN_ATT.zone}+ attempts)`, get: r => r.midPct, ok: r => (r.midA ?? 0) >= MIN_ATT.zone, group: "off" },
  thrPct: { key: "thrPct", label: "3pt FG%", title: `FG% on three-point jumpers (tint needs ${MIN_ATT.zone}+ attempts)`, get: r => r.thrPct, ok: r => (r.thrA ?? 0) >= MIN_ATT.zone, group: "off" },
  dpr: { key: "dpr", label: "DPR", title: "DPR: points per 100 possessions better than an average D-I player (adjusted plus-minus from lineups, shrunk toward a box-score prior)", get: r => r.dpr, sign: true, ok: r => (r.onPoss ?? 0) >= DPR_MIN_POSS },
  dprSE: { key: "dprSE", label: "± SE", title: "Standard error of DPR: the rating is likely within about this much of the truth (one SE)", get: r => r.dprSE, invert: true, heat: false },
  dprO: { key: "dprO", label: "Off", title: "Offensive DPR: points per 100 possessions added on offense", get: r => r.dprO, sign: true, group: "off", ok: r => (r.onPoss ?? 0) >= DPR_MIN_POSS },
  dprD: { key: "dprD", label: "Def", title: "Defensive DPR: points per 100 possessions saved on defense (positive = good)", get: r => r.dprD, sign: true, group: "def", ok: r => (r.onPoss ?? 0) >= DPR_MIN_POSS },
  onPoss: { key: "onPoss", label: "Poss", title: "On-court possessions tracked in play-by-play", get: r => r.onPoss, digits: 0, heat: false },
  dprRank: { key: "dprRank", label: "Rank", title: `National DPR rank among players with ${DPR_MIN_POSS}+ possessions`, get: r => r.dprRank, digits: 0, invert: true, heat: false },
  dunks: { key: "dunks", label: "Dunks", title: "Total dunks made", get: r => r.dunks, digits: 0 },
} satisfies Record<string, Stat>;

const VIEW_STATS: Record<View, { stats: Stat[]; sort: string }> = {
  Impact: { stats: [S.g, S.min, S.dpr, S.dprSE, S.dprO, S.dprD, S.onPoss, S.dprRank, S.usg, S.ts], sort: "dpr" },
  Scoring: { stats: [S.g, S.min, S.pts, S.pts40, S.fgPct, S.tpPct, S.ftPct, S.ts, S.tpaRate, S.ftr, S.usg], sort: "pts" },
  Efficiency: { stats: [S.g, S.min, S.ortg, S.drtg, S.net, S.ts, S.efg, S.usg, S.porpag, S.ws40], sort: "ortg" },
  Playmaking: { stats: [S.g, S.min, S.ast, S.ast40, S.tov, S.astTov, S.usg, S.astd, S.ortg], sort: "ast" },
  "Rebounding & defense": { stats: [S.g, S.min, S.reb, S.orb, S.drb, S.orbPct, S.reb40, S.stl, S.blk, S.stocks40, S.pf, S.drtg], sort: "reb" },
  "Shooting profile": { stats: [S.g, S.min, S.fgaG, S.rimShare, S.midShare, S.thrShare, S.rimPct, S.midPct, S.thrPct, S.ftPct, S.astd, S.dunks], sort: "fgaG" },
  Advanced: { stats: [S.g, S.min, S.usg, S.ortg, S.drtg, S.net, S.porpag, S.ws, S.ws40, S.ts, S.orbPct, S.ftr], sort: "porpag" },
};

export default function PlayersBoard() {
  const players = useJson<PlayerTable>("players.json");
  const teams = useJson<TeamSummary[]>("teams.json");
  const [view, setView] = useState<View>("Scoring");
  const [minPoss, setMinPoss] = useState(DPR_MIN_POSS);
  const [stars, setStars] = useState<StarFilter>("any");
  const [conf, setConf] = useState("all");
  const [pos, setPos] = useState<"all" | Pos>("all");
  const [minMin, setMinMin] = useState(10);
  const [minG, setMinG] = useState(1);
  const [q, setQ] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // URL state so a filtered board can be shared: ?view=&conf=&pos=&min=&g=
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = VIEWS.find(x => slugOf(x) === p.get("view"));
    if (v) setView(v);
    if (p.get("conf")) setConf(p.get("conf")!);
    const ps = p.get("pos")?.toUpperCase();
    if (ps === "G" || ps === "F" || ps === "C") setPos(ps);
    const m = Number(p.get("min"));
    if (p.has("min") && MIN_OPTS.includes(m)) setMinMin(m);
    const g = Number(p.get("g"));
    if (G_OPTS.includes(g)) setMinG(g);
    if (p.get("q")) setQ(p.get("q")!);
    const ps2 = Number(p.get("poss"));
    if (p.has("poss") && POSS_OPTS.includes(ps2)) setMinPoss(ps2);
    const st = STAR_OPTS.find(([k]) => k === p.get("stars"));
    if (st) setStars(st[0]);
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const p = new URLSearchParams();
    if (view !== "Scoring") p.set("view", slugOf(view));
    if (conf !== "all") p.set("conf", conf);
    if (pos !== "all") p.set("pos", pos);
    if (minMin !== 10) p.set("min", String(minMin));
    if (minG !== 1) p.set("g", String(minG));
    if (q.trim()) p.set("q", q.trim());
    if (view === "Impact" && minPoss !== DPR_MIN_POSS) p.set("poss", String(minPoss));
    if (stars !== "any") p.set("stars", stars);
    const s = p.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  }, [hydrated, view, conf, pos, minMin, minG, q, minPoss, stars]);

  const all = useMemo<PlayerRow[]>(() => {
    if (!players.data || !teams.data) return [];
    const byId = new Map(teams.data.map(t => [t.id, t]));
    return playerRows(players.data, players.data.rows).map(p => derive(p, byId.get(p.teamId) ?? null));
  }, [players.data, teams.data]);
  const confs = useMemo(() => [...new Map((teams.data ?? []).map(t => [t.confSlug, t.confName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [teams.data]);

  // Heat pool: everyone who clears the minutes (or, for Impact, possessions) + games floors (independent of search/conf/pos/stars).
  const impact = view === "Impact";
  const pool = useMemo(() => all.filter(r => (r.g ?? 0) >= minG && (impact ? (r.onPoss ?? 0) >= minPoss : (r.min ?? 0) >= minMin)), [all, minMin, minG, impact, minPoss]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return pool.filter(r => (conf === "all" || r.team?.confSlug === conf) && (pos === "all" || r.posN === pos) && starOk(stars, r.stars) &&
      (!n || r.name.toLowerCase().includes(n) || (r.team && (r.team.name.toLowerCase().includes(n) || r.team.short.toLowerCase() === n))));
  }, [pool, conf, pos, q, stars]);

  const { stats, sort } = VIEW_STATS[view];
  const pools = useMemo(() => {
    const out = new Map<string, ReturnType<typeof makePool>>();
    for (const s of stats) {
      if (s.heat === false) continue;
      const vals: number[] = [];
      for (const r of pool) { const v = s.get(r); if (v !== null && (!s.ok || s.ok(r))) vals.push(v); }
      out.set(s.key, makePool(vals));
    }
    return out;
  }, [stats, pool]);

  const columns = useMemo<Column<PlayerRow>[]>(() => [
    { key: "rk", label: "#", value: () => null, sortable: false, sticky: true, width: 40, render: (_r, i) => <span className="rank-cell text-mute">{i + 1}</span> },
    {
      key: "name", label: "Player", csvLabel: "Player", align: "l", value: r => r.name, first: "asc", sticky: true, width: 196,
      render: r => (
        <div className="flex items-center gap-2.5">
          {r.team ? (
            <Link href={`/teams/${r.team.slug}/`} tabIndex={-1} aria-hidden className="shrink-0"><TeamLogo src={r.team.logo} name={r.team.name} size={24} /></Link>
          ) : <TeamLogo src={null} name="?" size={24} />}
          <span className="min-w-0">
            <Link data-row-link href={`/player/?id=${r.id}`} className="link block truncate font-semibold">{r.name}</Link>
            <span className="block truncate text-[11.5px] text-mute">
              {r.team ? <Link href={`/teams/${r.team.slug}/`} className="hover:text-ink">{r.team.name}</Link> : "Unknown team"}
              {r.posN ? <> · {r.posN}</> : null}
            </span>
          </span>
        </div>
      ),
    },
    ...stats.map((s): Column<PlayerRow> => {
      const digits = s.digits ?? 1;
      return {
        key: s.key, label: s.label, csvLabel: s.label, title: s.title, group: s.group, first: s.invert ? "asc" : "desc",
        value: r => { const v = s.get(r); return v === null ? null : Number(v.toFixed(digits)); },
        render: r => {
          const v = s.get(r);
          if (v === null) return <span className="text-dim">—</span>;
          const okSample = !s.ok || s.ok(r);
          const bg = s.heat === false || !okSample ? undefined : heatPct(pools.get(s.key)?.pct(v, s.invert));
          return (
            <span className={`inline-block min-w-[2.9rem] rounded px-1.5 py-0.5 ${okSample ? "" : "text-dim"}`} style={{ background: bg }} title={okSample ? undefined : "Small sample"}>
              {s.sign ? signed(v, digits) : fmt(v, digits)}
            </span>
          );
        },
      };
    }),
    {
      key: "stars", label: "Rec.", csvLabel: "Recruiting stars", title: "High-school recruiting stars (College Basketball Data)", align: "l", value: r => r.stars, first: "desc",
      render: r => r.stars ? <span className="tracking-[0.04em]" title={`${r.stars}-star recruit${r.recRank || r.recYear ? `, ${recruitText(r)}` : ""}`} aria-label={`${r.stars}-star recruit`}>{starGlyphs(r.stars)}</span> : <span className="text-dim">—</span>,
    },
    {
      key: "conf", label: "Conf", csvLabel: "Conference", align: "l", value: r => r.team?.confName ?? null, first: "asc",
      render: r => r.team ? <Link href={`/conferences/${r.team.confSlug}/`} className="text-mute hover:text-ink">{r.team.confName}</Link> : <span className="text-mute">—</span>,
    },
  ], [stats, pools]);

  if (players.status === "error" || teams.status === "error") return <ErrorState message={players.error ?? teams.error ?? "Could not load players."} retry={() => { players.retry(); teams.retry(); }} />;
  if (!players.data || !teams.data) return <Loading label="Loading players" />;

  const reset = () => { setConf("all"); setPos("all"); setMinMin(10); setMinG(1); setQ(""); setMinPoss(DPR_MIN_POSS); setStars("any"); };

  return (
    <section aria-label="Player leaderboard">
      <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Leaderboard view">
        {VIEWS.map(v => <button key={v} className="chip" aria-pressed={view === v} onClick={() => setView(v)}>{v}</button>)}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
        <label className="relative col-span-2 sm:w-64">
          <span className="sr-only">Find a player or team</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
          <input className="field w-full !pl-9" placeholder="Player or team" value={q} onChange={e => setQ(e.target.value)} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="label">Conference</span>
          <select className="field" value={conf} onChange={e => setConf(e.target.value)}>
            <option value="all">All conferences</option>
            {confs.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Position</span>
          <select className="field" value={pos} onChange={e => setPos(e.target.value as "all" | Pos)}>
            <option value="all">All positions</option>
            {POS_OPTS.map(p => <option key={p} value={p}>{POS_WORD[p]}s</option>)}
          </select>
        </label>
        {impact ? (
          <label className="flex flex-col gap-1">
            <span className="label">On-court possessions</span>
            <select className="field" value={minPoss} onChange={e => setMinPoss(Number(e.target.value))}>
              {POSS_OPTS.map(m => <option key={m} value={m}>{m === 0 ? "Any possessions" : `${m}+ possessions`}</option>)}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="label">Minutes per game</span>
            <select className="field" value={minMin} onChange={e => setMinMin(Number(e.target.value))}>
              {MIN_OPTS.map(m => <option key={m} value={m}>{m === 0 ? "Any minutes" : `${m}+ mpg`}</option>)}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="label">Games played</span>
          <select className="field" value={minG} onChange={e => setMinG(Number(e.target.value))}>
            {G_OPTS.map(g => <option key={g} value={g}>{g === 1 ? "Any games" : `${g}+ games`}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Recruiting stars</span>
          <select className="field" value={stars} onChange={e => setStars(e.target.value as StarFilter)}>
            {STAR_OPTS.map(([k, l]) => <option key={k} value={k}>{k === "any" ? "Any stars" : l}</option>)}
          </select>
        </label>
      </div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs text-mute">
        <span aria-live="polite"><b className="font-display text-xl font-extrabold text-ink tnum">{rows.length.toLocaleString("en-US")}</b> players match</span>
        <span><i className="mr-1.5 inline-block h-2 w-3 rounded-sm bg-off align-middle" />Offense</span>
        <span><i className="mr-1.5 inline-block h-2 w-3 rounded-sm bg-def align-middle" />Defense</span>
        <span>
          Tint: <span className="text-win">top</span> / <span className="text-loss">bottom</span> of the {pool.length.toLocaleString("en-US")} players with {impact ? (minPoss ? `${minPoss}+ possessions` : "any possessions") : minMin ? `${minMin}+ mpg` : "any minutes"}{minG > 1 ? ` and ${minG}+ games` : ""}. Grey values are small samples{impact ? `; DPR is early-season and ± one standard error, so overlapping players are statistically tied. Ranks need ${DPR_MIN_POSS}+ possessions` : ""}.
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="deck flex flex-col items-start gap-3 p-6">
          <p className="font-semibold">No players match these filters</p>
          <p className="text-sm text-mute">{q.trim() ? `Nobody named “${q.trim()}” clears the current filters. ` : ""}Lower the {impact ? "possessions" : "minutes"} or games floor, or widen the conference, position and stars.</p>
          <button className="btn" onClick={reset}>Reset filters</button>
        </div>
      ) : (
        <div className={ROW_LINK_CLASS} onClick={followRowLink}>
        <DataTable key={view} rows={rows} columns={columns} rowKey={r => r.id} initialSort={sort} initialDir={VIEW_STATS[view].stats.find(s => s.key === sort)?.invert ? "asc" : "desc"}
          pageSize={100} csvName={`d1hoops-players-${slugOf(view)}.csv`} caption={`Player leaderboard: ${view}`} maxHeight="78vh" />
        </div>
      )}
    </section>
  );
}
