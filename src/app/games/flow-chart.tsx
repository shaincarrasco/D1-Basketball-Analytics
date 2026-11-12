"use client";
// In-game win probability (top) and score margin (bottom) on a shared clock.
// Home above the 50% / zero line in orange, away below in cyan. Hover, or focus the chart
// and use the arrow keys, to step through every scoring play.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { pctFmt } from "@/lib/format";
import type { Game } from "@/lib/types";
import { HALF_SECONDS, OT_SECONDS, REG_SECONDS, WP_SIGMA, clockLabel, flowSummary, type WPPoint } from "@/lib/win-prob";

const PAD_L = 8, PAD_R = 44, TOP = 8, WP_H = 168, GAP = 18, MG_H = 84, AXIS = 24;
const H = TOP + WP_H + GAP + MG_H + AXIS;

export default function FlowChart({ g, now }: { g: Game; now?: number | null }) {
  const s = useMemo(() => flowSummary(g, { now }), [g, now]);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [cursor, setCursor] = useState<number | null>(null); // index into s.events
  const [hoverT, setHoverT] = useState<number | null>(null);
  const uid = `fc-${g.id}`;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!s) return null;
  const homeS = g.home.short ?? g.home.name, awayS = g.away.short ?? g.away.name;
  const iw = w - PAD_L - PAD_R;
  const x = (t: number) => PAD_L + (Math.min(t, s.end) / s.end) * iw;
  const yW = (p: number) => TOP + (1 - p) * WP_H;
  const maxM = Math.max(5, Math.ceil(Math.max(...s.events.map(e => Math.abs(e.margin)), 1) / 5) * 5);
  const mTop = TOP + WP_H + GAP;
  const yM = (m: number) => mTop + MG_H / 2 - (m / maxM) * (MG_H / 2);

  const wpLine = s.points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${yW(p.wp).toFixed(1)}`).join("");
  const wpArea = `${wpLine}L${x(s.end).toFixed(1)},${yW(0.5)}L${x(0).toFixed(1)},${yW(0.5)}Z`;
  let mLine = `M${x(0).toFixed(1)},${yM(0).toFixed(1)}`;
  for (const e of s.events) mLine += `H${x(e.t).toFixed(1)}V${yM(e.margin).toFixed(1)}`;
  mLine += `H${x(s.end).toFixed(1)}`;
  const mArea = `${mLine}V${yM(0).toFixed(1)}H${x(0).toFixed(1)}Z`;

  // Period boundaries: halftime, end of regulation, each OT.
  const marks: { t: number; label: string }[] = [{ t: HALF_SECONDS, label: "Half" }];
  if (s.end > REG_SECONDS || s.ots > 0) for (let k = 0; k < Math.max(1, s.ots); k++) marks.push({ t: REG_SECONDS + k * OT_SECONDS, label: k === 0 ? "OT" : `${k + 1}OT` });
  const minor: number[] = [];
  for (let t = 300; t < Math.min(s.end, REG_SECONDS); t += 300) if (t !== HALF_SECONDS) minor.push(t);

  // The point under the cursor: keyboard index wins, else hover time, else the latest point.
  const pointAt = (t: number): WPPoint => {
    let lo = 0, hi = s.points.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s.points[mid].t <= t) lo = mid; else hi = mid - 1; }
    return s.points[lo];
  };
  const active: WPPoint | null = cursor != null ? s.events[cursor] ?? null : hoverT != null ? pointAt(hoverT) : null;
  const shown = active ?? s.points[s.points.length - 1];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - r.left - PAD_L) / iw) * s.end;
    setCursor(null);
    setHoverT(Math.max(0, Math.min(s.end, t)));
  };
  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const n = s.events.length;
    if (!n) return;
    let cur = cursor ?? n - 1;
    if (cursor == null && hoverT != null) { cur = 0; s.events.forEach((ev, i) => { if (ev.t <= hoverT) cur = i; }); }
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(n - 1, cur + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next == null) return;
    e.preventDefault();
    setHoverT(null);
    setCursor(next);
  };

  const timeText = (t: number) => (s.final && t >= s.end ? (s.ots ? `Final · ${s.ots === 1 ? "OT" : `${s.ots}OT`}` : "Final") : t <= 0 ? "Tip-off" : clockLabel(t));
  const leader = (wp: number) => (wp >= 0.5 ? { name: homeS, p: wp, tone: "text-off" } : { name: awayS, p: 1 - wp, tone: "text-def" });
  const ld = leader(shown.wp);
  const big = s.biggest;
  const swing = s.bigSwing;

  const summary = `${g.away.name} at ${g.home.name} win probability chart. ${s.leadChanges} lead changes, ${s.ties} ties. ` +
    `${big.home ? `${g.home.name} led by as many as ${big.home.size}. ` : ""}${big.away ? `${g.away.name} led by as many as ${big.away.size}. ` : ""}` +
    "Use the left and right arrow keys to step through scoring plays.";

  return (
    <div>
      <dl className="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line text-[12.5px] sm:grid-cols-4">
        <Stat label="Lead changes" value={String(s.leadChanges)} sub={`${s.ties} ${s.ties === 1 ? "tie" : "ties"}`} />
        <Stat label={`Biggest ${awayS} lead`} value={big.away ? String(big.away.size) : "—"} sub={big.away ? clockLabel(big.away.t) : "never led"} tone="def" />
        <Stat label={`Biggest ${homeS} lead`} value={big.home ? String(big.home.size) : "—"} sub={big.home ? clockLabel(big.home.t) : "never led"} tone="off" />
        <Stat label="Biggest swing" value={swing ? `${Math.round(Math.abs(swing.delta) * 100)}%` : "—"} sub={swing ? `${swing.delta > 0 ? homeS : awayS} score · ${clockLabel(swing.t)}` : ""} title="Largest change in win probability from one scoring play" />
      </dl>

      <p className="mb-1 flex flex-wrap items-baseline gap-x-2 text-[13px] text-mute tnum" aria-live="polite">
        <span className="font-semibold text-ink">{timeText(shown.t)}</span>
        <span>{awayS} {shown.away}, {homeS} {shown.home}</span>
        {s.final && shown.t >= s.end && shown.home !== shown.away
          ? <span className="ml-auto"><b className={ld.tone}>{ld.name}</b> won</span>
          : <span className="ml-auto"><b className={ld.tone}>{ld.name} {pctFmt(ld.p)}</b> to win</span>}
      </p>

      <div ref={box} className="relative w-full">
        <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className="block touch-pan-y select-none rounded focus-visible:outline-offset-4"
          role="img" aria-label={summary} tabIndex={0}
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHoverT(null)} onKeyDown={onKey} onBlur={() => setCursor(null)}>
          <defs>
            <clipPath id={`${uid}-wt`}><rect x={0} y={0} width={w} height={yW(0.5)} /></clipPath>
            <clipPath id={`${uid}-wb`}><rect x={0} y={yW(0.5)} width={w} height={WP_H / 2 + 2} /></clipPath>
            <clipPath id={`${uid}-mt`}><rect x={0} y={mTop - 1} width={w} height={yM(0) - mTop + 1} /></clipPath>
            <clipPath id={`${uid}-mb`}><rect x={0} y={yM(0)} width={w} height={MG_H / 2 + 1} /></clipPath>
          </defs>

          {/* grid */}
          <rect x={PAD_L} y={TOP} width={iw} height={WP_H} fill="none" stroke="var(--line)" />
          {[0.25, 0.75].map(p => <line key={p} x1={PAD_L} x2={PAD_L + iw} y1={yW(p)} y2={yW(p)} stroke="var(--line)" strokeDasharray="2 4" />)}
          <rect x={PAD_L} y={mTop} width={iw} height={MG_H} fill="none" stroke="var(--line)" />
          {minor.map(t => <line key={t} x1={x(t)} x2={x(t)} y1={TOP} y2={TOP + WP_H} stroke="var(--line)" strokeDasharray="1 5" />)}

          {/* win probability */}
          <path d={wpArea} fill="rgb(var(--off-rgb) / 0.16)" clipPath={`url(#${uid}-wt)`} />
          <path d={wpArea} fill="rgb(var(--def-rgb) / 0.16)" clipPath={`url(#${uid}-wb)`} />
          <line x1={PAD_L} x2={PAD_L + iw} y1={yW(0.5)} y2={yW(0.5)} stroke="var(--line-2)" />
          <path d={wpLine} fill="none" stroke="var(--off)" strokeWidth={2} strokeLinejoin="round" clipPath={`url(#${uid}-wt)`} />
          <path d={wpLine} fill="none" stroke="var(--def)" strokeWidth={2} strokeLinejoin="round" clipPath={`url(#${uid}-wb)`} />
          <text x={PAD_L + 6} y={TOP + 14} fontSize={11.5} fontWeight={600} fill="var(--off)">{homeS}</text>
          <text x={PAD_L + 6} y={TOP + WP_H - 6} fontSize={11.5} fontWeight={600} fill="var(--def)">{awayS}</text>
          {[[1, "100%"], [0.75, "75%"], [0.5, "50%"], [0.25, "75%"], [0, "100%"]].map(([p, l]) => (
            <text key={String(p)} x={w - PAD_R + 6} y={yW(p as number) + 4} fontSize={10.5} fill="var(--dim)">{l}</text>
          ))}

          {/* score margin */}
          <path d={mArea} fill="rgb(var(--off-rgb) / 0.22)" clipPath={`url(#${uid}-mt)`} />
          <path d={mArea} fill="rgb(var(--def-rgb) / 0.22)" clipPath={`url(#${uid}-mb)`} />
          <line x1={PAD_L} x2={PAD_L + iw} y1={yM(0)} y2={yM(0)} stroke="var(--line-2)" />
          <path d={mLine} fill="none" stroke="var(--mute)" strokeWidth={1.25} />
          <text x={PAD_L + 6} y={mTop + 13} fontSize={11} fill="var(--mute)">Score margin</text>
          <text x={w - PAD_R + 6} y={mTop + 9} fontSize={10.5} fill="var(--dim)">+{maxM}</text>
          <text x={w - PAD_R + 6} y={yM(0) + 4} fontSize={10.5} fill="var(--dim)">0</text>
          <text x={w - PAD_R + 6} y={mTop + MG_H} fontSize={10.5} fill="var(--dim)">+{maxM}</text>
          {big.home && <LeadDot cx={x(big.home.t)} cy={yM(big.home.size)} label={`${homeS} +${big.home.size}`} tone="off" up w={w} />}
          {big.away && <LeadDot cx={x(big.away.t)} cy={yM(-big.away.size)} label={`${awayS} +${big.away.size}`} tone="def" w={w} />}

          {/* period marks */}
          {marks.map(m => m.t < s.end + 1 && (
            <g key={m.label}>
              <line x1={x(m.t)} x2={x(m.t)} y1={TOP} y2={mTop + MG_H} stroke="var(--mute)" strokeDasharray="4 4" strokeOpacity={0.6} />
              <text x={x(m.t)} y={mTop + MG_H + 16} fontSize={11} textAnchor="middle" fill="var(--mute)">{m.label}</text>
            </g>
          ))}
          <text x={PAD_L} y={mTop + MG_H + 16} fontSize={11} fill="var(--dim)">Tip</text>
          <text x={PAD_L + iw} y={mTop + MG_H + 16} fontSize={11} textAnchor="end" fill="var(--dim)">{s.final ? "Final" : "Now"}</text>

          {/* cursor */}
          {active && (
            <g pointerEvents="none">
              <line x1={x(active.t)} x2={x(active.t)} y1={TOP} y2={mTop + MG_H} stroke="var(--ink)" strokeOpacity={0.5} />
              <circle cx={x(active.t)} cy={yW(active.wp)} r={4} fill={active.wp >= 0.5 ? "var(--off)" : "var(--def)"} stroke="var(--deck)" strokeWidth={2} />
              <circle cx={x(active.t)} cy={yM(active.margin)} r={3.5} fill="var(--ink)" stroke="var(--deck)" strokeWidth={2} />
            </g>
          )}
        </svg>
      </div>
      <p className="mt-2 text-[11.5px] text-dim">
        Win probability from the score, time left and the pregame projection (σ = {WP_SIGMA} points over a full game, shrinking with time left). <Link href="/methodology/#win-probability" className="underline hover:text-ink">How it works</Link>
      </p>
    </div>
  );
}

