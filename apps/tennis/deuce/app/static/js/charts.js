// Hand-rolled SVG charts: radar, time-series lines, calibration. No library.
import { h, s } from "./dom.js";

export function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

// ------------------------------------------------------------------ radar

export function radar(data, { size = 320 } = {}) {
  const p1 = (data && data.p1) || {};
  const p2 = (data && data.p2) || {};
  const axes = Array.from(new Set([...Object.keys(p1), ...Object.keys(p2)]));
  if (axes.length < 3) return null;
  const pad = 84;
  const W = size + pad * 2;
  const c = W / 2;
  const R = size / 2;
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
  const pt = (i, v) => {
    const r = (Math.max(0, Math.min(100, Number(v) || 0)) / 100) * R;
    return [c + r * Math.cos(ang(i)), c + r * Math.sin(ang(i))];
  };
  const svg = s("svg", { class: "radar", viewBox: `0 ${pad - 42} ${W} ${size + 88}`, role: "img", "aria-label": "Attribute radar comparing both players" });
  for (const ring of [25, 50, 75, 100]) {
    svg.append(s("polygon", { class: "ring", points: axes.map((_, i) => pt(i, ring).join(",")).join(" ") }));
  }
  axes.forEach((a, i) => {
    const [x, y] = pt(i, 100);
    svg.append(s("line", { class: "spoke", x1: c, y1: c, x2: x, y2: y }));
    const lx = c + (R + 14) * Math.cos(ang(i));
    const ly = c + (R + 14) * Math.sin(ang(i));
    const cos = Math.cos(ang(i));
    const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
    const dy = Math.sin(ang(i)) > 0.5 ? 14 : Math.sin(ang(i)) < -0.5 ? -4 : 5;
    const words = String(a).split(" ");
    if (words.length > 1 && String(a).length > 10) {
      const half = Math.ceil(words.length / 2);
      const top = Math.sin(ang(i)) < -0.5 ? -16 : Math.sin(ang(i)) > 0.5 ? 0 : -8;
      svg.append(s("text", { class: "ax", x: lx, y: ly + dy + top, "text-anchor": anchor },
        s("tspan", { x: lx }, words.slice(0, half).join(" ")),
        s("tspan", { x: lx, dy: 17 }, words.slice(half).join(" "))));
    } else {
      svg.append(s("text", { class: "ax", x: lx, y: ly + dy, "text-anchor": anchor }, a));
    }
  });
  const poly = (vals, cls) => s("polygon", { class: cls, points: axes.map((a, i) => pt(i, vals[a]).join(",")).join(" ") });
  svg.append(poly(p2, "poly2"), poly(p1, "poly1"));
  return svg;
}

// ------------------------------------------------------------------ time-series line chart

/**
 * opts: { width, height, series: [{cls, points:[{x:Date|number, y}], label, labelCls}],
 *         dashed: [{points}], splits: [{x, label}], yFormat, xFormat, zero: bool,
 *         tip: (seriesPoint) => [strong, rest] }
 */
