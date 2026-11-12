"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import DataTable, { type Column } from "@/components/data-table";
import PerfBars from "@/components/perf-bars";
import TeamLogo from "@/components/team-logo";
import { fmt, heat, signed } from "@/lib/format";
import type { ProfileKey, TeamSummary } from "@/lib/types";

const VIEWS = ["Ratings", "Four factors", "Shooting", "Résumé"] as const;
type View = (typeof VIEWS)[number];

export default function RankingsTable({ teams, total }: { teams: TeamSummary[]; total: number }) {
  const [view, setView] = useState<View>("Ratings");
  const [conf, setConf] = useState("all");
  const [q, setQ] = useState("");

  // Keep view + conference in the URL so a filtered table can be shared.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = VIEWS.find(x => x.toLowerCase().replace(/\W/g, "") === p.get("view"));
    if (v) setView(v);
    if (p.get("conf")) setConf(p.get("conf")!);
  }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    if (view !== "Ratings") p.set("view", view.toLowerCase().replace(/\W/g, ""));
    if (conf !== "all") p.set("conf", conf);
    const s = p.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  }, [view, conf]);

  const confs = useMemo(() => [...new Map(teams.map(t => [t.confSlug, t.confName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [teams]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return teams.filter(t => (conf === "all" || t.confSlug === conf) && (!n || t.name.toLowerCase().includes(n) || t.short.toLowerCase().includes(n)));
  }, [teams, conf, q]);

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
    { key: "rank", label: "Rk", value: t => t.rank, first: "asc", sticky: true, width: 46, render: t => <span className="rank-cell">{t.rank ?? "—"}</span> },
    {
      key: "name", label: "Team", align: "l", value: t => t.name, first: "asc", sticky: true, width: 210,
      render: t => (
        <Link href={`/teams/${t.slug}/`} className="link flex items-center gap-2.5">
          <TeamLogo src={t.logo} name={t.name} size={24} />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{t.name}</span>
            <span className="block truncate text-[11.5px] text-mute">{t.confName} · {t.w}–{t.l}</span>
          </span>
        </Link>
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
      <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-mute">
        <span><i className="mr-1.5 inline-block h-2 w-3 rounded-sm bg-off align-middle" />Offense</span>
        <span><i className="mr-1.5 inline-block h-2 w-3 rounded-sm bg-def align-middle" />Defense</span>
        <span>Small number = national rank. Shading marks the top and bottom of D-I.</span>
      </div>
      <DataTable key={view} rows={rows} columns={columns[view]} rowKey={t => t.id} initialSort={view === "Résumé" ? "rec" : "rank"} initialDir={view === "Résumé" ? "desc" : "asc"} csvName={`d1hoops-${view.toLowerCase().replace(/\W/g, "")}.csv`} caption="Division I power rankings" />
      {rows.length === 0 && <p className="mt-4 text-sm text-mute">No teams match “{q}”. Clear the search or pick another conference.</p>}
    </section>
  );
}