function Stat({ label, value, sub, tone, title }: { label: string; value: string; sub?: string; tone?: "off" | "def"; title?: string }) {
  return (
    <div className="bg-deck px-3 py-2" title={title}>
      <dt className="flex items-center gap-1.5 text-[11.5px] text-mute">
        {tone && <i className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone === "off" ? "bg-off" : "bg-def"}`} aria-hidden />}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="font-display text-[1.25rem] font-extrabold leading-tight text-ink tnum">{value}</dd>
      {sub ? <dd className="text-[11px] text-dim tnum">{sub}</dd> : null}
    </div>
  );
}

function LeadDot({ cx, cy, label, tone, up, w }: { cx: number; cy: number; label: string; tone: "off" | "def"; up?: boolean; w: number }) {
  // Beside the dot (left of it near the right edge), nudged toward the zero line so it stays inside the panel.
  const right = cx > w - PAD_R - 70;
  return (
    <g>
      <circle cx={cx} cy={cy} r={3.5} fill={`var(--${tone})`} stroke="var(--deck)" strokeWidth={1.5} />
      <text x={right ? cx - 7 : cx + 7} y={up ? cy + 11 : cy - 3} fontSize={11} fontWeight={600} textAnchor={right ? "end" : "start"} fill={`var(--${tone})`} stroke="var(--deck)" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">{label}</text>
    </g>
  );
}
