"use client";
// Charts draw with literal colours (read from the palette's CSS variables) so an exported
// PNG/SVG looks exactly like the page. Re-reads when the viewer switches palette or accent.
import { useEffect, useState } from "react";

export type ChartTheme = { bg: string; deck: string; line: string; line2: string; ink: string; mute: string; dim: string; bulb: string; good: string; bad: string; off: string; def: string; hot: string; display: string; body: string };

const FALLBACK: ChartTheme = { bg: "#0f1b2e", deck: "#16263d", line: "#24375a", line2: "#344b72", ink: "#eef2f7", mute: "#a0afc6", dim: "#7687a2", bulb: "#ffb31f", good: "#45d69e", bad: "#ff6b6b", off: "#ff825c", def: "#5eb8ff", hot: "#ff4d8d", display: "'Big Shoulders Display Variable', 'Arial Narrow', sans-serif", body: "Barlow, system-ui, sans-serif" };

function read(): ChartTheme {
  if (typeof window === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const rgb = (v: string, fb: string) => { const s = cs.getPropertyValue(v).trim(); return s ? `rgb(${s.split(/\s+/).join(",")})` : fb; };
  return {
    bg: rgb("--bg-rgb", FALLBACK.bg), deck: rgb("--deck-rgb", FALLBACK.deck), line: rgb("--line-rgb", FALLBACK.line), line2: rgb("--line-2-rgb", FALLBACK.line2),
    ink: rgb("--ink-rgb", FALLBACK.ink), mute: rgb("--mute-rgb", FALLBACK.mute), dim: rgb("--dim-rgb", FALLBACK.dim), bulb: rgb("--bulb-rgb", FALLBACK.bulb),
    good: rgb("--good-rgb", FALLBACK.good), bad: rgb("--bad-rgb", FALLBACK.bad), off: rgb("--off-rgb", FALLBACK.off), def: rgb("--def-rgb", FALLBACK.def), hot: rgb("--hot-rgb", FALLBACK.hot),
    display: FALLBACK.display, body: FALLBACK.body,
  };
}

export function useChartTheme() {
  const [t, setT] = useState<ChartTheme>(FALLBACK);
  useEffect(() => {
    setT(read());
    const mo = new MutationObserver(() => setT(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-palette", "style", "class"] });
    return () => mo.disconnect();
  }, []);
  return t;
}

/** Position colours (guards / forwards / centers / unknown). */
export const posColor = (t: ChartTheme, p: string | null) => (p === "G" ? t.def : p === "F" ? t.bulb : p === "C" ? t.off : t.dim);

/** Download an on-page <svg> as SVG or a 2× PNG. */
export async function exportSvg(svg: SVGSVGElement, name: string, kind: "png" | "svg", bg: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.querySelectorAll("[data-noexport]").forEach(n => n.remove());
  const vb = svg.viewBox.baseVal;
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  Object.entries({ x: vb.x, y: vb.y, width: vb.width, height: vb.height, fill: bg }).forEach(([k, v]) => rect.setAttribute(k, String(v)));
  clone.insertBefore(rect, clone.firstChild);
  clone.setAttribute("width", String(vb.width)); clone.setAttribute("height", String(vb.height));
  const text = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
  const save = (b: Blob, ext: string) => {
    const url = URL.createObjectURL(b);
    Object.assign(document.createElement("a"), { href: url, download: `${name}.${ext}` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  if (kind === "svg") return save(blob, "svg");
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("render failed")); img.src = url; });
  const c = document.createElement("canvas");
  c.width = vb.width * 2; c.height = vb.height * 2;
  const ctx = c.getContext("2d")!;
  ctx.scale(2, 2); ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  c.toBlob(b => b && save(b, "png"), "image/png");
}
