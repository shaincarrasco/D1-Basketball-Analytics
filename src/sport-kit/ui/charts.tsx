"use client";
// The four chart types, for any sport pack. All are plain SVG with the title, axes,
// captions and credit drawn inside the SVG, so what you download is the same graphic you see.
import { useMemo, useState, type ReactNode, type Ref } from "react";
import { useRouter } from "next/navigation";
import { luminance, teamHex } from "@/lib/color";
import { fmtMetric, inPool, makePool, median, metricIndex, pctLabel, poolText, sd, val, type ChartSpec, type Lists, type Metric, type SportPack, type TeamInfo } from "@/sport-kit";
import { posColor, toneColor, type ChartTheme } from "./theme";

export type ChartProps<R> = { pack: SportPack<R>; spec: ChartSpec; rows: R[]; lists: Lists; theme: ChartTheme; compact?: boolean; ref?: Ref<SVGSVGElement> };

// ---------- helpers ----------
const W = 800;
export function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv)$/i;
  let last = parts[parts.length - 1];
  if (suffix.test(last) && parts.length > 2) last = `${parts[parts.length - 2]} ${last}`;
  return `${parts[0][0]}. ${last}`;
}
function niceTicks(lo: number, hi: number, n = 5) {
  const span = hi - lo || 1;
  const step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}
const tickFmt = <R,>(m: Metric<R>, v: number) => (Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(Math.abs(v) < 1 ? 2 : 1)) + (m.unit === "%" ? "%" : "");

function dotColor<R>(pack: SportPack<R>, spec: ChartSpec, t: ChartTheme, r: R) {
  if (spec.color === "pos") return posColor(pack, t, pack.entity.pos(r));
  // "Light up a group" with nothing picked yet falls back to team colours rather than all grey.
  if (spec.color === "group" && spec.hiGroup) return pack.entity.team(r)?.group === spec.hiGroup ? t.bulb : t.line2;
  return readableTeam(t, pack.entity.team(r));
}
const inGroup = <R,>(pack: SportPack<R>, spec: ChartSpec, r: R) => pack.entity.team(r)?.group === spec.hiGroup;
/** Team colour that stays visible on the current background: very dark colours on dark palettes
 *  (and very light ones on light palettes) fall back to the alternate colour, then get mixed toward contrast. */
const bgDark = (t: ChartTheme) => { const m = t.bg.match(/\d+/g); return m ? (Number(m[0]) * 0.3 + Number(m[1]) * 0.59 + Number(m[2]) * 0.11) < 128 : true; };
export function readableTeam(t: ChartTheme, team: TeamInfo | null) {
  const dark = bgDark(t);
  const ok = (h: string | null) => { const l = luminance(h); return l !== null && (dark ? l > 0.07 : l < 0.6); };
  const main = teamHex(team?.color ?? null), alt = teamHex(team?.altColor ?? null);
  if (ok(main)) return main!;
  if (ok(alt)) return alt!;
  return main ? `color-mix(in srgb, ${main} 55%, ${dark ? "#ffffff" : "#000000"})` : t.mute;
}
/** Title block + credit line shared by every chart. */
function Frame({ h, title, sub, t, foot, children, compact, brand }: { h: number; title: string; sub: string; t: ChartTheme; foot: string; children: ReactNode; compact?: boolean; brand: string }) {
  return (
    <>
      <text x={24} y={38} fill={t.ink} fontFamily={t.display} fontWeight={800} fontSize={compact ? 30 : 28} letterSpacing="0.01em">{title.toUpperCase()}</text>
      <text x={24} y={60} fill={t.mute} fontFamily={t.body} fontSize={compact ? 15 : 13.5}>{sub}</text>
      {children}
      <text x={24} y={h - 14} fill={t.bulb} fontFamily={t.display} fontWeight={800} fontSize={13} letterSpacing="0.08em">{brand}</text>
      <text x={24 + brand.length * 8.4 + 1} y={h - 14} fill={t.dim} fontFamily={t.body} fontSize={11.5}>{foot}</text>
    </>
  );
}

function PosLegend<R>({ pack, t, y, compact }: { pack: SportPack<R>; t: ChartTheme; y: number; compact?: boolean }) {
  // Few positions: full plural names. Many (football): short keys so the legend fits.
  const many = pack.positions.length > 4;
  const items = pack.positions.map(p => [p.key, many ? p.key : p.plural, p.tone] as const);
  const fs = compact ? 14 : 12.5, step = many ? (compact ? 54 : 48) : compact ? 104 : 92;
  return (
    <g>
      {items.map(([k, label, tone], i) => {
        const x = W - 28 - (items.length - i) * step;
        return <g key={k}><circle cx={x} cy={y - 4} r={5} fill={toneColor(t, tone)} /><text x={x + 10} y={y} fill={t.mute} fontFamily={t.body} fontSize={fs}>{label}</text></g>;
      })}
    </g>
  );
}

