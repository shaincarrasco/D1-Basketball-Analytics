"use client";
// Touch maps on a turf canvas, seen from behind the offense: the line of scrimmage runs across
// the bottom and depth goes up the field.
//  - targets (receivers) and throws (QBs): the ball flies from the quarterback to the catch or
//    throw spot (air yards), then completions carry on up the field (yards after catch).
//  - carries (backs): a run up its lane (left / middle / right) for the yards gained.
// Depth and direction come from ESPN's play-by-play text. Replay animates the season in order.
import { useMemo, useState } from "react";
import type { Touch } from "@/lib/data";

const W = 533, YD = 10, TOP = 45, BOTTOM = 12;            // 53.3 yards wide; +45 to -12 yards
const H = (TOP + BOTTOM) * YD;
const LOS = TOP * YD;                                       // y of the line of scrimmage
const y = (depth: number) => LOS - Math.max(-BOTTOM, Math.min(TOP, depth)) * YD;
const LANE = { left: W * 0.2, middle: W * 0.5, right: W * 0.8 } as const;
// Stable spread inside a lane so dots don't stack (deterministic from the play text).
const jitter = (s: string, span: number) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return ((Math.abs(h) % 1000) / 1000 - 0.5) * span; };
const DEPTH_GUESS = { short: 6, deep: 24 } as const;        // when the spot isn't recorded

/** A completed pass (for receivers: a catch). Shared by the map and the zone grid so they agree. */
export const isComplete = (t: Touch) => t.kind === "rec" || (t.kind === "throw" && !t.int && /pass complete/i.test(t.text));

type Mark = { t: Touch; x0: number; y0: number; x1: number; y1: number; x2: number; y2: number; air: number; done: boolean; guess: boolean };

function build(touches: Touch[], mode: "air" | "run"): Mark[] {
  return touches.map(t => {
    const lane = t.dir ? LANE[t.dir] : LANE.middle;
    const xj = lane + jitter(t.text, W * 0.22);
    if (mode === "run") return { t, x0: xj, y0: LOS, x1: xj, y1: y(t.yds), x2: xj, y2: y(t.yds), air: 0, done: true, guess: false };
    const guess = t.spot === null;
    const air = guess ? (t.depth ? DEPTH_GUESS[t.depth] : 8) : t.spot! - t.los;
    const done = isComplete(t);
    const yac = done && t.end !== null && t.spot !== null ? t.end - t.spot : 0;
    return { t, x0: W / 2, y0: y(-6), x1: xj, y1: y(air), x2: xj + jitter(t.text + "y", 30), y2: y(air + yac), air, done, guess };
  });
}

const NEG = "rgb(12 14 18)";                                  // interceptions and lost yardage: dark on turf, unlike TD orange
const color = (m: Mark) => (m.t.int ? NEG : m.t.td ? "rgb(var(--bulb-rgb))" : m.done ? "rgb(var(--ink-rgb))" : "rgb(var(--mute-rgb) / .7)");

