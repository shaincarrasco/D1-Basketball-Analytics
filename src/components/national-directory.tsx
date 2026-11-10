"use client";

import { useEffect, useMemo, useState } from "react";
import type { Player } from "@/lib/types";
import { ArrowLeft, ChevronRight, Search, Users, Trophy, Loader2, RefreshCw } from "lucide-react";

type EspnTeam = { id: string; displayName: string; name?: string; abbreviation?: string; location?: string; logo?: string; links?: { web?: { href?: string } } };
type EspnAthlete = { id: string; fullName?: string; displayName?: string; position?: { abbreviation?: string; name?: string; displayName?: string }; jersey?: string; height?: string; weight?: string; age?: number; experience?: { displayValue?: string }; birthPlace?: { city?: string; state?: string; country?: string }; headshot?: { href?: string } };
type DirectoryState = "loading" | "ready" | "error";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";

const normalizeTeam = (value: string) => value.toLowerCase().replace(/\\b(the|university|college)\\b/g, "").replace(/[^a-z0-9]/g, "");

export default function NationalDirectory({ players = [] }: { players?: Player[] }) {
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
  const teamStats = useMemo(() => {
    if (!selected) return [];
    const candidates = [selected.name, selected.displayName].filter(Boolean).map((v) => normalizeTeam(v as string));
    return players.filter((p) => {
      const team = normalizeTeam(p.teamName || "");
      return team.length > 0 && candidates.some((candidate) => candidate === team || candidate.startsWith(team) || team.startsWith(candidate));
    }).sort((a, b) => (b.points ?? -1) - (a.points ?? -1));
  }, [players, selected]);

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
  }).sort((a,b) => (a.displayName || a.name || "").localeCompare(b.displayName || b.name || "")), [teams, query, conference]);

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
    <div className="panel p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold">2026–27 player stats</h3><p className="mt-1 text-xs text-slate-500">Season-to-date · per-game counting stats from provider totals</p></div><span className="text-xs text-lime-300">{teamStats.length} statistical profiles</span></div>
      {teamStats.length > 0 ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-slate-500"><tr>{["Player","GP","MPG","PTS","REB","AST","STL","BLK","TOV","USG%","eFG%","TS%","PORPAG"].map(h=><th key={h} className="px-3 py-3">{h}</th>)}</tr></thead><tbody>{teamStats.map(p=><tr key={p.id} className="border-t border-[#243044] hover:bg-[#172438]"><td className="px-3 py-3 font-semibold text-slate-200">{p.name}<span className="mt-1 block text-[10px] font-normal text-slate-500">{p.position || "Position unavailable"}</span></td><td className="px-3 py-3">{p.games ?? "—"}</td><td className="px-3 py-3">{p.minutes?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.points?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.rebounds?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.assists?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.steals?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.blocks?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.turnovers?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.usage?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.efg?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.ts?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.impact?.toFixed(2) ?? "—"}</td></tr>)}</tbody></table></div> : <p className="py-5 text-sm text-slate-400">No current-season statistical records match this team yet. The feed may not have recorded a game, or the provider team name may differ.</p>}
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
    <div className="flex flex-wrap gap-2"><label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-[#29364a] bg-[#101827] px-3"><Search size={15} className="text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search all teams…" className="w-full bg-transparent py-3 text-xs outline-none"/></label><select value={conference} onChange={e=>setConference(e.target.value)} className="rounded-xl border border-[#29364a] bg-[#101827] px-3 py-2 text-xs">{conferences.map(c=><option key={c}>{c}</option>)}</select></div>
    {status === "loading" && <div className="panel flex items-center gap-3 p-8 text-sm text-slate-400"><Loader2 className="animate-spin" size={18}/> Loading the national team directory…</div>}
    {status === "error" && <div className="panel p-6"><p className="text-sm text-amber-300">{error}</p><button onClick={() => void loadTeams()} className="mt-3 text-xs text-white underline">Retry directory load</button><p className="mt-3 text-xs text-slate-500">This data source may be temporarily unavailable or may block this browser request.</p></div>}
    {status === "ready" && <><div className="text-xs text-slate-500">Showing {filtered.length} of {teams.length} programs · select any team to open its roster</div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(t=><button key={t.id} onClick={() => void openTeam(t)} className="flex items-center gap-3 rounded-xl border border-[#263448] bg-[#101827] p-4 text-left transition hover:border-lime-300/60 hover:bg-[#172438]">{t.logo ? <img src={t.logo} alt="" className="h-10 w-10 object-contain"/> : <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#1c2939]"><Trophy size={17}/></div>}<span className="min-w-0 flex-1"><b className="block truncate text-sm">{t.displayName || t.name}</b><span className="text-xs text-slate-500">{t.abbreviation || "D-I program"}</span></span><ChevronRight size={16} className="text-lime-300"/></button>)}</div></>}
    <p className="text-xs leading-5 text-slate-600">Roster listings are provider-supplied and may be incomplete or change during the season. ESPN roster data does not itself provide a verified statistical profile. No missing player or stat records are invented.</p>
  </div>;
}
