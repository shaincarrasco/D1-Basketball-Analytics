"use client";
// The Model page's two charts, drawn at the container's real pixel width so labels stay
// readable on a phone. Colours are theme variables only: the model is the accent (bulb),
// Elo alone is a dashed neutral, so the two never rely on colour alone.
import { useEffect, useRef, useState } from "react";
import type { Model } from "@/lib/deuce";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const pc = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
const monthYear = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const longDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const splitName = (n: string, i: number) => (/^split\s*\d+$/i.test(n) ? `Split ${i + 1}` : n);

export function Legend({ items }: { items: { label: string; dashed?: boolean; dot?: boolean; faint?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-mute">
      {items.map(it => (
        <li key={it.label} className="flex items-center gap-2">
          <svg width="22" height="10" aria-hidden>
            {it.dot ? <circle cx="11" cy="5" r="4" fill="var(--bulb)" />
              : <line x1="1" x2="21" y1="5" y2="5" stroke={it.dashed ? "var(--ink)" : "var(--bulb)"} strokeOpacity={it.dashed ? 0.7 : it.faint ? 0.45 : 1} strokeWidth={it.faint ? 1.25 : it.dashed ? 2 : 3} strokeDasharray={it.dashed ? "4 3" : undefined} strokeLinecap="round" />}
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/** Share of the last 100 matches picked right, over time, with the walk-forward splits marked. */
export function RollingChart({ rolling, splits }: { rolling: Model["rolling"]; splits: Model["splits"] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pts = rolling.filter(r => r.accuracy_100 != null).map(r => ({ t: Date.parse(`${r.date}T12:00:00Z`), d: r.date, v: r.accuracy_100 as number }));
  const H = W < 560 ? 240 : 300, L = 40, R = 12, T = 34, B = 26;
  if (!pts.length) return <div ref={ref}><p className="text-mute">No rolling accuracy yet.</p></div>;
  const t0 = Math.min(pts[0].t, ...splits.map(s => Date.parse(`${s.start}T00:00:00Z`)));
  const t1 = Math.max(pts[pts.length - 1].t, ...splits.map(s => Date.parse(`${s.end}T23:59:00Z`)));
  const vals = [...pts.map(p => p.v), ...splits.flatMap(s => [s.baseline_elo_accuracy, s.accuracy]).filter((v): v is number => v != null)];
  const lo = Math.floor(Math.min(...vals) * 20) / 20, hi = Math.ceil(Math.max(...vals) * 20) / 20;
  const x = (t: number) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / Math.max(0.01, hi - lo)) * (H - T - B);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += 0.05) ticks.push(Number(v.toFixed(2)));
  // Break the line over the off-season (no matches for 3+ weeks) instead of drawing a straight bridge.
  const line = pts.map((p, i) => `${i && p.t - pts[i - 1].t < 21 * 864e5 ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join("");
  const h = hover !== null ? pts[hover] : null;
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - r.left - L) / (W - L - R)) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].t - t) < Math.abs(pts[best].t - t)) best = i;
    setHover(best);
  };
  return (
    <div ref={ref} className="relative">
      {W > 0 && (
        <svg width={W} height={H} className="block select-none" role="img" onPointerMove={onMove} onPointerLeave={() => setHover(null)}
          aria-label={`Share of the last 100 matches picked right, from ${longDay(pts[0].d)} to ${longDay(pts[pts.length - 1].d)}: between ${pc(Math.min(...pts.map(p => p.v)))} and ${pc(Math.max(...pts.map(p => p.v)))}.`}>
          {splits.map((s, i) => {
            const a = x(Date.parse(`${s.start}T00:00:00Z`)), b = x(Date.parse(`${s.end}T23:59:00Z`));
            return (
              <g key={s.name}>
                {i % 2 === 1 && <rect x={a} y={T - 22} width={b - a} height={H - T - B + 22} fill="rgb(var(--ink-rgb) / .035)" />}
                {i > 0 && <line x1={a} x2={a} y1={T - 22} y2={H - B} stroke="var(--line-2)" strokeWidth="1" />}
                <text x={a + 6} y={T - 8} className="fill-mute" fontSize="12" fontWeight="600">{splitName(s.name, i)}</text>
                {b - a > 150 && <text x={b - 6} y={T - 8} textAnchor="end" className="fill-dim" fontSize="11">{monthYear(s.start)} to {monthYear(s.end)}</text>}
              </g>
            );
          })}
          {ticks.map(v => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
              <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-dim" fontSize="11">{pc(v)}</text>
            </g>
          ))}
          <path d={line} fill="none" stroke="var(--bulb)" strokeOpacity=".45" strokeWidth="1.25" strokeLinejoin="round" />
          {splits.map(s => {
            const a = x(Date.parse(`${s.start}T00:00:00Z`)) + 3, b = x(Date.parse(`${s.end}T23:59:00Z`)) - 3;
            return (
              <g key={`avg-${s.name}`}>
                {s.baseline_elo_accuracy != null && <line x1={a} x2={b} y1={y(s.baseline_elo_accuracy)} y2={y(s.baseline_elo_accuracy)} stroke="var(--ink)" strokeOpacity=".7" strokeWidth="2" strokeDasharray="5 4" />}
                {s.accuracy != null && <>
                  <line x1={a} x2={b} y1={y(s.accuracy)} y2={y(s.accuracy)} stroke="var(--bulb)" strokeWidth="3" strokeLinecap="round" />
                  {b - a > 70 && <text x={b} y={y(s.accuracy) - 7} textAnchor="end" className="fill-ink" fontSize="12" fontWeight="700">{pc(s.accuracy, 1)}</text>}
                </>}
              </g>
            );
          })}
          {h && <>
            <line x1={x(h.t)} x2={x(h.t)} y1={T} y2={H - B} stroke="var(--ink)" strokeOpacity=".35" strokeWidth="1" />
            <circle cx={x(h.t)} cy={y(h.v)} r="4.5" fill="var(--bulb)" stroke="var(--deck)" strokeWidth="2" />
          </>}
          <text x={L} y={H - 6} className="fill-dim" fontSize="11">{monthYear(pts[0].d)}</text>
          <text x={W - R} y={H - 6} textAnchor="end" className="fill-dim" fontSize="11">{monthYear(pts[pts.length - 1].d)}</text>
        </svg>
      )}
      {h && (
        <div className="pointer-events-none absolute top-8 z-10 w-48 rounded-xl border border-line2 bg-deck2 p-2.5 text-[13px] shadow-xl"
          style={{ left: Math.min(Math.max(0, x(h.t) - 96), W - 192) }}>
          <b className="block text-ink">{longDay(h.d)}</b>
          <span className="text-mute">Last 100 matches: <b className="text-ink">{pc(h.v)}</b> picked right</span>
        </div>
      )}
    </div>
  );
}

/** Calibration: when the model gave its favourite X%, how often did the favourite win? */
export function CalibrationChart({ bins }: { bins: Model["calibration"] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const S = Math.min(W, 440), L = 44, R = 14, T = 12, B = 40;
  const lo = 0.5, hi = 1;
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * (S - L - R);
  const y = (v: number) => T + (1 - (Math.max(lo - 0.05, v) - lo) / (hi - lo)) * (S - T - B);
  const maxN = Math.max(1, ...bins.map(b => b.n));
  const r = (n: number) => 4 + 5 * Math.sqrt(n / maxN);
  const ticks = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const h = hover !== null ? bins[hover] : null;
  return (
    <div ref={ref} className="relative mx-auto" style={{ maxWidth: 440 }}>
      {S > 0 && (
        <svg width={S} height={S} className="block select-none" role="img" aria-label="Calibration: predicted chance for the favourite against how often the favourite won. Points near the diagonal mean the percentages can be taken at face value.">
          {ticks.map(v => (
            <g key={v}>
              <line x1={x(v)} x2={x(v)} y1={T} y2={S - B} stroke="var(--line)" />
              <line x1={L} x2={S - R} y1={y(v)} y2={y(v)} stroke="var(--line)" />
              <text x={x(v)} y={S - B + 16} textAnchor="middle" className="fill-dim" fontSize="11">{pc(v)}</text>
              <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-dim" fontSize="11">{pc(v)}</text>
            </g>
          ))}
          <text x={(L + S - R) / 2} y={S - 4} textAnchor="middle" className="fill-mute" fontSize="12">Model&apos;s chance for the favourite</text>
          <line x1={x(lo)} y1={y(lo)} x2={x(hi)} y2={y(hi)} stroke="var(--ink)" strokeOpacity=".7" strokeWidth="2" strokeDasharray="5 4" />
          <path d={bins.map((b, i) => `${i ? "L" : "M"}${x(b.pred).toFixed(1)} ${y(b.actual).toFixed(1)}`).join("")} fill="none" stroke="var(--bulb)" strokeWidth="2" strokeOpacity=".6" />
          {bins.map((b, i) => (
            <g key={b.bin} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <circle cx={x(b.pred)} cy={y(b.actual)} r={14} fill="transparent" />
              <circle cx={x(b.pred)} cy={y(b.actual)} r={r(b.n)} fill="var(--bulb)" stroke="var(--deck)" strokeWidth="2" />
            </g>
          ))}
        </svg>
      )}
      {h && (
        <div className="pointer-events-none absolute z-10 w-52 rounded-xl border border-line2 bg-deck2 p-2.5 text-[13px] shadow-xl"
          style={{ left: Math.min(Math.max(0, x(h.pred) - 104), Math.max(0, S - 208)), top: Math.max(0, y(h.actual) - 86) }}>
          <span className="block text-mute">Model said <b className="text-ink">{pc(h.pred)}</b></span>
          <span className="block text-mute">Favourite won <b className="text-ink">{pc(h.actual)}</b></span>
          <span className="block text-dim">{h.n.toLocaleString("en-US")} matches</span>
        </div>
      )}
    </div>
  );
}