type Hover<R> = { r: R; x: number; y: number; lines: string[] } | null;
function Tip<R>({ pack, hover, h }: { pack: SportPack<R>; hover: Hover<R>; h: number }) {
  if (!hover) return null;
  const team = pack.entity.team(hover.r), pos = pack.entity.pos(hover.r);
  const left = (hover.x / W) * 100, top = (hover.y / h) * 100;
  return (
    <div className="pointer-events-none absolute z-10 min-w-[10rem] -translate-x-1/2 rounded-lg border border-line2 bg-deck2/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
      style={{ left: `${Math.min(88, Math.max(12, left))}%`, top: `${top}%`, transform: `translate(-50%, ${top > 40 ? "calc(-100% - 12px)" : "14px"})` }}>
      <div className="font-display text-[15px] font-extrabold leading-tight text-ink">{pack.entity.name(hover.r)}</div>
      <div className="mb-1 text-mute">{team?.name ?? "—"}{pos ? ` · ${pos}` : ""}</div>
      {hover.lines.map(l => <div key={l} className="tnum text-ink">{l}</div>)}
    </div>
  );
}

/** Greedy label placement: try a few spots around each dot, skip ones that would collide. */
function placeLabels(items: { x: number; y: number; text: string; r: number; hi?: boolean }[], bounds: { l: number; r: number; t: number; b: number }, fs: number, reserved: { x: number; y: number; w: number; h: number }[] = []) {
  const placed: { x: number; y: number; w: number; h: number }[] = [...reserved];
  const out: { x: number; y: number; text: string; anchor: "start" | "end" | "middle"; lx: number; ly: number; hi?: boolean }[] = [];
  const hit = (a: { x: number; y: number; w: number; h: number }) => placed.some(b => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
  for (const it of items) {
    const w = it.text.length * fs * 0.52 + 4, hgt = fs + 2, g = it.r + 3;
    const opts: [number, number, "start" | "end" | "middle"][] = [
      [it.x + g, it.y - hgt / 2, "start"], [it.x - g - w, it.y - hgt / 2, "end"], [it.x - w / 2, it.y - g - hgt, "middle"], [it.x - w / 2, it.y + g, "middle"],
      [it.x + g, it.y - hgt - 2, "start"], [it.x - g - w, it.y + 2, "end"],
    ];
    for (const [bx, by, anchor] of opts) {
      const box = { x: bx, y: by, w, h: hgt };
      if (bx < bounds.l || bx + w > bounds.r || by < bounds.t || by + hgt > bounds.b) continue;
      if (hit(box)) continue;
      placed.push(box);
      out.push({ text: it.text, anchor, hi: it.hi, x: anchor === "start" ? bx + 2 : anchor === "end" ? bx + w - 2 : bx + w / 2, y: by + hgt - 3, lx: it.x, ly: it.y });
      break;
    }
  }
  return out;
}

function useOpen<R>(pack: SportPack<R>) {
  const router = useRouter();
  return (r: R) => { const href = pack.entity.href(r); if (href) router.push(href); };
}

// ---------- scatter ----------
export function Scatter<R>({ pack, spec, rows, theme: t, lists, compact, ref }: ChartProps<R>) {
  const E = pack.entity, METRIC = metricIndex(pack);
  const open = useOpen(pack);
  const [hover, setHover] = useState<Hover<R>>(null);
  const H = 600, L = 64, R = W - 28, T = 84, B = H - 70;
  const mx = METRIC[spec.x], my = METRIC[spec.y], ms = spec.size ? METRIC[spec.size] ?? null : null;
  const data = useMemo(() => {
    if (!mx || !my) return null;
    const pts = rows.filter(r => inPool(pack, spec.pool, r)).map(r => ({ r, x: val(mx, r), y: val(my, r), s: ms ? val(ms, r) : null })).filter((p): p is { r: R; x: number; y: number; s: number | null } => p.x !== null && p.y !== null);
    if (pts.length < 3) return { pts: [], empty: true } as const;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const pad = (lo: number, hi: number) => { const d = (hi - lo || 1) * 0.05; return [lo - d, hi + d] as const; };
    const [x0, x1] = pad(Math.min(...xs), Math.max(...xs)), [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
    const fx = (v: number) => (mx.invert ? R - ((v - x0) / (x1 - x0)) * (R - L) : L + ((v - x0) / (x1 - x0)) * (R - L));
    const fy = (v: number) => (my.invert ? T + ((v - y0) / (y1 - y0)) * (B - T) : B - ((v - y0) / (y1 - y0)) * (B - T));
    const medX = median(xs), medY = median(ys), sx = sd(xs), sy = sd(ys);
    const sv = ms ? pts.map(p => p.s).filter((v): v is number => v !== null) : [];
    const sLo = sv.length ? Math.min(...sv) : 0, sHi = sv.length ? Math.max(...sv) : 1;
    const rad = (s: number | null) => (ms && s !== null ? 2.2 + 7 * Math.sqrt(Math.max(0, (ms.invert ? sHi - s : s - sLo) / (sHi - sLo || 1))) : compact ? 3.6 : 3.4);
    const plotted = pts.map(p => {
      // "Good" direction is up/right even for flipped axes.
      const zx = ((p.x - medX) / sx) * (mx.invert ? -1 : 1), zy = ((p.y - medY) / sy) * (my.invert ? -1 : 1);
      return { ...p, px: fx(p.x), py: fy(p.y), rad: rad(p.s), score: Math.hypot(zx, zy) + 0.6 * (zx + zy), hi: spec.ids.includes(E.id(p.r)), id: E.id(p.r) };
    });
    return { pts: plotted, x0, x1, y0, y1, fx, fy, medX, medY, empty: false } as const;
  }, [pack, E, rows, spec.pool, spec.ids, mx, my, ms, compact, L, R, T, B]);

  if (!mx || !my) return null;
  const title = spec.title || `${my.short} vs ${mx.short}`;
  const sub = `${my.label} by ${/^[A-Z][a-z]/.test(mx.label) ? mx.label[0].toLowerCase() + mx.label.slice(1) : mx.label} · ${data && !data.empty ? data.pts.length.toLocaleString("en-US") : 0} ${poolText(pack, spec.pool, lists)}`;
  const foot = `Lines = medians${mx.invert || my.invert ? " · flipped axes put better to the top/right" : ""}${ms ? ` · dot size = ${ms.short}` : ""}`;
  if (!data || data.empty) return <Empty h={H} t={t} title={title} sub={sub} ref={ref} brand={pack.brand} />;

  const { pts, fx, fy, medX, medY } = data;
  const lightGroup = spec.color === "group" && !!spec.hiGroup;
  const highlighting = spec.ids.length > 0 || lightGroup;
  const order = [...pts].sort((a, b) => Number(a.hi) - Number(b.hi) || (lightGroup ? Number(inGroup(pack, spec, a.r)) - Number(inGroup(pack, spec, b.r)) : 0) || b.rad - a.rad);
  const ranked = [...pts].filter(p => !p.hi && (!lightGroup || inGroup(pack, spec, p.r))).sort((a, b) => b.score - a.score).slice(0, spec.labels);
  const q = spec.quads;
  const cfs = compact ? 15 : 13, cw = (txt: string) => txt.length * cfs * 0.62 + 6;
  const reserved = [
    q[0] && { x: L + 6, y: T + 4, w: cw(q[0]), h: cfs + 6 }, q[1] && { x: R - 6 - cw(q[1]), y: T + 4, w: cw(q[1]), h: cfs + 6 },
    q[2] && { x: L + 6, y: B - 12 - cfs - 2, w: cw(q[2]), h: cfs + 6 }, q[3] && { x: R - 6 - cw(q[3]), y: B - 12 - cfs - 2, w: cw(q[3]), h: cfs + 6 },
  ].filter((b): b is { x: number; y: number; w: number; h: number } => !!b);
  const labels = placeLabels([...pts.filter(p => p.hi), ...ranked].map(p => ({ x: p.px, y: p.py, r: p.rad, text: shortName(E.name(p.r)), hi: p.hi })), { l: L + 2, r: R - 2, t: T + 2, b: B - 2 }, compact ? 13 : 11.5, reserved);
  const xt = niceTicks(Math.min(data.x0, data.x1), Math.max(data.x0, data.x1)), yt = niceTicks(Math.min(data.y0, data.y1), Math.max(data.y0, data.y1));
  const qs = { fill: t.dim, fontFamily: t.display, fontWeight: 800, fontSize: compact ? 15 : 13, letterSpacing: "0.06em", stroke: t.deck, strokeWidth: 4, paintOrder: "stroke" } as const;

  const move = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement!, box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W, y = ((e.clientY - box.top) / box.height) * H;
    let best: (typeof pts)[number] | null = null, bd = 18 ** 2;
    for (const p of pts) { const d = (p.px - x) ** 2 + (p.py - y) ** 2; if (d < bd) { bd = d; best = p; } }
    setHover(best ? { r: best.r, x: best.px, y: best.py, lines: [`${mx.short} ${fmtMetric(mx, best.x)}`, `${my.short} ${fmtMetric(my, best.y)}`, ...(ms ? [`${ms.short} ${fmtMetric(ms, best.s)}`] : [])] } : null);
  };

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" role="img" aria-label={`${title}. ${sub}`}>
        <Frame h={H} t={t} title={title} sub={sub} foot={foot} compact={compact} brand={pack.brand}>
          {xt.map(v => <g key={`x${v}`}><line x1={fx(v)} x2={fx(v)} y1={T} y2={B} stroke={t.line} strokeWidth={1} opacity={0.55} /><text x={fx(v)} y={B + 18} fill={t.dim} fontSize={compact ? 13 : 11.5} fontFamily={t.body} textAnchor="middle">{tickFmt(mx, v)}</text></g>)}
          {yt.map(v => <g key={`y${v}`}><line x1={L} x2={R} y1={fy(v)} y2={fy(v)} stroke={t.line} strokeWidth={1} opacity={0.55} /><text x={L - 8} y={fy(v) + 4} fill={t.dim} fontSize={compact ? 13 : 11.5} fontFamily={t.body} textAnchor="end">{tickFmt(my, v)}</text></g>)}
          <line x1={fx(medX)} x2={fx(medX)} y1={T} y2={B} stroke={t.mute} strokeDasharray="4 4" strokeWidth={1.2} opacity={0.7} />
          <line x1={L} x2={R} y1={fy(medY)} y2={fy(medY)} stroke={t.mute} strokeDasharray="4 4" strokeWidth={1.2} opacity={0.7} />
          {spec.color === "pos" && <PosLegend pack={pack} t={t} y={62} compact={compact} />}
          {q[0] && <text x={L + 10} y={T + 20} {...qs}>{q[0].toUpperCase()}</text>}
          {q[1] && <text x={R - 10} y={T + 20} textAnchor="end" {...qs}>{q[1].toUpperCase()}</text>}
          {q[2] && <text x={L + 10} y={B - 12} {...qs}>{q[2].toUpperCase()}</text>}
          {q[3] && <text x={R - 10} y={B - 12} textAnchor="end" {...qs}>{q[3].toUpperCase()}</text>}
          <text x={(L + R) / 2} y={B + 40} fill={t.mute} fontSize={compact ? 15 : 13} fontFamily={t.body} fontWeight={600} textAnchor="middle">{mx.label}{mx.invert ? " (lower is better →)" : " →"}</text>
          <text transform={`translate(18 ${(T + B) / 2}) rotate(-90)`} fill={t.mute} fontSize={compact ? 15 : 13} fontFamily={t.body} fontWeight={600} textAnchor="middle">{my.label}{my.invert ? " (lower is better →)" : " →"}</text>
          <g>
            {order.map(p => {
              const lit = p.hi || (lightGroup ? inGroup(pack, spec, p.r) : !highlighting);
              return <circle key={p.id} cx={p.px} cy={p.py} r={p.hi ? p.rad + 1.5 : p.rad} fill={p.hi ? t.bulb : dotColor(pack, spec, t, p.r)} fillOpacity={lit ? 0.85 : 0.28} stroke={p.hi ? t.ink : t.bg} strokeWidth={p.hi ? 1.6 : 0.6} />;
            })}
          </g>
          {labels.map(l => (
            <g key={l.text + l.lx}>
              <text x={l.x} y={l.y} textAnchor={l.anchor} fontFamily={t.body} fontWeight={700} fontSize={compact ? 13 : 11.5} fill={l.hi ? t.bulb : t.ink} stroke={t.deck} strokeWidth={3} paintOrder="stroke">{l.text}</text>
            </g>
          ))}
          {hover && <circle data-noexport cx={hover.x} cy={hover.y} r={8} fill="none" stroke={t.bulb} strokeWidth={2} />}
          <rect data-noexport x={L} y={T} width={R - L} height={B - T} fill="transparent" style={{ cursor: hover && E.href(hover.r) ? "pointer" : "crosshair" }}
            onPointerMove={move} onPointerLeave={() => setHover(null)} onClick={() => hover && open(hover.r)} />
        </Frame>
      </svg>
      <Tip pack={pack} hover={hover} h={H} />
    </div>
  );
}

