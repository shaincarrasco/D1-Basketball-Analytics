"use client";
// Chart gallery for any sport pack: curated standout charts, all re-filterable at once
// and each one remixable in the builder.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, SlidersHorizontal } from "lucide-react";
import { ErrorState, Loading } from "@sports/ui/states";
import { encodeSpec, resolvePreset, withDefaults, type Lists, type Pool, type Preset, type SportData, type SportPack } from "../index";
import { Chart } from "./charts";
import { PoolControls } from "./controls";
import { exportSvg, useChartTheme, type ChartTheme } from "./theme";

/** Where the builder and rankings live. May already carry a query (?sport=tennis). */
export type KitRoutes = { builder: string; rankings: string };
/** Append a query string to a route that may already have one. */
export const withQuery = (base: string, qs: string) => (qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base);

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

function Card<R>({ pack, preset, rows, theme, lists, filter, routes }: { pack: SportPack<R>; preset: Preset; rows: R[]; theme: ChartTheme; lists: Lists; filter: Pool; routes: KitRoutes }) {
  const svg = useRef<SVGSVGElement>(null);
  const s = useMemo(() => resolvePreset(pack, preset, rows, filter), [pack, preset, filter, rows]);
  return (
    <article className="deck overflow-hidden" aria-labelledby={`c-${preset.id}`}>
      <div className="p-2 sm:p-3">
        <Lazy minH={s.type === "bars" ? 420 : 460}>
          <Chart ref={svg} pack={pack} spec={s} rows={rows} theme={theme} lists={lists} compact />
        </Lazy>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <p id={`c-${preset.id}`} className="min-w-0 flex-1 text-[13.5px] leading-snug text-mute">{preset.blurb}</p>
        <button className="btn !px-3 !py-1.5 text-[13px]" onClick={() => svg.current && exportSvg(svg.current, `${pack.filePrefix}-${preset.id}`, "png", theme.deck)} aria-label={`Download ${preset.id} as PNG`}>
          <Download size={14} aria-hidden /> PNG
        </button>
        <Link className="btn btn-primary !px-3 !py-1.5 text-[13px]" href={withQuery(routes.builder, encodeSpec(pack, s))}>
          <SlidersHorizontal size={14} aria-hidden /> Remix
        </Link>
      </div>
    </article>
  );
}

export default function Gallery<R>({ pack, data, routes }: { pack: SportPack<R>; data: SportData<R>; routes: KitRoutes }) {
  const { rows, lists, ready, error, retry } = data;
  const theme = useChartTheme();
  // Only the compact filters the viewer has touched override each preset's own pool.
  const [touched, setTouched] = useState<Pool>({});
  const [section, setSection] = useState<string>("All");
  const shownPool = useMemo(() => ({ ...withDefaults(pack), ...touched }), [pack, touched]);

  if (error) return <ErrorState message={error} retry={retry} />;
  if (!ready) return <Loading label={`Loading ${pack.nouns.players}`} />;
  const sections = pack.charts.sections;
  const shown = pack.charts.presets.filter(p => section === "All" || p.section === section);
  const compactCount = pack.filters.filter(f => f.compact).length;

  return (
    <>
      <div className="sticky top-14 z-20 -mx-4 mb-5 border-b border-line bg-night/90 px-4 pb-3 pt-2 backdrop-blur-xl sm:mx-0 sm:rounded-xl sm:border sm:px-3">
        <div className="no-scrollbar -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Chart topic">
          {["All", ...sections].map(s => <button key={s} className="chip" aria-pressed={section === s} onClick={() => setSection(s)}>{s}</button>)}
        </div>
        {compactCount > 0 && (
          <div className="grid gap-2 sm:max-w-xl" style={{ gridTemplateColumns: `repeat(${Math.min(compactCount, 3)}, minmax(0, 1fr))` }}>
            <PoolControls pack={pack} compact lists={lists} pool={shownPool} set={p => {
              const next: Pool = { ...touched };
              for (const f of pack.filters) if (f.compact && p[f.key] !== shownPool[f.key]) next[f.key] = p[f.key];
              setTouched(next);
            }} />
          </div>
        )}
      </div>
      {(section === "All" ? sections : [section]).map(sec => {
        const list = shown.filter(p => p.section === sec);
        if (!list.length) return null;
        return (
          <section key={sec} className="mb-10" aria-labelledby={`sec-${sec}`}>
            <h2 id={`sec-${sec}`} className="h-section font-display mb-3 uppercase">{sec}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {list.map(p => <Card key={p.id} pack={pack} preset={p} rows={rows} theme={theme} lists={lists} filter={touched} routes={routes} />)}
            </div>
          </section>
        );
      })}
    </>
  );
}