export default function TouchMap({ touches, mode, label }: { touches: Touch[]; mode: "air" | "run"; label: string }) {
  const [run, setRun] = useState(0);                         // bump to replay
  const marks = useMemo(() => build(touches, mode), [touches, mode]);
  const step = Math.min(90, 6000 / Math.max(1, marks.length)); // whole replay ≈ 6s
  return (
    <figure className="m-0">
      <div className="relative overflow-hidden rounded-2xl border border-line">
        <svg key={run} viewBox={`0 0 ${W} ${H}`} className="touch-map block h-auto w-full" role="img" aria-label={label}>
          {/* turf stripes every 5 yards, chalk lines every 10 */}
          {Array.from({ length: Math.ceil((TOP + BOTTOM) / 5) }, (_, i) => <rect key={i} x={0} y={i * 50} width={W} height={50} fill={i % 2 ? "var(--turf)" : "var(--turf-2)"} />)}
          {Array.from({ length: Math.floor(TOP / 10) + 2 }, (_, i) => i * 10 - 10).map(d => (
            <g key={d}>
              <line x1={0} x2={W} y1={y(d)} y2={y(d)} stroke="var(--chalk)" strokeOpacity={d === 0 ? 0 : 0.35} strokeWidth={1.5} />
              {d !== 0 && <text x={10} y={y(d) - 6} fill="white" fillOpacity={0.55} fontSize={14} fontWeight={700}>{d > 0 ? `+${d}` : d}</text>}
            </g>
          ))}
          {[W / 3, (2 * W) / 3].map(x => <line key={x} x1={x} x2={x} y1={0} y2={H} stroke="white" strokeOpacity={0.12} strokeDasharray="6 8" />)}
          <line x1={0} x2={W} y1={LOS} y2={LOS} stroke="rgb(var(--def-rgb))" strokeWidth={3} />
          <text x={W - 10} y={LOS + 18} textAnchor="end" fill="white" fillOpacity={0.7} fontSize={13} fontWeight={700}>line of scrimmage</text>
          {marks.map((m, i) => {
            const d = { animationDelay: `${i * step}ms` };
            if (mode === "run") return (
              <g key={i} className="tm-item" style={d}>
                <path d={`M${m.x0} ${m.y0} L${m.x1} ${m.y1}`} pathLength={1} className="tm-draw" stroke={m.t.td ? "rgb(var(--bulb-rgb))" : m.t.yds >= 10 ? "white" : m.t.yds <= 0 ? NEG : "rgb(255 255 255 / .55)"} strokeWidth={m.t.yds >= 10 ? 3 : 2} fill="none" strokeLinecap="round" style={d} />
                <circle cx={m.x1} cy={m.y1} r={3.5} fill={m.t.td ? "rgb(var(--bulb-rgb))" : m.t.yds <= 0 ? NEG : "white"} className="tm-pop" style={d}><title>{m.t.text}</title></circle>
              </g>
            );
            const arc = `M${m.x0} ${m.y0} Q${(m.x0 + m.x1) / 2} ${Math.min(m.y0, m.y1) - 40 - m.air * 2} ${m.x1} ${m.y1}`;
            return (
              <g key={i} className="tm-item" style={d}>
                <path d={arc} pathLength={1} className="tm-draw" stroke={color(m)} strokeOpacity={m.done ? 0.55 : 0.35} strokeWidth={1.5} fill="none" strokeDasharray={m.done ? undefined : "0.02 0.02"} style={d} />
                {m.done && m.y2 !== m.y1 && <path d={`M${m.x1} ${m.y1} L${m.x2} ${m.y2}`} pathLength={1} className="tm-draw tm-late" stroke={color(m)} strokeWidth={2.5} fill="none" strokeLinecap="round" style={d} />}
                <circle cx={m.x1} cy={m.y1} r={m.t.td || m.t.int ? 6 : 4.5} fill={m.done || m.t.int ? color(m) : "none"} stroke={m.t.int ? "white" : color(m)} strokeWidth={m.done && !m.t.int ? 0 : 2} strokeDasharray={m.guess ? "2 2" : undefined} className="tm-pop" style={d}><title>{m.t.text}</title></circle>
              </g>
            );
          })}
        </svg>
        <button className="btn absolute right-3 top-3 !px-3 !py-1.5 text-[13px]" onClick={() => setRun(r => r + 1)}>Replay</button>
      </div>
      <p className="sr-only">{mode === "run"
        ? `${touches.length} carries for ${touches.reduce((n, t) => n + t.yds, 0)} yards, ${touches.filter(t => t.td).length} touchdowns: ${touches.filter(t => t.dir === "left").length} left, ${touches.filter(t => t.dir === "middle").length} middle, ${touches.filter(t => t.dir === "right").length} right.`
        : `${touches.length} passes, ${touches.filter(isComplete).length} completed, ${touches.filter(t => t.td).length} touchdowns${touches.some(t => t.int) ? `, ${touches.filter(t => t.int).length} intercepted` : ""}. The zone table below breaks them down by depth and direction.`}</p>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-mute">
        {mode === "air" ? <>
          <span><b className="text-ink">●</b> caught (line = yards after catch)</span><span>○ incomplete</span>
          <span><b className="text-bulb">●</b> touchdown</span>{touches.some(t => t.kind === "throw") && <span><b className="rounded-full bg-black px-[3px] text-white">●</b> intercepted</span>}
          <span>dashed ring = depth estimated (spot not recorded)</span>
        </> : <>
          <span><b className="text-ink">│</b> carry (length = yards)</span><span><b className="text-bulb">│</b> touchdown</span><span><b className="text-black [text-shadow:0_0_2px_white]">│</b> no gain or loss</span>
        </>}
      </figcaption>
    </figure>
  );
}

/** Depth × direction grid: targets, catch rate and yards in each of six zones. */
export function ZoneGrid({ touches }: { touches: Touch[] }) {
  const rows = (["deep", "short"] as const).map(depth => ({
    depth,
    cells: (["left", "middle", "right"] as const).map(dir => {
      const ts = touches.filter(t => t.depth === depth && t.dir === dir);
      const caught = ts.filter(isComplete);
      return { dir, n: ts.length, rate: ts.length ? caught.length / ts.length : null, yds: caught.reduce((s, t) => s + t.yds, 0) };
    }),
  }));
  const max = Math.max(1, ...rows.flatMap(r => r.cells.map(c => c.n)));
  return (
    <table className="w-full border-separate border-spacing-1.5 text-center text-[13px]">
      <thead><tr><th /><th className="font-semibold text-mute">Left</th><th className="font-semibold text-mute">Middle</th><th className="font-semibold text-mute">Right</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.depth}>
            <th className="w-14 text-left font-semibold capitalize text-mute">{r.depth}</th>
            {r.cells.map(c => (
              <td key={c.dir} className="rounded-lg px-2 py-2.5" style={{ background: `rgb(var(--bulb-rgb) / ${0.08 + 0.5 * (c.n / max)})` }}>
                <b className="block font-display text-2xl leading-none">{c.n}</b>
                <span className="block text-[11.5px] text-ink">{c.rate === null ? "—" : `${Math.round(c.rate * 100)}% caught`}</span>
                <span className="block text-[11.5px] text-mute">{c.yds} yds</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
