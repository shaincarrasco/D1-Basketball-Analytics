"use client";
// Transfer portal board: player list (filters, impact ranks that ignore the name search) and
// a team view (who they lost / who they added, net impact). Filters live in the URL.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import DataTable, { type Column } from "@/components/data-table";
import TeamLogo from "@/components/team-logo";
import { TransferLedger } from "@/components/team-transfers";
import { useJson } from "@/lib/client-data";
import { fmt, signed } from "@/lib/format";
import { DEFAULT_POOL, usePlayers } from "@/lib/player-metrics";
import { ELIG_LABEL, IMPACT_SHORT, STATUS_LABEL, allTeamMoves, dateShort, signedImpact, teamMoves, type PortalEntry, type PortalPlace, type TeamMoves } from "@/lib/portal";
import type { TeamSummary } from "@/lib/types";
import { grade } from "../player/scouting";
import { FW, rankPool } from "../players/rankings/frameworks";
import { POS_WORD, starGlyphs, type Pos } from "../players/player-stats";
import { followRowLink, ROW_LINK_CLASS } from "../players/row-link";

type View = "players" | "teams";
type St = "active" | "available" | "committed" | "withdrawn" | "all";
const ST_OPTS: [St, string][] = [["active", "In the portal"], ["available", "Available"], ["committed", "Committed"], ["withdrawn", "Withdrew"], ["all", "Everyone"]];
const STAR_OPTS = [["any", "Any stars"], ["5", "5★"], ["4", "4★+"], ["3", "3★+"], ["none", "Unrated"]] as const;
type StarF = (typeof STAR_OPTS)[number][0];
const POS_OPTS: Pos[] = ["G", "F", "C"];

const placeKey = (p: PortalPlace | null) => (p ? p.slug ?? `n:${p.name}` : "");
const confKey = (p: PortalPlace | null) => (p ? p.confSlug ?? (p.conf ? `c:${p.conf}` : "") : "");
const inStatus = (e: PortalEntry, s: St) => s === "all" || (s === "active" ? e.status !== "withdrawn" : e.status === s);
const starOk = (f: StarF, s: number | null) => f === "any" || (f === "none" ? !s : (s ?? 0) >= Number(f));

type Row = PortalEntry & { grade: string | null; standing: number | null };

function Place({ p, logos, muted }: { p: PortalPlace; logos: Record<string, string | null>; muted?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <TeamLogo src={p.slug ? logos[p.slug] ?? null : null} name={p.name} size={20} />
      <span className="min-w-0">
        {p.slug ? <Link href={`/teams/${p.slug}/`} className={`link block truncate ${muted ? "" : "font-semibold"}`}>{p.name}</Link> : <span className="block truncate">{p.name}</span>}
        <span className="block truncate text-[11px] text-mute">{p.conf ?? (p.d1 ? "" : "Not D-I")}</span>
      </span>
    </span>
  );
}

