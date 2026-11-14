"use client";
// Chart gallery: curated standout charts, all re-filterable at once and each one remixable.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, SlidersHorizontal } from "lucide-react";
import { ErrorState, Loading } from "@/components/states";
import { CHARTS } from "@/components/charts/player-charts";
import { PRESETS, SECTIONS, type Preset } from "@/components/charts/presets";
import { encodeSpec, type ChartSpec } from "@/components/charts/spec";
import { exportSvg, useChartTheme, type ChartTheme } from "@/components/charts/theme";
import { PoolControls } from "@/components/charts/controls";
import { inPool, METRIC, usePlayers, val, type PoolFilter } from "@/lib/player-metrics";
import type { PlayerRow } from "@/app/players/player-stats";

/** Renders children once they scroll near the viewport (keeps the gallery light). */
function Lazy({ children, minH }: { children: React.ReactNode; minH: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || on) return;
    const io = new IntersectionObserver(e => { if (e.some(x => x.isIntersecting)) { setOn(true); io.disconnect(); } }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  return <div ref={ref} style={{ minHeight: on ? undefined : minH }}>{on ? children : null}</div>;
}

function Card({ preset, rows, theme, confs, filter }: { preset: Preset; rows: PlayerRow[]; theme: ChartTheme; confs: [string, string][]; filter: Partial<PoolFilter> }) {
  const svg = useRef<SVGSVGElement>(null);
  const s: ChartSpec = useMemo(() => {
    const pool = { ...preset.spec.pool, ...filter };
    const base = { ...preset.spec, pool };
    if (preset.topBy) {
      const m = METRIC[preset.topBy];
      const ids = rows.filter(r => inPool(pool, r)).map(r => ({ r, v: val(m, r) })).filter(p => p.v !== null).sort((a, b) => (b.v as number) - (a.v as number)).slice(0, 3).map(p => p.r.id);
      return { ...base, ids };
    }
    return base;
  }, [preset, filter, rows]);
  const Chart = CHARTS[s.type];
  return (
    <article className="deck overflow-hidden" aria-labelledby={`c-${preset.id}`}>
      <div className="p-2 sm:p-3">
        <Lazy minH={s.type === "bars" ? 420 : 460}>
          <Chart ref={svg} spec={s} rows={rows} theme={theme} confs={confs} compact />
        </Lazy>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <p id={`c-${preset.id}`} className="min-w-0 flex-1 text-[13.5px] leading-snug text-mute">{preset.blurb}</p>
        <button className="btn !px-3 !py-1.5 text-[13px]" onClick={() => svg.current && exportSvg(svg.current, `d1hoops-${preset.id}`, "png", theme.deck)} aria-label={`Download ${preset.id} as PNG`}>
          <Download size={14} aria-hidden /> PNG
        </button>
        <Link className="btn btn-primary !px-3 !py-1.5 text-[13px]" href={`/charts/build/?${encodeSpec(s)}`}>
          <SlidersHorizontal size={14} aria-hidden /> Remix
        </Link>
      </div>
    </article>
  );
}

export default function Gallery() {
  const { rows, confs, ready, error, retry } = usePlayers();
  const theme = useChartTheme();
  const [conf, setConf] = useState("all");
  const [pos, setPos] = useState<PoolFilter["pos"]>("all");
  const [minMin, setMinMin] = useState<number | null>(null);
  const [section, setSection] = useState<string>("All");
  const filter = useMemo(() => ({ conf, pos, ...(minMin !== null ? { minMin } : {}) }), [conf, pos, minMin]);

  if (error) return <ErrorState message={error} retry={retry} />;
  if (!ready) return <Loading label="Loading players" />;
  const shown = PRESETS.filter(p => section === "All" || p.section === section);
  const pool: PoolFilter = { conf, pos, minMin: minMin ?? 15, minG: 2, stars: "any" };

  return (
    <>
      <div className="sticky top-14 z-20 -mx-4 mb-5 border-b border-line bg-night/90 px-4 pb-3 pt-2 backdrop-blur-xl sm:mx-0 sm:rounded-xl sm:border sm:px-3">
        <div className="no-scrollbar -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Chart topic">
          {["All", ...SECTIONS].map(s => <button key={s} className="chip" aria-pressed={section === s} onClick={() => setSection(s)}>{s}</button>)}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:max-w-xl">
          <PoolControls compact confs={confs} pool={pool} set={p => { setConf(p.conf); setPos(p.pos); setMinMin(p.minMin); }} />
        </div>
      </div>
      {(section === "All" ? SECTIONS : [section]).map(sec => {
        const list = shown.filter(p => p.section === sec);
        if (!list.length) return null;
        return (
          <section key={sec} className="mb-10" aria-labelledby={`sec-${sec}`}>
            <h2 id={`sec-${sec}`} className="h-section font-display mb-3 uppercase">{sec}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {list.map(p => <Card key={p.id} preset={p} rows={rows} theme={theme} confs={confs} filter={filter} />)}
            </div>
          </section>
        );
      })}
    </>
  );
}
