"use client";

import { useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";

type Props = {
  kind: "team" | "player";
  title: string;
  subtitle: string;
  color: string | null;
  stats: { label: string; value: string }[];
  href: string;
  rankLabel?: string;
};

const W = 1200;
const H = 630;
const FALLBACK_BG = "#0F1B2E";
const DARK_INK = "#0F1B2E";
const LIGHT_INK = "#FFFFFF";
const FONT = "Big Shoulders Display, Impact, sans-serif";
const BODY_FONT = "system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Parses #rgb or #rrggbb into [r, g, b] in 0-255, or null. */
function parseHex(hex: string | null): [number, number, number] | null {
  if (!hex) return null;
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Picks whichever of the two inks reads better on the background. */
function inkFor(bg: [number, number, number]): string {
  const L = relLuminance(bg);
  const dark = contrast(L, relLuminance(parseHex(DARK_INK)!));
  const light = contrast(L, relLuminance([255, 255, 255]));
  return dark >= light ? DARK_INK : LIGHT_INK;
}

function buildSvg(p: Props, url: string): string {
  const bg = parseHex(p.color) ?? parseHex(FALLBACK_BG)!;
  const bgDark = bg.map((v) => v * 0.6) as [number, number, number];
  const ink = inkFor(bg);
  const titleSize = p.title.length > 18 ? 96 : 124;
  const stats = p.stats.slice(0, 4);
  const colW = stats.length ? Math.min(260, (W - 160) / stats.length) : 0;

  const plate = p.rankLabel
    ? (() => {
        const text = p.rankLabel;
        const w = Math.max(120, text.length * 16 + 48);
        return `<rect x="60" y="56" width="${w}" height="64" rx="12" fill="${DARK_INK}" fill-opacity="0.92" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="2"/>
  <text x="${60 + w / 2}" y="99" text-anchor="middle" font-family="${esc(BODY_FONT)}" font-weight="700" font-size="30" fill="${LIGHT_INK}">${esc(text)}</text>`;
      })()
    : "";

  const statEls = stats
    .map((s, i) => {
      const x = 80 + i * colW;
      return `<text x="${x}" y="470" font-family="${esc(BODY_FONT)}" font-weight="600" font-size="22" letter-spacing="2" fill="${ink}" fill-opacity="0.7">${esc(s.label.toUpperCase())}</text>
  <text x="${x}" y="530" font-family="${esc(FONT)}" font-weight="900" font-size="60" fill="${ink}">${esc(s.value)}</text>`;
    })
    .join("\n  ");

  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  })();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${toHex(bg)}"/>
      <stop offset="1" stop-color="${toHex(bgDark)}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="${H - 8}" width="${W}" height="8" fill="${ink}" fill-opacity="0.25"/>
  ${plate}
  <text x="80" y="300" font-family="${esc(FONT)}" font-weight="900" font-size="${titleSize}" fill="${ink}">${esc(p.title)}</text>
  <text x="80" y="362" font-family="${esc(BODY_FONT)}" font-weight="500" font-size="36" fill="${ink}" fill-opacity="0.85">${esc(p.subtitle)}</text>
  ${statEls}
  <text x="80" y="590" font-family="${esc(BODY_FONT)}" font-weight="500" font-size="22" fill="${ink}" fill-opacity="0.7">${esc(`Sports Analytics · ${host}${p.href}`)}</text>
</svg>`;
}

function svgToPng(svg: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("no 2d context"));
        return;
      }
      ctx.drawImage(img, 0, 0, W, H);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export default function ShareCard(props: Props) {
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function flash(text: string) {
    if (!mounted.current) return;
    setLabel(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (mounted.current) setLabel(null);
    }, 2000);
  }

  async function onShare() {
    if (busy) return;
    setBusy(true);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const url = location.origin + basePath + props.href;
    const slug = props.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "card";
    try {
      const svg = buildSvg(props, url);
      const blob = await svgToPng(svg);
      const file = new File([blob], `${slug}.png`, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: props.title, url });
        } catch (err) {
          if (!(err instanceof DOMException && err.name === "AbortError")) throw err;
        }
      } else {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = `${slug}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objUrl), 1000);

        let copied = false;
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            copied = true;
          }
        } catch {
          copied = false;
        }
        flash(copied ? "Link copied" : "Saved image");
      }
    } catch {
      flash("Share failed");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn"
      onClick={onShare}
      disabled={busy}
      aria-live="polite"
    >
      <Share2 size={16} aria-hidden="true" />{" "}
      {label ?? "Share"}
    </button>
  );
}
