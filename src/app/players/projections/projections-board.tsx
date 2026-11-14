"use client";
// /players/projections/: rank D-I players by a projected skill. Ranks come from the filtered pool
// before any name search, so searching never renumbers anyone.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import DataTable, { type Column } from "@/components/data-table";
import TeamLogo from "@/components/team-logo";
import { ErrorState, Loading } from "@/components/states";
import { PoolControls } from "@/sport-kit/ui/controls";
import { shortName } from "@/sport-kit/ui/charts";
import { heatPct } from "@/lib/format";
import { teamHex } from "@/lib/color";
import { inPool, readPool, withDefaults, writePool, type Pool } from "@/sport-kit";
import { useBasketball } from "@/sports/basketball/data";
import { basketball } from "@/sports/basketball/pack";
import { fmtSkill, gradeTone, ownShare, pct99, SKILL_DESC, SKILL_KEYS, SKILL_NAME, skillsOf, useSkills, type SkillCell, type SkillKey, type SkillStatMeta } from "@/lib/skills";
import type { PlayerRow } from "@/app/players/player-stats";
import { followRowLink, ROW_LINK_CLASS } from "@/app/players/row-link";

type Ranked = { r: PlayerRow; c: SkillCell; own: number };
const POOL0: Pool = withDefaults(basketball, { min: "10", g: "1" });

