"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import DataTable, { type Column } from "@/components/data-table";
import PerfBars from "@/components/perf-bars";
import TeamLogo from "@/components/team-logo";
import { fmt, heat, pctFmt, signed } from "@/lib/format";
import type { ProfileKey, TeamSummary } from "@/lib/types";
import { useLiveTeams } from "@/lib/live-ratings";
import LiveRatingsNote, { RankMove } from "@/components/live-ratings-note";

const VIEWS = ["Ratings", "Projections", "Four factors", "Shooting", "Résumé"] as const;
type View = (typeof VIEWS)[number];
/** URL slug for a view: ratings, projections, fourfactors, shooting, resume. */
const slug = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

export default function RankingsTable({ teams: published, total }: { teams: TeamSummary[]; total: number }) {
  const { teams, prevRank, live } = useLiveTeams(published);
  const [view, setView] = useState<View>("Ratings");
  const [conf, setConf] = useState("all");
  const [q, setQ] = useState("");

  // Keep view + conference in the URL so a filtered table can be shared.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const want = slug(p.get("view") ?? "");
    const v = VIEWS.find(x => slug(x) === want);
    if (v) setView(v);
    if (p.get("conf")) setConf(p.get("conf")!);
  }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    if (view !== "Ratings") p.set("view", slug(view));
    if (conf !== "all") p.set("conf", conf);
    const s = p.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  }, [view, conf]);

  const confs = useMemo(() => [...new Map(teams.map(t => [t.confSlug, t.confName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [teams]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return teams.filter(t => (conf === "all" || t.confSlug === conf) && (!n || t.name.toLowerCase().includes(n) || t.short.toLowerCase().includes(n)));
  }, [teams, conf, q]);

  // National ranks for the simulation columns (heat shading).
  const simRanks = useMemo(() => {
    const rankBy = (v: (t: TeamSummary) => number | null) => {
      const list = teams.filter(t => v(t) !== null).sort((a, b) => v(b)! - v(a)!);
      return new Map(list.map((t, i) => [t.id, i + 1]));
    };
    return { wins: rankBy(t => t.sim?.wins ?? null), title: rankBy(t => t.sim?.title ?? null), win20: rankBy(t => t.sim?.win20 ?? null) };
  }, [teams]);
  // Shared axis for the win-range bars: lowest 10th percentile to highest 90th percentile in D-I.
  const winAxis = useMemo(() => {
    const sims = teams.flatMap(t => (t.sim ? [t.sim] : []));
    const lo = sims.length ? Math.min(...sims.map(x => x.p10)) : 0, hi = sims.length ? Math.max(...sims.map(x => x.p90)) : 30;
    return { lo, span: Math.max(1, hi - lo) };
  }, [teams]);
  const wx = (v: number) => ((v - winAxis.lo) / winAxis.span) * 100;
  const atsPct = (t: TeamSummary) => (t.ats[0] + t.ats[1] ? t.ats[0] / (t.ats[0] + t.ats[1]) : null);

  const rankCell = (v: number | null, rank: number | null | undefined, digits = 1, prefix = "") => (
    <span className="inline-block min-w-[3.4rem] rounded px-1.5 py-0.5" style={{ background: heat(rank, total) }}>
      {prefix}{fmt(v, digits)}<span className="sub-rank">{rank ?? ""}</span>
    </span>
  );
  const prof = (side: "off" | "def", k: ProfileKey, label: string, title: string, group?: "off" | "def"): Column<TeamSummary> => ({
    key: `${side}.${k}`, label, csvLabel: `${side === "off" ? "Off" : "Def"} ${label}`, title, group: group ?? side,
    value: t => t[side]?.[k] ?? null, first: (side === "off") === (k !== "tov") ? "desc" : "asc",
    render: t => rankCell(t[side]?.[k] ?? null, t[side === "off" ? "offRanks" : "defRanks"]?.[k]),
  });

  const identity: Column<TeamSummary>[] = [
    { key: "rank", label: "Rk", value: t => t.rank, first: "asc", sticky: true, width: 62, render: t => <span className="whitespace-nowrap"><span className="rank-cell">{t.rank ?? "—"}</span><RankMove now={t.rank} before={prevRank.get(t.id)} /></span> },
    {
      key: "name", label: "Team", align: "l", value: t => t.name, first: "asc", sticky: true, width: 210,
      render: t => (
        <div className="flex items-center gap-2.5">
          <Link href={`/teams/${t.slug}/`} tabIndex={-1} aria-hidden className="shrink-0"><TeamLogo src={t.logo} name={t.name} size={24} /></Link>
          <span className="min-w-0">
            <Link href={`/teams/${t.slug}/`} className="link block truncate font-semibold group-hover/row:text-off">{t.name}</Link>
            <span className="block truncate text-[11.5px] text-mute">
              <Link href={`/conferences/${t.confSlug}/`} className="hover:text-ink hover:underline">{t.confName}</Link> · {t.w}–{t.l}
            </span>
          </span>
        </div>
      ),
    },
  ];
  const columns: Record<View, Column<TeamSummary>[]> = {
    Ratings: [
      ...identity,
      { key: "adjEM", label: "AdjEM", title: "Adjusted efficiency margin (AdjO − AdjD)", value: t => t.adjEM, render: t => <b className="text-[15px]">{signed(t.adjEM, 1)}</b> },
      { key: "adjO", label: "AdjO", title: "Adjusted offense: points per 100 possessions vs an average D-I defense", group: "off", value: t => t.adjO, render: t => rankCell(t.adjO, t.adjORank) },
      { key: "adjD", label: "AdjD", title: "Adjusted defense: points allowed per 100 possessions vs an average D-I offense (lower is better)", group: "def", first: "asc", value: t => t.adjD, render: t => rankCell(t.adjD, t.adjDRank) },
      { key: "adjT", label: "Tempo", title: "Adjusted possessions per 40 minutes (style, not quality)", value: t => t.adjT, render: t => <span>{fmt(t.adjT)}<span className="sub-rank">{t.adjTRank}</span></span> },
      { key: "sos", label: "SOS", title: "Average AdjEM of opponents played", value: t => t.sos, render: t => rankCell(t.sos, t.sosRank, 1) },
      { key: "perf", label: "Game form", title: "Adjusted efficiency margin in each game (opponent + venue adjusted)", sortable: false, value: t => t.perf.length ? t.perf.reduce((a, b) => a + b, 0) / t.perf.length : null, render: t => <PerfBars values={t.perf} /> },
      { key: "proj", label: "Proj W–L", title: "Current record plus expected wins in remaining games", value: t => t.projW, render: t => <span>{fmt(t.projW, 1)}–{fmt(t.projL, 1)}</span> },
      { key: "sample", label: "Sample", title: "Rated D-I games; early ratings lean on conference priors", value: t => t.ratedGames, render: t => <span className={t.ratedGames < 4 ? "text-dim" : "text-mute"}>{fmt(t.ratedGames, 0)} g</span> },
    ],
    Projections: [
      ...identity,
      {
        key: "simW", label: "Exp. wins", csvLabel: "Expected wins", title: "Average final win total across 10,000 season simulations; the bar spans the 10th–90th percentile",
        value: t => t.sim?.wins ?? null,
        render: t => t.sim ? (
          <span className="inline-flex items-center gap-2.5" title={`${fmt(t.sim.wins, 1)} wins expected; 80% of simulations end between ${t.sim.p10} and ${t.sim.p90}`}>
            <span className="relative h-2 w-[96px] rounded-full bg-line" aria-hidden>
              <span className="absolute inset-y-0 rounded-full bg-mute/45" style={{ left: `${wx(t.sim.p10)}%`, width: `${Math.max(2, wx(t.sim.p90) - wx(t.sim.p10))}%` }} />
              <span className="absolute -top-0.5 h-3 w-[3px] -translate-x-1/2 rounded-full bg-ink" style={{ left: `${wx(t.sim.wins)}%` }} />
            </span>
            <b className="w-9 text-[15px]">{fmt(t.sim.wins, 1)}</b>
          </span>
        ) : "—",
      },
      { key: "simRange", label: "80% range", csvLabel: "Wins p10–p90", title: "10th to 90th percentile of simulated final win totals", value: t => t.sim ? t.sim.p90 - t.sim.p10 : null, first: "asc",
        render: t => t.sim ? <span className="text-mute">{t.sim.p10}–{t.sim.p90}</span> : "—" },
      { key: "proj", label: "Proj W–L", title: "Current record plus summed win probability of every remaining game", value: t => t.projW, render: t => <span className="font-semibold">{fmt(t.projW, 1)}–{fmt(t.projL, 1)}</span> },
      { key: "simConfW", label: "Exp. conf W", csvLabel: "Expected conference wins", title: "Average conference wins across the simulations", value: t => t.sim?.confWins ?? null, render: t => fmt(t.sim?.confWins, 1) },
      { key: "simTitle", label: "Conf title", csvLabel: "Conference title odds", title: "Share of simulations in which the team wins or shares its conference regular-season title", value: t => t.sim?.title ?? null,
        render: t => t.sim ? <span className="inline-block min-w-[3.2rem] rounded px-1.5 py-0.5 font-semibold" style={{ background: heat(simRanks.title.get(t.id), total) }}>{pctFmt(t.sim.title, t.sim.title < 0.1 && t.sim.title >= 0.005 ? 1 : 0)}</span> : "—" },
      { key: "simOut", label: "Outright", csvLabel: "Outright title odds", title: "Share of simulations in which the team wins the conference title alone", value: t => t.sim?.outright ?? null, render: t => <span className="text-mute">{pctFmt(t.sim?.outright)}</span> },
      { key: "simW20", label: "20+ wins", csvLabel: "P(20+ wins)", title: "Share of simulations in which the team finishes with 20 or more wins", value: t => t.sim?.win20 ?? null,
        render: t => t.sim ? <span className="inline-block min-w-[3.2rem] rounded px-1.5 py-0.5" style={{ background: heat(simRanks.win20.get(t.id), total) }}>{pctFmt(t.sim.win20)}</span> : "—" },
      { key: "ats", label: "ATS", csvLabel: "ATS cover %", title: "Record against the pregame spread ESPN shows (W–L–push)", value: atsPct,
        render: t => t.ats[0] + t.ats[1] + t.ats[2] ? <span>{t.ats[0]}–{t.ats[1]}{t.ats[2] ? `–${t.ats[2]}` : ""}<span className="sub-rank">{atsPct(t) === null ? "" : `${Math.round(atsPct(t)! * 100)}%`}</span></span> : <span className="text-dim">—</span> },
    ],
    "Four factors": [
      ...identity,
      prof("off", "efg", "eFG%", "Effective field-goal %"), prof("off", "tov", "TO%", "Turnovers per 100 possessions"),
      prof("off", "orb", "OR%", "Offensive rebound %"), prof("off", "ftr", "FTR", "Free-throw attempts per FGA"),
      prof("def", "efg", "eFG%", "Opponent effective field-goal %"), prof("def", "tov", "TO%", "Turnovers forced per 100 possessions"),
      prof("def", "orb", "OR%", "Opponent offensive rebound %"), prof("def", "ftr", "FTR", "Opponent free-throw rate"),
    ],
    Shooting: [
      ...identity,
      prof("off", "threeRate", "3PA%", "Share of field-goal attempts from three"), prof("off", "threePct", "3P%", "Three-point %"),
      prof("off", "twoPct", "2P%", "Two-point %"), prof("off", "ftPct", "FT%", "Free-throw %"),
      prof("off", "astRate", "Ast%", "Assisted share of made field goals"), prof("off", "paintShare", "Paint%", "Share of points scored in the paint"),
      prof("def", "threePct", "Opp 3P%", "Opponent three-point %"), prof("def", "twoPct", "Opp 2P%", "Opponent two-point %"),
      prof("off", "blkRate", "Blk%", "Blocks per opponent two-point attempt", "def"), prof("off", "stlRate", "Stl%", "Steals per 100 opponent possessions", "def"),
    ],
    "Résumé": [
      ...identity,
      { key: "rec", label: "W–L", value: t => t.w - t.l, render: t => <b>{t.w}–{t.l}</b> },
      { key: "crec", label: "Conf", value: t => t.cw - t.cl, render: t => `${t.cw}–${t.cl}` },
      ...[0, 1, 2, 3].map(i => ({ key: `q${i + 1}`, label: `Q${i + 1}`, title: `Record vs DHR quadrant ${i + 1} (unofficial, NET-style cutoffs by venue)`, value: (t: TeamSummary) => t.quads[i][0] - t.quads[i][1] * 0.5, render: (t: TeamSummary) => <span className={t.quads[i][0] + t.quads[i][1] ? "" : "text-dim"}>{t.quads[i][0]}–{t.quads[i][1]}</span> })),
      { key: "close", label: "≤5 pts", title: "Record in games decided by five points or fewer", value: t => t.close[0] - t.close[1], render: t => `${t.close[0]}–${t.close[1]}` },
      { key: "sos", label: "SOS", value: t => t.sos, render: t => rankCell(t.sos, t.sosRank) },
      { key: "streak", label: "Streak", value: t => t.streak, render: t => <span className={t.streak?.startsWith("W") ? "text-win" : "text-loss"}>{t.streak ?? "—"}</span> },
      { key: "proj", label: "Proj W–L", value: t => t.projW, render: t => `${fmt(t.projW, 1)}–${fmt(t.projL, 1)}` },
      { key: "projc", label: "Proj conf", value: t => t.projCW, render: t => `${fmt(t.projCW, 1)}–${fmt(t.projCL, 1)}` },
    ],
  };

  return (
    <section aria-label="Rankings table">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Table view">
          {VIEWS.map(v => <button key={v} className="chip" aria-pressed={view === v} onClick={() => setView(v)}>{v}</button>)}
        </div>
        <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
          <label className="relative flex-1 sm:w-56 sm:flex-none">
            <span className="sr-only">Find a team</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
            <input className="field w-full !pl-9" placeholder="Find a team" value={q} onChange={e => setQ(e.target.value)} />
          </label>
          <label>
            <span className="sr-only">Conference</span>
            <select className="field" value={conf} onChange={e => setConf(e.target.value)}>
              <option value="all">All conferences</option>
              {confs.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
            </select>
          </label>
        </div>
      </div>
      <LiveRatingsNote live={live} className="mb-2" />
      {view === "Projections" ? (
        <p className="mb-2 text-xs text-mute">10,000 simulations of the rest of the season using current ratings. The bar shows where 80% of simulated win totals land; early-season ranges are wide on purpose.</p>
      ) : (
        <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-mute">
          <span><i className="mr-1.5 inline-block h-2 w-3 rounded-sm bg-off align-middle" />Offense</span>
          <span><i className="mr-1.5 inline-block h-2 w-3 rounded-sm bg-def align-middle" />Defense</span>
          <span>Small number = national rank. Shading marks the top and bottom of D-I.</span>
        </div>
      )}
      <DataTable key={view} rows={rows} columns={columns[view]} rowKey={t => t.id} rowHref={t => `/teams/${t.slug}/`} initialSort={view === "Résumé" ? "rec" : view === "Projections" ? "simW" : "rank"} initialDir={view === "Résumé" || view === "Projections" ? "desc" : "asc"} csvName={`d1hoops-${slug(view)}.csv`} caption="Division I power rankings" />
      {rows.length === 0 && <p className="mt-4 text-sm text-mute">No teams match “{q}”. Clear the search or pick another conference.</p>}
    </section>
  );
}
