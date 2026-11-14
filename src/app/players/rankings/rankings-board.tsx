"use client";
// Player ranking frameworks: pick a lens (or build your own weights), choose the pool and
// whether to compare within position, and get a ranked list with every ingredient shown.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Plus, RotateCcw, Search, X } from "lucide-react";
import DataTable, { type Column } from "@/components/data-table";
import TeamLogo from "@/components/team-logo";
import { ErrorState, Loading } from "@/components/states";
import { PoolControls } from "@/components/charts/controls";
import { encodeSpec, spec } from "@/components/charts/spec";
import { shortName } from "@/components/charts/player-charts";
import { heatPct } from "@/lib/format";
import { teamHex } from "@/lib/color";
import { DEFAULT_POOL, fmtMetric, METRIC, METRIC_GROUPS, METRICS, usePlayers, val, type PoolFilter } from "@/lib/player-metrics";
import { pctLabel } from "@/app/players/player-stats";
import { followRowLink, ROW_LINK_CLASS } from "@/app/players/row-link";
import { decodeWeights, encodeWeights, FRAMEWORKS, FW, MIN_COVERAGE, rankPool, tierOf, TIERS, type Ranked, type Weights } from "./frameworks";

const scoreBg = (s: number) => heatPct(s / 100);

export default function RankingsBoard() {
  const { rows, confs, ready, error, retry } = usePlayers();
  const [fw, setFw] = useState("overall");
  const [weights, setWeights] = useState<Weights>(FW.overall.weights);
  const [pool, setPool] = useState<PoolFilter>(DEFAULT_POOL);
  const [relative, setRelative] = useState<"all" | "pos">("all");
  const [shrink, setShrink] = useState(true);
  const [q, setQ] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const f = p.get("fw");
    const w = decodeWeights(p.get("w"));
    if (f && FW[f]) { setFw(f); setWeights(FW[f].weights); }
    else if (f === "custom" && w) { setFw("custom"); setWeights(w); }
    const np: PoolFilter = { ...DEFAULT_POOL };
    if (p.get("conf")) np.conf = p.get("conf")!;
    const pos = p.get("pos"); if (pos === "G" || pos === "F" || pos === "C") np.pos = pos;
    if (p.has("min")) np.minMin = Number(p.get("min")) || 0;
    if (p.has("g")) np.minG = Math.max(1, Number(p.get("g")) || 1);
    const st = p.get("st"); if (st === "4" || st === "3" || st === "none") np.stars = st;
    setPool(np);
    if (p.get("rel") === "pos") setRelative("pos");
    if (p.get("raw") === "1") setShrink(false);
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const p = new URLSearchParams();
    if (fw !== "overall") p.set("fw", fw);
    if (fw === "custom") p.set("w", encodeWeights(weights));
    if (pool.conf !== DEFAULT_POOL.conf) p.set("conf", pool.conf);
    if (pool.pos !== "all") p.set("pos", pool.pos);
    if (pool.minMin !== DEFAULT_POOL.minMin) p.set("min", String(pool.minMin));
    if (pool.minG !== DEFAULT_POOL.minG) p.set("g", String(pool.minG));
    if (pool.stars !== "any") p.set("st", pool.stars);
    if (relative === "pos") p.set("rel", "pos");
    if (!shrink) p.set("raw", "1");
    const s = p.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  }, [hydrated, fw, weights, pool, relative, shrink]);

  const ranked = useMemo(() => (ready ? rankPool(rows, pool, weights, relative, shrink) : []), [ready, rows, pool, weights, relative, shrink]);
  const rankOf = useMemo(() => new Map(ranked.map((x, i) => [x.r.id, i + 1])), [ranked]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? ranked.filter(x => x.r.name.toLowerCase().includes(n) || x.r.team?.name.toLowerCase().includes(n) || x.r.team?.short.toLowerCase() === n) : ranked;
  }, [ranked, q]);
  const active = weights.filter(([k, w]) => METRIC[k] && w > 0);
  const totalW = active.reduce((a, [, w]) => a + w, 0) || 1;

  const columns = useMemo<Column<Ranked>[]>(() => [
    { key: "rk", label: "#", value: x => rankOf.get(x.r.id) ?? null, first: "asc", sticky: true, width: 46, render: x => <span className="rank-cell">{rankOf.get(x.r.id)}</span> },
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
    {
      key: "score", label: "Score", csvLabel: "Score", title: "Weighted average of the percentiles (0-100)", value: x => x.score, first: "desc",
      render: x => <span className="font-display inline-block min-w-[3.2rem] rounded px-1.5 py-0.5 text-[17px] font-extrabold tnum" style={{ background: scoreBg(x.standing) }}>{x.score.toFixed(1)}</span>,
    },
    { key: "tier", label: "Tier", csvLabel: "Tier", title: "Tier from where the score ranks in the pool: Elite = top 3%, Excellent = top 10%, Very good = top 25%, Solid = top half", align: "l", value: x => x.standing, first: "desc", render: x => <span className={x.standing >= 90 ? "font-semibold text-ink" : "text-mute"}>{tierOf(x.standing)}</span> },
    ...active.map(([k, w], i): Column<Ranked> => {
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
    { key: "conf", label: "Conf", csvLabel: "Conference", align: "l", value: x => x.r.team?.confName ?? null, first: "asc", render: x => <span className="text-mute">{x.r.team?.confName ?? "—"}</span> },
  ], [active, totalW, rankOf]);

  if (error) return <ErrorState message={error} retry={retry} />;
  if (!ready || !hydrated) return <Loading label="Loading players" />;

  const pick = (k: string) => { setFw(k); setWeights(FW[k].weights); };
  const edit = (w: Weights) => { setFw("custom"); setWeights(w); };
  const unused = METRICS.filter(m => !weights.some(([k]) => k === m.key));
  const top = ranked.slice(0, 3);
  const compareHref = `/charts/build/?${encodeSpec(spec({ type: "profile", ids: top.map(x => x.r.id), metrics: active.map(([k]) => k).slice(0, 14), pool, title: `${fw === "custom" ? "Custom" : FW[fw].label} top three` }))}`;

  return (
    <section aria-label="Player ranking frameworks">
      <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Ranking framework">
        {FRAMEWORKS.map(f => <button key={f.key} className="chip" aria-pressed={fw === f.key} onClick={() => pick(f.key)}>{f.label}</button>)}
        <button className="chip" aria-pressed={fw === "custom"} onClick={() => edit(weights)}>Custom</button>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="deck p-4">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl font-extrabold uppercase">{fw === "custom" ? "Your formula" : FW[fw].label}</h2>
            {fw === "custom" && <button className="btn !px-3 !py-1 text-[13px]" onClick={() => pick("overall")}><RotateCcw size={13} aria-hidden /> Start over</button>}
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
                {METRIC_GROUPS.map(g => <optgroup key={g} label={g}>{unused.filter(m => m.group === g).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>)}
              </select>
            </label>
          )}
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
                  <span className="mt-2 block text-xs text-mute">Score <b className="font-display text-lg text-ink tnum">{x.score.toFixed(1)}</b> · {tierOf(x.standing)}</span>
                </Link>
              );
            })}
          </div>
          {top.length > 0 && <Link href={compareHref} className="btn self-start"><BarChart3 size={15} aria-hidden /> Chart the top three</Link>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><PoolControls pool={pool} set={setPool} confs={confs} /></div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="label">Percentiles against</span>
              <div className="seg" role="group">
                {(["all", "pos"] as const).map(v => <button key={v} aria-pressed={relative === v} onClick={() => setRelative(v)}>{v === "all" ? "Everyone" : "Same position"}</button>)}
              </div>
            </label>
            <label className="flex items-center gap-2 pb-2 text-[13.5px]">
              <input type="checkbox" checked={shrink} onChange={e => setShrink(e.target.checked)} className="accent-[rgb(var(--bulb-rgb))]" />
              Adjust for small samples
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
        <span className="text-xs text-mute" aria-live="polite"><b className="font-display text-xl font-extrabold text-ink tnum">{ranked.length.toLocaleString("en-US")}</b> players ranked</span>
        <span className="text-xs text-dim">Tiers by standing in the pool: {TIERS.slice(0, 4).map(t => `${t.label} top ${100 - t.min}%`).join(" · ")}</span>
      </div>
      {active.length === 0 ? (
        <div className="deck p-6 text-mute">Give at least one stat some weight to rank players.</div>
      ) : shown.length === 0 ? (
        <div className="deck p-6 text-mute">Nobody matches. Lower the minutes or games floor, or widen the conference and position.</div>
      ) : (
        <div className={ROW_LINK_CLASS} onClick={followRowLink}>
          <DataTable key={fw + active.map(([k]) => k).join()} rows={shown} columns={columns} rowKey={x => x.r.id} initialSort="rk" initialDir="asc"
            pageSize={100} csvName={`d1hoops-player-rankings-${fw}.csv`} caption={`Player rankings: ${fw}`} maxHeight="78vh" />
        </div>
      )}
      <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-dim">
        How it works: each stat becomes a percentile against the pool (or against the player&apos;s position), the percentiles are blended by weight, and the score is that weighted average (100 = best in the pool at everything). Tiers come from where the score ranks in the pool.
        Stats with too small a sample are left out of that player&apos;s blend; players need {Math.round(MIN_COVERAGE * 100)}% of the weight covered to be ranked.
        &ldquo;Adjust for small samples&rdquo; pulls each blend toward average until a player has a few hundred minutes, so two hot games can&apos;t top the list on their own.
      </p>
    </section>
  );
}
