"use client";

import { useEffect, useMemo, useState } from "react";
import type { Player, TeamSeasonRecord } from "@/lib/types";
import { ArrowLeft, ChevronRight, Search, Users, Trophy, Loader2, RefreshCw } from "lucide-react";

type EspnTeam = { id: string; displayName: string; name?: string; abbreviation?: string; location?: string; logo?: string; links?: { web?: { href?: string } } };
type EspnAthlete = { id: string; fullName?: string; displayName?: string; position?: { abbreviation?: string; name?: string; displayName?: string }; jersey?: string; height?: string; weight?: string; age?: number; experience?: { displayValue?: string }; birthPlace?: { city?: string; state?: string; country?: string }; headshot?: { href?: string } };
type DirectoryState = "loading" | "ready" | "error";
type FlatStat = { label: string; value: string };
const flattenStats = (input: unknown, prefix = ""): FlatStat[] => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const ignored = new Set(["season", "seasonLabel", "teamId", "team", "conference", "athleteId", "athleteSourceId", "name", "position"]);
  return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) => {
    if (ignored.has(key)) return [];
    const label = prefix ? prefix + " · " + key : key;
    if (value && typeof value === "object" && !Array.isArray(value)) return flattenStats(value, label);
    const display = value == null ? "Not supplied" : typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : String(value);
    return [{ label: label.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()), value: display }];
  });
};

const BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";

const normalizeTeam = (value: string) => value.toLowerCase().replace(/\b(the|university|college)\b/g, "").replace(/[^a-z0-9]/g, "");
const nestedNumber = (source: Record<string, unknown> | undefined, group: string, field: string): number | null => {
  const value = source?.[group];
  if (!value || typeof value !== "object") return null;
  const result = (value as Record<string, unknown>)[field];
  return typeof result === "number" && Number.isFinite(result) ? result : null;
};

const teamMetric = (team: TeamSeasonRecord, key: string): number | null => {
  const games = team.games ?? 0;
  const perGame = (value: number | null): number | null => value == null || games <= 0 ? null : value / games;
  switch (key) {
    case "wins": return team.wins ?? null;
    case "winPct": return games > 0 && team.wins != null ? team.wins / games * 100 : null;
    case "losses": return team.losses ?? null;
    case "games": return team.games ?? null;
    case "pace": return team.pace ?? null;
    case "netRating": return team.adjusted?.netRating ?? null;
    case "offensiveRating": return team.adjusted?.offensiveRating ?? null;
    case "defensiveRating": return team.adjusted?.defensiveRating ?? null;
    case "srs": return team.srsRating ?? null;
    case "elo": return team.eloRating ?? null;
    case "points": return perGame(nestedNumber(team.teamStats, "points", "total"));
    case "rebounds": return perGame(nestedNumber(team.teamStats, "rebounds", "total"));
    case "assists": return perGame(typeof team.teamStats?.assists === "number" ? team.teamStats.assists : null);
    case "turnovers": return perGame(nestedNumber(team.teamStats, "turnovers", "total"));
    case "steals": return perGame(typeof team.teamStats?.steals === "number" ? team.teamStats.steals : null);
    case "blocks": return perGame(typeof team.teamStats?.blocks === "number" ? team.teamStats.blocks : null);
    case "fgPct": return nestedNumber(team.teamStats, "fieldGoals", "pct");
    case "threePct": return nestedNumber(team.teamStats, "threePointFieldGoals", "pct");
    case "efgPct": return nestedNumber(team.teamStats, "fourFactors", "effectiveFieldGoalPct");
    case "orbPct": return nestedNumber(team.teamStats, "fourFactors", "offensiveReboundPct");
    case "tovPct": return nestedNumber(team.teamStats, "fourFactors", "turnoverRatio");
    case "ftRate": return nestedNumber(team.teamStats, "fourFactors", "freeThrowRate");
    default: return null;
  }
};


