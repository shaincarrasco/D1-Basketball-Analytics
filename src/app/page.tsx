"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowDownUp, ArrowRight, CalendarDays,
  ChevronRight, CircleHelp, Clock3, Database, Gauge, Home,
  Menu, Moon, Search, ShieldCheck, Sun, Trophy, Users, X
} from "lucide-react";
import type { Player, TeamSeasonRecord } from "@/lib/types";
import NationalDirectory from "@/components/national-directory";
import { metricDefinitions } from "@/lib/metrics";

type Section = "Overview" | "Teams" | "Players" | "Games" | "Metrics";
type Feed<T> = { items: T[]; updatedAt: string | null; status: "loading" | "ready" | "empty" | "error"; note: string };
type OverviewTeam = { team: string; conference?: string | null; wins?: number | null; losses?: number | null; netEfficiency: number };
type OverviewPlayer = { id: string; name: string; teamName: string; conference?: string | null; detailGroup?: string; points: number; rebounds?: number | null; assists?: number | null };
type OverviewSnapshot = { teamCount: number; playerCount: number; gameCount: number; teams: OverviewTeam[]; players: OverviewPlayer[]; games: AppGame[]; updatedAt: { teams: string | null; players: string | null; games: string | null } };
type GameBoxscoreTeam = { teamId: number | null; team: string; conference?: string | null; opponent?: string | null; isHome: boolean; pace?: number | null; stats?: Record<string, unknown> | null };
type GameBoxscore = { id: string; date: string | null; neutralSite: boolean; conferenceGame: boolean; teams: GameBoxscoreTeam[] };
type PlayerDetailRecord = { id: string; sourceStats: Record<string, unknown>; shootingProfile?: Record<string, unknown> | null };
type AppGame = {
  id: string; date: string; status: string; homeTeam: string; awayTeam: string;
  homeScore: number | null; awayScore: number | null; homeConference?: string | null;
  awayConference?: string | null; conferenceGame?: boolean; neutralSite?: boolean;
  tournament?: string | null; venue?: string | null; city?: string | null; state?: string | null;
  homePeriodPoints?: number[] | null; awayPeriodPoints?: number[] | null;
};
const NAV: { name: Section; description: string; icon: typeof Home }[] = [
  { name: "Overview", description: "National command center", icon: Home },
  { name: "Teams", description: "Every D-I program", icon: Trophy },
  { name: "Players", description: "Player discovery", icon: Users },
  { name: "Games", description: "Schedule & results", icon: CalendarDays },
  { name: "Metrics", description: "Methods & definitions", icon: Gauge },
];
const number = (value: number | null | undefined, digits = 1) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
const flatten = (input: unknown, prefix = ""): { label: string; value: string }[] => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) => {
    if (["season", "seasonLabel", "teamId", "athleteId", "athleteSourceId", "sourceId"].includes(key)) return [];
    const label = (prefix ? prefix + " · " : "") + key.replace(/([A-Z])/g, " $1");
    if (value && typeof value === "object" && !Array.isArray(value)) return flatten(value, label);
    return [{ label: label.replace(/^./, c => c.toUpperCase()), value: value == null ? "Not supplied" : typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : String(value) }];
  });
};
function useFeed<T>(path: string, key: string, fallback: string, enabled = true) {
  const [feed, setFeed] = useState<Feed<T>>({ items: [], updatedAt: null, status: "loading", note: fallback });
  const loaded = useRef(false);
  useEffect(() => {
    if (!enabled || loaded.current) return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const controller = new AbortController();
    fetch(`${base}${path}`, { signal: controller.signal, cache: "no-store" })
      .then(response => { if (!response.ok) throw new Error(`Feed request failed (${response.status})`); return response.json(); })
      .then(payload => {
        if (!payload || !Array.isArray(payload[key])) throw new Error("Feed schema is invalid");
        const items = payload[key] as T[];
        loaded.current = true;
        setFeed({ items, updatedAt: typeof payload.fetchedAt === "string" ? payload.fetchedAt : null, status: items.length ? "ready" : "empty", note: typeof payload.note === "string" ? payload.note : fallback });
      })
      .catch(error => { if (error instanceof Error && error.name === "AbortError") return; setFeed(current => ({ ...current, status: "error", note: error instanceof Error ? error.message : "Feed unavailable" })); });
    return () => controller.abort();
  }, [path, key, fallback, enabled]);
  return feed;
}
function MetricCard({ label, value, detail, onClick }: { label: string; value: string; detail: string; onClick?: () => void }) {
  return <button type="button" onClick={onClick} className="metric-card panel w-full p-4 text-left"><div className="flex items-center justify-between gap-2 text-xs text-muted"><span>{label}</span><ArrowRight size={14}/></div><div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</div><div className="mt-1 text-[11px] text-muted">{detail}</div></button>;
}
function EmptyState({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) {
  return <div className="panel flex flex-col items-center px-6 py-12 text-center"><Database size={25} className="mb-4 text-muted"/><h3 className="font-semibold">{title}</h3><p className="mt-2 max-w-lg text-sm leading-6 text-muted">{detail}</p>{retry && <button onClick={retry} className="mt-4 rounded-lg border px-4 py-2 text-sm">Retry</button>}</div>;
}
export default function HomePage() {
  const [section, setSection] = useState<Section>("Overview");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [teamSearchTerm, setTeamSearchTerm] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [playerSort, setPlayerSort] = useState<keyof Player>("points");
  const [playerConference, setPlayerConference] = useState("All conferences");
  const [gameDateFrom, setGameDateFrom] = useState("");
  const [gameDateTo, setGameDateTo] = useState("");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [gameStatus, setGameStatus] = useState("all");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedGame, setSelectedGame] = useState<AppGame | null>(null);
  const overviewFeed = useFeed<OverviewSnapshot>("/data/overview-2027.json", "overview", "The compact season overview is not published yet.", section === "Overview");
  const playerFeed = useFeed<Player>("/data/player-season-2027.json", "players", "Current-season player statistics are not published yet.", section === "Players" || section === "Teams");
  const teamFeed = useFeed<TeamSeasonRecord>("/data/team-season-2027.json", "teams", "Current-season team ratings are not published yet.", section === "Teams");
  const gameFeed = useFeed<AppGame>("/data/games-season-2027.json", "games", "Current-season games have not been published yet.", section === "Games");
  const gameBoxscoreFeed = useFeed<GameBoxscore>("/data/game-team-boxscores-2027.json", "games", "Game box scores are not published yet.", selectedGame !== null);
  const overview = overviewFeed.items[0];
  const players = playerFeed.items;
  const teams = teamFeed.items;
  const games = gameFeed.items;
  const [playerDetails, setPlayerDetails] = useState<PlayerDetailRecord | null>(null);
  const [playerDetailsStatus, setPlayerDetailsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  useEffect(() => {
    if (!selectedPlayer) { setPlayerDetails(null); setPlayerDetailsStatus("idle"); return; }
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const controller = new AbortController();
    setPlayerDetails(null);
    setPlayerDetailsStatus("loading");
    fetch(`${base}/data/player-details-2027/${selectedPlayer.detailGroup || "unclassified"}.json`, { signal: controller.signal, cache: "no-store" })
      .then(response => { if (!response.ok) throw new Error(`Player detail request failed (${response.status})`); return response.json(); })
      .then(payload => {
        const detail = Array.isArray(payload?.players) ? payload.players.find((entry: PlayerDetailRecord) => entry.id === selectedPlayer.id) : null;
        setPlayerDetails(detail ?? null);
        setPlayerDetailsStatus(detail ? "ready" : "error");
      })
      .catch(error => { if (error instanceof Error && error.name === "AbortError") return; setPlayerDetailsStatus("error"); });
    return () => controller.abort();
  }, [selectedPlayer?.id, selectedPlayer?.detailGroup]);
  useEffect(() => {
    const saved = window.localStorage.getItem("d1-hoops-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("d1-hoops-theme", theme);
  }, [theme]);
  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...players].filter(player => `${player.name} ${player.teamName} ${player.position} ${player.conference ?? ""}`.toLowerCase().includes(q) && (playerConference === "All conferences" || player.conference === playerConference)).sort((a,b) => {
      const av = a[playerSort], bv = b[playerSort];
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return direction === "asc" ? cmp : -cmp;
    });
  }, [players, query, playerSort, direction, playerConference]);
  const filteredGames = useMemo(() => [...games].filter(game => {
    const matches = `${game.homeTeam} ${game.awayTeam} ${game.homeConference ?? ""} ${game.awayConference ?? ""} ${game.venue ?? ""}`.toLowerCase().includes(query.toLowerCase());
    const day = game.date.slice(0, 10);
    const inDateRange = (!gameDateFrom || day >= gameDateFrom) && (!gameDateTo || day <= gameDateTo);
    return matches && inDateRange && (gameStatus === "all" || game.status === gameStatus);
  }).sort((a,b) => direction === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)), [games, query, gameStatus, direction]);
  const leaders = overview?.players ?? [];
  const topTeams = overview?.teams ?? [];
  const latestGames = overview?.games ?? [];
  const selectedGameBoxscore = gameBoxscoreFeed.items.find(game => game.id === selectedGame?.id);
  const feedReady = [playerFeed, teamFeed, gameFeed].filter(feed => feed.status === "ready").length;
  const changeSection = (next: Section) => { setSection(next); setQuery(""); setSelectedPlayer(null); setSelectedGame(null); setMobileOpen(false); if (next !== "Teams") setTeamSearchTerm(""); };
  const openTeamDirectory = (teamName: string) => { changeSection("Teams"); setTeamSearchTerm(teamName); };
  const openGame = (game: AppGame) => { changeSection("Games"); setSelectedGame(game); };
  const openPlayer = (player: Player | OverviewPlayer) => { changeSection("Players"); setSelectedPlayer(player as Player); };
  const pageTitle = selectedPlayer?.name ?? (selectedGame ? `${selectedGame.awayTeam} at ${selectedGame.homeTeam}` : section);
  const refresh = () => window.location.reload();
  const integrityStatuses = [
    ["Teams", teamFeed.status === "ready" || (overview?.teamCount ?? 0) > 0 ? "ready" : teamFeed.status],
    ["Players", playerFeed.status === "ready" || (overview?.playerCount ?? 0) > 0 ? "ready" : playerFeed.status],
    ["Games", gameFeed.status === "ready" || (overview?.gameCount ?? 0) > 0 ? "ready" : gameFeed.status],
  ];
  const Sidebar = () => <div className="flex h-full flex-col">
    <div className="mb-9 flex items-center gap-3 px-2"><div className="brand-mark"><Activity size={20}/></div><div><div className="text-[15px] font-bold tracking-tight">D1 Hoops</div><div className="text-[10px] uppercase tracking-[.17em] text-muted">Basketball intelligence</div></div></div>
    <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-muted">Workspace</div>
    <nav className="space-y-1" aria-label="Main navigation">{NAV.map(({name,description,icon:Icon}) => <button key={name} onClick={() => changeSection(name)} aria-current={section === name ? "page" : undefined} className={`nav-item ${section === name ? "active" : ""}`}><Icon size={17}/><span className="min-w-0 flex-1 text-left"><span className="block text-[13px] font-medium">{name}</span><span className="mt-0.5 block truncate text-[10px] text-muted">{description}</span></span>{section === name && <span className="nav-indicator"/>}</button>)}</nav>
    <div className="mt-auto space-y-4"><div className="rounded-xl border p-3"><div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck size={14}/> Data integrity</div><div className="mt-3 grid grid-cols-3 gap-2 text-center">{integrityStatuses.map(([label,status])=><div key={label}><div className={`status-dot ${status === "ready" ? "good" : status === "error" ? "bad" : ""}`}/><div className="mt-1 text-[10px] text-muted">{label}</div></div>)}</div></div><div className="px-3 text-[10px] text-muted">2026–27 MEN'S DIVISION I</div></div>
  </div>;
  const SearchBar = () => <label className="search-field"><Search size={16}/><input ref={searchInputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder={section === "Players" ? "Search player, team or conference" : "Search teams, matchups, venues…"}/>{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={14}/></button>}<kbd>⌘ K</kbd></label>;
  return <main className="app-shell">
    <aside className="desktop-sidebar"><Sidebar/></aside>
    {mobileOpen && <div className="mobile-scrim" onClick={() => setMobileOpen(false)}><aside className="mobile-sidebar" onClick={e => e.stopPropagation()}><div className="mb-5 flex justify-end"><button onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X/></button></div><Sidebar/></aside></div>}
    <section className="app-main">
      <header className="topbar"><div className="flex min-w-0 items-center gap-3"><button className="icon-button lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={18}/></button><div className="min-w-0"><div className="text-[10px] font-medium uppercase tracking-[.14em] text-muted">2026–27 season <span className="mx-1 opacity-40">/</span> Men's Division I</div><div className="truncate text-sm font-semibold">{pageTitle}</div></div></div><div className="flex items-center gap-2"><span className="hidden text-[11px] text-muted sm:inline-flex"><span className={`status-dot mr-2 ${section === "Overview" ? (overviewFeed.status === "ready" ? "good" : overviewFeed.status === "error" ? "bad" : "") : (feedReady === 3 ? "good" : [playerFeed,teamFeed,gameFeed].some(feed => feed.status === "error") ? "bad" : "")}`}/>{section === "Overview" ? (overviewFeed.status === "ready" ? "Overview snapshot ready" : "Overview data pending") : `${feedReady}/3 feeds ready`}</span><button className="icon-button" onClick={() => setTheme(v => v === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to light appearance" : "Switch to dark appearance"}>{theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}</button></div></header>
      <div className="page-content">
        {section === "Overview" && <>
          <div className="page-heading"><div><div className="eyebrow">Season intelligence · 2026–27</div><h1>College basketball,<br/><span>without the guesswork.</span></h1><p>One place to explore the teams, players, games and numbers shaping Division I.</p></div><div className="season-pill"><span className="status-dot good"/> Regular season · source snapshots</div></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Team records" value={overview ? overview.teamCount.toLocaleString() : "—"} detail={overview ? "Provider team records" : "Awaiting verified snapshot"} onClick={() => changeSection("Teams")}/>
            <MetricCard label="Player profiles" value={overview ? overview.playerCount.toLocaleString() : "—"} detail={overview ? "Current-season player records" : "Awaiting verified snapshot"} onClick={() => changeSection("Players")}/>
            <MetricCard label="Games indexed" value={overview ? overview.gameCount.toLocaleString() : "—"} detail={overview ? "Schedule and results indexed" : "Awaiting verified snapshot"} onClick={() => changeSection("Games")}/>
            <MetricCard label="Data feeds" value={overview ? "3/3" : "—"} detail="Team · player · game snapshots" onClick={refresh}/>
          </div>
          <div className="overview-grid">
            <section className="panel section-panel"><div className="section-heading"><div><div className="eyebrow">Power index</div><h2>Top teams by estimated net efficiency</h2><p className="mt-1 text-[10px] text-muted">Unadjusted box-score estimate · not an opponent-adjusted rating</p></div><button className="text-link" onClick={() => changeSection("Teams")}>Full directory <ArrowRight size={14}/></button></div>
              {topTeams.length ? <div className="leader-list">{topTeams.map((team,index)=><div className="leader-row" key={team.team}><span className="leader-rank">{String(index+1).padStart(2,"0")}</span><span className="min-w-0 flex-1"><b>{team.team}</b><small>{team.conference ?? "Conference unavailable"} · {team.wins ?? "—"}–{team.losses ?? "—"}</small></span><strong>{number(team.netEfficiency)}</strong></div>)}</div> : <EmptyState title="Team efficiency not published" detail={overviewFeed.note}/>}
            </section>
            <section className="panel section-panel"><div className="section-heading"><div><div className="eyebrow">Recent schedule</div><h2>Games & results</h2></div><button className="text-link" onClick={() => changeSection("Games")}>Game center <ArrowRight size={14}/></button></div>
              {latestGames.length ? <div className="space-y-2">{latestGames.map(game=><button key={game.id} className="game-compact" onClick={() => openGame(game)}><span className="min-w-0 flex-1"><small>{new Date(game.date).toLocaleDateString()} · {game.status.replace("_"," ")}</small><b>{game.awayTeam} <span>@</span> {game.homeTeam}</b></span><strong>{game.awayScore == null || game.homeScore == null ? "—" : `${game.awayScore}–${game.homeScore}`}</strong><ChevronRight size={15}/></button>)}</div> : <EmptyState title="No game records yet" detail={overviewFeed.note}/>}
            </section>
          </div>
          <section className="panel section-panel"><div className="section-heading"><div><div className="eyebrow">Player spotlight</div><h2>Scoring leaders</h2></div><button className="text-link" onClick={() => changeSection("Players")}>All players <ArrowRight size={14}/></button></div>
            {leaders.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{leaders.slice(0,8).map((player,index)=><button className="player-spotlight" key={player.id} onClick={() => openPlayer(player)}><span className="text-[10px] text-muted">#{index+1} SCORING</span><b>{player.name}</b><span>{player.teamName}</span><strong>{number(player.points)} <small>PPG</small></strong></button>)}</div> : <EmptyState title="Player leaders unavailable" detail={overviewFeed.note}/>}
          </section>
          <div className="data-footnote"><Clock3 size={13}/> Team data: {overview?.updatedAt.teams ? new Date(overview.updatedAt.teams).toLocaleString() : "not published"} · Player data: {overview?.updatedAt.players ? new Date(overview.updatedAt.players).toLocaleString() : "not published"} · Game data: {overview?.updatedAt.games ? new Date(overview.updatedAt.games).toLocaleString() : "not published"}</div>
        </>}
        {section === "Teams" && <><div className="section-title-row"><div><div className="eyebrow">National directory</div><h1>Teams</h1><p>Search the national directory and inspect every available team metric in one place.</p></div></div>{teamFeed.status === "loading" && <p className="mb-3 text-xs text-muted">Loading the 2026–27 team metrics snapshot…</p>}{teamFeed.status === "error" && <p className="mb-3 text-xs text-amber-500">Team statistics could not be loaded: {teamFeed.note}</p>}<NationalDirectory players={players} teamRecords={teams} initialQuery={teamSearchTerm}/></>}
        {section === "Players" && <>
          {selectedPlayer ? <><button className="back-link" onClick={() => setSelectedPlayer(null)}>← All players</button><div className="profile-hero"><div className="eyebrow">Player profile · 2026–27 season</div><h1>{selectedPlayer.name}</h1><p>{selectedPlayer.teamName} · {selectedPlayer.position || "Position not supplied"} · {selectedPlayer.games ?? "—"} games</p><div className="profile-kpis">{[["PTS/G",selectedPlayer.points],["REB/G",selectedPlayer.rebounds],["AST/G",selectedPlayer.assists],["MPG",selectedPlayer.minutes],["USG%",selectedPlayer.usage],["eFG%",selectedPlayer.efg],["TS%",selectedPlayer.ts],["PORPAG",selectedPlayer.impact]].map(([label,value])=><div key={label}><small>{label}</small><b>{number(value as number | null)}</b></div>)}</div><button type="button" className="control-button mt-4" onClick={() => openTeamDirectory(selectedPlayer.teamName)}>Explore {selectedPlayer.teamName} team profile <ArrowRight size={14}/></button></div><section className="panel section-panel"><div className="section-heading"><h2>Complete provider stat record</h2><span className="text-xs text-muted">{playerDetailsStatus === "ready" ? `${flatten({providerStats:playerDetails?.sourceStats,shootingProfile:playerDetails?.shootingProfile}).length} source fields` : playerDetailsStatus === "loading" ? "Loading full profile…" : "Source detail unavailable"}</span></div>{playerDetailsStatus === "loading" ? <p className="py-8 text-sm text-muted">Loading the complete provider record for this player…</p> : playerDetailsStatus === "error" || !playerDetails ? <p className="py-8 text-sm text-muted">The leaderboard statistics are available, but the full provider detail file could not be loaded. Try reloading the profile.</p> : <div className="stat-grid">{flatten({providerStats:playerDetails.sourceStats,shootingProfile:playerDetails.shootingProfile}).map(stat=><div className="raw-stat" key={stat.label}><small>{stat.label}</small><b>{stat.value}</b></div>)}</div>}<p className="mt-4 text-xs text-muted">Full provider data is loaded only when a player profile is opened. Missing source values are never estimated.</p></section></> : <>
            <div className="section-title-row"><div><div className="eyebrow">Player discovery</div><h1>Players</h1><p>Search and sort the current-season player statistical universe.</p></div><div className="text-xs text-muted">{players.length.toLocaleString()} records · refreshed {playerFeed.updatedAt ? new Date(playerFeed.updatedAt).toLocaleDateString() : "—"}</div></div>
            <div className="toolbar"><SearchBar/><label className="control-label">Conference<select value={playerConference} onChange={e => setPlayerConference(e.target.value)}><option>All conferences</option>{Array.from(new Set(players.map(player => player.conference).filter((value): value is string => Boolean(value)))).sort().map(value=><option key={value}>{value}</option>)}</select></label><label className="control-label">Sort by<select value={String(playerSort)} onChange={e => setPlayerSort(e.target.value as keyof Player)}><option value="points">Points</option><option value="rebounds">Rebounds</option><option value="assists">Assists</option><option value="minutes">Minutes</option><option value="usage">Usage</option><option value="efg">eFG%</option><option value="ts">True shooting</option><option value="impact">PORPAG</option><option value="name">Name</option><option value="teamName">Team</option></select></label><button className="control-button" onClick={() => setDirection(v => v === "asc" ? "desc" : "asc")}><ArrowDownUp size={14}/> {direction === "desc" ? "High to low" : "Low to high"}</button></div>
            {playerFeed.status === "loading" ? <EmptyState title="Loading player records" detail="Reading the published 2026–27 snapshot…"/> : playerFeed.status === "error" || playerFeed.status === "empty" ? <EmptyState title="Player feed unavailable" detail={playerFeed.note} retry={refresh}/> : <section className="panel table-panel"><div className="table-scroll"><table className="data-table min-w-[1050px]"><thead><tr>{["Player","Team","GP","MPG","PTS","REB","AST","STL","BLK","TOV","USG%","FG%","2P%","3P%","FT%","eFG%","TS%","PORPAG","ORtg","DRtg","Net","FT rate","OREB%","AST/TO","WS"].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{filteredPlayers.map(player=><tr key={player.id}><td><button type="button" className="text-link" onClick={() => setSelectedPlayer(player)}>{player.name}</button><small>{player.position || "Position —"}</small></td><td>{player.teamName}</td><td>{player.games ?? "—"}</td><td>{number(player.minutes)}</td><td>{number(player.points)}</td><td>{number(player.rebounds)}</td><td>{number(player.assists)}</td><td>{number(player.steals)}</td><td>{number(player.blocks)}</td><td>{number(player.turnovers)}</td><td>{number(player.usage)}</td><td>{number(player.fieldGoals?.pct)}</td><td>{number(player.twoPointFieldGoals?.pct)}</td><td>{number(player.threePointFieldGoals?.pct)}</td><td>{number(player.freeThrows?.pct)}</td><td>{number(player.efg)}</td><td>{number(player.ts)}</td><td>{number(player.impact,2)}</td><td>{number(player.offensiveRating)}</td><td>{number(player.defensiveRating)}</td><td>{number(player.netRating)}</td><td>{number(player.freeThrowRate,3)}</td><td>{number(player.offensiveReboundPct)}</td><td>{number(player.assistsTurnoverRatio,2)}</td><td>{number(player.winShares?.total,2)}</td></tr>)}</tbody></table></div><div className="table-footer">Showing {filteredPlayers.length.toLocaleString()} of {players.length.toLocaleString()} players · select a row to inspect all source fields</div></section>}
          </>}
        </>}
        {section === "Games" && <>
          {selectedGame ? <><button className="back-link" onClick={() => setSelectedGame(null)}>← All games</button><div className="profile-hero"><div className="eyebrow">{new Date(selectedGame.date).toLocaleString()} · {selectedGame.status.replace("_"," ")}</div><h1>{selectedGame.awayTeam} <span>@</span> {selectedGame.homeTeam}</h1><div className="game-scoreline"><div><small>{selectedGame.awayConference ?? "Away"}</small><b>{selectedGame.awayScore ?? "—"}</b><span>{selectedGame.awayTeam}</span></div><div className="text-muted">{selectedGame.status.replace("_"," ").toUpperCase()}</div><div><small>{selectedGame.homeConference ?? "Home"}</small><b>{selectedGame.homeScore ?? "—"}</b><span>{selectedGame.homeTeam}</span></div></div><div className="mt-5 flex flex-wrap gap-2"><button type="button" className="control-button" onClick={() => openTeamDirectory(selectedGame.awayTeam)}>Explore {selectedGame.awayTeam}</button><button type="button" className="control-button" onClick={() => openTeamDirectory(selectedGame.homeTeam)}>Explore {selectedGame.homeTeam}</button></div></div><section className="panel section-panel"><div className="eyebrow">Game information</div><div className="stat-grid mt-4">{[["Venue",selectedGame.venue],["Location",[selectedGame.city,selectedGame.state].filter(Boolean).join(", ")],["Site",selectedGame.neutralSite ? "Neutral" : "Home court"],["Game type",selectedGame.conferenceGame ? "Conference" : "Non-conference"],["Tournament",selectedGame.tournament],["Period scores",selectedGame.awayPeriodPoints && selectedGame.homePeriodPoints ? `Away ${selectedGame.awayPeriodPoints.join("–")} · Home ${selectedGame.homePeriodPoints.join("–")}` : null]].map(([label,value])=><div className="raw-stat" key={label}><small>{label}</small><b>{value || "Not supplied"}</b></div>)}</div></section>{gameBoxscoreFeed.status === "loading" ? <EmptyState title="Loading team box scores" detail="Retrieving the provider game-level box-score record…"/> : selectedGameBoxscore?.teams?.length ? <section className="panel section-panel"><div className="section-heading"><div><div className="eyebrow">Provider game box score</div><h2>Team-level game statistics</h2></div><span className="text-xs text-muted">{selectedGameBoxscore.teams.length} team records</span></div><div className="grid gap-4 lg:grid-cols-2">{selectedGameBoxscore.teams.map(team=><div key={team.teamId ?? team.team} className="rounded-xl border border-line p-4"><h3 className="mb-3 font-semibold">{team.team} <span className="text-xs text-muted">{team.isHome ? "· Home" : "· Away"}</span></h3><div className="stat-grid">{flatten(team.stats).map(stat=><div className="raw-stat" key={stat.label}><small>{stat.label}</small><b>{stat.value}</b></div>)}</div></div>)}</div><p className="mt-4 text-xs text-muted">These are provider-supplied team box-score fields. Player-level game logs and play-by-play are not implied by this feed.</p></section> : <div className="panel p-4 text-xs text-muted">{gameBoxscoreFeed.status === "error" ? "The provider game box-score file is unavailable." : "No team box-score record is available for this game yet."}</div></> : <>
            <div className="section-title-row"><div><div className="eyebrow">Schedule & results</div><h1>Games</h1><p>Browse verified 2026–27 regular-season matchups and scores.</p></div><span className="text-xs text-muted">{games.length.toLocaleString()} records</span></div>
            <div className="toolbar"><SearchBar/><label className="control-label">From<input type="date" value={gameDateFrom} onChange={e => setGameDateFrom(e.target.value)}/></label><label className="control-label">To<input type="date" value={gameDateTo} onChange={e => setGameDateTo(e.target.value)}/></label><label className="control-label">Status<select value={gameStatus} onChange={e => setGameStatus(e.target.value)}><option value="all">All games</option><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="final">Final</option><option value="postponed">Postponed</option><option value="cancelled">Cancelled</option></select></label><button className="control-button" onClick={() => setDirection(v => v === "asc" ? "desc" : "asc")}><ArrowDownUp size={14}/> {direction === "desc" ? "Newest first" : "Oldest first"}</button></div>
            {gameFeed.status === "loading" ? <EmptyState title="Loading games" detail="Reading the published schedule and results snapshot…"/> : gameFeed.status === "error" || gameFeed.status === "empty" ? <EmptyState title="Game feed unavailable" detail={gameFeed.note} retry={refresh}/> : <section className="panel table-panel"><div className="table-scroll"><table className="data-table min-w-[850px]"><thead><tr>{["Date","Away","Score","Home","Status","Conference","Venue"].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{filteredGames.map(game=><tr key={game.id}><td><button type="button" className="text-link" onClick={() => setSelectedGame(game)}>{new Date(game.date).toLocaleString()}</button></td><td>{game.awayTeam}</td><td className="font-semibold">{game.awayScore == null || game.homeScore == null ? "—" : `${game.awayScore}–${game.homeScore}`}</td><td>{game.homeTeam}</td><td><span className={`game-status ${game.status === "final" ? "complete" : game.status === "in_progress" ? "live" : ""}`}>{game.status.replace("_"," ")}</span></td><td>{game.conferenceGame ? "Conference" : "Non-conference"}</td><td>{game.venue ?? "—"}</td></tr>)}</tbody></table></div><div className="table-footer">Showing {filteredGames.length.toLocaleString()} of {games.length.toLocaleString()} games</div></section>}
          </>}
        </>}
        {section === "Metrics" && <>
          <div className="section-title-row"><div><div className="eyebrow">Methods & definitions</div><h1>Metrics</h1><p>Know what every number means, how it is calculated, and where it can mislead.</p></div></div>
          <div className="metric-intro"><div><Database size={18}/><b>Source transparency</b><p>Provider-supplied adjusted ratings are kept distinct from statistics calculated from season aggregates or game-level box scores. A blank means unavailable, not zero.</p></div><div><ShieldCheck size={18}/><b>Known limitations</b><p>Shot-quality models, lineup/on-off impact and a separately calibrated forecast model are not represented as available metrics.</p></div></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{metricDefinitions.map(metric=><article className="panel metric-definition" key={metric.key}><div className="flex items-start justify-between gap-3"><h2>{metric.label}</h2><span>{metric.unit}</span></div><p>{metric.description}</p><div className="metric-formula"><small>Formula</small><b>{metric.formula}</b></div><div className="metric-caveat">{metric.higherIsBetter ? "Higher is generally better" : "Lower is generally better"} · {metric.caveat}</div></article>)}</div>
        </>}
        <footer className="app-footer">D1 HOOPS ANALYTICS <span>·</span> 2026–27 MEN'S DIVISION I <span>·</span> College Basketball Data</footer>
      </div>
    </section>
  </main>;
}