export function lineChart(opts) {
  const width = Math.max(260, Math.floor(opts.width || 600));
  const height = opts.height || 260;
  const m = { t: opts.splits && opts.splits.length ? 26 : 12, r: opts.marginRight ?? 16, b: 28, l: opts.marginLeft ?? 52 };
  const all = [...opts.series, ...(opts.dashed || [])].flatMap((sr) => sr.points);
  if (!all.length) return null;
  const xs = all.map((p) => +p.x);
  const ys = all.map((p) => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 3600e3; x1 += 3600e3; }
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (opts.zero) { y0 = Math.min(0, y0); y1 = Math.max(0, y1); }
  const padY = (y1 - y0 || 1) * 0.08;
  const ticks = niceTicks(y0 - padY, y1 + padY, 4);
  y0 = Math.min(y0 - padY, ticks[0]); y1 = Math.max(y1 + padY, ticks[ticks.length - 1]);
  const X = (v) => m.l + ((+v - x0) / (x1 - x0)) * (width - m.l - m.r);
  const Y = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * (height - m.t - m.b);

  const svg = s("svg", { class: "chart", width, height, viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": opts.label || "Chart" });
  for (const t of ticks) {
    if (t < y0 || t > y1) continue;
    svg.append(s("line", { class: opts.zero && t === 0 ? "zero" : "grid", x1: m.l, x2: width - m.r, y1: Y(t), y2: Y(t) }));
    svg.append(s("text", { class: "axis", x: m.l - 8, y: Y(t) + 4, "text-anchor": "end" }, (opts.yFormat || String)(t)));
  }
  // x labels
  const xt = timeTicks(x0, x1, Math.max(2, Math.floor((width - m.l - m.r) / 110)), opts.xUnit);
  for (const t of xt) {
    svg.append(s("text", { class: "axis", x: X(t.v), y: height - 8, "text-anchor": "middle" }, t.label));
  }
  for (const sp of opts.splits || []) {
    let x = X(sp.x);
    if (x < m.l && +sp.x > x0 - 45 * 864e5) x = m.l;
    if (x < m.l - 1 || x > width - m.r + 1) continue;
    svg.append(s("line", { class: "splitline", x1: x, x2: x, y1: m.t - 18, y2: height - m.b }));
    svg.append(s("text", { class: "splitlbl", x: x + 6, y: m.t - 8 }, sp.label));
  }
  const path = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join("");
  for (const d of opts.dashed || []) {
    if (d.points.length > 1) svg.append(s("path", { class: "base", d: path(d.points) }));
  }
  const dashedLabels = (opts.dashed || []).filter((d) => d.label && d.points.length).map((d) => {
    const last = d.points[d.points.length - 1];
    return s("text", { class: "axis dl", x: Math.min(X(last.x), width - m.r) - 4, y: Y(last.y) + 16, "text-anchor": "end" }, d.label);
  });
  for (const sr of opts.series) {
    if (sr.points.length > 1) svg.append(s("path", { class: sr.cls, d: path(sr.points) }));
    else if (sr.points.length === 1) svg.append(s("circle", { class: sr.dotCls || "dot1", cx: X(sr.points[0].x), cy: Y(sr.points[0].y), r: 3.5 }));
    if (sr.showDots) for (const p of sr.points) svg.append(s("circle", { class: sr.dotCls, cx: X(p.x), cy: Y(p.y), r: 3 }));
    if (sr.label && sr.points.length) {
      const last = sr.points[sr.points.length - 1];
      svg.append(s("text", { class: `direct ${sr.labelCls || ""}`, x: X(last.x) + 10, y: Y(last.y) + 5 }, sr.label));
    }
  }

  svg.append(...dashedLabels);

  // Scrubbing on the first series: a vertical rule and a value callout.
  if (opts.tip && opts.series[0] && opts.series[0].points.length > 1 && opts.tipHost) {
    const pts = opts.series[0].points;
    const rule = s("line", { class: "scrub", y1: m.t, y2: height - m.b, visibility: "hidden" });
    const dot = s("circle", { class: opts.series[0].dotCls || "dot1", r: 4, visibility: "hidden" });
    svg.append(rule, dot);
    const tip = h("div", { class: "chart-tip" });
    opts.tipHost.append(tip);
    const hide = () => { rule.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.style.display = "none"; };
    svg.addEventListener("pointermove", (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * width;
      const xv = x0 + ((px - m.l) / (width - m.l - m.r)) * (x1 - x0);
      let lo = 0, hi = pts.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (+pts[mid].x < xv) lo = mid; else hi = mid; }
      const p = Math.abs(+pts[lo].x - xv) < Math.abs(+pts[hi].x - xv) ? pts[lo] : pts[hi];
      const cx = X(p.x), cy = Y(p.y);
      rule.setAttribute("x1", cx); rule.setAttribute("x2", cx); rule.setAttribute("visibility", "visible");
      dot.setAttribute("cx", cx); dot.setAttribute("cy", cy); dot.setAttribute("visibility", "visible");
      const [strong, rest] = opts.tip(p);
      tip.replaceChildren(h("b", null, strong), " ", rest);
      const hostRect = opts.tipHost.getBoundingClientRect();
      tip.style.left = `${rect.left - hostRect.left + (cx / width) * rect.width}px`;
      tip.style.top = `${rect.top - hostRect.top + (cy / height) * rect.height - 10}px`;
      tip.style.display = "block";
    });
    svg.addEventListener("pointerleave", hide);
  }
  return svg;
}

const monthFmt = new Intl.DateTimeFormat(undefined, { month: "short" });
const monthYearFmt = new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" });
const dayMonthFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const hourFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

function timeTicks(x0, x1, maxTicks) {
  const span = x1 - x0;
  const day = 864e5;
  const out = [];
  if (span > 400 * day) {
    const y0 = new Date(x0).getFullYear(), y1 = new Date(x1).getFullYear();
    const years = [];
    for (let y = y0; y <= y1 + 1; y++) years.push(y);
    let step = 1;
    while (years.length / step > maxTicks) step++;
    for (let i = 0; i < years.length; i += step) {
      const v = +new Date(years[i], 0, 1);
      if (v >= x0 && v <= x1) out.push({ v, label: String(years[i]) });
    }
    if (out.length < 2) {
      // fall back to quarter ticks
      return monthTicks(x0, x1, maxTicks, 3);
    }
    return out;
  }
  if (span > 45 * day) return monthTicks(x0, x1, maxTicks, 1);
  if (span > 2 * day) {
    const n = Math.min(maxTicks, 6);
    for (let i = 0; i <= n; i++) {
      const v = x0 + (span * i) / n;
      out.push({ v, label: dayMonthFmt.format(new Date(v)) });
    }
    return dedupe(out);
  }
  const n = Math.min(maxTicks, 4);
  for (let i = 0; i <= n; i++) {
    const v = x0 + (span * i) / n;
    out.push({ v, label: hourFmt.format(new Date(v)) });
  }
  return dedupe(out);
}

function monthTicks(x0, x1, maxTicks, baseStep) {
  const out = [];
  const d0 = new Date(x0);
  const months = [];
  for (let d = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); +d <= x1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);
  let step = baseStep;
  while (months.length / step > maxTicks) step += baseStep;
  for (let i = 0; i < months.length; i += step) {
    const d = months[i];
    out.push({ v: +d, label: d.getMonth() === 0 || i === 0 ? monthYearFmt.format(d) : monthFmt.format(d) });
  }
  return out;
}

