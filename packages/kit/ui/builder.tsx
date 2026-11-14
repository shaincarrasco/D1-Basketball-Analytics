"use client";
// Chart builder for any sport pack: pick a chart type, the stats, the pool and who to
// highlight. Everything lives in the URL, so a chart is shared by copying the link.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Check, Download, Link2, RotateCcw } from "lucide-react";
import { ErrorState, Loading } from "@sports/ui/states";
import { CHART_TYPES, decodeSpec, defaultSpec, encodeSpec, metricIndex, sanitizePool, type ChartSpec, type ColorBy, type SportData, type SportPack } from "../index";
import { Chart } from "./charts";
import { MetricSelect, PlayerPicker, PoolControls } from "./controls";
import { exportSvg, useChartTheme } from "./theme";

const QUAD_LABELS = ["Top left", "Top right", "Bottom left", "Bottom right"];

export default function Builder<R>({ pack, data, keep }: { pack: SportPack<R>; data: SportData<R>; /** Extra URL params to preserve (e.g. sport=tennis on the lab page). */ keep?: Record<string, string> }) {
  const { rows, lists, ready, error, retry } = data;
  const METRIC = metricIndex(pack);
  const theme = useChartTheme();
  const [s, setS] = useState<ChartSpec>(() => defaultSpec(pack));
  const [hydrated, setHydrated] = useState(false);
  const [copied, setCopied] = useState(false);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => { setS(decodeSpec(pack, window.location.search.slice(1))); setHydrated(true); }, [pack]);
  useEffect(() => {
    if (!hydrated) return;
    const p = new URLSearchParams(encodeSpec(pack, s));
    for (const [k, v] of Object.entries(keep ?? {})) p.set(k, v);
    window.history.replaceState(null, "", `?${p}`);
  }, [pack, s, hydrated, keep]);

  useEffect(() => {
    if (ready && hydrated) setS(prev => { const pool = sanitizePool(pack, prev.pool, lists); return pool === prev.pool ? prev : { ...prev, pool }; });
  }, [pack, ready, hydrated, lists]);

  const set = (patch: Partial<ChartSpec>) => setS(prev => ({ ...prev, ...patch }));
  const name = useMemo(() => `${pack.filePrefix}-${(s.title || `${s.type}-${s.x}${s.type === "scatter" ? `-${s.y}` : ""}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`, [pack, s]);

  if (error) return <ErrorState message={error} retry={retry} />;
  if (!ready || !hydrated) return <Loading label={`Loading ${pack.nouns.players}`} />;

  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked: the URL bar still has the link */ }
  };
  const axis = s.type === "scatter" || s.type === "bars" || s.type === "swarm";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1" aria-label="Chart settings">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="label mb-1.5">Chart type</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {CHART_TYPES.map(ct => (
              <button key={ct.key} type="button" aria-pressed={s.type === ct.key} onClick={() => set({ type: ct.key })}
                className={`press rounded-xl border px-3 py-2 text-left ${s.type === ct.key ? "border-bulb bg-deck2" : "border-line bg-deck hover:border-line2"}`}>
                <span className="font-display block text-[17px] font-extrabold uppercase leading-tight">{ct.label}</span>
                <span className="block text-[11.5px] leading-snug text-mute">{ct.hint(pack.nouns)}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="deck-flat flex flex-col gap-3 p-3">
          <h2 className="font-display text-lg font-extrabold uppercase">Stats</h2>
          {axis && (
            <div className={s.type === "scatter" ? "grid grid-cols-[1fr_auto_1fr] items-end gap-1.5" : ""}>
              <MetricSelect pack={pack} label={s.type === "scatter" ? "Across (x)" : "Stat"} value={s.x} onChange={x => set({ x })} />
              {s.type === "scatter" && <>
                <button type="button" className="btn mb-0.5 !h-10 !w-10 !p-0" onClick={() => set({ x: s.y, y: s.x, quads: [s.quads[3], s.quads[1], s.quads[2], s.quads[0]] })} aria-label="Swap axes" title="Swap axes"><ArrowLeftRight size={15} /></button>
                <MetricSelect pack={pack} label="Up (y)" value={s.y} onChange={y => set({ y })} />
              </>}
            </div>
          )}
          {axis && <p className="text-[12.5px] leading-snug text-dim">{METRIC[s.x]?.desc}{s.type === "scatter" && METRIC[s.y] ? ` ${METRIC[s.y].desc}` : ""}</p>}
          {s.type === "scatter" && <MetricSelect pack={pack} label="Dot size" value={s.size} onChange={size => set({ size })} allowNone="Same size" />}
          {s.type === "bars" && (
            <label className="flex flex-col gap-1">
              <span className="label">Shown: {s.n}</span>
              <input type="range" min={5} max={40} value={s.n} onChange={e => set({ n: Number(e.target.value) })} className="accent-[rgb(var(--bulb-rgb))]" />
            </label>
          )}
          {s.type === "swarm" && pack.positions.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.split} onChange={e => set({ split: e.target.checked })} className="accent-[rgb(var(--bulb-rgb))]" /> Split by position
            </label>
          )}
          {s.type === "profile" && (
            <fieldset>
              <legend className="label mb-1.5">Stats to compare ({s.metrics.length}/14)</legend>
              <div className="flex flex-col gap-2">
                {pack.metricGroups.map(g => (
                  <div key={g}>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-dim">{g}</div>
                    <div className="flex flex-wrap gap-1">
                      {pack.metrics.filter(m => m.group === g).map(m => {
                        const on = s.metrics.includes(m.key);
                        return <button key={m.key} type="button" className="chip !px-2.5 !py-1 text-[12.5px]" aria-pressed={on} title={m.desc}
                          onClick={() => set({ metrics: on ? s.metrics.filter(k => k !== m.key) : s.metrics.length < 14 ? [...s.metrics, m.key] : s.metrics })}>{m.short}</button>;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          )}
        </div>

        <div className="deck-flat flex flex-col gap-3 p-3">
          <h2 className="font-display text-lg font-extrabold uppercase">{pack.nouns.players}</h2>
          <PlayerPicker pack={pack} rows={rows} ids={s.ids} setIds={ids => set({ ids })} max={s.type === "profile" ? 4 : 12} label={s.type === "profile" ? "Compare" : "Highlight"} />
          <div className="grid grid-cols-2 gap-2"><PoolControls pack={pack} pool={s.pool} set={pool => set({ pool })} lists={lists} /></div>
        </div>

        {s.type !== "profile" && (
          <div className="deck-flat flex flex-col gap-3 p-3">
            <h2 className="font-display text-lg font-extrabold uppercase">Look</h2>
            {s.type !== "bars" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="label">Color dots by</span>
                  <select className="field" value={s.color} onChange={e => set({ color: e.target.value as ColorBy })}>
                    <option value="team">Team colors</option>
                    {pack.positions.length > 0 && <option value="pos">Position</option>}
                    {pack.groups && <option value="group">Light up a {pack.groups.label.toLowerCase()}</option>}
                  </select>
                </label>
                {s.color === "group" && pack.groups ? (
                  <label className="flex flex-col gap-1">
                    <span className="label">{pack.groups.label}</span>
                    <select className="field" value={s.hiGroup} onChange={e => set({ hiGroup: e.target.value })}>
                      <option value="">Pick one</option>
                      {(lists[pack.groups.list] ?? []).map(([slug, n]) => <option key={slug} value={slug}>{n}</option>)}
                    </select>
                  </label>
                ) : <span />}
              </div>
            )}
            {s.type !== "bars" && (
              <label className="flex flex-col gap-1">
                <span className="label">Label the top {s.labels} standouts</span>
                <input type="range" min={0} max={40} value={s.labels} onChange={e => set({ labels: Number(e.target.value) })} className="accent-[rgb(var(--bulb-rgb))]" />
              </label>
            )}
            {s.type === "scatter" && (
              <fieldset>
                <legend className="label mb-1">Quadrant captions</legend>
                <div className="grid grid-cols-2 gap-1.5">
                  {QUAD_LABELS.map((ql, i) => (
                    <input key={ql} className="field !px-2.5 !py-1.5 text-sm" placeholder={ql} maxLength={32} value={s.quads[i]} aria-label={`${ql} caption`}
                      onChange={e => { const q = [...s.quads] as ChartSpec["quads"]; q[i] = e.target.value; set({ quads: q }); }} />
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        )}
        <label className="flex flex-col gap-1">
          <span className="label">Title</span>
          <input className="field" placeholder="Leave blank for an automatic title" maxLength={90} value={s.title} onChange={e => set({ title: e.target.value })} />
        </label>
      </aside>

      <section aria-label="Your chart" className="min-w-0">
        <div className="mb-3 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={copy}>{copied ? <Check size={15} aria-hidden /> : <Link2 size={15} aria-hidden />}{copied ? "Link copied" : "Copy link"}</button>
          <button className="btn" onClick={() => svg.current && exportSvg(svg.current, name, "png", theme.deck)}><Download size={15} aria-hidden /> PNG</button>
          <button className="btn" onClick={() => svg.current && exportSvg(svg.current, name, "svg", theme.deck)}><Download size={15} aria-hidden /> SVG</button>
          <button className="btn ml-auto" onClick={() => setS({ ...defaultSpec(pack), type: s.type })}><RotateCcw size={15} aria-hidden /> Reset</button>
        </div>
        <div className="deck p-2 sm:p-4">
          <Chart ref={svg} pack={pack} spec={s} rows={rows} theme={theme} lists={lists} />
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-dim">
          Hover or tap a dot for the numbers{rows.some(r => pack.entity.href(r)) ? <>; click to open the {pack.nouns.player}</> : null}. Standouts are the {pack.nouns.players} furthest from the medians toward the top right.
          Rates need a minimum sample before a {pack.nouns.player} appears, so tiny samples don&apos;t pass as outliers.
        </p>
      </section>
    </div>
  );
}
