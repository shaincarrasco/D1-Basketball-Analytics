"use client";
// The net chart: one column per tournament across the season. Serve points won rise above
// the net, return points won hang below it, coloured by surface. Dashed lines are the tour
// average. Tap a column to focus the page on that tournament.
import { useState } from "react";
import { pct, rpw, spw, sum, surfaceColor, type Event } from "@/lib/season";

const W = 1000, H = 360, NET = 190, UP = 150, DOWN = 130, L = 44, R = 12;
// Serve won % is drawn from 40% (at the net) to 85%; return won % from 15% to 55%.
const up = (v: number) => (Math.max(0, Math.min(1, (v - 0.4) / 0.45))) * UP;
const down = (v: number) => (Math.max(0, Math.min(1, (v - 0.15) / 0.4))) * DOWN;

export default function NetChart({ evs, focus, onFocus, avg }: { evs: Event[]; focus: string | null; onFocus: (eid: string | null) => void; avg: { spw: number; rpw: number } | null }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!evs.length) return null;
  const step = (W - L - R) / evs.length, bw = Math.min(46, step * 0.62);
  const cols = evs.map((e, i) => { const t = sum(e.matches); return { e, i, x: L + step * i + step / 2, s: spw(t), r: rpw(t) }; });
  const h = hover !== null ? cols[hover] : null;
  return (
    <figure className="relative m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" role="img"
        aria-label={`Serve and return points won at each of ${evs.length} tournaments this season`} onMouseLeave={() => setHover(null)}>
        {/* court: net line and side labels */}
        <text x={L - 8} y={NET - UP + 4} textAnchor="end" className="fill-dim" fontSize={12}>85%</text>
        <text x={L - 8} y={NET - 10} textAnchor="end" className="fill-dim" fontSize={12}>40%</text>
        <text x={L - 8} y={NET + 24} textAnchor="end" className="fill-dim" fontSize={12}>15%</text>
        <text x={L - 8} y={NET + DOWN + 4} textAnchor="end" className="fill-dim" fontSize={12}>55%</text>
        <text x={L} y={22} className="fill-mute" fontSize={13} fontWeight={600}>Serve points won</text>
        <text x={L} y={H - 8} className="fill-mute" fontSize={13} fontWeight={600}>Return points won</text>
        {avg && <>
          <line x1={L} x2={W - R} y1={NET - up(avg.spw)} y2={NET - up(avg.spw)} stroke="rgb(var(--ink-rgb) / .35)" strokeDasharray="4 5" />
          <line x1={L} x2={W - R} y1={NET + down(avg.rpw)} y2={NET + down(avg.rpw)} stroke="rgb(var(--ink-rgb) / .35)" strokeDasharray="4 5" />
          <text x={W - R} y={NET - up(avg.spw) - 6} textAnchor="end" className="fill-dim" fontSize={11}>tour avg {pct(avg.spw)}</text>
          <text x={W - R} y={NET + down(avg.rpw) + 15} textAnchor="end" className="fill-dim" fontSize={11}>tour avg {pct(avg.rpw)}</text>
        </>}
        {cols.map(c => {
          const dim = focus !== null && focus !== c.e.eid;
          const col = surfaceColor(c.e.surface);
          return (
            <g key={c.e.eid} opacity={dim ? 0.28 : 1} style={{ cursor: "pointer" }}
              onMouseEnter={() => setHover(c.i)} onClick={() => onFocus(focus === c.e.eid ? null : c.e.eid)}>
              <rect x={c.x - step / 2} y={0} width={step} height={H} fill="transparent" />
              {c.s !== null && <rect x={c.x - bw / 2} y={NET - up(c.s)} width={bw} height={up(c.s)} fill={col} rx={3} />}
              {c.r !== null && <rect x={c.x - bw / 2} y={NET + 3} width={bw} height={down(c.r)} fill={col} opacity={0.55} rx={3} />}
              <text x={c.x} y={NET - (c.s !== null ? up(c.s) : 0) - 7} textAnchor="middle" fontSize={step > 34 ? 13 : 10} fontWeight={800}
                className={c.e.result === "W" ? "fill-bulb" : "fill-ink"}>{c.e.result}</text>
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={NET + 1.5} y2={NET + 1.5} stroke="rgb(var(--ink-rgb))" strokeWidth={3} />
      </svg>
      {h && (
        <figcaption className="pointer-events-none absolute top-2 z-10 w-56 rounded-xl border border-line2 bg-deck2 p-3 text-[13px] shadow-xl"
          style={{ left: `clamp(0px, calc(${(h.x / W) * 100}% - 112px), calc(100% - 224px))` }}>
          <b className="block font-display text-[16px] leading-tight text-ink">{h.e.name}</b>
          <span className="text-dim">{h.e.level}, {h.e.surface}</span>
          <span className="mt-1.5 block text-ink">{h.e.result === "W" ? "Champion" : `Reached ${h.e.result}`} ({h.e.wins}-{h.e.losses})</span>
          <span className="block text-mute">Serve points won <b className="text-ink">{pct(h.s, 1)}</b></span>
          <span className="block text-mute">Return points won <b className="text-ink">{pct(h.r, 1)}</b></span>
        </figcaption>
      )}
    </figure>
  );
}