function Empty({ h, t, title, sub, ref, brand }: { h: number; t: ChartTheme; title: string; sub: string; ref?: Ref<SVGSVGElement>; brand: string }) {
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${h}`} className="block h-auto w-full" role="img" aria-label={`${title}: not enough data`}>
      <Frame h={h} t={t} title={title} sub={sub} foot="" brand={brand}>
        <text x={W / 2} y={h / 2} fill={t.mute} fontFamily={t.body} fontSize={16} textAnchor="middle">Not enough players clear these filters yet. Try loosening them.</text>
      </Frame>
    </svg>
  );
}

// ---------- leaders (bars) ----------
export function Bars<R>({ pack, spec, rows, theme: t, lists, compact, ref }: ChartProps<R>) {
  const E = pack.entity;
  const open = useOpen(pack);
  const m = metricIndex(pack)[spec.x];
  const n = compact ? Math.min(spec.n, 12) : spec.n;
  const rowH = compact ? 30 : 27, T = 84, L = 222, R = W - 86;
  const data = useMemo(() => {
    if (!m) return null;
    const pool = rows.filter(r => inPool(pack, spec.pool, r)).map(r => ({ r, v: val(m, r), id: E.id(r) })).filter((p): p is { r: R; v: number; id: string } => p.v !== null);
    const sorted = [...pool].sort((a, b) => (m.invert ? a.v - b.v : b.v - a.v));
    const top = sorted.slice(0, n);
    for (const id of spec.ids) if (!top.some(p => p.id === id)) { const i = sorted.findIndex(p => p.id === id); if (i >= 0 && top.length < n + 4) top.push(sorted[i]); }
    const rank = new Map(sorted.map((p, i) => [p.id, i + 1]));
    return { top, rank, med: median(pool.map(p => p.v)), size: pool.length, all: pool.map(p => p.v) };
  }, [pack, E, rows, spec.pool, spec.ids, m, n]);
  if (!m || !data) return null;
  const title = spec.title || `${m.short} leaders`;
  const sub = `${m.label}${m.invert ? " (lowest first)" : ""} · top ${n} of ${data.size.toLocaleString("en-US")} ${poolText(pack, spec.pool, lists)}`;
  if (data.top.length === 0) return <Empty h={300} t={t} title={title} sub={sub} ref={ref} brand={pack.brand} />;
  const H2 = T + data.top.length * rowH + 56;
  const vals = data.top.map(p => p.v).concat(data.med);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const fx = (v: number) => L + ((v - lo) / (hi - lo || 1)) * (R - L);
  const zero = fx(0);
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H2}`} className="block h-auto w-full" role="img" aria-label={`${title}. ${sub}`}>
      <Frame h={H2} t={t} title={title} sub={sub} foot={`Dashed line = median of the pool (${fmtMetric(m, data.med)})${m.invert ? " · shorter is better" : ""}`} compact={compact} brand={pack.brand}>
        {data.top.map((p, i) => {
          const team = E.team(p.r), name = E.name(p.r);
          const y = T + i * rowH, x = fx(p.v), c = spec.ids.includes(p.id) ? t.bulb : readableTeam(t, team);
          const barX = Math.min(zero, x), barW = Math.max(2, Math.abs(x - zero));
          return (
            <g key={p.id} style={{ cursor: E.href(p.r) ? "pointer" : undefined }} onClick={() => open(p.r)}>
              <rect x={0} y={y} width={W} height={rowH} fill="transparent" />
              <text x={30} y={y + rowH * 0.66} fill={t.bulb} fontFamily="'Doto Variable', monospace" fontWeight={900} fontSize={compact ? 17 : 15} textAnchor="end">{data.rank.get(p.id)}</text>
              <text x={40} y={y + rowH * 0.66} fill={t.ink} fontFamily={t.body} fontWeight={700} fontSize={compact ? 15 : 13.5}>{name.length > 20 ? shortName(name) : name}</text>
              <text x={L - 10} y={y + rowH * 0.66} fill={t.dim} fontFamily={t.body} fontSize={compact ? 13 : 11.5} textAnchor="end">{team?.short ?? ""}</text>
              <rect x={barX} y={y + 5} width={barW} height={rowH - 10} rx={3} fill={c} fillOpacity={0.9} stroke={t.ink} strokeOpacity={0.12} />
              <text x={Math.max(x, zero) + 8} y={y + rowH * 0.66} fill={t.ink} fontFamily={t.body} fontWeight={700} fontSize={compact ? 15 : 13} className="tnum">{fmtMetric(m, p.v)}</text>
            </g>
          );
        })}
        <line x1={fx(data.med)} x2={fx(data.med)} y1={T - 6} y2={T + data.top.length * rowH + 4} stroke={t.mute} strokeDasharray="4 4" />
        <text x={fx(data.med)} y={T - 10} fill={t.mute} fontSize={11} fontFamily={t.body} textAnchor="middle">median</text>
      </Frame>
    </svg>
  );
}