export default function NationalDirectory({ players = [], teamRecords = [] }: { players?: Player[]; teamRecords?: TeamSeasonRecord[] }) {
  const [teams, setTeams] = useState<EspnTeam[]>([]);
  const [status, setStatus] = useState<DirectoryState>("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [conference, setConference] = useState("All locations");
  const [selected, setSelected] = useState<EspnTeam | null>(null);
  const [roster, setRoster] = useState<EspnAthlete[]>([]);
  const [rosterStatus, setRosterStatus] = useState<DirectoryState>("ready");
  const [rosterError, setRosterError] = useState("");
  const [player, setPlayer] = useState<EspnAthlete | null>(null);
  const [selectedStatsPlayer, setSelectedStatsPlayer] = useState<Player | null>(null);
  const [directorySort, setDirectorySort] = useState<"name" | "location">("name");
  const [directoryDirection, setDirectoryDirection] = useState<"asc" | "desc">("asc");
  const [statsSort, setStatsSort] = useState<keyof Player>("points");
  const [statsDirection, setStatsDirection] = useState<"asc" | "desc">("desc");
  const [rankingMetric, setRankingMetric] = useState("netRating");
  const [rankingDirection, setRankingDirection] = useState<"asc" | "desc">("desc");
  const teamStats = useMemo(() => {
    if (!selected) return [];
    const candidates = [selected.name, selected.displayName].filter(Boolean).map((v) => normalizeTeam(v as string));
    return players.filter((p) => {
      const team = normalizeTeam(p.teamName || "");
      return team.length > 0 && candidates.some((candidate) => candidate === team || candidate.startsWith(team) || team.startsWith(candidate));
    }).sort((a, b) => {
      const av = a[statsSort] as number | string | null | undefined;
      const bv = b[statsSort] as number | string | null | undefined;
      if (av == null || bv == null) return av == null ? (bv == null ? 0 : 1) : -1;
      const aNumber = Number(av);
      const bNumber = Number(bv);
      const comparison = Number.isFinite(aNumber) && Number.isFinite(bNumber)
        ? aNumber - bNumber
        : String(av).localeCompare(String(bv));
      return statsDirection === "asc" ? comparison : -comparison;
    });
  }, [players, selected, statsSort, statsDirection]);

  const loadTeams = async () => {
    setStatus("loading"); setError("");
    try {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      let parsed: EspnTeam[] = [];
      // Prefer the build-time snapshot: GitHub Pages cannot proxy API requests,
      // and some browsers/networks block direct requests to ESPN.
      try {
        const snapshot = await fetch(`${basePath}/data/team-directory.json`, { cache: "no-store" });
        if (snapshot.ok) {
          const payload = await snapshot.json();
          if (Array.isArray(payload.teams)) parsed = payload.teams;
        }
      } catch { /* use live provider fallback below */ }
      if (!parsed.length) {
        const response = await fetch(`${BASE}/teams?limit=500`);
        if (!response.ok) throw new Error(`Team directory request failed (${response.status})`);
        const json = await response.json();
        const raw = json.sports?.[0]?.leagues?.[0]?.teams ?? json.teams ?? [];
        parsed = raw.map((entry: any) => entry.team ?? entry).filter((t: any) => t.id && (t.displayName || t.name));
      }
      if (!parsed.length) throw new Error("The team directory snapshot and live provider both returned no team records.");
      setTeams(parsed); setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the team directory.");
      setStatus("error");
    }
  };

  useEffect(() => { void loadTeams(); }, []);

  const conferences = useMemo(() => ["All locations", ...Array.from(new Set(teams.map(t => t.location || "Other"))).sort()], [teams]);
  const filtered = useMemo(() => teams.filter(t => {
    const name = t.displayName || t.name || "";
    return name.toLowerCase().includes(query.toLowerCase()) && (conference === "All locations" || (t.location || "Other") === conference);
  }).sort((a, b) => {
    const av = directorySort === "name" ? (a.displayName || a.name || "") : (a.location || "");
    const bv = directorySort === "name" ? (b.displayName || b.name || "") : (b.location || "");
    const comparison = av.localeCompare(bv);
    return directoryDirection === "asc" ? comparison : -comparison;
  }), [teams, query, conference, directorySort, directoryDirection]);

  const rankedRecords = useMemo(() => [...teamRecords].sort((a, b) => {
    const av = teamMetric(a, rankingMetric);
    const bv = teamMetric(b, rankingMetric);
    if (av == null || bv == null) return av == null ? (bv == null ? 0 : 1) : -1;
    return rankingDirection === "asc" ? av - bv : bv - av;
  }), [teamRecords, rankingMetric, rankingDirection]);

  const openTeam = async (team: EspnTeam) => {
    setSelected(team); setPlayer(null); setRoster([]); setRosterStatus("loading"); setRosterError("");
    try {
      const response = await fetch(`${BASE}/teams/${team.id}?enable=roster`);
      if (!response.ok) throw new Error(`Roster request failed (${response.status})`);
      const json = await response.json();
      const raw = json.team?.athletes ?? json.athletes ?? [];
      const flattened = raw.flatMap((group: any) => Array.isArray(group.items) ? group.items : Array.isArray(group) ? group : [group]);
      setRoster(flattened.filter((a: any) => a && a.id && (a.fullName || a.displayName)));
      setRosterStatus("ready");
    } catch (e) {
      setRosterError(e instanceof Error ? e.message : "Could not load this roster.");
      setRosterStatus("error");
    }
  };

  if (selectedStatsPlayer && selected) return <div className="space-y-5">
    <button onClick={() => setSelectedStatsPlayer(null)} className="inline-flex items-center gap-2 rounded-lg border border-[#29364a] px-3 py-2 text-sm text-slate-300 hover:border-lime-300"><ArrowLeft size={15}/> Back to {selected.displayName || selected.name} stats</button>
    <div className="panel p-6"><div className="eyebrow">Complete provider stat record · 2026–27</div><h2 className="mt-2 text-3xl font-black">{selectedStatsPlayer.name}</h2><p className="mt-2 text-sm text-slate-400">{selectedStatsPlayer.teamName} · {selectedStatsPlayer.position || "Position unavailable"} · {selectedStatsPlayer.games ?? "—"} games</p></div>
    <div className="panel p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-bold">All available season statistics</h3><span className="text-xs text-lime-300">{flattenStats(selectedStatsPlayer.sourceStats ?? selectedStatsPlayer).length} fields</span></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{flattenStats(selectedStatsPlayer.sourceStats ?? selectedStatsPlayer).map(stat=><div key={stat.label} className="rounded-xl border border-[#263448] bg-[#0c1420] p-3"><div className="text-[10px] uppercase tracking-wider text-slate-500">{stat.label}</div><div className="mt-2 break-words text-sm font-semibold tabular-nums text-slate-100">{stat.value}</div></div>)}</div>
      <p className="mt-4 text-xs text-slate-500">Values are shown as returned by College Basketball Data. Null or absent source values are labeled “Not supplied”; no values are fabricated.</p>
    </div>
  </div>;
  if (player && selected) return <div className="space-y-5">
    <button onClick={() => setPlayer(null)} className="inline-flex items-center gap-2 rounded-lg border border-[#29364a] px-3 py-2 text-sm text-slate-300 hover:border-lime-300"><ArrowLeft size={15}/> Back to {selected.displayName || selected.name} roster</button>
    <div className="panel p-6"><div className="eyebrow">ESPN roster directory · player bio</div><h2 className="mt-2 text-3xl font-black">{player.fullName || player.displayName}</h2><p className="mt-2 text-sm text-slate-400">{player.position?.displayName || player.position?.name || player.position?.abbreviation || "Position not listed"} · Jersey {player.jersey || "—"}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Height",player.height],["Weight",player.weight ? player.weight+" lb" : undefined],["Class / experience",player.experience?.displayValue],["Hometown",[player.birthPlace?.city,player.birthPlace?.state,player.birthPlace?.country].filter(Boolean).join(", ") || undefined]].map(([k,v])=><div key={k} className="rounded-xl bg-[#0c1420] p-4"><div className="text-xs text-slate-500">{k}</div><div className="mt-2 font-semibold">{v || "Not listed"}</div></div>)}</div>
      <p className="mt-5 text-xs text-slate-500">Biographical fields are supplied by ESPN and may be incomplete. Season statistics are not inferred from roster data.</p>
    </div>
  </div>;

  if (selected) return <div className="space-y-5">
    <button onClick={() => setSelected(null)} className="inline-flex items-center gap-2 rounded-lg border border-[#29364a] px-3 py-2 text-sm text-slate-300 hover:border-lime-300"><ArrowLeft size={15}/> Back to all teams</button>
    <div className="panel flex flex-wrap items-center justify-between gap-4 p-6"><div><div className="eyebrow">Division I team · live directory</div><h2 className="mt-2 text-3xl font-black">{selected.displayName || selected.name}</h2><p className="mt-2 text-sm text-slate-400">{selected.abbreviation || "Team"} · ESPN team ID {selected.id}</p></div>{selected.logo && <img src={selected.logo} alt="" className="h-16 w-16 object-contain"/>}</div>
    <div className="panel p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold">2026–27 player stats</h3><p className="mt-1 text-xs text-slate-500">Season-to-date · per-game counting stats from provider totals</p></div><div className="flex items-center gap-2"><label className="text-xs text-slate-500" htmlFor="team-player-sort">Sort</label><select id="team-player-sort" value={String(statsSort)} onChange={e => setStatsSort(e.target.value as keyof Player)} className="rounded-lg border border-[#29364a] bg-[#101827] px-2 py-2 text-xs"><option value="points">Points</option><option value="rebounds">Rebounds</option><option value="assists">Assists</option><option value="minutes">Minutes</option><option value="impact">PORPAG</option><option value="usage">Usage</option><option value="efg">eFG%</option><option value="ts">TS%</option><option value="offensiveRating">Offensive rating</option><option value="defensiveRating">Defensive rating</option><option value="netRating">Net rating</option><option value="name">Player name</option></select><button onClick={() => setStatsDirection(v => v === "asc" ? "desc" : "asc")} className="rounded-lg border border-[#29364a] px-3 py-2 text-xs" aria-label="Toggle player sort direction">{statsDirection === "asc" ? "↑ Asc" : "↓ Desc"}</button><span className="text-xs text-lime-300">{teamStats.length} statistical profiles</span></div></div>
      {teamStats.length > 0 ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-slate-500"><tr>{["Player","GP","MPG","PTS","REB","AST","STL","BLK","TOV","USG%","eFG%","TS%","PORPAG","FG%","2P%","3P%","FT%","ORtg","DRtg","Net","FT rate","OREB%","AST/TO","WS"].map(h=><th key={h} className="px-3 py-3">{h}</th>)}</tr></thead><tbody>{teamStats.map(p=><tr key={p.id} onClick={() => setSelectedStatsPlayer(p)} className="cursor-pointer border-t border-[#243044] hover:bg-[#172438]"><td className="px-3 py-3 font-semibold text-lime-300"><button className="text-left">{p.name}<span className="mt-1 block text-[10px] font-normal text-slate-500">{p.position || "Position unavailable"} · View all stats</span></button></td><td className="px-3 py-3">{p.games ?? "—"}</td><td className="px-3 py-3">{p.minutes?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.points?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.rebounds?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.assists?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.steals?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.blocks?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.turnovers?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.usage?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.efg?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.ts?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.impact?.toFixed(2) ?? "—"}</td><td className="px-3 py-3">{p.fieldGoals?.pct?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.twoPointFieldGoals?.pct?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.threePointFieldGoals?.pct?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.freeThrows?.pct?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.offensiveRating?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.defensiveRating?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.netRating?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.freeThrowRate?.toFixed(3) ?? "—"}</td><td className="px-3 py-3">{p.offensiveReboundPct?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.assistsTurnoverRatio?.toFixed(2) ?? "—"}</td><td className="px-3 py-3">{p.winShares?.total?.toFixed(2) ?? "—"}</td></tr>)}</tbody></table></div> : <p className="py-5 text-sm text-slate-400">No current-season statistical records match this team yet. The feed may not have recorded a game, or the provider team name may differ.</p>}
    </div>
    <div className="panel p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold">ESPN roster & player bios</h3><p className="mt-1 text-xs text-slate-500">Biographical listings are separate from the stats table</p></div><span className="text-xs text-lime-300">{rosterStatus === "ready" ? `${roster.length} listed` : "Loading"}</span></div>
      {rosterStatus === "loading" && <div className="flex items-center gap-2 py-8 text-sm text-slate-400"><Loader2 className="animate-spin" size={17}/> Loading roster…</div>}
      {rosterStatus === "error" && <div className="py-6 text-sm text-amber-300">{rosterError} <button onClick={() => void openTeam(selected)} className="ml-2 underline">Try again</button></div>}
      {rosterStatus === "ready" && roster.length === 0 && <p className="py-6 text-sm text-slate-400">No roster entries were returned for this team.</p>}
      <div className="grid gap-2 sm:grid-cols-2">{roster.map(a=><button key={a.id} onClick={() => setPlayer(a)} className="flex items-center gap-3 rounded-xl border border-[#263448] bg-[#0c1420] p-3 text-left hover:border-lime-300/60">{a.headshot?.href ? <img src={a.headshot.href} alt="" className="h-11 w-11 rounded-full object-cover"/> : <div className="grid h-11 w-11 place-items-center rounded-full bg-[#1c2939]"><Users size={18}/></div>}<span className="min-w-0 flex-1"><b className="block truncate text-sm">{a.fullName || a.displayName}</b><span className="text-xs text-slate-500">{a.position?.abbreviation || a.position?.name || "Position —"} · #{a.jersey || "—"}</span></span><ChevronRight size={16} className="text-lime-300"/></button>)}</div>
    </div>
  </div>;

  return <div className="space-y-5">
    <div className="panel flex flex-wrap items-center justify-between gap-3 p-5"><div><div className="eyebrow">National directory · men's Division I</div><h2 className="mt-2 text-2xl font-black">Every program. Every listed roster.</h2><p className="mt-1 text-xs text-slate-400">Build-refreshed national directory and live roster listings from ESPN.</p></div><button onClick={() => void loadTeams()} className="inline-flex items-center gap-2 rounded-lg border border-[#29364a] px-3 py-2 text-xs hover:border-lime-300"><RefreshCw size={14}/> Refresh</button></div>
    <div className="flex flex-wrap gap-2"><label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-[#29364a] bg-[#101827] px-3"><Search size={15} className="text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search all teams…" className="w-full bg-transparent py-3 text-xs outline-none"/></label><label className="flex items-center gap-2 rounded-xl border border-[#29364a] bg-[#101827] px-3 text-xs text-slate-500">Sort<select value={directorySort} onChange={e=>setDirectorySort(e.target.value as "name"|"location")} className="bg-transparent py-3 text-slate-100"><option value="name">Team name</option><option value="location">Location</option></select></label><button onClick={() => setDirectoryDirection(v => v === "asc" ? "desc" : "asc")} className="rounded-xl border border-[#29364a] bg-[#101827] px-3 py-2 text-xs" aria-label="Toggle team sort direction">{directoryDirection === "asc" ? "A–Z" : "Z–A"}</button><select value={conference} onChange={e=>setConference(e.target.value)} className="rounded-xl border border-[#29364a] bg-[#101827] px-3 py-2 text-xs">{conferences.map(c=><option key={c}>{c}</option>)}</select></div>
    {status === "loading" && <div className="panel flex items-center gap-3 p-8 text-sm text-slate-400"><Loader2 className="animate-spin" size={18}/> Loading the national team directory…</div>}
    {status === "error" && <div className="panel p-6"><p className="text-sm text-amber-300">{error}</p><button onClick={() => void loadTeams()} className="mt-3 text-xs text-white underline">Retry directory load</button><p className="mt-3 text-xs text-slate-500">This data source may be temporarily unavailable or may block this browser request.</p></div>}
    {teamRecords.length > 0 && <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#263448] p-5">
        <div><div className="eyebrow">2026–27 national rankings · live provider data</div><h3 className="mt-1 text-lg font-bold">Division I team leaderboard</h3><p className="mt-1 text-xs text-slate-500">{rankedRecords.length} teams with at least one provider record · choose a metric to rerank</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-500" htmlFor="team-ranking-metric">Rank by</label>
          <select id="team-ranking-metric" value={rankingMetric} onChange={e=>setRankingMetric(e.target.value)} className="rounded-lg border border-[#29364a] bg-[#101827] px-3 py-2 text-xs">
            <option value="netRating">Adjusted net rating</option><option value="offensiveRating">Adjusted offense</option><option value="defensiveRating">Adjusted defense</option><option value="srs">SRS</option><option value="elo">Elo</option><option value="wins">Wins</option><option value="winPct">Win percentage</option><option value="losses">Losses</option><option value="points">Points per game</option><option value="rebounds">Rebounds per game</option><option value="assists">Assists per game</option><option value="turnovers">Turnovers per game</option><option value="steals">Steals per game</option><option value="blocks">Blocks per game</option><option value="pace">Pace</option><option value="fgPct">FG%</option><option value="threePct">3P%</option><option value="efgPct">eFG%</option><option value="orbPct">Offensive rebound %</option><option value="tovPct">Turnover %</option><option value="ftRate">Free-throw rate</option>
          </select>
          <button onClick={()=>setRankingDirection(v=>v==="asc"?"desc":"asc")} className="rounded-lg border border-[#29364a] px-3 py-2 text-xs" aria-label="Toggle ranking direction">{rankingDirection==="asc"?"↑ Lowest first":"↓ Highest first"}</button>
        </div>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-[#131e2d] text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Rank</th><th className="px-4 py-3">Team</th><th className="px-4 py-3">Conference</th><th className="px-4 py-3">Record</th><th className="px-4 py-3">GP</th><th className="px-4 py-3 text-right">Value</th></tr></thead><tbody>{rankedRecords.map((record,index)=>{const team=teams.find(t=>normalizeTeam(t.displayName||t.name||"")===normalizeTeam(record.team));const value=teamMetric(record,rankingMetric);return <tr key={record.teamId??record.team} className="border-t border-[#243044] hover:bg-[#172438]"><td className="px-4 py-3 font-mono text-slate-500">{index+1}</td><td className="px-4 py-3 font-semibold text-lime-300">{team?<button onClick={()=>void openTeam(team)} className="text-left hover:underline">{record.team}</button>:record.team}</td><td className="px-4 py-3 text-slate-400">{record.conference||"—"}</td><td className="px-4 py-3 font-mono">{record.wins??"—"}–{record.losses??"—"}</td><td className="px-4 py-3 font-mono">{record.games??"—"}</td><td className="px-4 py-3 text-right font-mono">{value==null?"—":value.toFixed(1)}</td></tr>})}</tbody></table></div>
      <p className="border-t border-[#263448] px-5 py-3 text-[11px] text-slate-500">Provider values only. Missing values are shown as — and excluded from ranking. Adjusted defense ranks lowest-first for best defense.</p>
    </section>}
    {status === "ready" && <><div className="text-xs text-slate-500">Showing {filtered.length} of {teams.length} programs · select any team to open its roster</div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(t=><button key={t.id} onClick={() => void openTeam(t)} className="flex items-center gap-3 rounded-xl border border-[#263448] bg-[#101827] p-4 text-left transition hover:border-lime-300/60 hover:bg-[#172438]">{t.logo ? <img src={t.logo} alt="" className="h-10 w-10 object-contain"/> : <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#1c2939]"><Trophy size={17}/></div>}<span className="min-w-0 flex-1"><b className="block truncate text-sm">{t.displayName || t.name}</b><span className="text-xs text-slate-500">{t.abbreviation || "D-I program"}</span></span><ChevronRight size={16} className="text-lime-300"/></button>)}</div></>}
    <p className="text-xs leading-5 text-slate-600">Roster listings are provider-supplied and may be incomplete or change during the season. ESPN roster data does not itself provide a verified statistical profile. No missing player or stat records are invented.</p>
  </div>;
}
