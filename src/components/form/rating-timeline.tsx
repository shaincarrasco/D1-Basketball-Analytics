// DHR over the season: one point per ratings refit (preseason first). Server-rendered.
// The line is an SVG stretched to the box; labels and points are HTML so they stay crisp
// and readable at any width.
import { dayLabel, signed } from "@sports/ui/format";
import { addDays, type HistoryPoint } from "@/lib/form";

const DAY = 864e5;
const dayNum = (d: string) => Date.parse(`${d}T12:00:00Z`) / DAY;

export default function RatingTimeline({ points, color, total }: { points: HistoryPoint[]; color?: string | null; total: number }) {
  if (points.length < 2) return <p className="text-sm text-mute">The rating timeline starts after the first refit with this team&apos;s games.</p>;
  const firstDay = points.find(p => p.through)?.through ?? null;
  // Preseason sits two days before the first game day.
  const xs = points.map(p => dayNum(p.through ?? (firstDay ? addDays(firstDay, -2) : "2026-11-01")));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ems = points.map(p => p.em);
  const pad = Math.max(2, (Math.max(...ems) - Math.min(...ems)) * 0.15);
  const lo = Math.min(...ems) - pad, hi = Math.max(...ems) + pad;
  const X = (v: number) => (x1 > x0 ? ((v - x0) / (x1 - x0)) * 100 : 50);
  const Y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const line = points.map((p, i) => `${i ? "L" : "M"}${X(xs[i]).toFixed(2)},${Y(p.em).toFixed(2)}`).join(" ");
  const stroke = color ?? "var(--off)";
  const first = points[0], last = points.at(-1)!;
  const change = last.em - first.em;
  const label = (p: HistoryPoint) => (p.through ? dayLabel(p.through, { month: "short", day: "numeric" }) : "Preseason");
  const ticks = [...new Set([lo + pad, (lo + hi) / 2, hi - pad].map(v => Math.round(v)))];

  return (
    <figure>
      <figcaption className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="text-mute">{label(first)} <b className="text-ink tnum">{signed(first.em, 1)}</b> <span className="text-dim">(No. {first.rank})</span></span>
        <span className="text-dim" aria-hidden>→</span>
        <span className="text-mute">Now <b className="text-ink tnum">{signed(last.em, 1)}</b> <span className="text-dim">(No. {last.rank} of {total})</span></span>
        <span className={`ml-auto font-semibold tnum ${change >= 0 ? "text-win" : "text-loss"}`}>{signed(change, 1)} since {first.through ? label(first) : "preseason"}</span>
      </figcaption>
      <div className="relative ml-8 h-[150px]" role="img" aria-label={`DHR rating by date: ${points.map(p => `${label(p)} ${signed(p.em, 1)} (No. ${p.rank})`).join(", ")}`}>
        {ticks.map(t => (
          <div key={t} className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: `${Y(t)}%` }} aria-hidden>
            <span className="absolute -left-8 -top-2 w-6 text-right text-[10.5px] text-dim tnum">{t > 0 ? "+" : ""}{t}</span>
          </div>
        ))}
        {lo < 0 && hi > 0 && <div className="absolute inset-x-0 border-t border-line2" style={{ top: `${Y(0)}%` }} aria-hidden />}
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path d={line} fill="none" stroke={stroke} strokeWidth="2.25" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        {points.map((p, i) => (
          <span key={i} title={`${label(p)}: DHR ${signed(p.em, 1)}, No. ${p.rank}`} aria-hidden
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-deck"
            style={{ left: `${X(xs[i])}%`, top: `${Y(p.em)}%`, background: stroke }} />
        ))}
      </div>
      <div className="ml-8 mt-1.5 flex justify-between text-[11px] text-dim" aria-hidden>
        <span>{label(first)}</span>
        <span>{label(last)}</span>
      </div>
    </figure>
  );
}