// ---------- swarm ----------
export function Swarm<R>({ pack, spec, rows, theme: t, lists, compact, ref }: ChartProps<R>) {
  const E = pack.entity;
  const open = useOpen(pack);
  const [hover, setHover] = useState<Hover<R>>(null);
  const m = metricIndex(pack)[spec.x];
  const splitRows = spec.split && pack.positions.length > 1 && (spec.pool.pos ?? "all") === "all";
  const groups = useMemo<(string | null)[]>(() => (splitRows ? pack.positions.map(p => p.key) : [null]), [splitRows, pack.positions]);
  // Three bands of 150 for basketball; more positions get thinner bands so the chart stays a sane height.
  const bandH = groups.length > 1 ? Math.max(64, Math.round(450 / groups.length)) : 300, T = 84, L = 96, R = W - 28;
  const H = T + groups.length * bandH + 64;
  const data = useMemo(() => {
    if (!m) return null;
    const pool = rows.filter(r => inPool(pack, spec.pool, r)).map(r => ({ r, v: val(m, r), pos: E.pos(r) })).filter((p): p is { r: R; v: number; pos: string | null } => p.v !== null);
    if (pool.length < 3) return { pts: [], size: 0 };
    const vs = pool.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), d = (hi - lo || 1) * 0.03;
    const x0 = lo - d, x1 = hi + d;
    const fx = (v: number) => (m.invert ? R - ((v - x0) / (x1 - x0)) * (R - L) : L + ((v - x0) / (x1 - x0)) * (R - L));
    const rad = compact ? 2.6 : 2.4, gap = rad * 2 + 0.4;
    const pts: { r: R; id: string; v: number; px: number; py: number; band: number; hi: boolean }[] = [];
    groups.forEach((g, bi) => {
      const mid = T + bi * bandH + bandH / 2, half = bandH / 2 - 8;
      const band = pool.filter(p => g === null || p.pos === g).sort((a, b) => fx(a.v) - fx(b.v));
      const placed: { x: number; y: number }[] = [];
      let start = 0;
      for (const p of band) {
        const x = fx(p.v);
        while (start < placed.length && placed[start].x < x - gap) start++;
        const near = placed.slice(start);
        let y = 0;
        for (let k = 0; k < 400; k++) {
          const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (rad * 0.9);
          if (Math.abs(off) > half) { y = (((pts.length * 7919) % 97) / 97 - 0.5) * half * 2; break; }
          if (near.every(q => (q.x - x) ** 2 + (q.y - (mid + off)) ** 2 >= gap * gap)) { y = off; break; }
        }
        placed.push({ x, y: mid + y });
        const id = E.id(p.r);
        pts.push({ r: p.r, id, v: p.v, px: x, py: mid + y, band: bi, hi: spec.ids.includes(id) });
      }
    });
    return { pts, size: pool.length, fx, x0, x1, rad, med: groups.map((g) => median(pool.filter(p => g === null || p.pos === g).map(p => p.v))) };
  }, [pack, E, rows, spec.pool, spec.ids, m, compact, groups, bandH, L, R]);
  if (!m || !data) return null;
  const title = spec.title || `Where everyone sits: ${m.short}`;
  const sub = `${m.label} · ${data.size.toLocaleString("en-US")} ${poolText(pack, spec.pool, lists)}${groups.length > 1 ? ", by position" : ""}`;
  if (!data.fx) return <Empty h={H} t={t} title={title} sub={sub} ref={ref} brand={pack.brand} />;
  const { pts, fx } = data;
  const ticks = niceTicks(Math.min(data.x0!, data.x1!), Math.max(data.x0!, data.x1!), 6);
  // Label the best few in each band, plus highlighted players.
  const perBand = Math.max(1, Math.ceil(spec.labels / groups.length));
  const best = groups.flatMap((_, bi) => pts.filter(p => p.band === bi && !p.hi).sort((a, b) => (m.invert ? a.v - b.v : b.v - a.v)).slice(0, perBand));
  const labels = placeLabels([...pts.filter(p => p.hi), ...best].map(p => ({ x: p.px, y: p.py, r: data.rad!, text: shortName(E.name(p.r)), hi: p.hi })), { l: L, r: R, t: T, b: T + groups.length * bandH }, compact ? 13 : 11.5);
  const move = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W, y = ((e.clientY - box.top) / box.height) * H;
    let b: (typeof pts)[number] | null = null, bd = 12 ** 2;
    for (const p of pts) { const d = (p.px - x) ** 2 + (p.py - y) ** 2; if (d < bd) { bd = d; b = p; } }
    setHover(b ? { r: b.r, x: b.px, y: b.py, lines: [`${m.short} ${fmtMetric(m, b.v)}`] } : null);
  };
  const posOf = (k: string) => pack.positions.find(p => p.key === k);
  const bandFs = groups.length > 4 ? (compact ? 14 : 12.5) : compact ? 16 : 14;
  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" role="img" aria-label={`${title}. ${sub}`}>
        <Frame h={H} t={t} title={title} sub={sub} foot={`Each dot is a ${pack.nouns.player} · dashed = ${groups.length > 1 ? "position " : ""}median${m.invert ? " · axis flipped so better is to the right" : ""}`} compact={compact} brand={pack.brand}>
          {ticks.map(v => <g key={v}><line x1={fx(v)} x2={fx(v)} y1={T} y2={T + groups.length * bandH} stroke={t.line} opacity={0.5} /><text x={fx(v)} y={T + groups.length * bandH + 18} fill={t.dim} fontSize={compact ? 13 : 11.5} fontFamily={t.body} textAnchor="middle">{tickFmt(m, v)}</text></g>)}
          {groups.map((g, bi) => (
            <g key={bi}>
              {bi > 0 && <line x1={L - 80} x2={R} y1={T + bi * bandH} y2={T + bi * bandH} stroke={t.line} />}
              <text x={24} y={T + bi * bandH + bandH / 2 + 5} fill={g ? posColor(pack, t, g) : t.mute} fontFamily={t.display} fontWeight={800} fontSize={bandFs} letterSpacing="0.06em">{g ? (groups.length > 4 ? g : posOf(g)?.plural ?? g).toUpperCase() : "ALL"}</text>
              <line x1={fx(data.med![bi])} x2={fx(data.med![bi])} y1={T + bi * bandH + 6} y2={T + (bi + 1) * bandH - 6} stroke={t.mute} strokeDasharray="4 4" />
            </g>
          ))}
          {spec.color === "pos" && !splitRows && pack.positions.length > 0 && <PosLegend pack={pack} t={t} y={62} compact={compact} />}
          {pts.map(p => <circle key={p.id} cx={p.px} cy={p.py} r={p.hi ? data.rad! + 2 : data.rad!} fill={p.hi ? t.bulb : dotColor(pack, spec, t, p.r)} fillOpacity={spec.ids.length && !p.hi ? 0.3 : 0.85} stroke={p.hi ? t.ink : "none"} strokeWidth={1.4} />)}
          {labels.map(l => <text key={l.text + l.lx} x={l.x} y={l.y} textAnchor={l.anchor} fontFamily={t.body} fontWeight={700} fontSize={compact ? 13 : 11.5} fill={l.hi ? t.bulb : t.ink} stroke={t.deck} strokeWidth={3} paintOrder="stroke">{l.text}</text>)}
          <text x={(L + R) / 2} y={T + groups.length * bandH + 40} fill={t.mute} fontSize={compact ? 15 : 13} fontFamily={t.body} fontWeight={600} textAnchor="middle">{m.label} →</text>
          {hover && <circle data-noexport cx={hover.x} cy={hover.y} r={7} fill="none" stroke={t.bulb} strokeWidth={2} />}
          <rect data-noexport x={L} y={T} width={R - L} height={groups.length * bandH} fill="transparent" style={{ cursor: hover && E.href(hover.r) ? "pointer" : "default" }} onPointerMove={move} onPointerLeave={() => setHover(null)} onClick={() => hover && open(hover.r)} />
        </Frame>
      </svg>
      <Tip pack={pack} hover={hover} h={H} />
    </div>
  );
}