function dedupe(ticks) {
  const seen = new Set();
  return ticks.filter((t) => (seen.has(t.label) ? false : (seen.add(t.label), true)));
}

// ------------------------------------------------------------------ calibration

export function calibration(points, { size = 340 } = {}) {
  const pts = (points || []).map((p) => ({
    x: num(p.predicted ?? p.pred ?? p.mean_pred ?? p.prob ?? p.p),
    y: num(p.actual ?? p.observed ?? p.frac ?? p.rate ?? p.win_rate),
    n: num(p.n ?? p.count) || 0,
  })).filter((p) => p.x !== null && p.y !== null);
  if (!pts.length) return null;
  const m = { t: 10, r: 12, b: 40, l: 58 };
  const W = size, H = size;
  const X = (v) => m.l + v * (W - m.l - m.r);
  const Y = (v) => m.t + (1 - v) * (H - m.t - m.b);
  const svg = s("svg", { class: "chart calib", viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Calibration: predicted probability against how often it happened" });
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    svg.append(s("line", { class: "grid", x1: X(0), x2: X(1), y1: Y(t), y2: Y(t) }));
    svg.append(s("text", { class: "axis", x: m.l - 8, y: Y(t) + 4, "text-anchor": "end" }, `${t * 100}%`));
    svg.append(s("text", { class: "axis", x: X(t), y: H - 22, "text-anchor": "middle" }, `${t * 100}%`));
  }
  svg.append(s("text", { class: "axis", x: X(0.5), y: H - 4, "text-anchor": "middle" }, "Model said"));
  svg.append(s("text", { class: "axis", x: 10, y: Y(0.5), "text-anchor": "middle", transform: `rotate(-90 10 ${Y(0.5)})` }, "It happened"));
  svg.append(s("line", { class: "diag", x1: X(0), y1: Y(0), x2: X(1), y2: Y(1) }));
  const maxN = Math.max(...pts.map((p) => p.n), 1);
  for (const p of pts) {
    const r = 3 + 7 * Math.sqrt(p.n / maxN);
    const c = s("circle", { class: "cdot", cx: X(p.x), cy: Y(p.y), r });
    c.append(s("title", null, `Model ${(p.x * 100).toFixed(0)}%, happened ${(p.y * 100).toFixed(0)}%${p.n ? `, ${p.n.toLocaleString()} matches` : ""}`));
    svg.append(c);
  }
  return svg;
}

function num(v) {
  const n = Number(v);
  return v === null || v === undefined || Number.isNaN(n) ? null : n;
}
