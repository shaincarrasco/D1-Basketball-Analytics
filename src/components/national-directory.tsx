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


const TEAM_METRIC_GROUPS = [
  { label: "Record", columns: [["wins","W"],["losses","L"],["games","GP"],["winPct","Win %"],["margin","Margin/G"]] },
  { label: "Ratings", columns: [["netRating","Adj Net"],["offensiveRating","Adj O"],["defensiveRating","Adj D"],["srs","SRS"],["elo","Elo"],["sos","SOS"]] },
  { label: "Scoring & pace", columns: [["points","PTS/G"],["pointsPerPoss","PTS/Poss"],["offensePer100","Off/100"],["defensePer100","Def/100"],["netPer100","Net/100"],["pace","Pace"]] },
  { label: "Shooting", columns: [["fgPct","FG %"],["threePct","3P %"],["efgPct","eFG %"],["oppEfgPct","Opp eFG %"],["ftRate","FT Rate"],["oppFtRate","Opp FT Rate"]] },
  { label: "Four factors", columns: [["orbPct","ORB %"],["drbPct","DRB %"],["tovPct","TOV %"],["oppTovPct","Opp TOV %"],["oppOrbPct","Opp ORB %"]] },
  { label: "Box score", columns: [["rebounds","REB/G"],["assists","AST/G"],["astTov","AST/TO"],["turnovers","TO/G"],["steals","STL/G"],["stealRate","STL/100"],["blocks","BLK/G"]] },
  { label: "Game splits", columns: [["homeWinPct","Home W%"],["awayWinPct","Away W%"],["neutralWinPct","Neutral W%"],["homeMargin","Home +/-"],["awayMargin","Away +/-"],["homeOffense","Home Off"],["awayOffense","Away Off"],["homeDefense","Home Def"],["awayDefense","Away Def"]] },
  { label: "Recent form & consistency", columns: [["recentWinPct","Last 5 W%"],["recentMargin","Last 5 +/-"],["recentOffense","Last 5 Off"],["recentDefense","Last 5 Def"],["marginStd","Margin SD"],["offenseStd","Off SD"],["defenseStd","Def SD"]] },
] as const;

const BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";

const normalizeTeam = (value: string) => value.toLowerCase().replace(/\b(the|university|college)\b/g, "").replace(/[^a-z0-9]/g, "");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const parseEspnTeam = (value: unknown): EspnTeam | null => {
  if (!isRecord(value)) return null;
  const record = isRecord(value.team) ? value.team : value;
  const id = record.id;
  const displayName = asString(record.displayName) ?? asString(record.name);
  if ((typeof id !== "string" && typeof id !== "number") || !displayName) return null;
  const logos = Array.isArray(record.logos) ? record.logos : [];
  const firstLogo = logos.find(isRecord);
  const logo = asString(record.logo) ?? (firstLogo ? asString(firstLogo.href) : undefined);
  return {
    id: String(id),
    displayName,
    name: asString(record.name),
    abbreviation: asString(record.abbreviation),
    location: asString(record.location),
    logo,
  };
};

const parseEspnAthlete = (value: unknown): EspnAthlete | null => {
  if (!isRecord(value)) return null;
  const id = value.id;
  const fullName = asString(value.fullName) ?? asString(value.displayName);
  if ((typeof id !== "string" && typeof id !== "number") || !fullName) return null;
  const position = isRecord(value.position) ? value.position : undefined;
  const experience = isRecord(value.experience) ? value.experience : undefined;
  const birthPlace = isRecord(value.birthPlace) ? value.birthPlace : undefined;
  const headshot = isRecord(value.headshot) ? value.headshot : undefined;
  return {
    id: String(id),
    fullName,
    displayName: asString(value.displayName),
    jersey: asString(value.jersey),
    height: asString(value.height),
    weight: asString(value.weight),
    age: typeof value.age === "number" ? value.age : undefined,
    position: position ? {
      abbreviation: asString(position.abbreviation),
      name: asString(position.name),
      displayName: asString(position.displayName),
    } : undefined,
    experience: experience ? { displayValue: asString(experience.displayValue) } : undefined,
    birthPlace: birthPlace ? {
      city: asString(birthPlace.city),
      state: asString(birthPlace.state),
      country: asString(birthPlace.country),
    } : undefined,
    headshot: headshot ? { href: asString(headshot.href) } : undefined,
  };
};

const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const nestedNumber = (source: Record<string, unknown> | undefined, group: string, field: string): number | null => {
  if (!source) return null;
  const value = source[group];
  if (isRecord(value)) return finiteNumber(value[field]);
  // CBBD's team season response has some values flat (for example points and assists)
  // and others grouped (for example rebounds.total and fieldGoals.pct).
  return finiteNumber(value);
};

const firstNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number !== null) return number;
  }
  return null;
};

const statNumber = (source: Record<string, unknown> | undefined, ...paths: string[]): number | null => {
  if (!source) return null;
  for (const path of paths) {
    let value: unknown = source;
    for (const part of path.split(".")) value = isRecord(value) ? value[part] : undefined;
    const number = finiteNumber(value);
    if (number !== null) return number;
  }
  return null;
};

const teamMetric = (team: TeamSeasonRecord, key: string): number | null => {
  const games = team.games ?? 0;
  const perGame = (value: number | null): number | null => value == null || games <= 0 ? null : value / games;
  const gameRows = (team.gameStats ?? []).filter(isRecord);
  const gameResult = (row: Record<string, unknown>) => {
    const own = isRecord(row.teamStats) ? row.teamStats : undefined;
    const opp = isRecord(row.opponentStats) ? row.opponentStats : undefined;
    const ownPoints = statNumber(own, "points.total", "points");
    const oppPoints = statNumber(opp, "points.total", "points");
    const ownPoss = statNumber(own, "possessions");
    const oppPoss = statNumber(opp, "possessions");
    return ownPoints == null || oppPoints == null ? null : { ownPoints, oppPoints, ownPoss, oppPoss, ownEff: ownPoss && ownPoss > 0 ? ownPoints / ownPoss * 100 : null, oppEff: oppPoss && oppPoss > 0 ? oppPoints / oppPoss * 100 : null, margin: ownPoints - oppPoints, win: ownPoints > oppPoints };
  };
  const validGames = gameRows.map(row => ({ row, result: gameResult(row) })).filter((item): item is { row: Record<string, unknown>; result: { ownPoints: number; oppPoints: number; ownPoss: number | null; oppPoss: number | null; ownEff: number | null; oppEff: number | null; margin: number; win: boolean } } => item.result !== null);
  const sortedGames = [...validGames].sort((a, b) => String(b.row.startDate ?? "").localeCompare(String(a.row.startDate ?? "")));
  const pct = (rows: typeof validGames) => rows.length ? rows.filter(item => item.result.win).length / rows.length * 100 : null;
  const mean = (values: Array<number | null>) => {
    const present = values.filter((value): value is number => value !== null && Number.isFinite(value));
    return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
  };
  const deviation = (values: Array<number | null>) => {
    const avg = mean(values);
    const present = values.filter((value): value is number => value !== null && Number.isFinite(value));
    return avg == null ? null : Math.sqrt(present.reduce((sum, value) => sum + (value - avg) ** 2, 0) / present.length);
  };
  const margins = validGames.map(item => item.result.margin);
  const marginMean = margins.length ? margins.reduce((sum, value) => sum + value, 0) / margins.length : null;
  const marginStd = marginMean == null ? null : Math.sqrt(margins.reduce((sum, value) => sum + (value - marginMean) ** 2, 0) / margins.length);
  const homeGames = validGames.filter(item => item.row.isHome === true && item.row.neutralSite !== true);
  const awayGames = validGames.filter(item => item.row.isHome === false && item.row.neutralSite !== true);
  const neutralGames = validGames.filter(item => item.row.neutralSite === true);
  const lastFive = sortedGames.slice(0, 5);
  const recentOffense = mean(lastFive.map(item => item.result.ownEff));
  const recentDefense = mean(lastFive.map(item => item.result.oppEff));
  const t = team.teamStats;
  const o = team.opponentStats;
  const fga = statNumber(t, "fieldGoals.attempted", "fieldGoals.attempts", "fieldGoalsAttempted");
  const fgm = statNumber(t, "fieldGoals.made", "fieldGoals.total", "fieldGoalsMade");
  const threeMade = statNumber(t, "threePointFieldGoals.made", "threePointFieldGoals.total", "threePointersMade");
  const fta = statNumber(t, "freeThrows.attempted", "freeThrows.attempts", "freeThrowsAttempted");
  const turnovers = statNumber(t, "turnovers.total", "turnovers", "totalTurnovers");
  const orb = statNumber(t, "offensiveRebounds.total", "offensiveRebounds", "rebounds.offensive");
  const drb = statNumber(t, "defensiveRebounds.total", "defensiveRebounds", "rebounds.defensive");
  const points = statNumber(t, "points", "points.total", "totalPoints");
  const oppFga = statNumber(o, "fieldGoals.attempted", "fieldGoals.attempts", "fieldGoalsAttempted");
  const oppFgm = statNumber(o, "fieldGoals.made", "fieldGoals.total", "fieldGoalsMade");
  const oppThreeMade = statNumber(o, "threePointFieldGoals.made", "threePointFieldGoals.total", "threePointersMade");
  const oppFta = statNumber(o, "freeThrows.attempted", "freeThrows.attempts", "freeThrowsAttempted");
  const oppTurnovers = statNumber(o, "turnovers.total", "turnovers", "totalTurnovers");
  const oppOrb = statNumber(o, "offensiveRebounds.total", "offensiveRebounds", "rebounds.offensive");
  const oppDrb = statNumber(o, "defensiveRebounds.total", "defensiveRebounds", "rebounds.defensive");
  const oppPoints = statNumber(o, "points", "points.total", "totalPoints");
  const poss = fga != null && turnovers != null && fta != null ? fga - (orb ?? 0) + turnovers + 0.475 * fta : null;
  const oppPoss = oppFga != null && oppTurnovers != null && oppFta != null ? oppFga - (oppOrb ?? 0) + oppTurnovers + 0.475 * oppFta : null;
  const ratio = (n: number | null, d: number | null, scale = 100) => n == null || d == null || d <= 0 ? null : n / d * scale;
  const efg = ratio(fgm != null && threeMade != null ? fgm + 0.5 * threeMade : null, fga);
  const oppEfg = ratio(oppFgm != null && oppThreeMade != null ? oppFgm + 0.5 * oppThreeMade : null, oppFga);
  const offense = ratio(points, poss);
  const defense = ratio(oppPoints, oppPoss);
  const ast = statNumber(t, "assists", "assists.total");
  const tov = turnovers;
  const stl = statNumber(t, "steals", "steals.total");
  const blocks = statNumber(t, "blocks", "blocks.total");
  switch (key) {
    case "wins": return team.wins ?? null;
    case "winPct": return games > 0 && team.wins != null ? team.wins / games * 100 : null;
    case "losses": return team.losses ?? null;
    case "games": return team.games ?? null;
    case "pace": return team.pace ?? null;
    case "netRating": return team.adjusted?.netRating ?? (offense != null && defense != null ? offense - defense : null);
    case "offensiveRating": return team.adjusted?.offensiveRating ?? offense;
    case "defensiveRating": return team.adjusted?.defensiveRating ?? defense;
    case "srs": return team.srsRating ?? null;
    case "elo": return team.eloRating ?? null;
    case "sos": return team.sosRating ?? null;
    case "homeWinPct": return pct(homeGames);
    case "awayWinPct": return pct(awayGames);
    case "neutralWinPct": return pct(neutralGames);
    case "recentWinPct": return pct(lastFive);
    case "recentMargin": return lastFive.length ? lastFive.reduce((sum, item) => sum + item.result.margin, 0) / lastFive.length : null;
    case "homeMargin": return homeGames.length ? homeGames.reduce((sum, item) => sum + item.result.margin, 0) / homeGames.length : null;
    case "awayMargin": return awayGames.length ? awayGames.reduce((sum, item) => sum + item.result.margin, 0) / awayGames.length : null;
    case "marginStd": return marginStd;
    case "recentOffense": return recentOffense;
    case "recentDefense": return recentDefense;
    case "offenseStd": return deviation(validGames.map(item => item.result.ownEff));
    case "defenseStd": return deviation(validGames.map(item => item.result.oppEff));
    case "homeOffense": return mean(homeGames.map(item => item.result.ownEff));
    case "awayOffense": return mean(awayGames.map(item => item.result.ownEff));
    case "homeDefense": return mean(homeGames.map(item => item.result.oppEff));
    case "awayDefense": return mean(awayGames.map(item => item.result.oppEff));
    case "points": return perGame(points);
    case "rebounds": return perGame(statNumber(t, "rebounds.total", "rebounds"));
    case "assists": return perGame(ast);
    case "turnovers": return perGame(tov);
    case "steals": return perGame(stl);
    case "blocks": return perGame(blocks);
    case "fgPct": return statNumber(t, "fieldGoals.pct", "fieldGoalPct");
    case "threePct": return statNumber(t, "threePointFieldGoals.pct", "threePointPct");
    case "efgPct": return efg;
    case "oppEfgPct": return oppEfg;
    case "orbPct": return ratio(orb, orb != null && oppDrb != null ? orb + oppDrb : null);
    case "drbPct": return ratio(drb, drb != null && oppOrb != null ? drb + oppOrb : null);
    case "tovPct": return ratio(tov, poss);
    case "ftRate": return ratio(fta, fga, 1);
    case "oppTovPct": return ratio(oppTurnovers, oppPoss);
    case "oppOrbPct": return ratio(oppOrb, oppOrb != null && drb != null ? oppOrb + drb : null);
    case "oppFtRate": return ratio(oppFta, oppFga, 1);
    case "offensePer100": return offense;
    case "defensePer100": return defense;
    case "netPer100": return offense != null && defense != null ? offense - defense : null;
    case "pointsPerPoss": return poss != null && poss > 0 && points != null ? points / poss : null;
    case "oppPointsPerPoss": return oppPoss != null && oppPoss > 0 && oppPoints != null ? oppPoints / oppPoss : null;
    case "margin": return points != null && oppPoints != null && games > 0 ? (points - oppPoints) / games : null;
    case "astTov": return ast != null && tov != null && tov > 0 ? ast / tov : null;
    case "stealRate": return ratio(stl, poss);
    default: return null;
  }
};


