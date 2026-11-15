// "Heat check": a tiny sparkline of a player's recent points against his season average.
import { fmt } from "@sports/ui/format";

const MAX_POINTS = 8;

/** Hot / Cold tag: last-3 mean well above or below the season average (needs 3+ games). */
export function heatTag(values: number[], avg: number | null): { label: "Hot" | "Cold" | null; tone: "win" | "loss" | null } {
  if (avg === null || !Number.isFinite(avg) || values.length < 3) return { label: null, tone: null };
  const last3 = values.slice(-3);
  const mean = last3.reduce((s, v) => s + v, 0) / 3;
  const gap = Math.max(4, 0.3 * avg);
  if (mean >= avg + gap) return { label: "Hot", tone: "win" };
  if (mean <= avg - gap) return { label: "Cold", tone: "loss" };
  return { label: null, tone: null };
}

/** Inline SVG sparkline of the last 8 values, a dashed line at the average, and a dot on the last value. */
export function Sparkline({ values, avg, width = 64, height = 20, className }: {
  values: number[]; avg: number | null; width?: number; height?: number; className?: string;
}) {
  const pts = values.slice(-MAX_POINTS).filter(v => Number.isFinite(v));
  const pad = 2;
  const hasAvg = avg !== null && Number.isFinite(avg);
  const scale = [...pts, ...(hasAvg ? [avg as number] : [])];
  const lo = scale.length ? Math.min(...scale) : 0;
  const hi = scale.length ? Math.max(...scale) : 1;
  const span = hi - lo || 1;
  const innerW = width - pad * 2, innerH = height - pad * 2;
  const x = (i: number) => (pts.length > 1 ? pad + (i / (pts.length - 1)) * innerW : pad + innerW / 2);
  const y = (v: number) => pad + (1 - (v - lo) / span) * innerH;
  const coords = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = pts.length ? { cx: x(pts.length - 1), cy: y(pts[pts.length - 1]) } : null;
  const avgY = hasAvg ? y(avg as number) : null;
  const summary = `Last ${pts.length} ${pts.length === 1 ? "game" : "games"}: ${pts.map(v => fmt(v, 0)).join(", ") || "none"}${hasAvg ? `; season average ${fmt(avg, 1)}` : ""}`;

  return (
    <span className={`inline-flex items-center ${className ?? ""}`}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false" className="overflow-visible">
        {avgY !== null && (
          <line x1={pad} x2={width - pad} y1={avgY} y2={avgY} stroke="currentColor" strokeWidth={1} strokeDasharray="2 2" opacity={0.5} />
        )}
        {pts.length > 1 && <polyline points={coords} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />}
        {last && <circle cx={last.cx} cy={last.cy} r={2} fill="currentColor" />}
      </svg>
      <span className="sr-only">{summary}</span>
    </span>
  );
}
