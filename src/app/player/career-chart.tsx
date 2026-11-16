"use client";
// Career progression: four small multiples (PTS, REB, AST, TS%) by season, as inline SVG.
// Fed by the same season lines the Career table shows. Renders nothing with fewer than two seasons of data.
import { fmt } from "@sports/ui/format";

export type ChartSeason = {
  season: number; // year the season ends (2027 = 2026–27)
  ppg: number | null; rpg: number | null; apg: number | null; ts: number | null;
  current?: boolean;
};

type Key = "ppg" | "rpg" | "apg" | "ts";
const METRICS: { key: Key; label: string; name: string }[] = [
  { key: "ppg", label: "PTS", name: "Points per game" },
  { key: "rpg", label: "REB", name: "Rebounds per game" },
  { key: "apg", label: "AST", name: "Assists per game" },
  { key: "ts", label: "TS%", name: "True shooting %" },
];

const W = 160, H = 96;
const PAD_X = 14, PLOT_TOP = 24, PLOT_BOTTOM = 70, LABEL_Y = 90;

/** "22–23" for the season that ends in 2023. */
const shortLabel = (s: number) => `${String(s - 1).slice(2)}–${String(s).slice(2)}`;
const hasData = (s: ChartSeason) => METRICS.some(m => s[m.key] !== null);

function Mini({ m, seasons }: { m: (typeof METRICS)[number]; seasons: ChartSeason[] }) {
  const n = seasons.length;
  const vals = seasons.map(s => s[m.key]);
  const known = vals.filter((v): v is number => v !== null);
  if (!known.length) return null;

  // Shared y-scale per chart; widen a flat series so it sits mid-plot.
  let lo = Math.min(...known), hi = Math.max(...known);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;

  const x = (i: number) => (n === 1 ? W / 2 : PAD_X + (i * (W - 2 * PAD_X)) / (n - 1));
  const y = (v: number) => PLOT_TOP + (1 - (v - lo) / (hi - lo)) * (PLOT_BOTTOM - PLOT_TOP);

  const pts = vals.map((v, i) => (v === null ? null : { x: x(i), y: y(v), v, i })).filter((p): p is { x: number; y: number; v: number; i: number } => p !== null);
  const latest = pts[pts.length - 1];
  const summary = `${m.name} by season: ${pts.map(p => `${shortLabel(seasons[p.i].season)} ${fmt(p.v, 1)}`).join(", ")}`;

  // Label every season when there is room; with many seasons, keep the first, the last and every other one.
  const showLabel = (i: number) => n <= 5 || i === n - 1 || (i % 2 === 0 && n - 1 - i >= 2);

  return (
    <figure className="min-w-0 rounded-xl border border-line p-2.5">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold tracking-[0.04em] text-mute" title={m.name}>{m.label}</span>
        {latest && <span className="font-display text-base font-extrabold leading-none tnum">{fmt(latest.v, 1)}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="mt-1 block h-auto w-full overflow-visible">
        {pts.length > 1 && (
          <polyline points={pts.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--dim)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {pts.map(p => {
          const cur = !!seasons[p.i].current;
          return (
            <g key={p.i}>
              <circle cx={p.x} cy={p.y} r={cur ? 4 : 2.5} fill={cur ? "var(--bulb)" : "var(--mute)"} stroke={cur ? "var(--ink)" : "none"} strokeWidth={cur ? 1 : 0}>
                <title>{`${shortLabel(seasons[p.i].season)}${cur ? " (this season)" : ""}: ${fmt(p.v, 1)}`}</title>
              </circle>
            </g>
          );
        })}
        {seasons.map((s, i) => showLabel(i) && (
          <text key={s.season} x={x(i)} y={LABEL_Y} textAnchor="middle" fontSize={9} fontWeight={s.current ? 700 : 400}
            fill={s.current ? "var(--ink)" : "var(--mute)"}>{shortLabel(s.season)}</text>
        ))}
      </svg>
    </figure>
  );
}

export default function CareerChart({ seasons }: { seasons: ChartSeason[] }) {
  const pts = seasons.filter(hasData);
  if (pts.length < 2) return null;
  return (
    <div role="group" className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Career progression by season">
      {METRICS.map(m => <Mini key={m.key} m={m} seasons={pts} />)}
    </div>
  );
}