export default function ProjectionsBoard() {
  const { rows, lists, ready, error, retry } = useBasketball();
  const skills = useSkills();
  const [skill, setSkill] = useState<SkillKey>("pts");
  const [pool, setPool] = useState<Pool>(POOL0);
  const [q, setQ] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("s"); if (s && (SKILL_KEYS as readonly string[]).includes(s)) setSkill(s as SkillKey);
    const np = readPool(basketball, p, POOL0);
    setPool(np);
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const p = new URLSearchParams();
    if (skill !== "pts") p.set("s", skill);
    writePool(basketball, pool, p);
    for (const [k, v] of Object.entries(POOL0)) { if (pool[k] === v) p.delete(k); else if (!p.has(k)) p.set(k, pool[k]); }
    const s = p.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  }, [hydrated, skill, pool]);

  const meta = useMemo(() => new Map((skills.data?.meta.stats ?? []).map(s => [s.key, s])), [skills.data]);
  const sm: SkillStatMeta | undefined = meta.get(skill);
  const ranked = useMemo<Ranked[]>(() => {
    if (!ready || !skills.data || !sm) return [];
    const out: Ranked[] = [];
    for (const r of rows) {
      if (!inPool(basketball, pool, r)) continue;
      const c = skillsOf(skills.data, r.id)?.[skill];
      if (c) out.push({ r, c, own: ownShare(c.n, sm.k) });
    }
    return out.sort((a, b) => (sm.invert ? a.c.proj - b.c.proj : b.c.proj - a.c.proj) || b.c.n - a.c.n);
  }, [ready, rows, skills.data, sm, skill, pool]);
  const rankOf = useMemo(() => new Map(ranked.map((x, i) => [x.r.id, i + 1])), [ranked]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? ranked.filter(x => x.r.name.toLowerCase().includes(n) || x.r.team?.name.toLowerCase().includes(n) || x.r.team?.short.toLowerCase() === n) : ranked;
  }, [ranked, q]);

  const columns = useMemo<Column<Ranked>[]>(() => !sm ? [] : [
    { key: "rk", label: "#", title: "Rank by projection in this pool. Searching a name doesn't change it.", value: x => rankOf.get(x.r.id) ?? null, first: "asc", sticky: true, width: 46, render: x => <span className="rank-cell">{rankOf.get(x.r.id)}</span> },
    {
      key: "name", label: "Player", csvLabel: "Player", align: "l", value: x => x.r.name, first: "asc", sticky: true, width: 200,
      render: x => (
        <div className="flex items-center gap-2.5">
          <TeamLogo src={x.r.team?.logo ?? null} name={x.r.team?.name ?? "?"} size={24} />
          <span className="min-w-0">
            <Link data-row-link href={`/player/?id=${x.r.id}`} className="link block truncate font-semibold">{x.r.name}</Link>
            <span className="block truncate text-[11.5px] text-mute">{x.r.team?.name ?? "—"}{x.r.posN ? ` · ${x.r.posN}` : ""}</span>
          </span>
        </div>
      ),
    },
    { key: "proj", label: "Projected", csvLabel: `Projected ${sm.short}`, title: `Projected ${sm.label}: this season blended with his starting point`, value: x => x.c.proj, first: sm.invert ? "asc" : "desc",
      render: x => <b className="font-display text-[17px] font-extrabold tnum">{fmtSkill(sm, x.c.proj)}</b> },
    { key: "grade", label: "Grade", csvLabel: "Grade", title: "Letter grade from the projected percentile (scouting-report scale)", value: x => x.c.pct, first: "desc",
      render: x => <span className="font-display text-[17px] font-black" style={{ color: gradeTone(x.c.grade) }}>{x.c.grade}</span> },
    { key: "pct", label: "Pctl", csvLabel: "Percentile", title: "Projected percentile vs D-I players averaging 10+ minutes", value: x => pct99(x.c.pct), first: "desc",
      render: x => <span className="inline-block min-w-[2.6rem] rounded px-1.5 py-0.5 tnum" style={{ background: heatPct(x.c.pct) }}>{pct99(x.c.pct)}</span> },
    { key: "raw", label: "This season", csvLabel: `This season ${sm.short}`, title: "His real number so far (box scores), before any projection", value: x => x.c.raw, first: sm.invert ? "asc" : "desc",
      render: x => <span className="text-mute tnum">{fmtSkill(sm, x.c.raw)}</span> },
    { key: "n", label: "Sample", csvLabel: `Sample (${sm.nUnit})`, title: `His own ${sm.nUnit} this season`, value: x => x.c.n, first: "desc",
      render: x => <span className="text-mute tnum">{x.c.n.toLocaleString("en-US")}</span> },
    { key: "own", label: "Own data", csvLabel: "Own data share", title: "How much of the projection comes from his own games; the rest is his starting point (position, height, recruiting, class)", value: x => Math.round(x.own * 100), first: "desc",
      render: x => <span className="text-mute tnum">{x.own < 0.01 ? "<1%" : `${Math.round(x.own * 100)}%`}</span> },
    { key: "conf", label: "Conf", csvLabel: "Conference", align: "l", value: x => x.r.team?.confName ?? null, first: "asc", render: x => <span className="text-mute">{x.r.team?.confName ?? "—"}</span> },
  ], [sm, rankOf]);

  if (error || skills.status === "error") return <ErrorState message={error ?? skills.error ?? "Could not load projections."} retry={() => { retry(); skills.retry(); }} />;
  if (!ready || !skills.data || !hydrated || !sm) return <Loading label="Loading projections" />;

  const top = ranked.slice(0, 3);
  const half = Math.round(sm.k);
  const shares = ranked.map(x => x.own).sort((a, b) => a - b);
  const medianOwn = shares.length ? shares[Math.floor(shares.length / 2)] : 0;
  return (
    <section aria-label="Player skill projections">
      <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Skill">
        {SKILL_KEYS.filter(k => meta.has(k)).map(k => <button key={k} className="chip whitespace-nowrap" aria-pressed={skill === k} onClick={() => setSkill(k)}>{meta.get(k)!.short}</button>)}
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="deck p-4">
          <h2 className="font-display text-2xl font-extrabold uppercase">{SKILL_NAME[skill]}</h2>
          <p className="mt-1 text-[14px] leading-snug text-mute">{SKILL_DESC[skill]} D-I average {fmtSkill(sm, sm.league)}.</p>
          <p className="mt-2 text-[13.5px] leading-snug text-mute">
            <b className="text-ink">Projected</b> = this season blended with a starting point from position, height, recruiting and class.
            A player&apos;s own record counts half after about <b className="text-ink">{half.toLocaleString("en-US")} {sm.nUnit}</b>{sm.oppAdjusted ? ", and games against weak or strong opponents are adjusted" : ""}.
            <b className="text-ink"> This season</b> is his real number so far.
          </p>
          {medianOwn < 0.25 && (
            <p className="mt-2 rounded-lg bg-deck2 px-3 py-2 text-[13px] leading-snug text-mute">
              <b className="text-ink">Early season.</b> For the typical player here, his own games make up only {Math.max(1, Math.round(medianOwn * 100))}% of this projection, so the list mostly reflects starting points. It sharpens as games come in.
            </p>
          )}
          <Link href="/methodology/#skills" className="link mt-2 inline-block text-sm text-mute underline">How projections work and how accurate they are</Link>
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            {top.map((x, i) => {
              const c = teamHex(x.r.team?.color);
              return (
                <Link key={x.r.id} href={`/player/?id=${x.r.id}`} className="deck press team-accent relative overflow-hidden p-3" style={{ ["--team" as string]: c ?? undefined, borderTop: `3px solid ${c ?? "rgb(var(--bulb-rgb))"}` }}>
                  <span className="dots dots-glow text-3xl">{i + 1}</span>
                  <span className="font-display mt-1 block truncate text-[19px] font-extrabold leading-tight"><span className="hidden sm:inline">{x.r.name}</span><span className="sm:hidden">{shortName(x.r.name)}</span></span>
                  <span className="block truncate text-xs text-mute">{x.r.team?.short}{x.r.posN ? ` · ${x.r.posN}` : ""}</span>
                  <span className="mt-2 block text-xs text-mute">Proj <b className="font-display text-lg text-ink tnum">{fmtSkill(sm, x.c.proj)}</b> · this season {fmtSkill(sm, x.c.raw)}</span>
                </Link>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><PoolControls pack={basketball} pool={pool} set={setPool} lists={lists} /></div>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Find a player or team</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
          <input className="field w-full !pl-9" placeholder="Find a player or team" value={q} onChange={e => setQ(e.target.value)} />
        </label>
        <span className="text-xs text-mute" aria-live="polite"><b className="font-display text-xl font-extrabold text-ink tnum">{ranked.length.toLocaleString("en-US")}</b> players ranked</span>
        <span className="text-xs text-dim">Percentiles and grades compare against every D-I player averaging 10+ minutes, whatever the filters.</span>
      </div>
      {shown.length === 0 ? (
        <div className="deck p-6 text-mute">{ranked.length ? "Nobody by that name in this pool." : "Nobody matches. Lower the minutes or games floor, or widen the conference and position."}</div>
      ) : (
        <div className={ROW_LINK_CLASS} onClick={followRowLink}>
          <DataTable key={skill} rows={shown} rankRows={ranked} columns={columns} rowKey={x => x.r.id} initialSort="rk" initialDir="asc"
            pageSize={100} csvName={`d1hoops-skill-projections-${skill}.csv`} caption={`Projected ${sm.label}`} maxHeight="78vh" />
        </div>
      )}
    </section>
  );
}