export default function Board({ entries }: { entries: PortalEntry[] }) {
  const { rows: players } = usePlayers();
  const teams = useJson<TeamSummary[]>("teams.json");
  const logos = useMemo(() => Object.fromEntries((teams.data ?? []).map(t => [t.slug, t.logo])) as Record<string, string | null>, [teams.data]);

  // Our scouting grade: the Overall ranking lens (players at 10+ mpg, 2+ games), as a letter on the scouting-report scale.
  const standing = useMemo(() => {
    if (!players.length) return null;
    const list = rankPool(players, { ...DEFAULT_POOL, minMin: 10 }, FW.overall.weights, "all", true);
    return new Map(list.map(x => [x.r.id, x.standing]));
  }, [players]);
  const rows = useMemo<Row[]>(() => entries.map(e => {
    const s = e.pid && standing ? standing.get(e.pid) ?? null : null;
    return { ...e, standing: s, grade: s === null ? null : grade(s / 100) };
  }), [entries, standing]);

  const [view, setView] = useState<View>("players");
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<"all" | Pos>("all");
  const [conf, setConf] = useState("all");
  const [from, setFrom] = useState("all");
  const [to, setTo] = useState("all");
  const [st, setSt] = useState<St>("active");
  const [stars, setStars] = useState<StarF>("any");
  const [team, setTeam] = useState<string | null>(null);
  const [tq, setTq] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("view") === "teams" || p.get("team")) setView("teams");
    if (p.get("team")) setTeam(p.get("team"));
    if (p.get("q")) setQ(p.get("q")!);
    const ps = p.get("pos")?.toUpperCase(); if (ps === "G" || ps === "F" || ps === "C") setPos(ps);
    if (p.get("conf")) setConf(p.get("conf")!);
    if (p.get("from")) setFrom(p.get("from")!);
    if (p.get("to")) setTo(p.get("to")!);
    const s = ST_OPTS.find(([k]) => k === p.get("st")); if (s) setSt(s[0]);
    const sr = STAR_OPTS.find(([k]) => k === p.get("stars")); if (sr) setStars(sr[0]);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams();
    if (view === "teams") { p.set("view", "teams"); if (team) p.set("team", team); }
    else {
      if (q.trim()) p.set("q", q.trim());
      if (pos !== "all") p.set("pos", pos);
      if (conf !== "all") p.set("conf", conf);
      if (from !== "all") p.set("from", from);
      if (to !== "all") p.set("to", to);
      if (st !== "active") p.set("st", st);
      if (stars !== "any") p.set("stars", stars);
    }
    const s = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
  }, [ready, view, team, q, pos, conf, from, to, st, stars]);

  // Filter options come from the entries themselves.
  const options = useMemo(() => {
    const confs = new Map<string, string>(), froms = new Map<string, string>(), tos = new Map<string, string>();
    for (const e of entries) {
      for (const p of [e.from, e.to]) if (p?.conf) confs.set(confKey(p), p.conf);
      if (e.from) froms.set(placeKey(e.from), e.from.name);
      if (e.to) tos.set(placeKey(e.to), e.to.name);
    }
    const sort = (m: Map<string, string>) => [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    return { confs: sort(confs), froms: sort(froms), tos: sort(tos) };
  }, [entries]);

  const counts = useMemo(() => ({
    active: entries.filter(e => e.status !== "withdrawn").length,
    committed: entries.filter(e => e.status === "committed").length,
    available: entries.filter(e => e.status === "available").length,
    withdrawn: entries.filter(e => e.status === "withdrawn").length,
  }), [entries]);

  // `ranked` = every entry the filters allow (ranks count here); the name search only narrows what's shown.
  const ranked = useMemo(() => rows.filter(e =>
    inStatus(e, st) && (pos === "all" || e.posN === pos) && starOk(stars, e.stars) &&
    (conf === "all" || confKey(e.from) === conf || confKey(e.to) === conf) &&
    (from === "all" || placeKey(e.from) === from) && (to === "all" || placeKey(e.to) === to)), [rows, st, pos, stars, conf, from, to]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return !n ? ranked : ranked.filter(e => e.name.toLowerCase().includes(n) || !!e.from?.name.toLowerCase().includes(n) || !!e.to?.name.toLowerCase().includes(n));
  }, [ranked, q]);

  const columns = useMemo<Column<Row>[]>(() => [
    { key: "rk", label: "#", value: () => null, sortable: false, sticky: true, width: 40, render: (_r, i) => <span className="rank-cell text-mute">{i + 1}</span> },
    {
      key: "name", label: "Player", csvLabel: "Player", align: "l", value: r => r.name, first: "asc", sticky: true, width: 172,
      render: r => (
        <span className="block min-w-0">
          {r.pid ? <Link data-row-link href={`/player/?id=${r.pid}`} className="link block truncate font-semibold">{r.name}</Link> : <span className="block truncate font-semibold">{r.name}</span>}
          <span className="block truncate text-[11.5px] text-mute">
            {[r.posN ? POS_WORD[r.posN] : r.pos, r.yrs !== null ? `${r.yrs} yr${r.yrs === 1 ? "" : "s"} left` : null].filter(Boolean).join(" · ") || "—"}
          </span>
        </span>
      ),
    },
    { key: "from", label: "From", csvLabel: "From", align: "l", width: 170, value: r => r.from?.name ?? null, first: "asc", render: r => (r.from ? <Place p={r.from} logos={logos} muted /> : <span className="text-dim">—</span>) },
    {
      key: "to", label: "To", csvLabel: "To", align: "l", width: 170, first: "asc",
      value: r => (r.status === "committed" ? r.to?.name ?? null : STATUS_LABEL[r.status]),
      render: r => r.status === "committed" && r.to ? <Place p={r.to} logos={logos} />
        : <span className={`chip !px-2.5 !py-0.5 text-[12px] ${r.status === "available" ? "!border-hot text-hot" : "text-mute"}`} title={r.elig ? ELIG_LABEL[r.elig] ?? r.elig : undefined}>{STATUS_LABEL[r.status]}</span>,
    },
    {
      key: "impact", label: "Impact", csvLabel: "Impact (pts/100 over replacement)", title: IMPACT_SHORT, value: r => r.impact,
      render: r => r.impact === null ? <span className="text-dim" title="No 2026–27 D-I stats line we could match">—</span> : <b className="font-display text-[16px] font-extrabold tnum">{fmt(r.impact)}</b>,
    },
    {
      key: "grade", label: "Grade", csvLabel: "Scouting grade (Overall lens)", title: "Our scouting grade: his Overall-lens percentile among D-I players at 10+ mpg, on the scouting-report letter scale", value: r => r.standing,
      render: r => r.grade ? <span className="font-display text-[16px] font-black" style={{ color: r.grade[0] === "A" ? "var(--win)" : r.grade[0] === "D" ? "var(--loss)" : undefined }} title={`Better than ${r.standing}% of D-I rotation players (Overall lens)`}>{r.grade}</span> : <span className="text-dim" title={r.pid ? "Under 10 mpg or fewer than 2 games" : "No stats line"}>—</span>,
    },
    { key: "min", label: "MPG", title: "Minutes per game, 2026–27", value: r => r.stats?.min ?? null, render: r => fmt(r.stats?.min ?? null) },
    { key: "pts", label: "PTS", title: "Points per game, 2026–27", value: r => r.stats?.pts ?? null, render: r => fmt(r.stats?.pts ?? null) },
    { key: "reb", label: "REB", title: "Rebounds per game, 2026–27", value: r => r.stats?.reb ?? null, render: r => fmt(r.stats?.reb ?? null) },
    { key: "ast", label: "AST", title: "Assists per game, 2026–27", value: r => r.stats?.ast ?? null, render: r => fmt(r.stats?.ast ?? null) },
    { key: "ts", label: "TS%", title: "True shooting %, 2026–27", value: r => r.stats?.ts ?? null, render: r => fmt(r.stats?.ts ?? null) },
    { key: "dpr", label: "DPR", title: "Points per 100 possessions vs an average D-I player (lineup data)", value: r => r.stats?.dpr ?? null, render: r => signed(r.stats?.dpr ?? null) },
    {
      key: "stars", label: "Stars", csvLabel: "Transfer stars", title: "Transfer star rating (College Basketball Data)", align: "l", value: r => r.stars,
      render: r => r.stars ? <span className="tracking-[0.04em]" aria-label={`${r.stars}-star transfer`} title={r.rating !== null ? `Transfer rating ${r.rating}` : undefined}>{starGlyphs(r.stars)}</span> : <span className="text-dim">—</span>,
    },
    { key: "seen", label: "First seen", csvLabel: "First seen", title: "When our daily check first saw him in the portal (the provider publishes no dates)", align: "l", value: r => r.firstSeen, first: "desc", render: r => <span className="text-mute">{dateShort(r.firstSeen) || "—"}</span> },
  ], [logos]);

  // ---------- team view ----------
  const moves = useMemo(() => allTeamMoves(entries), [entries]);
  const shownMoves = useMemo(() => { const n = tq.trim().toLowerCase(); return !n ? moves : moves.filter(m => m.name.toLowerCase().includes(n)); }, [moves, tq]);
  const selected = useMemo(() => (team ? teamMoves(entries, team) : null), [entries, team]);
  const selectedName = useMemo(() => (team ? teams.data?.find(t => t.slug === team)?.name ?? moves.find(m => m.slug === team)?.name ?? team : null), [team, teams.data, moves]);
  const teamCols = useMemo<Column<TeamMoves>[]>(() => [
    { key: "rk", label: "#", value: () => null, sortable: false, sticky: true, width: 40, render: (_r, i) => <span className="rank-cell text-mute">{i + 1}</span> },
    {
      key: "team", label: "Team", align: "l", sticky: true, width: 170, value: m => m.name, first: "asc",
      render: m => (
        <button className="flex min-w-0 items-center gap-2 text-left" onClick={() => { setTeam(m.slug); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <TeamLogo src={logos[m.slug] ?? null} name={m.name} size={20} />
          <span className="min-w-0"><span className="link block truncate font-semibold">{m.name}</span><span className="block truncate text-[11px] text-mute">{m.conf ?? ""}</span></span>
        </button>
      ),
    },
    { key: "outN", label: "Out", title: "Players who left through the portal (withdrawn players excluded)", value: m => m.out.length },
    { key: "lost", label: "Lost", title: "Impact of the players who left", value: m => m.lost, render: m => <span className="text-loss tnum">{m.lost ? `−${fmt(m.lost)}` : "0.0"}</span> },
    { key: "inN", label: "In", title: "Portal players who committed here", value: m => m.inn.length },
    { key: "added", label: "Added", title: "Impact of the players who committed here", value: m => m.added, render: m => <span className="text-win tnum">{m.added ? `+${fmt(m.added)}` : "0.0"}</span> },
    { key: "net", label: "Net", title: "Added minus lost", value: m => m.net, render: m => <b className={`font-display text-[16px] font-extrabold tnum ${m.net > 0.04 ? "text-win" : m.net < -0.04 ? "text-loss" : ""}`}>{signedImpact(m.net)}</b> },
  ], [logos]);

  const reset = () => { setQ(""); setPos("all"); setConf("all"); setFrom("all"); setTo("all"); setSt("active"); setStars("any"); };
  const tiles: [string, number, St][] = [["In the portal", counts.active, "active"], ["Committed", counts.committed, "committed"], ["Available", counts.available, "available"], ["Withdrew", counts.withdrawn, "withdrawn"]];

  return (
    <section className="mb-10" aria-label="Transfer portal tracker">
      <ul className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Summary">
        {tiles.map(([l, v, s]) => (
          <li key={l}>
            <button className="deck press w-full px-4 py-3 text-left hover:border-line2" onClick={() => { setView("players"); setSt(s); }} aria-label={`Show ${l.toLowerCase()}: ${v}`}>
              <span className="block font-display text-[2.2rem] font-black leading-none tnum">{v}</span>
              <span className="mt-1 block text-[12.5px] font-semibold text-mute">{l}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="seg mb-4 w-full sm:max-w-xs" role="group" aria-label="View">
        {(["players", "teams"] as View[]).map(v => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className="hover:text-ink">
            {v === "players" ? "Players" : "Teams"}
          </button>
        ))}
      </div>

      {view === "players" ? (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
            <label className="relative col-span-2 sm:w-64">
              <span className="sr-only">Find a player or team</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
              <input className="field w-full !pl-9" placeholder="Player or team" value={q} onChange={e => setQ(e.target.value)} />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="label">Status</span>
              <select className="field" value={st} onChange={e => setSt(e.target.value as St)}>{ST_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="label">Position</span>
              <select className="field" value={pos} onChange={e => setPos(e.target.value as "all" | Pos)}>
                <option value="all">All positions</option>
                {POS_OPTS.map(p => <option key={p} value={p}>{POS_WORD[p]}s</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="label">Conference (left or joined)</span>
              <select className="field" value={conf} onChange={e => setConf(e.target.value)}>
                <option value="all">All conferences</option>
                {options.confs.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="label">Stars</span>
              <select className="field" value={stars} onChange={e => setStars(e.target.value as StarF)}>{STAR_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="label">From team</span>
              <select className="field" value={from} onChange={e => setFrom(e.target.value)}>
                <option value="all">Any team</option>
                {options.froms.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="label">Committed to</span>
              <select className="field" value={to} onChange={e => setTo(e.target.value)}>
                <option value="all">Any team</option>
                {options.tos.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
          </div>
          <p className="mb-2 text-xs text-mute" aria-live="polite">
            <b className="font-display text-xl font-extrabold text-ink tnum">{shown.length}</b> {shown.length === 1 ? "player" : "players"}
            {q.trim() && shown.length !== ranked.length ? <> of {ranked.length} (ranks stay as in the full filtered list)</> : null}. Ranked by impact: {IMPACT_SHORT}
          </p>
          {shown.length === 0 ? (
            <div className="deck flex flex-col items-start gap-3 p-6">
              <p className="font-semibold">No portal players match these filters</p>
              <p className="text-sm text-mute">{q.trim() ? `Nobody named “${q.trim()}” clears the current filters. ` : ""}Try a wider status, position, conference or team.</p>
              <button className="btn" onClick={reset}>Reset filters</button>
            </div>
          ) : (
            <div className={ROW_LINK_CLASS} onClick={followRowLink}>
              <DataTable rows={shown} rankRows={ranked} columns={columns} rowKey={r => r.key} initialSort="impact" pageSize={100} csvName="d1hoops-transfer-portal-2027.csv" caption="Transfer portal players" maxHeight="78vh" />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-2 sm:flex sm:items-end">
            <label className="flex min-w-0 flex-col gap-1 sm:w-72">
              <span className="label">Team</span>
              <select className="field" value={team ?? ""} onChange={e => setTeam(e.target.value || null)}>
                <option value="">Pick a team</option>
                {[...moves].sort((a, b) => a.name.localeCompare(b.name)).map(m => <option key={m.slug} value={m.slug}>{m.name}</option>)}
              </select>
            </label>
          </div>
          {team && (
            <section className="deck mb-6 p-5" aria-labelledby="ledger-h">
              <div className="mb-3 flex items-center gap-3">
                <TeamLogo src={logos[team] ?? null} name={selectedName ?? team} size={36} />
                <h2 id="ledger-h" className="min-w-0 flex-1 truncate font-display text-[28px] font-black leading-none">
                  <Link href={`/teams/${team}/`} className="link">{selectedName}</Link>
                </h2>
                <button className="btn !px-3 !py-1.5 text-[13px]" onClick={() => setTeam(null)}>Clear</button>
              </div>
              {selected ? <TransferLedger moves={selected} logos={logos} /> : <p className="text-sm text-mute">No portal moves for {selectedName} yet.</p>}
            </section>
          )}
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <h2 className="h-section">Every team&apos;s portal balance</h2>
            <label className="relative w-full sm:w-56">
              <span className="sr-only">Find a team</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
              <input className="field w-full !pl-9" placeholder="Find a team" value={tq} onChange={e => setTq(e.target.value)} />
            </label>
          </div>
          <p className="mb-2 text-xs text-mute">D-I teams with at least one move, ranked by net impact (added minus lost). Tap a team for its ins and outs.</p>
          {shownMoves.length ? (
            <DataTable rows={shownMoves} rankRows={moves} columns={teamCols} rowKey={m => m.slug} initialSort="net" pageSize={100} caption="Team portal balance" maxHeight="70vh" />
          ) : <div className="deck p-5 text-sm text-mute">No team matches “{tq.trim()}”.</div>}
        </>
      )}
    </section>
  );
}
