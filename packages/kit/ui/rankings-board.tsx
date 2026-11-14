"use client";
// Ranking frameworks for any sport pack: pick a lens (or build your own weights), choose
// the pool and whether to compare within position, and get a ranked list with every
// ingredient shown.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Plus, RotateCcw, Search, X } from "lucide-react";
import DataTable, { type Column } from "@sports/ui/data-table";
import TeamLogo from "@sports/ui/team-logo";
import { ErrorState, Loading } from "@sports/ui/states";
import { heatPct } from "@sports/ui/format";
import { teamHex } from "@sports/ui/color";
import { followRowLink, ROW_LINK_CLASS } from "@sports/ui/row-link";
import {
  decodeWeights, encodeSpec, encodeWeights, fmtMetric, makeSpec, metricIndex, pctLabel, rankPool, readPool, sanitizePool, tierOf, val, withDefaults, writePool,
  type Pool, type Ranked, type SportData, type SportPack, type Weights,
} from "../index";
import { shortName } from "./charts";
import { PoolControls } from "./controls";
import { withQuery, type KitRoutes } from "./gallery";

const scoreBg = (s: number) => heatPct(s / 100);

export default function RankingsBoard<R>({ pack, data, routes, keep }: { pack: SportPack<R>; data: SportData<R>; routes: KitRoutes; keep?: Record<string, string> }) {
  const { rows, lists, ready, error, retry } = data;
  const E = pack.entity, METRIC = metricIndex(pack);
  const FW = useMemo(() => Object.assign(Object.create(null), Object.fromEntries(pack.frameworks.map(f => [f.key, f]))) as Record<string, (typeof pack.frameworks)[number]>, [pack]);
  const first = pack.frameworks[0];
  const [fw, setFw] = useState(first.key);
  const [weights, setWeights] = useState<Weights>(first.weights);
  const [pool, setPool] = useState<Pool>(() => withDefaults(pack));
  const [relative, setRelative] = useState<"all" | "pos">("all");
  const [shrink, setShrink] = useState(true);
  const [q, setQ] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const f = p.get("fw");
    const w = decodeWeights(pack, p.get("w"));
    if (f && FW[f]) { setFw(f); setWeights(FW[f].weights); }
    else if (f === "custom" && w) { setFw("custom"); setWeights(w); }
    setPool(readPool(pack, p));
    if (p.get("rel") === "pos" && pack.positions.length) setRelative("pos");
    if (p.get("raw") === "1") setShrink(false);
    setHydrated(true);
  }, [pack, FW]);
  useEffect(() => {
    if (!hydrated) return;
    const p = new URLSearchParams(keep);
    if (fw !== first.key) p.set("fw", fw);
    if (fw === "custom") p.set("w", encodeWeights(weights));
    writePool(pack, pool, p);
    if (relative === "pos") p.set("rel", "pos");
    if (!shrink) p.set("raw", "1");
    const s = p.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  }, [pack, keep, first.key, hydrated, fw, weights, pool, relative, shrink]);

  useEffect(() => { if (ready && hydrated) setPool(prev => sanitizePool(pack, prev, lists)); }, [pack, ready, hydrated, lists]);

  const ranked = useMemo(() => (ready ? rankPool(pack, rows, pool, weights, relative, shrink) : []), [pack, ready, rows, pool, weights, relative, shrink]);
  const rankOf = useMemo(() => new Map(ranked.map((x, i) => [E.id(x.r), i + 1])), [E, ranked]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return ranked;
    return ranked.filter(x => { const t = E.team(x.r); return E.name(x.r).toLowerCase().includes(n) || !!t?.name.toLowerCase().includes(n) || t?.short.toLowerCase() === n; });
  }, [E, ranked, q]);
  const active = weights.filter(([k, w]) => METRIC[k] && w > 0);
  const totalW = active.reduce((a, [, w]) => a + w, 0) || 1;

  const noun = pack.nouns.player[0].toUpperCase() + pack.nouns.player.slice(1);
  const tierText = pack.tiers.slice(0, -1).map(t => `${t.label} = top ${100 - t.min}%`).join(", ");
  const columns = useMemo<Column<Ranked<R>>[]>(() => [
    { key: "rk", label: "#", value: x => rankOf.get(E.id(x.r)) ?? null, first: "asc", sticky: true, width: 46, render: x => <span className="rank-cell">{rankOf.get(E.id(x.r))}</span> },
    {
      key: "name", label: noun, csvLabel: noun, align: "l", value: x => E.name(x.r), first: "asc", sticky: true, width: 200,
      render: x => {
        const t = E.team(x.r), pos = E.pos(x.r), href = E.href(x.r);
        return (
          <div className="flex items-center gap-2.5">
            <TeamLogo src={t?.logo ?? null} name={t?.name ?? "?"} size={24} />
            <span className="min-w-0">
              {href ? <Link data-row-link href={href} className="link block truncate font-semibold">{E.name(x.r)}</Link> : <span className="block truncate font-semibold">{E.name(x.r)}</span>}
              <span className="block truncate text-[11.5px] text-mute">{t?.name ?? "—"}{pos ? ` · ${pos}` : ""}</span>
            </span>
          </div>
        );
      },
    },
    {
      key: "score", label: "Score", csvLabel: "Score", title: "Weighted average of the percentiles (0-100)", value: x => x.score, first: "desc",
      render: x => <span className="font-display inline-block min-w-[3.2rem] rounded px-1.5 py-0.5 text-[17px] font-extrabold tnum" style={{ background: scoreBg(x.standing) }}>{x.score.toFixed(1)}</span>,
    },
    { key: "tier", label: "Tier", csvLabel: "Tier", title: `Tier from where the score ranks in the pool: ${tierText}`, align: "l", value: x => x.standing, first: "desc", render: x => <span className={x.standing >= 90 ? "font-semibold text-ink" : "text-mute"}>{tierOf(pack, x.standing)}</span> },
    ...active.map(([k, w], i): Column<Ranked<R>> => {
      const m = METRIC[k];
      return {
        key: `c-${k}`, label: m.short, csvLabel: `${m.short} percentile`, title: `${m.label} (${Math.round((w / totalW) * 100)}% of the score). Cell = percentile, raw value on hover.`,
        value: x => (x.pcts[i] === null ? null : Math.min(99, Math.round(x.pcts[i]! * 100))), first: "desc",
        render: x => {
          const pc = x.pcts[i], v = val(m, x.r);
          if (pc === null) return <span className="text-dim" title="Sample too small; left out of this player's score">—</span>;
          return <span className="inline-block min-w-[2.6rem] rounded px-1.5 py-0.5 tnum" style={{ background: heatPct(pc) }} title={`${fmtMetric(m, v)} · ${pctLabel(pc)} percentile`}>{Math.min(99, Math.round(pc * 100))}</span>;
        },
      };
    }),
    ...(pack.groups ? [{ key: "grp", label: pack.groups.short ?? pack.groups.label, csvLabel: pack.groups.label, align: "l", value: (x: Ranked<R>) => E.team(x.r)?.groupName ?? null, first: "asc", render: (x: Ranked<R>) => <span className="text-mute">{E.team(x.r)?.groupName ?? "—"}</span> } as Column<Ranked<R>>] : []),
  ], [pack, E, METRIC, noun, tierText, active, totalW, rankOf]);

  if (error) return <ErrorState message={error} retry={retry} />;
  if (!ready || !hydrated) return <Loading label={`Loading ${pack.nouns.players}`} />;

  const pick = (k: string) => { setFw(k); setWeights(FW[k].weights); };
  const edit = (w: Weights) => { setFw("custom"); setWeights(w); };
  const unused = pack.metrics.filter(m => !weights.some(([k]) => k === m.key));
  const top = ranked.slice(0, 3);
  const compareSpec = makeSpec(pack, { type: "profile", ids: top.map(x => E.id(x.r)), metrics: active.map(([k]) => k).slice(0, 14), pool, title: `${fw === "custom" ? "Custom" : FW[fw].label} top three` });
  const compareHref = withQuery(routes.builder, encodeSpec(pack, compareSpec));

  return (
    <section aria-label={`${noun} ranking frameworks`}>
      <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Ranking framework">
        {pack.frameworks.map(f => <button key={f.key} className="chip" aria-pressed={fw === f.key} onClick={() => pick(f.key)}>{f.label}</button>)}
        <button className="chip" aria-pressed={fw === "custom"} onClick={() => edit(weights)}>Custom</button>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="deck p-4">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl font-extrabold uppercase">{fw === "custom" ? "Your formula" : FW[fw].label}</h2>
            {fw === "custom" && <button className="btn !px-3 !py-1 text-[13px]" onClick={() => pick(first.key)}><RotateCcw size={13} aria-hidden /> Start over</button>}
          </div>
          <p className="mb-3 text-[13.5px] leading-snug text-mute">{fw === "custom" ? "Drag a weight to change how much it counts. Each stat is a percentile, so a 2:1 weight really is twice the pull." : `${FW[fw].blurb} Drag any weight to make it yours.`}</p>
          <ul className="flex flex-col gap-2">
            {weights.map(([k, w], i) => {
              const m = METRIC[k];
              if (!m) return null;
              return (
                <li key={k} className="grid grid-cols-[6.5rem_1fr_2.5rem_1.5rem] items-center gap-2">
                  <span className="truncate text-[13.5px] font-semibold" title={m.desc}>{m.short}</span>
                  <input type="range" min={0} max={50} value={w} aria-label={`${m.label} weight`} className="accent-[rgb(var(--bulb-rgb))]"
                    onChange={e => { const n = [...weights] as Weights; n[i] = [k, Number(e.target.value)]; edit(n); }} />
                  <span className="text-right text-[13px] tnum text-mute">{w ? `${Math.round((w / totalW) * 100)}%` : "off"}</span>
                  <button className="text-dim hover:text-ink" aria-label={`Remove ${m.label}`} onClick={() => edit(weights.filter((_, j) => j !== i))}><X size={15} /></button>
                </li>
              );
            })}
          </ul>
          {weights.length < 12 && (
            <label className="mt-3 flex items-center gap-2">
              <Plus size={15} className="text-dim" aria-hidden />
              <select className="field flex-1 !py-1.5 text-sm" value="" onChange={e => e.target.value && edit([...weights, [e.target.value, 15]])} aria-label="Add a stat">
                <option value="">Add a stat…</option>
                {pack.metricGroups.map(g => <optgroup key={g} label={g}>{unused.filter(m => m.group === g).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>)}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            {top.map((x, i) => {
              const t = E.team(x.r), pos = E.pos(x.r), name = E.name(x.r), href = E.href(x.r);
              const c = teamHex(t?.color ?? null);
              const body = (
                <>
                  <span className="dots dots-glow text-3xl">{i + 1}</span>
                  <span className="font-display mt-1 block truncate text-[19px] font-extrabold leading-tight"><span className="hidden sm:inline">{name}</span><span className="sm:hidden">{shortName(name)}</span></span>
                  <span className="block truncate text-xs text-mute">{t?.short}{pos ? `${t?.short ? " · " : ""}${pos}` : ""}</span>
                  <span className="mt-2 block text-xs text-mute">Score <b className="font-display text-lg text-ink tnum">{x.score.toFixed(1)}</b> · {tierOf(pack, x.standing)}</span>
                </>
              );
              const cls = "deck press team-accent relative overflow-hidden p-3", style = { ["--team" as string]: c ?? undefined, borderTop: `3px solid ${c ?? "rgb(var(--bulb-rgb))"}` };
              return href ? <Link key={E.id(x.r)} href={href} className={cls} style={style}>{body}</Link> : <div key={E.id(x.r)} className={cls} style={style}>{body}</div>;
            })}
          </div>
          {top.length > 0 && <Link href={compareHref} className="btn self-start"><BarChart3 size={15} aria-hidden /> Chart the top three</Link>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><PoolControls pack={pack} pool={pool} set={setPool} lists={lists} /></div>
          <div className="flex flex-wrap items-end gap-3">
            {pack.positions.length > 0 && <label className="flex flex-col gap-1">
              <span className="label">Percentiles against</span>
              <div className="seg" role="group">
                {(["all", "pos"] as const).map(v => <button key={v} aria-pressed={relative === v} onClick={() => setRelative(v)}>{v === "all" ? "Everyone" : "Same position"}</button>)}
              </div>
            </label>}
            <label className="flex items-center gap-2 pb-2 text-[13.5px]">
              <input type="checkbox" checked={shrink} onChange={e => setShrink(e.target.checked)} className="accent-[rgb(var(--bulb-rgb))]" />
              Adjust for small samples
            </label>
          </div>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Find a {pack.nouns.player} or team</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
          <input className="field w-full !pl-9" placeholder={`Find a ${pack.nouns.player} or team`} value={q} onChange={e => setQ(e.target.value)} />
        </label>
        <span className="text-xs text-mute" aria-live="polite"><b className="font-display text-xl font-extrabold text-ink tnum">{ranked.length.toLocaleString("en-US")}</b> {pack.nouns.players} ranked</span>
        <span className="text-xs text-dim">Tiers by standing in the pool: {pack.tiers.slice(0, -1).map(t => `${t.label} top ${100 - t.min}%`).join(" · ")}</span>
      </div>
      {active.length === 0 ? (
        <div className="deck p-6 text-mute">Give at least one stat some weight to rank {pack.nouns.players}.</div>
      ) : shown.length === 0 ? (
        <div className="deck p-6 text-mute">Nobody matches. Loosen the filters above.</div>
      ) : (
        <div className={shown.some(x => E.href(x.r)) ? ROW_LINK_CLASS : undefined} onClick={followRowLink}>
          <DataTable key={fw + active.map(([k]) => k).join()} rows={shown} columns={columns} rowKey={x => E.id(x.r)} initialSort="rk" initialDir="asc"
            pageSize={100} csvName={`${pack.filePrefix}-rankings-${fw}.csv`} caption={`${noun} rankings: ${fw}`} maxHeight="78vh" />
        </div>
      )}
      <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-dim">
        How it works: each stat becomes a percentile against the pool{pack.positions.length > 0 ? <> (or against the {pack.nouns.player}&apos;s position)</> : null}, the percentiles are blended by weight, and the score is that weighted average (100 = best in the pool at everything). Tiers come from where the score ranks in the pool.
        Stats with too small a sample are left out of that {pack.nouns.player}&apos;s blend; {pack.nouns.players} need {Math.round(pack.ranking.minCoverage * 100)}% of the weight covered to be ranked.
        &ldquo;Adjust for small samples&rdquo; pulls each blend toward average: halfway at {pack.ranking.shrinkK.toLocaleString("en-US")} {pack.ranking.shrinkUnit} played, less and less after that, so a hot start can&apos;t top the list on its own.
      </p>
    </section>
  );
}
