// Normal distribution of the final margin. Team A wins are on the left (cyan), team B wins on the right (orange),
// matching the win-probability bar above it.
"use client";
import { useEffect, useId, useRef, useState } from "react";

const Z80 = 1.2816;

export default function MarginChart({ margin, sigma, aShort, bShort }: { margin: number; sigma: number; aShort: string; bShort: string }) {
  const clipId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 500 ? 150 : 190, padX = 16, top = 14, base = H - 42;
  // x is "B margin" so that A-wins sit on the left.
  const center = -margin;
  const span = Math.max(30, Math.ceil((Math.abs(center) + 3.2 * sigma) / 10) * 10);
  const xs = (v: number) => padX + ((v + span) / (2 * span)) * (W - 2 * padX);
  const pdf = (v: number) => Math.exp(-0.5 * ((v - center) / sigma) ** 2);
  const ys = (d: number) => base - d * (base - top);

  const N = 160;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) { const v = -span + (2 * span * i) / N; pts.push([xs(v), ys(pdf(v))]); }
  const curve = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const area = `${curve}L${xs(span).toFixed(1)},${base}L${xs(-span).toFixed(1)},${base}Z`;
  const zero = xs(0);
  const lo = center - Z80 * sigma, hi = center + Z80 * sigma;
  const maxTicks = W < 500 ? 5 : W < 900 ? 7 : 9;
  const step = [10, 20, 25, 50].find(st => 2 * Math.floor(span / st) + 1 <= maxTicks) ?? 50;
  const ticks: number[] = [0];
  for (let v = step; v <= span; v += step) ticks.push(-v, v);
  const tickLabel = (v: number) => (v === 0 ? "Even" : v < 0 ? `${aShort} +${-v}` : `${bShort} +${v}`);

  return (
    <div ref={box} className="w-full">
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block h-auto max-w-full" role="img"
      aria-label={`Distribution of the final margin. The middle 80% of outcomes run from ${tickLabel(Math.round(lo))} to ${tickLabel(Math.round(hi))}.`}>
      <defs>
        <clipPath id={`${clipId}-a`}><rect x="0" y="0" width={zero} height={H} /></clipPath>
        <clipPath id={`${clipId}-b`}><rect x={zero} y="0" width={W - zero} height={H} /></clipPath>
      </defs>
      <path d={area} fill="var(--def)" opacity="0.28" clipPath={`url(#${clipId}-a)`} />
      <path d={area} fill="var(--off)" opacity="0.28" clipPath={`url(#${clipId}-b)`} />
      <path d={curve} fill="none" stroke="var(--def)" strokeWidth="2" clipPath={`url(#${clipId}-a)`} />
      <path d={curve} fill="none" stroke="var(--off)" strokeWidth="2" clipPath={`url(#${clipId}-b)`} />
      {/* 80% interval */}
      <line x1={xs(lo)} x2={xs(hi)} y1={base + 10} y2={base + 10} stroke="var(--mute)" strokeWidth="2" />
      <line x1={xs(lo)} x2={xs(lo)} y1={base + 5} y2={base + 15} stroke="var(--mute)" strokeWidth="2" />
      <line x1={xs(hi)} x2={xs(hi)} y1={base + 5} y2={base + 15} stroke="var(--mute)" strokeWidth="2" />
      <line x1={xs(center)} x2={xs(center)} y1={top - 4} y2={base} stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="3 3" />
      <line x1={padX} x2={W - padX} y1={base} y2={base} stroke="var(--line-2)" />
      <line x1={zero} x2={zero} y1={top - 6} y2={base} stroke="var(--ink)" strokeOpacity="0.5" />
      {ticks.map(v => (
        <text key={v} x={xs(v)} y={H - 6} textAnchor={v === -span ? "start" : v === span ? "end" : "middle"} fontSize="11" fill="var(--dim)">{tickLabel(v)}</text>
      ))}
    </svg>
    </div>
  );
}
