"use client";
// Point funnels: how service (or return) points split, drawn as stacked rows like court
// lines. Each row is 100% of the row above it, so widths read as shares of all points.
import { pct, type Totals } from "@/lib/season";

type Cell = { label: string; v: number; tone: "good" | "bad" | "neutral" | "ball"; note?: string };
type Row = Cell[][]; // groups of cells; each group sits under one cell of the row above

function Funnel({ title, total, rows, caption }: { title: string; total: number; rows: Row[]; caption: string }) {
  const fill = { good: "rgb(var(--good-rgb) / .85)", bad: "rgb(var(--bad-rgb) / .8)", neutral: "rgb(var(--def-rgb) / .55)", ball: "rgb(var(--bulb-rgb) / .9)" };
  return (
    <figure className="m-0">
      <h3 className="font-display mb-2 text-xl font-extrabold">{title}</h3>
      <div className="flex flex-col gap-1.5">
        {rows.map((row, ri) => (
          <div key={ri} className="flex h-12 gap-1.5">
            {row.flat().map((c, ci) => (
              <div key={ci} className="flex min-w-0 flex-col justify-center overflow-hidden rounded-md px-2 text-[12px] leading-tight"
                style={{ flexGrow: Math.max(c.v, 0.0001), flexBasis: 0, minWidth: c.v > 0 ? "2.75rem" : 0, background: fill[c.tone], color: c.tone === "neutral" ? "rgb(var(--ink-rgb))" : "rgb(var(--bg-rgb))" }}
                title={`${c.label}: ${pct(total ? c.v / total : null, 1)} of all points`}>
                <b className="truncate text-[15px] font-extrabold">{pct(total ? c.v / total : null)}</b>
                <span className="truncate font-semibold">{c.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <figcaption className="mt-2 text-xs text-dim">{caption}</figcaption>
    </figure>
  );
}

export function ServeFunnel({ t }: { t: Totals }) {
  const second = t.sp - t.fi, secondIn = Math.max(0, second - t.df);
  return (
    <Funnel title="On serve" total={t.sp} caption={`${Math.round(t.sp).toLocaleString("en-US")} service points (estimated). ${t.ac} aces, ${t.df} double faults.`} rows={[
      [[{ label: "1st serve in", v: t.fi, tone: "neutral" }], [{ label: "2nd serve", v: second, tone: "neutral" }]],
      [[{ label: "Won on 1st", v: t.fw, tone: "good" }, { label: "Lost on 1st", v: t.fi - t.fw, tone: "bad" }],
       [{ label: "Won on 2nd", v: t.sw, tone: "good" }, { label: "Lost on 2nd", v: Math.max(0, secondIn - t.sw), tone: "bad" }, { label: "Double fault", v: t.df, tone: "ball" }]],
    ]} />
  );
}

export function ReturnFunnel({ t }: { t: Totals }) {
  const second = t.rp - t.rf;
  return (
    <Funnel title="On return" total={t.rp} caption={`${Math.round(t.rp).toLocaleString("en-US")} return points (estimated). Broke serve ${t.bpv} times from ${t.bpc} break points.`} rows={[
      [[{ label: "vs 1st serve", v: t.rf, tone: "neutral" }], [{ label: "vs 2nd serve", v: second, tone: "neutral" }]],
      [[{ label: "Won vs 1st", v: t.rfw, tone: "good" }, { label: "Lost vs 1st", v: t.rf - t.rfw, tone: "bad" }],
       [{ label: "Won vs 2nd", v: t.rsw, tone: "good" }, { label: "Lost vs 2nd", v: Math.max(0, second - t.rsw), tone: "bad" }]],
    ]} />
  );
}
