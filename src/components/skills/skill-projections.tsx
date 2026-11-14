"use client";
// Player page: "Skill projections". One lollipop per skill, sorted by projected percentile vs D-I
// rotation players. Each row opens to show this season's real number, the starting point (prior),
// how much of the projection is his own games, and any opponent adjustment.
import Link from "next/link";
import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { ordinal } from "@sports/ui/format";
import {
  basisLine, fmtSkill, gradeTone, lookalike, oppText, pct99, profileWord, sampleText, SKILL_DESC, SKILL_KEYS, SKILL_NAME, useTeamSkills,
  type SkillDetailCell, type SkillKey, type SkillPlayerDetail, type SkillStatMeta,
} from "@/lib/skills";

type Row = { key: SkillKey; s: SkillStatMeta; c: SkillDetailCell };

export default function SkillProjections({ playerId, teamSlug, name }: { playerId: string; teamSlug: string | null; name: string }) {
  const file = useTeamSkills(teamSlug);
  const d = file.data?.players?.[playerId] ?? null;
  const rows = useMemo<Row[]>(() => {
    if (!file.data || !d) return [];
    const metaBy = new Map(file.data.meta.stats.map(s => [s.key, s]));
    return SKILL_KEYS.filter(k => metaBy.has(k) && d[k]).map(k => ({ key: k, s: metaBy.get(k)!, c: d[k] })).sort((a, b) => b.c.pct - a.c.pct);
  }, [file.data, d]);
  const pool = file.data?.meta.pool;

  return (
    <section className="deck p-5" aria-labelledby="skills-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="skills-h" className="h-section">Skill projections</h2>
        <Link href="/methodology/#skills" className="link text-sm text-mute underline">How projections work</Link>
      </div>
      {file.status === "error" ? (
        <p className="mt-2 text-sm text-mute">Projections didn&apos;t load. <button className="underline" onClick={file.retry}>Try again</button></p>
      ) : file.status === "loading" && teamSlug ? (
        <p className="mt-2 text-sm text-mute">Loading projections…</p>
      ) : !d || !rows.length ? (
        <p className="mt-2 text-sm text-mute">No skill projections for {name} yet. They appear after his first game with a box score.</p>
      ) : (
        <>
          <p className="mt-1 text-[15px] leading-snug text-mute">
            What his skills most likely are: this season blended with what players like him usually do. <b className="text-ink">{basisLine(d)}.</b>
          </p>
          <p className="mt-1 text-xs text-dim">
            Dot = projected percentile vs {pool ? pool.players.toLocaleString("en-US") : ""} D-I players averaging {pool?.minMpg ?? 10}+ minutes. Tap a skill for the numbers behind it.
          </p>
          <div className="mt-3 hidden grid-cols-[11rem_minmax(0,1fr)_2.75rem_5rem_6.5rem_1rem] gap-3 border-b border-line pb-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-dim sm:grid" aria-hidden>
            <span>Skill</span><span>Projected percentile</span><span className="text-center">Grade</span><span className="text-right">Projected</span><span className="text-right">This season</span><span />
          </div>
          <ul className="divide-y divide-line">
            {rows.map(r => <SkillRow key={r.key} r={r} d={d} pool={pool?.minMpg ?? 10} />)}
          </ul>
        </>
      )}
    </section>
  );
}

function Lollipop({ pct, tone, label }: { pct: number; tone: string; label: string }) {
  const x = Math.max(1.5, Math.min(98.5, pct * 100));
  return (
    <div className="relative h-5" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct99(pct)}>
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line2" aria-hidden />
      <span className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-line2" style={{ left: "50%" }} aria-hidden title="D-I median" />
      <span className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full opacity-60" style={{ width: `${x}%`, background: tone }} aria-hidden />
      <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[rgb(var(--deck-rgb))]" style={{ left: `${x}%`, background: tone }} aria-hidden />
    </div>
  );
}

function SkillRow({ r, d, pool }: { r: Row; d: SkillPlayerDetail; pool: number }) {
  const { key, s, c } = r;
  const tone = gradeTone(c.grade);
  const own = Math.round(c.w * 100);
  const opp = s.oppAdjusted ? oppText(key, c) : null;
  const kText = s.k >= 1000 ? Math.round(s.k).toLocaleString("en-US") : String(Math.round(s.k));
  return (
    <li>
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)_2.75rem_5rem_6.5rem_1rem] sm:gap-3 [&::-webkit-details-marker]:hidden">
          <span className="truncate text-[14.5px] font-semibold" title={SKILL_DESC[key]}>{SKILL_NAME[key]}</span>
          <span className="text-right font-display text-[22px] font-black leading-none sm:order-3 sm:text-center" style={{ color: tone }} title={`${ordinal(pct99(c.pct))} percentile`}>{c.grade}</span>
          <span className="col-span-2 sm:order-2 sm:col-span-1"><Lollipop pct={c.pct} tone={tone} label={`${SKILL_NAME[key]}, projected percentile`} /></span>
          <span className="text-[13px] text-mute tnum sm:order-4 sm:text-right">
            <span className="sm:hidden">Proj </span><b className="font-display text-[17px] font-extrabold text-ink">{fmtSkill(s, c.proj)}</b>
          </span>
          <span className="text-right text-[13px] text-mute tnum sm:order-5">
            {c.raw === null ? <span className="text-dim">no tries yet</span> : <>{fmtSkill(s, c.raw)}<span className="sm:hidden"> this season</span></>}
          </span>
          <ChevronDown size={15} className="hidden text-dim transition-transform group-open:rotate-180 sm:order-6 sm:block" aria-hidden />
        </summary>
        <div className="mb-3 rounded-xl bg-deck2 px-4 py-3 text-[13.5px] leading-snug text-mute">
          <p className="mb-2 text-xs text-dim">{SKILL_DESC[key]}</p>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div>
              <dt className="label">This season (real)</dt>
              <dd><b className="text-ink tnum">{fmtSkill(s, c.raw)}</b> {c.raw === null ? "" : "on "}{sampleText(s, c)}</dd>
            </div>
            <div>
              <dt className="label">Starting point</dt>
              <dd><b className="text-ink tnum">{fmtSkill(s, c.prior)}</b>, typical for {lookalike(d)}{key === "tp" ? ", given his free-throw shooting" : ""}</dd>
            </div>
            <div>
              <dt className="label">Projected</dt>
              <dd>
                <b className="text-ink tnum">{fmtSkill(s, c.proj)}</b>.{" "}
                {c.n ? <>His own games make up <b className="text-ink">{own < 1 ? "under 1" : own}%</b> of this; the {profileWord(d)} makes up the rest. A player&apos;s own record counts half after about {kText} {s.nUnit}.</>
                  : <>No {s.nUnit} yet, so this is the starting point alone.</>}
              </dd>
            </div>
            <div>
              <dt className="label">Vs D-I</dt>
              <dd>Better than <b className="text-ink">{pct99(c.pct)}%</b> of D-I players averaging {pool}+ minutes{s.invert ? " (fewer is better)" : ""}: grade <b style={{ color: tone }}>{c.grade}</b>.</dd>
            </div>
          </dl>
          {opp && <p className="mt-2 text-xs">{opp}</p>}
        </div>
      </details>
    </li>
  );
}
