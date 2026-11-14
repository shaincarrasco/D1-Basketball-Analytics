"use client";
// Team mode: every five-man combination from a team's rotation, ranked by projected net, next to the
// units that have actually played (play-by-play), with projected vs observed side by side.
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import DataTable, { type Column } from "@/components/data-table";
import TeamLogo from "@/components/team-logo";
import { Empty, ErrorState, Loading } from "@/components/states";
import { useJson } from "@/lib/client-data";
import { fmt, signed } from "@/lib/format";
import { bestLineups, observedSd, projectLineup, rotationOf, shortName, type LabData, type LabPlayer, type RankedLineup } from "@/lib/lineup-lab";
import type { TeamDetail } from "@/lib/types";
import { DPR_TITLE, Tags } from "./parts";

type Unit = NonNullable<TeamDetail["lineups"]>[number];
const SMALL = 40;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const netCell = (v: number) => <b className={`font-semibold ${v >= 0 ? "text-win" : "text-loss"}`}>{signed(v, 1)}</b>;

export default function TeamMode({ data, slug, setTeam }: { data: LabData; slug: string | null; setTeam: (slug: string) => void }) {
  const teamOptions = useMemo(() => [...data.teams.values()].filter(t => data.players.some(p => p.t === t.slug)).sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const team = slug ? data.teams.get(slug) ?? null : null;
  return (
    <div className="space-y-6">
      <div className="deck flex flex-wrap items-center gap-3 p-4 sm:p-5">
        {team && <TeamLogo src={team.logo} name={team.name} size={36} />}
        <label htmlFor="lab-team" className="sr-only">Team</label>
        <select id="lab-team" className="field min-w-[220px] font-semibold" value={slug ?? ""} onChange={e => setTeam(e.target.value)}>
          {!team && <option value="">Pick a team</option>}
          {teamOptions.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
        </select>
        {team && <Link href={`/teams/${team.slug}/#lineups`} className="link text-sm text-mute underline">Team page</Link>}
      </div>
      {team ? <TeamLineups key={team.slug} data={data} slug={team.slug} /> : <Empty title="Pick a team">Choose a team to rank every lineup from its rotation.</Empty>}
    </div>
  );
}

function TeamLineups({ data, slug }: { data: LabData; slug: string }) {
  const detail = useJson<TeamDetail>(`team/${slug}.json`);
  const [q, setQ] = useState("");
  const rotation = useMemo(() => rotationOf(data.players, slug, 10), [data, slug]);
  const ranked = useMemo(() => bestLineups(rotation, data.meta.eff), [rotation, data.meta.eff]);
  const observed = useMemo(() => new Map((detail.data?.lineups ?? []).map(u => [[...u.pids].sort().join("-"), u])), [detail.data]);
  const shown = useMemo(() => {
    const s = fold(q.trim());
    return s ? ranked.filter(l => l.players.some(p => fold(p.n).includes(s))) : ranked;
  }, [ranked, q]);

  if (rotation.length < 5) return <Empty title="Not enough players yet">This team has fewer than five players averaging {data.meta.minMpg}+ minutes with a rating.</Empty>;

  const names = (ps: LabPlayer[]) => (
    <span className="flex min-w-[220px] flex-wrap gap-x-2.5 gap-y-0.5 whitespace-normal sm:min-w-[300px]">
      {ps.map(p => <Link key={p.id} href={`/player/?id=${p.id}`} className="link font-semibold" title={p.n}>{shortName(p.n)}</Link>)}
    </span>
  );
  const columns: Column<RankedLineup>[] = [
    { key: "rank", label: "#", sortable: false, value: () => null, render: (_l, i) => <span className="tabular-nums text-mute">{i + 1}</span> },
    { key: "unit", label: "Lineup", align: "l", sortable: false, csvLabel: "Lineup", value: l => l.players.map(p => p.n).join(" / "), render: l => names(l.players) },
    { key: "off", label: "Proj off", title: "Projected offense per 100 vs average (DPR offense + offensive fit adjustments)", group: "off", value: l => l.proj.off, render: l => signed(l.proj.off, 1) },
    { key: "def", label: "Proj def", title: "Projected defense per 100 vs average (positive = fewer points allowed)", group: "def", value: l => l.proj.def, render: l => signed(l.proj.def, 1) },
    { key: "fit", label: "Fit", title: "Total of the fit adjustments (spacing, ball handling, shot creation, rim protection, rebounding)", value: l => l.proj.fit.total, render: l => <span className={l.proj.fit.total < -0.05 ? "text-loss" : l.proj.fit.total > 0.05 ? "text-win" : "text-mute"}>{signed(l.proj.fit.total, 1)}</span> },
    { key: "net", label: "Proj net", title: "Projected net per 100 possessions vs an average D-I lineup", value: l => l.proj.net, render: l => netCell(l.proj.net) },
    {
      key: "flags", label: "Warnings", title: "Balance warnings (open the lineup to read them)", first: "asc",
      value: l => l.proj.warnings.filter(w => w.level === "high" || w.level === "mid").length,
      render: l => { const w = l.proj.warnings.filter(x => x.level === "high" || x.level === "mid"); return w.length ? <span className="text-hot" title={w.map(x => x.text).join("\n")}>{w.length}</span> : <span className="text-dim">0</span>; },
    },
    {
      key: "obs", label: "Real net", title: "Observed net per 100 when this exact five has played (play-by-play, 2+ minutes, not opponent-adjusted)",
      value: l => observed.get(l.key)?.net ?? null,
      render: l => { const u = observed.get(l.key); return u ? <span className={u.poss < SMALL ? "opacity-60" : undefined} title={`${fmt(u.poss, 0)} possessions`}>{signed(u.net, 1)} <span className="text-dim">({fmt(u.poss, 0)})</span></span> : <span className="text-dim">—</span>; },
    },
    { key: "open", label: "", sortable: false, value: () => null, render: l => <Link href={`/lineups/?p=${l.ids.join(",")}`} className="link whitespace-nowrap text-xs font-semibold underline">Open</Link> },
  ];

  const best = ranked[0];
  return (
    <div className="space-y-6">
      <section className="deck p-4 sm:p-5" aria-label="Rotation">
        <h2 className="h-section">Rotation</h2>
        <p className="mt-1 text-sm text-mute">The {rotation.length} players with the most minutes ({data.meta.minMpg}+ mpg). Every five-man mix of them is ranked below: {ranked.length} lineups.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {rotation.map(p => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line px-3 py-2 text-sm">
              <Link href={`/player/?id=${p.id}`} className="link font-semibold">{p.n}</Link>
              <span className="text-xs text-mute">{p.pos ?? "—"} · {fmt(p.mpg)} mpg</span>
              <span className="text-xs tabular-nums text-mute" title={DPR_TITLE}>DPR {signed(p.o + p.d, 1)}</span>
              <Tags p={p} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Best projected lineups">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="h-section">Best projected lineups</h2>
            <p className="text-sm text-mute">Projected per 100 possessions vs an average D-I lineup. {best && <>Top: <b className="text-ink">{best.players.map(p => p.n.split(" ").slice(-1)[0]).join(", ")}</b> at {signed(best.proj.net, 1)}.</>}</p>
          </div>
          <div className="relative">
            <Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
            <input type="search" aria-label="Find lineups with a player" className="field w-56 py-1.5 pl-8 text-sm" placeholder="Lineups with…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        <DataTable rows={shown} rankRows={ranked} columns={columns} rowKey={l => l.key} initialSort="net" pageSize={10} caption="Best projected lineups" csvName={`${slug}-projected-lineups`} />
        <p className="mt-2 text-xs text-dim">Rank numbers stay put when you search. &ldquo;Real net&rdquo; (possessions in brackets) appears only for fives that have actually played 2+ minutes together.</p>
      </section>

      <section aria-label="Observed lineups">
        <h2 className="h-section">Real lineups: observed vs projected</h2>
        {detail.status === "error" ? <ErrorState message={detail.error} retry={detail.retry} />
          : !detail.data ? <Loading label="Loading play-by-play lineups" />
          : <Observed units={detail.data.lineups ?? []} data={data} />}
      </section>
    </div>
  );
}

type ObsRow = Unit & { players: (LabPlayer | null)[]; proj: number | null };

function Observed({ units, data }: { units: Unit[]; data: LabData }) {
  const rows: ObsRow[] = useMemo(() => units.map(u => {
    const players = u.pids.map(id => data.byId.get(id) ?? null);
    const proj = players.every(Boolean) ? projectLineup(players as LabPlayer[], data.meta.eff).net : null;
    return { ...u, players, proj };
  }), [units, data]);
  if (!rows.length) return <p className="mt-2 text-sm text-mute">No five-man units with play-by-play yet.</p>;
  const dim = (u: ObsRow, node: React.ReactNode) => <span className={u.poss < SMALL ? "opacity-60" : undefined}>{node}</span>;
  const columns: Column<ObsRow>[] = [
    {
      key: "unit", label: "Lineup", align: "l", sortable: false, csvLabel: "Lineup", value: u => u.players.map(p => p?.n ?? "Unlisted").join(" / "),
      render: u => (
        <span className="flex min-w-[220px] flex-wrap gap-x-2.5 gap-y-0.5 whitespace-normal sm:min-w-[300px]">
          {u.players.map((p, i) => p ? <Link key={p.id} href={`/player/?id=${p.id}`} className="link font-semibold" title={p.n}>{shortName(p.n)}</Link> : <span key={i} className="text-mute">Unlisted player</span>)}
        </span>
      ),
    },
    { key: "poss", label: "Poss", title: "Possessions together (real)", value: u => u.poss, render: u => dim(u, fmt(u.poss, 0)) },
    { key: "net", label: "Real net", title: "Observed net per 100 possessions (not adjusted for opponent)", value: u => u.net, render: u => dim(u, netCell(u.net)) },
    { key: "luck", label: "± luck", title: "One standard deviation of a unit's net from the bounce of the ball alone at this many possessions", value: u => observedSd(u.poss), render: u => <span className="text-dim">±{Math.round(observedSd(u.poss) ?? 0)}</span> },
    { key: "proj", label: "Proj net", title: "What the lineup lab projects for this five", value: u => u.proj, render: u => (u.proj === null ? <span className="text-dim" title="A player here averages under the lab's minutes cutoff">—</span> : signed(u.proj, 1)) },
    { key: "open", label: "", sortable: false, value: () => null, render: u => (u.proj === null ? null : <Link href={`/lineups/?p=${u.pids.join(",")}`} className="link text-xs font-semibold underline">Open</Link>) },
  ];
  return (
    <div className="mt-3">
      <DataTable rows={rows} columns={columns} rowKey={u => u.pids.join("-")} initialSort="poss" pageSize={10} caption="Observed five-man lineups" />
      <p className="mt-2 text-xs text-dim">Real results from play-by-play (units with 2+ minutes). Under {SMALL} possessions is faded: at that size a unit&apos;s net swings by 20+ points from luck alone, so a gap between real and projected says little yet.</p>
    </div>
  );
}