// ---------- compare (percentile profiles) ----------
export function Profile<R>({ pack, spec, rows, theme: t, lists, compact, ref }: ChartProps<R>) {
  const E = pack.entity;
  const metrics = useMemo(() => { const M = metricIndex(pack); return spec.metrics.map(k => M[k]).filter(Boolean); }, [pack, spec.metrics]);
  const players = useMemo(() => { const byId = new Map(rows.map(r => [E.id(r), r])); return spec.ids.map(id => byId.get(id)).filter((r): r is R => !!r).slice(0, 4); }, [E, rows, spec.ids]);
  const rowH = compact ? 36 : 34, T = 84 + (players.length ? 34 : 0), L = 150, R = W - 40;
  const H = T + Math.max(1, metrics.length) * rowH + 60;
  const pools = useMemo(() => {
    const pool = rows.filter(r => inPool(pack, spec.pool, r));
    return new Map(metrics.map(m => [m.key, makePool(pool.map(r => val(m, r)).filter((v): v is number => v !== null))]));
  }, [pack, rows, spec.pool, metrics]);
  const palette = [t.bulb, t.def, t.hot, t.good];
  const title = spec.title || (players.length ? players.map(p => shortName(E.name(p))).join(" vs ") : `Compare ${pack.nouns.players}`);
  const sub = `Percentile vs ${poolText(pack, spec.pool, lists)} · 100 = best in the pool`;
  const fx = (p: number) => L + p * (R - L);
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${title}. ${sub}`}>
      <Frame h={H} t={t} title={title} sub={sub} foot="Values shown beside each dot · grey = sample too small to rank" compact={compact} brand={pack.brand}>
        {players.length === 0 && <text x={W / 2} y={H / 2} fill={t.mute} fontFamily={t.body} fontSize={16} textAnchor="middle">Add up to four {pack.nouns.players} to compare.</text>}
        {players.map((p, i) => {
          const team = E.team(p), pos = E.pos(p);
          return (
            <g key={E.id(p)} transform={`translate(${24 + i * 190} 92)`}>
              <circle cx={7} cy={-5} r={7} fill={palette[i]} />
              <text x={20} y={0} fill={t.ink} fontFamily={t.body} fontWeight={700} fontSize={compact ? 15 : 13.5}>{shortName(E.name(p))}</text>
              <text x={20} y={15} fill={t.dim} fontFamily={t.body} fontSize={11}>{team?.short ?? ""}{pos ? `${team?.short ? " · " : ""}${pos}` : ""}</text>
            </g>
          );
        })}
        {[0, 0.25, 0.5, 0.75, 1].map(v => <g key={v}><line x1={fx(v)} x2={fx(v)} y1={T - 4} y2={T + metrics.length * rowH} stroke={t.line} strokeDasharray={v === 0.5 ? "4 4" : undefined} opacity={v === 0.5 ? 1 : 0.5} /><text x={fx(v)} y={T + metrics.length * rowH + 18} fill={t.dim} fontSize={11.5} fontFamily={t.body} textAnchor="middle">{Math.round(v * 100)}</text></g>)}
        {metrics.map((m, mi) => {
          const y = T + mi * rowH + rowH / 2, pool = pools.get(m.key)!;
          return (
            <g key={m.key}>
              <text x={L - 12} y={y + 4} fill={t.ink} fontFamily={t.body} fontWeight={600} fontSize={compact ? 15 : 13} textAnchor="end">{m.short}</text>
              <rect x={L} y={y - 3} width={R - L} height={6} rx={3} fill={t.line} />
              {players.map((p, i) => {
                const v = val(m, p), pc = v === null ? null : pool.pct(v, m.invert);
                if (pc === null) return <text key={E.id(p)} x={R + 6} y={y + 4} fill={t.dim} fontSize={10} fontFamily={t.body}>{i === 0 ? "—" : ""}</text>;
                const yy = y + (i - (players.length - 1) / 2) * 5;
                return (
                  <g key={E.id(p)}>
                    <circle cx={fx(pc)} cy={yy} r={7} fill={palette[i]} stroke={t.bg} strokeWidth={1.5}><title>{`${E.name(p)}: ${fmtMetric(m, v)} (${pctLabel(pc)} percentile)`}</title></circle>
                    {players.length === 1 && <text x={fx(pc) + (pc > 0.85 ? -12 : 12)} y={y - 9} textAnchor={pc > 0.85 ? "end" : "start"} fill={t.mute} fontFamily={t.body} fontSize={11}>{fmtMetric(m, v)} · {pctLabel(pc)}</text>}
                  </g>
                );
              })}
            </g>
          );
        })}
      </Frame>
    </svg>
  );
}

const CHARTS = { scatter: Scatter, bars: Bars, swarm: Swarm, profile: Profile } as const;
/** Render whichever chart type the spec asks for. */
export function Chart<R>(props: ChartProps<R>) {
  const C = CHARTS[props.spec.type] as (p: ChartProps<R>) => ReactNode;
  return <C {...props} />;
}
