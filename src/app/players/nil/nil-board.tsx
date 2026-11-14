"use client";
// /players/nil/: every D-I player's estimated NIL value, sortable and filterable. Ranks come from
// the filtered list before any name search, so searching never renumbers anyone.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import DataTable, { type Column } from "@sports/ui/data-table";
import TeamLogo from "@sports/ui/team-logo";
import { ErrorState, Loading } from "@sports/ui/states";
import { shortName } from "@sports/kit/ui/charts";
import { teamHex } from "@sports/ui/color";
import { useBasketball } from "@/sports/basketball/data";
import { fmtMoney, fmtRange, fmtReported, KIND_WORD, NIL_METHOD_HREF, useNil, type NilData, type NilRow, type NilTeam } from "@/lib/nil";
import { EstimateTag, ReportedTag, ReportList } from "@/components/nil/reported";
import { POS_WORD, type Pos, type PlayerRow } from "@/app/players/player-stats";
import { followRowLink, ROW_LINK_CLASS } from "@sports/ui/row-link";

type Item = { p: PlayerRow; n: NilRow; t: NilTeam | null; pos: Pos | null };
const POSITIONS: Pos[] = ["G", "F", "C"];

export default function NilBoard() {
  const { rows, lists, ready, error, retry } = useBasketball();
  const { nil, byPid, status, error: nilError, retry: nilRetry } = useNil();
  const [conf, setConf] = useState("all");
  const [pos, setPos] = useState("all");
  const [team, setTeam] = useState("all");
  const [q, setQ] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setConf(p.get("conf") ?? "all"); setPos(p.get("pos") ?? "all"); setTeam(p.get("team") ?? "all");
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const p = new URLSearchParams();
    if (conf !== "all") p.set("conf", conf);
    if (pos !== "all") p.set("pos", pos);
    if (team !== "all") p.set("team", team);
    const s = p.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  }, [hydrated, conf, pos, team]);

  const items = useMemo<Item[]>(() => {
    if (!ready || !nil || !byPid) return [];
    const out: Item[] = [];
    for (const p of rows) {
      const n = byPid.get(p.id);
      if (n) out.push({ p, n, t: nil.teams[n[1]] ?? null, pos: (p.posN ?? (n[6] as Pos | null)) || null });
    }
    return out.sort((a, b) => b.n[2] - a.n[2] || b.n[4] - a.n[4]);
  }, [ready, rows, nil, byPid]);
  const teamsInConf = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of items) if (x.p.team && (conf === "all" || x.p.team.confSlug === conf)) m.set(x.p.team.slug, x.p.team.name);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items, conf]);
  const pool = useMemo(() => items.filter(x =>
    (conf === "all" || x.p.team?.confSlug === conf) && (pos === "all" || x.pos === pos) && (team === "all" || x.p.team?.slug === team)), [items, conf, pos, team]);
  const rankOf = useMemo(() => new Map(pool.map((x, i) => [x.p.id, i + 1])), [pool]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? pool.filter(x => x.p.name.toLowerCase().includes(n) || x.p.team?.name.toLowerCase().includes(n) || x.p.team?.short.toLowerCase() === n) : pool;
  }, [pool, q]);
  const reportedPids = useMemo(() => new Set((nil?.calibration.players ?? []).map(c => c.pid).filter(Boolean)), [nil]);

  const columns = useMemo<Column<Item>[]>(() => [
    { key: "rk", label: "#", title: "Rank by estimated value in this list. Searching a name doesn't change it.", value: x => rankOf.get(x.p.id) ?? null, first: "asc", sticky: true, width: 46,
      render: x => <span className="rank-cell">{rankOf.get(x.p.id)}</span> },
    {
      key: "name", label: "Player", csvLabel: "Player", align: "l", value: x => x.p.name, first: "asc", sticky: true, width: 184,
      render: x => (
        <div className="flex items-center gap-2.5">
          <TeamLogo src={x.p.team?.logo ?? null} name={x.p.team?.name ?? "?"} size={24} />
          <span className="min-w-0">
            <Link data-row-link href={`/player/?id=${x.p.id}`} className="link block truncate font-semibold">{x.p.name}</Link>
            <span className="block truncate text-[11.5px] text-mute">{x.p.team?.short ?? "—"}{x.pos ? ` · ${x.pos}` : ""}{reportedPids.has(x.p.id) ? " · reported figure" : ""}</span>
          </span>
        </div>
      ),
    },
    { key: "value", label: "Estimate", csvLabel: "Estimated value (USD)", title: "D1 Hoops model estimate of annual value, 2026–27. Not a reported deal.", value: x => x.n[2], first: "desc",
      render: x => <b className="font-display text-[17px] font-extrabold tnum">{fmtMoney(x.n[2])}</b> },
    { key: "range", label: "Likely range", csvLabel: "Range low (USD)", title: "Intended 80% range: budget uncertainty plus how far our estimates missed reported figures", value: x => x.n[3], first: "desc",
      render: x => <span className="whitespace-nowrap text-mute tnum">{fmtRange(x.n[3], x.n[4])}</span> },
    { key: "share", label: "Team share", csvLabel: "Share of team budget (%)", title: "His slice of the team's roster budget", value: x => x.n[5], first: "desc",
      render: x => <span className="text-mute tnum">{x.n[5] < 0.1 ? "<0.1" : x.n[5].toFixed(1)}%</span> },
    { key: "budget", label: "Team budget", csvLabel: "Team budget (USD)", title: "Roster budget behind the estimate: CBS Sports tier where reported, otherwise our estimate from program strength (marked *)", value: x => x.t?.budget ?? null, first: "desc",
      render: x => <span className="whitespace-nowrap text-mute tnum">{fmtMoney(x.t?.budget)}{x.t?.kind === "estimated" ? "*" : ""}</span> },
    { key: "mpg", label: "MPG", csvLabel: "Minutes per game", title: "Minutes per game this season", value: x => x.p.min, first: "desc", render: x => <span className="text-mute tnum">{x.p.min?.toFixed(1) ?? "—"}</span> },
    { key: "conf", label: "Conf", csvLabel: "Conference", align: "l", value: x => x.p.team?.confName ?? null, first: "asc", render: x => <span className="text-mute">{x.p.team?.confName ?? "—"}</span> },
  ], [rankOf, reportedPids]);

  if (error || status === "error") return <ErrorState message={error ?? nilError ?? "Could not load estimates."} retry={() => { retry(); nilRetry(); }} />;
  if (status === "ready" && !nil) return <ErrorState message="NIL estimates aren't available in this build." retry={nilRetry} />;
  if (!ready || !nil || !hydrated) return <Loading label="Loading estimates" />;

  const top = pool.slice(0, 3);
  return (
    <section aria-label="Estimated NIL value">
      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="order-2 lg:order-1"><FitCard nil={nil} /></div>
        <div className="order-1 flex flex-col gap-3 lg:order-2">
          <div className="grid grid-cols-3 gap-2">
            {top.map((x, i) => {
              const c = teamHex(x.p.team?.color);
              return (
                <Link key={x.p.id} href={`/player/?id=${x.p.id}`} className="deck press team-accent relative min-w-0 overflow-hidden p-3" style={{ ["--team" as string]: c ?? undefined, borderTop: `3px solid ${c ?? "rgb(var(--bulb-rgb))"}` }}>
                  <span className="dots dots-glow text-3xl">{rankOf.get(x.p.id) ?? i + 1}</span>
                  <span className="font-display mt-1 block truncate text-[19px] font-extrabold leading-tight"><span className="hidden sm:inline">{x.p.name}</span><span className="sm:hidden">{shortName(x.p.name)}</span></span>
                  <span className="block truncate text-xs text-mute">{x.p.team?.short}{x.pos ? ` · ${x.pos}` : ""}</span>
                  <span className="mt-2 block text-xs text-mute">Est. <b className="font-display text-lg text-ink tnum">{fmtMoney(x.n[2])}</b></span>
                </Link>
              );
            })}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="label">Conference</span>
              <select className="field w-full" value={conf} onChange={e => { setConf(e.target.value); setTeam("all"); }}>
                <option value="all">All D-I</option>
                {lists.conf.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="label">Position</span>
              <select className="field w-full" value={pos} onChange={e => setPos(e.target.value)}>
                <option value="all">All positions</option>
                {POSITIONS.map(p => <option key={p} value={p}>{POS_WORD[p]}s</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="label">Team</span>
              <select className="field w-full" value={team} onChange={e => setTeam(e.target.value)}>
                <option value="all">All teams</option>
                {teamsInConf.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Find a player or team</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
          <input className="field w-full !pl-9" placeholder="Find a player or team" value={q} onChange={e => setQ(e.target.value)} />
        </label>
        <span className="text-xs text-mute" aria-live="polite"><b className="font-display text-xl font-extrabold text-ink tnum">{pool.length.toLocaleString("en-US")}</b> players</span>
        <span className="flex items-center gap-1.5 text-xs text-dim"><EstimateTag /> every figure in this table · * team budget has no public figure</span>
      </div>
      {shown.length === 0 ? (
        <div className="deck p-6 text-mute">{pool.length ? "Nobody by that name in this list." : "Nobody matches. Widen the conference, position or team."}</div>
      ) : (
        <div className={ROW_LINK_CLASS} onClick={followRowLink}>
          <DataTable rows={shown} rankRows={pool} columns={columns} rowKey={x => x.p.id} initialSort="rk" initialDir="asc"
            pageSize={100} csvName="d1hoops-nil-estimates.csv" caption="Estimated NIL value (model estimates, not reported deals)" maxHeight="78vh" />
        </div>
      )}

      <Reported nil={nil} />
    </section>
  );
}

function FitCard({ nil }: { nil: NilData }) {
  const c = nil.fit.calibration;
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  return (
    <div className="deck p-4">
      <div className="flex items-center gap-2"><h2 className="font-display text-2xl font-extrabold">How accurate is it?</h2><EstimateTag>Model</EstimateTag></div>
      <p className="mt-1 text-[14px] leading-snug text-mute">
        Estimate = <b className="text-ink">team roster budget</b> × <b className="text-ink">his share</b>. Budgets come from CBS Sports&apos; spending tiers for 80 high-major programs and from program strength elsewhere; shares come from minutes, DPR, recruiting rank and position, fitted to {c.fitted} publicly reported 2026–27 figures.
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line text-center">
        <div className="bg-deck px-2 py-2"><dt className="label">Typical miss</dt><dd className="font-display text-xl font-extrabold tnum">{pct(c.looMedianAbsPctErr)}</dd></div>
        <div className="bg-deck px-2 py-2"><dt className="label">Range covers report</dt><dd className="font-display text-xl font-extrabold tnum">{c.rangeOverlapsReported}/{c.fitted}</dd></div>
        <div className="bg-deck px-2 py-2"><dt className="label">Est. $3.9M+</dt><dd className="font-display text-xl font-extrabold tnum">{nil.fit.over39}</dd></div>
      </dl>
      <p className="mt-2 text-[13px] leading-snug text-mute">
        Typical miss: median error on players with a reported figure, each predicted with his own report left out. The Athletic reported at least 18 players at $3.9M or more; we estimate {nil.fit.over39}.
        Our biggest blind spot: pay was set last spring on last season&apos;s stats, social following and draft stock, none of which is in our data, so we often under-rate the specific stars who made headlines.
      </p>
      <Link href={NIL_METHOD_HREF} className="link mt-2 inline-block text-sm text-mute underline">How we estimate this, and every source</Link>
    </div>
  );
}

function Reported({ nil }: { nil: NilData }) {
  const list = nil.calibration.players;
  return (
    <section className="mt-8" aria-labelledby="reported-h">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="reported-h" className="h-section">Reported figures</h2>
        <ReportedTag />
      </div>
      <p className="mb-3 mt-1 max-w-3xl text-sm text-mute">
        What outlets have reported for 2026–27, next to our estimate. These are reports, mostly unconfirmed: schools rarely disclose deals and many skip the clearinghouse. We fit the model to them but never copy them into our estimates.
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {list.map(c => (
          <li key={c.name} className="deck p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="min-w-0">
                {c.pid ? <Link href={`/player/?id=${c.pid}`} className="link font-semibold">{c.name}</Link> : <b>{c.name}</b>}
                <span className="text-sm text-mute"> · {c.team}</span>
              </span>
              <span className="text-xs text-mute">{KIND_WORD[c.kind] ?? "Reported"}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-deck2 px-3 py-2"><div className="label">Reported</div><b className="tnum">{fmtReported(c.low, c.high)}</b></div>
              <div className="rounded-lg border border-line px-3 py-2"><div className="label">Our estimate</div>{c.model ? <><b className="tnum">{fmtMoney(c.model.point)}</b> <span className="text-xs text-mute tnum">({fmtRange(c.model.low, c.model.high)})</span></> : <span className="text-mute">Hasn&apos;t played yet</span>}</div>
            </div>
            <ReportList reports={c.reports} sources={nil.calibration.sources} className="mt-2" />
            {c.note && <p className="mt-1.5 text-xs text-dim">{c.note}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