export default function NationalDirectory({ players = [], teamRecords = [], initialQuery = "" }: { players?: Player[]; teamRecords?: TeamSeasonRecord[]; initialQuery?: string }) {
  const [teams, setTeams] = useState<EspnTeam[]>([]);
  const [status, setStatus] = useState<DirectoryState>("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState(initialQuery);
  const [conference, setConference] = useState("All conferences");
  const [selected, setSelected] = useState<EspnTeam | null>(null);
  const [roster, setRoster] = useState<EspnAthlete[]>([]);
  const [rosterStatus, setRosterStatus] = useState<DirectoryState>("ready");
  const [rosterError, setRosterError] = useState("");
  const [player, setPlayer] = useState<EspnAthlete | null>(null);
  const [selectedStatsPlayer, setSelectedStatsPlayer] = useState<Player | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [directorySort, setDirectorySort] = useState<"name" | "location">("name");
  const [directoryDirection, setDirectoryDirection] = useState<"asc" | "desc">("asc");
  const [statsSort, setStatsSort] = useState<keyof Player>("points");
  const [statsDirection, setStatsDirection] = useState<"asc" | "desc">("desc");
  const [rankingMetric, setRankingMetric] = useState("netRating");
  const [rankingDirection, setRankingDirection] = useState<"asc" | "desc">("desc");
  const [rosterSort, setRosterSort] = useState<"name" | "position" | "jersey">("name");
  useEffect(() => { if (initialQuery) setQuery(initialQuery); }, [initialQuery]);
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

  const comparisonRecords = teamRecords.filter(record => compareIds.includes(String(record.teamId ?? record.team)));
  const selectedRecord = selected ? teamRecords.find(record => [selected.name, selected.displayName].filter(Boolean).some(name => normalizeTeam(record.team) === normalizeTeam(name as string))) : undefined;

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
          const payload: unknown = await snapshot.json();
          if (isRecord(payload) && Array.isArray(payload.teams)) {
            parsed = payload.teams.map(parseEspnTeam).filter((team): team is EspnTeam => team !== null);
          }
        }
      } catch { /* use live provider fallback below */ }
      if (!parsed.length) {
        const response = await fetch(`${BASE}/teams?limit=500`);
        if (!response.ok) throw new Error(`Team directory request failed (${response.status})`);
        const json: unknown = await response.json();
        const root = isRecord(json) ? json : {};
        const sports = Array.isArray(root.sports) ? root.sports : [];
        const firstSport = isRecord(sports[0]) ? sports[0] : {};
        const leagues = Array.isArray(firstSport.leagues) ? firstSport.leagues : [];
        const firstLeague = isRecord(leagues[0]) ? leagues[0] : {};
        const raw = Array.isArray(firstLeague.teams) ? firstLeague.teams : Array.isArray(root.teams) ? root.teams : [];
        parsed = raw.map(parseEspnTeam).filter((team): team is EspnTeam => team !== null);
      }
      if (!parsed.length) throw new Error("The team directory snapshot and live provider both returned no team records.");
      setTeams(parsed); setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the team directory.");
      setStatus("error");
    }
  };

  useEffect(() => { void loadTeams(); }, []);

  const conferenceByTeam = useMemo(() => new Map(teamRecords.map(record => [normalizeTeam(record.team), record.conference || "Conference unavailable"] as const)), [teamRecords]);
  const conferences = useMemo(() => ["All conferences", ...Array.from(new Set(teamRecords.map(record => record.conference).filter((value): value is string => Boolean(value)))).sort()], [teamRecords]);
  const filtered = useMemo(() => teams.filter(t => {
    const name = t.displayName || t.name || "";
    const teamConference = conferenceByTeam.get(normalizeTeam(name)) || "Conference unavailable";
    return name.toLowerCase().includes(query.toLowerCase()) && (conference === "All conferences" || teamConference === conference);
  }).sort((a, b) => {
    const av = directorySort === "name" ? (a.displayName || a.name || "") : (a.location || "");
    const bv = directorySort === "name" ? (b.displayName || b.name || "") : (b.location || "");
    const comparison = av.localeCompare(bv);
    return directoryDirection === "asc" ? comparison : -comparison;
  }), [teams, query, conference, conferenceByTeam, directorySort, directoryDirection]);

  const sortedRoster = useMemo(() => [...roster].sort((a, b) => {
    const av = rosterSort === "position" ? (a.position?.displayName || a.position?.name || "") : rosterSort === "jersey" ? (a.jersey || "") : (a.fullName || a.displayName || "");
    const bv = rosterSort === "position" ? (b.position?.displayName || b.position?.name || "") : rosterSort === "jersey" ? (b.jersey || "") : (b.fullName || b.displayName || "");
    return av.localeCompare(bv, undefined, { numeric: rosterSort === "jersey" });
  }), [roster, rosterSort]);

  const rankedRecords = useMemo(() => teamRecords
    .map(record => ({ record, value: teamMetric(record, rankingMetric) }))
    .sort((a, b) => {
      if (a.value == null) return b.value == null ? a.record.team.localeCompare(b.record.team) : 1;
      if (b.value == null) return -1;
      const comparison = rankingDirection === "asc" ? a.value - b.value : b.value - a.value;
      return comparison || a.record.team.localeCompare(b.record.team);
    }), [teamRecords, rankingMetric, rankingDirection]);

  const openTeam = async (team: EspnTeam) => {
    setSelected(team); setPlayer(null); setRoster([]); setRosterStatus("loading"); setRosterError("");
    try {
      const response = await fetch(`${BASE}/teams/${team.id}?enable=roster`);
      if (!response.ok) throw new Error(`Roster request failed (${response.status})`);
      const json: unknown = await response.json();
      const root = isRecord(json) ? json : {};
      const teamRecord = isRecord(root.team) ? root.team : root;
      const raw = Array.isArray(teamRecord.athletes) ? teamRecord.athletes : Array.isArray(root.athletes) ? root.athletes : [];
      const flattened = raw.flatMap(group => isRecord(group) && Array.isArray(group.items) ? group.items : Array.isArray(group) ? group : [group]);
      setRoster(flattened.map(parseEspnAthlete).filter((athlete): athlete is EspnAthlete => athlete !== null));
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
    {selectedRecord && <section className="panel p-5">
      <div className="mb-4"><div className="eyebrow">Provider-backed team profile · 2026–27</div><h3 className="mt-1 font-semibold">Complete team analytics</h3><p className="mt-1 text-xs text-slate-500">All supported team metrics, grouped by basketball concept. Missing fields remain blank.</p></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{TEAM_METRIC_GROUPS.flatMap(group=>group.columns.map(([key,label])=><div key={key} className="rounded-lg border border-[#263448] bg-[#0c1420] p-3"><div className="text-[10px] uppercase tracking-wider text-slate-500">{group.label} · {label}</div><div className="mt-2 text-lg font-semibold tabular-nums">{teamMetric(selectedRecord,key)?.toFixed(1) ?? "—"}</div></div>))}</div>
      <details className="mt-5 rounded-lg border border-[#263448] p-3"><summary className="cursor-pointer text-xs font-semibold">Inspect raw provider team and opponent box-score fields</summary><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{flattenStats({teamStats:selectedRecord.teamStats ?? {},opponentStats:selectedRecord.opponentStats ?? {}}).map(stat=><div key={stat.label} className="rounded-md bg-[#101827] p-2"><div className="text-[9px] uppercase text-slate-500">{stat.label}</div><div className="mt-1 text-xs font-semibold tabular-nums">{stat.value}</div></div>)}</div></details>
    </section>}
    <div className="panel p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold">2026–27 player stats</h3><p className="mt-1 text-xs text-slate-500">Season-to-date · per-game counting stats from provider totals</p></div><div className="flex items-center gap-2"><label className="text-xs text-slate-500" htmlFor="team-player-sort">Sort</label><select id="team-player-sort" value={String(statsSort)} onChange={e => setStatsSort(e.target.value as keyof Player)} className="rounded-lg border border-[#29364a] bg-[#101827] px-2 py-2 text-xs"><option value="points">Points</option><option value="rebounds">Rebounds</option><option value="assists">Assists</option><option value="minutes">Minutes</option><option value="impact">PORPAG</option><option value="usage">Usage</option><option value="efg">eFG%</option><option value="ts">TS%</option><option value="offensiveRating">Offensive rating</option><option value="defensiveRating">Defensive rating</option><option value="netRating">Net rating</option><option value="name">Player name</option></select><button onClick={() => setStatsDirection(v => v === "asc" ? "desc" : "asc")} className="rounded-lg border border-[#29364a] px-3 py-2 text-xs" aria-label="Toggle player sort direction">{statsDirection === "asc" ? "↑ Asc" : "↓ Desc"}</button><span className="text-xs text-lime-300">{teamStats.length} statistical profiles</span></div></div>
      {teamStats.length > 0 ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-slate-500"><tr>{["Player","GP","MPG","PTS","REB","AST","STL","BLK","TOV","USG%","eFG%","TS%","PORPAG","FG%","2P%","3P%","FT%","ORtg","DRtg","Net","FT rate","OREB%","AST/TO","WS"].map(h=><th key={h} className="px-3 py-3">{h}</th>)}</tr></thead><tbody>{teamStats.map(p=><tr key={p.id} className="border-t border-[#243044] hover:bg-[#172438]"><td className="px-3 py-3 font-semibold text-lime-300"><button type="button" onClick={() => setSelectedStatsPlayer(p)} className="text-left">{p.name}<span className="mt-1 block text-[10px] font-normal text-slate-500">{p.position || "Position unavailable"} · View all stats</span></button></td><td className="px-3 py-3">{p.games ?? "—"}</td><td className="px-3 py-3">{p.minutes?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.points?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.rebounds?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.assists?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.steals?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.blocks?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.turnovers?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.usage?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.efg?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.ts?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.impact?.toFixed(2) ?? "—"}</td><td className="px-3 py-3">{p.fieldGoals?.pct?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.twoPointFieldGoals?.pct?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.threePointFieldGoals?.pct?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.freeThrows?.pct?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.offensiveRating?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.defensiveRating?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.netRating?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.freeThrowRate?.toFixed(3) ?? "—"}</td><td className="px-3 py-3">{p.offensiveReboundPct?.toFixed(1) ?? "—"}</td><td className="px-3 py-3">{p.assistsTurnoverRatio?.toFixed(2) ?? "—"}</td><td className="px-3 py-3">{p.winShares?.total?.toFixed(2) ?? "—"}</td></tr>)}</tbody></table></div> : <p className="py-5 text-sm text-slate-400">No current-season statistical records match this team yet. The feed may not have recorded a game, or the provider team name may differ.</p>}
    </div>
    <div className="panel p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold">ESPN roster & player bios</h3><p className="mt-1 text-xs text-slate-500">Biographical listings are separate from the stats table</p></div><span className="text-xs text-lime-300">{rosterStatus === "ready" ? `${roster.length} listed` : "Loading"}</span></div>
      {rosterStatus === "loading" && <div className="flex items-center gap-2 py-8 text-sm text-slate-400"><Loader2 className="animate-spin" size={17}/> Loading roster…</div>}
      {rosterStatus === "error" && <div className="py-6 text-sm text-amber-300">{rosterError} <button onClick={() => void openTeam(selected)} className="ml-2 underline">Try again</button></div>}
      {rosterStatus === "ready" && roster.length === 0 && <p className="py-6 text-sm text-slate-400">No roster entries were returned for this team.</p>}
      <div className="mb-3 flex items-center gap-2"><label htmlFor="roster-sort" className="text-xs text-slate-500">Sort roster</label><select id="roster-sort" value={rosterSort} onChange={e=>setRosterSort(e.target.value as "name"|"position"|"jersey")} className="rounded-lg border border-[#29364a] bg-[#101827] px-3 py-2 text-xs"><option value="name">Player name</option><option value="position">Position</option><option value="jersey">Jersey number</option></select></div><div className="grid gap-2 sm:grid-cols-2">{sortedRoster.map(a=><button key={a.id} onClick={() => setPlayer(a)} className="flex items-center gap-3 rounded-xl border border-[#263448] bg-[#0c1420] p-3 text-left hover:border-lime-300/60">{a.headshot?.href ? <img src={a.headshot.href} alt="" className="h-11 w-11 rounded-full object-cover"/> : <div className="grid h-11 w-11 place-items-center rounded-full bg-[#1c2939]"><Users size={18}/></div>}<span className="min-w-0 flex-1"><b className="block truncate text-sm">{a.fullName || a.displayName}</b><span className="text-xs text-slate-500">{a.position?.abbreviation || a.position?.name || "Position —"} · #{a.jersey || "—"}</span></span><ChevronRight size={16} className="text-lime-300"/></button>)}</div>
    </div>
  </div>;

  return <div className="space-y-5">
    <div className="panel flex flex-wrap items-center justify-between gap-3 p-5"><div><div className="eyebrow">National directory · men's Division I</div><h2 className="mt-2 text-2xl font-black">Every program. Every listed roster.</h2><p className="mt-1 text-xs text-slate-400">Build-refreshed national directory and live roster listings from ESPN.</p></div><button onClick={() => void loadTeams()} className="inline-flex items-center gap-2 rounded-lg border border-[#29364a] px-3 py-2 text-xs hover:border-lime-300"><RefreshCw size={14}/> Refresh</button></div>
    <div className="flex flex-wrap gap-2"><label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-[#29364a] bg-[#101827] px-3"><Search size={15} className="text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search all teams…" className="w-full bg-transparent py-3 text-xs outline-none"/></label><label className="flex items-center gap-2 rounded-xl border border-[#29364a] bg-[#101827] px-3 text-xs text-slate-500">Sort<select value={directorySort} onChange={e=>setDirectorySort(e.target.value as "name"|"location")} className="bg-transparent py-3 text-slate-100"><option value="name">Team name</option><option value="location">Location</option></select></label><button onClick={() => setDirectoryDirection(v => v === "asc" ? "desc" : "asc")} className="rounded-xl border border-[#29364a] bg-[#101827] px-3 py-2 text-xs" aria-label="Toggle team sort direction">{directoryDirection === "asc" ? "A–Z" : "Z–A"}</button><label className="flex items-center gap-2 rounded-xl border border-[#29364a] bg-[#101827] px-3 text-xs text-slate-500">Conference<select value={conference} onChange={e=>setConference(e.target.value)} className="bg-transparent py-2 text-slate-100">{conferences.map(c=><option key={c}>{c}</option>)}</select></label></div>
    {status === "loading" && <div className="panel flex items-center gap-3 p-8 text-sm text-slate-400"><Loader2 className="animate-spin" size={18}/> Loading the national team directory…</div>}
    {status === "error" && <div className="panel p-6"><p className="text-sm text-amber-300">{error}</p><button onClick={() => void loadTeams()} className="mt-3 text-xs text-white underline">Retry directory load</button><p className="mt-3 text-xs text-slate-500">This data source may be temporarily unavailable or may block this browser request.</p></div>}
    {comparisonRecords.length > 0 && <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#263448] p-4">
        <div><div className="eyebrow">Side-by-side research</div><h3 className="mt-1 font-semibold">Team comparison · {comparisonRecords.length}/3 selected</h3></div>
        <button type="button" onClick={() => setCompareIds([])} className="rounded-lg border border-[#29364a] px-3 py-2 text-xs">Clear comparison</button>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-xs tabular-nums">
        <thead><tr className="bg-[#131e2d] text-[10px] uppercase tracking-wider text-slate-400"><th className="sticky left-0 bg-[#131e2d] px-3 py-3 text-left">Metric</th>{comparisonRecords.map(record=><th key={String(record.teamId ?? record.team)} className="px-3 py-3 text-right">{record.team}</th>)}</tr></thead>
        <tbody>{TEAM_METRIC_GROUPS.flatMap(group=>[
          <tr key={group.label}><td colSpan={comparisonRecords.length+1} className="border-t border-[#263448] bg-[#172438] px-3 py-2 text-left font-semibold text-lime-300">{group.label}</td></tr>,
          ...group.columns.map(([key,label])=><tr key={key} className="border-t border-[#243044]"><td className="sticky left-0 bg-[#101827] px-3 py-2 text-left text-slate-400">{label}</td>{comparisonRecords.map(record=><td key={String(record.teamId ?? record.team)} className="px-3 py-2 text-right">{teamMetric(record,key)?.toFixed(1) ?? "—"}</td>)}</tr>)
        ])}</tbody>
      </table></div>
    </section>}
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#263448] p-5">
        <div><div className="eyebrow">2026–27 national analytics · all available team metrics</div><h3 className="mt-1 text-lg font-bold">The complete team table</h3><p className="mt-1 text-xs text-slate-500">{rankedRecords.length} teams · {TEAM_METRIC_GROUPS.reduce((n,g)=>n+g.columns.length,0)} stat columns · select any column heading to sort</p></div>
        <div className="text-right text-xs text-slate-500"><div>Season-to-date</div><div className="mt-1 font-medium text-slate-300">All metrics shown together</div></div>
      </div>
      {rankedRecords.length ? <div className="max-h-[72vh] overflow-auto">
        <table className="w-full min-w-[2600px] border-separate border-spacing-0 text-left text-[11px] tabular-nums">
          <thead className="sticky top-0 z-30">
            <tr className="bg-[#131e2d] text-[10px] uppercase tracking-wider text-slate-400">
              <th rowSpan={2} className="sticky left-0 z-40 border-b border-r border-[#263448] bg-[#131e2d] px-3 py-3">#</th>
              <th rowSpan={2} className="sticky left-[42px] z-40 min-w-[190px] border-b border-r border-[#263448] bg-[#131e2d] px-3 py-3">Team</th>
              {TEAM_METRIC_GROUPS.map(group=><th key={group.label} colSpan={group.columns.length} className="border-b border-l border-[#263448] px-3 py-2 text-center">{group.label}</th>)}
            </tr>
            <tr className="bg-[#172438] text-[10px] font-semibold text-slate-400">
              {TEAM_METRIC_GROUPS.flatMap(group=>group.columns.map(([key,label])=><th key={key} title={label} className={`border-b border-r border-[#263448] px-3 py-2 text-right whitespace-nowrap ${rankingMetric===key?"text-lime-300":""}`}><button type="button" onClick={()=>{if(rankingMetric===key)setRankingDirection(v=>v==="asc"?"desc":"asc");else{setRankingMetric(key);setRankingDirection(["defensiveRating","defensePer100","oppPointsPerPoss","oppEfgPct","oppOrbPct","oppFtRate","turnovers","losses","tovPct","marginStd","offenseStd","defenseStd"].includes(key)?"asc":"desc");}}} className="hover:text-white">{label}{rankingMetric===key?(rankingDirection==="asc"?" ↑":" ↓"):""}</button></th>))}
            </tr>
          </thead>
          <tbody>{rankedRecords.map(({record,value},index)=>{const team=teams.find(t=>normalizeTeam(t.displayName||t.name||"")===normalizeTeam(record.team));return <tr key={record.teamId??record.team} className="group hover:bg-[#172438]">
            <td className="sticky left-0 z-10 border-b border-r border-[#243044] bg-[#0d1521] px-3 py-3 font-mono text-slate-500 group-hover:bg-[#172438]">{value==null?"—":index+1}</td>
            <td className="sticky left-[42px] z-10 border-b border-r border-[#243044] bg-[#0d1521] px-3 py-3 font-semibold text-lime-300 group-hover:bg-[#172438]"><div className="flex items-center gap-2">{team?<button onClick={()=>void openTeam(team)} className="max-w-[180px] truncate text-left hover:underline">{record.team}</button>:<span className="text-slate-200">{record.team}</span>}<button type="button" onClick={()=>{const id=String(record.teamId??record.team);setCompareIds(current=>current.includes(id)?current.filter(value=>value!==id):current.length<3?[...current,id]:[...current.slice(1),id]);}} className="rounded-md border border-[#29364a] px-1.5 py-1 text-[9px] text-slate-400 hover:text-lime-300">{compareIds.includes(String(record.teamId??record.team))?"Selected":"+ Compare"}</button></div><span className="mt-1 block text-[10px] font-normal text-slate-500">{record.wins??"—"}–{record.losses??"—"} · {record.conference||"D-I"}</span></td>
            {TEAM_METRIC_GROUPS.flatMap(group=>group.columns.map(([key])=>{const value=teamMetric(record,key);const isPct=String(key).toLowerCase().includes("pct")||["fgPct","threePct","efgPct","oppEfgPct","orbPct","drbPct","tovPct"].includes(key);const digits=["wins","losses","games"].includes(key)?0:["elo"].includes(key)?0:["astTov","ftRate","oppFtRate"].includes(key)?2:1;return <td key={key} className={`border-b border-r border-[#243044] px-3 py-3 text-right whitespace-nowrap ${rankingMetric===key?"bg-lime-300/[0.06] text-lime-200 font-semibold":"text-slate-300"}`}>{value==null?"—":`${value.toFixed(digits)}${isPct?"%":""}`}</td>}))}
          </tr>})}</tbody>
        </table>
      </div> : <div className="px-5 py-8 text-sm text-slate-400">No current-season team records are available yet. The table will populate from the 2026–27 provider feed after the data-refresh workflow succeeds.</div>}
      <p className="border-t border-[#263448] px-5 py-3 text-[11px] leading-5 text-slate-500">Every metric is displayed in one horizontally scrollable table. Click a column heading to sort the entire national field. “—” means the provider has not supplied enough data to calculate that value; missing values are never replaced with zero. Adjusted ratings are provider metrics; other efficiency, four-factor, game-split and recent-form values are calculated from the listed source data.</p>
      {!teamRecords.length && <div className="px-5 py-3 text-xs text-amber-300">2026–27 team statistics have not loaded. Check the latest GitHub Actions data-refresh run; no rankings are fabricated.</div>}
    </section>
    {status === "ready" && <><div className="text-xs text-slate-500">Showing {filtered.length} of {teams.length} programs · select any team to open its roster</div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(t=><button key={t.id} onClick={() => void openTeam(t)} className="flex items-center gap-3 rounded-xl border border-[#263448] bg-[#101827] p-4 text-left transition hover:border-lime-300/60 hover:bg-[#172438]">{t.logo ? <img src={t.logo} alt="" className="h-10 w-10 object-contain"/> : <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#1c2939]"><Trophy size={17}/></div>}<span className="min-w-0 flex-1"><b className="block truncate text-sm">{t.displayName || t.name}</b><span className="text-xs text-slate-500">{t.abbreviation || "D-I program"}</span></span><ChevronRight size={16} className="text-lime-300"/></button>)}</div></>}
    <p className="text-xs leading-5 text-slate-600">Roster listings are provider-supplied and may be incomplete or change during the season. ESPN roster data does not itself provide a verified statistical profile. No missing player or stat records are invented.</p>
  </div>;
}
