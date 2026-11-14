// Colour themes. Every colour in the app comes from CSS variables set per palette in
// globals.css (html[data-palette="…"]). This file lists the palettes and accent swatches
// the picker offers, and applies the viewer's choice. To add a palette: add a block to
// globals.css and an entry here. To change the default look: edit the "arena" block.

export type Mode = "dark" | "light";
export type Palette = { id: string; name: string; note: string; mode: Mode; bg: string; deck: string; ink: string; accent: string; themeColor: string };

export const PALETTES: Palette[] = [
  { id: "arena", name: "Arena", note: "Scoreboard navy, amber bulbs", mode: "dark", bg: "#0F1B2E", deck: "#16263D", ink: "#EEF2F7", accent: "#FFB31F", themeColor: "#0F1B2E" },
  { id: "blacktop", name: "Blacktop", note: "Night court, neon lights", mode: "dark", bg: "#0E0F12", deck: "#191B20", ink: "#F2F3F5", accent: "#3DF59A", themeColor: "#0E0F12" },
  { id: "hardwood", name: "Hardwood", note: "Maple floor, painted lines", mode: "light", bg: "#F3EADB", deck: "#FCF8F1", ink: "#221A12", accent: "#C2560E", themeColor: "#F3EADB" },
  { id: "daygame", name: "Day game", note: "Bright gym, clean whites", mode: "light", bg: "#F5F6F9", deck: "#FFFFFF", ink: "#101828", accent: "#D97F00", themeColor: "#F5F6F9" },
];

/** Accent swatches. null = the palette's own accent. */
export const ACCENTS: { name: string; hex: string | null }[] = [
  { name: "Palette default", hex: null },
  { name: "Amber", hex: "#FFB31F" },
  { name: "Neon green", hex: "#3DF59A" },
  { name: "Hot pink", hex: "#FF4D9D" },
  { name: "Electric blue", hex: "#3DA9FF" },
  { name: "Tangerine", hex: "#FF7A1A" },
  { name: "Violet", hex: "#A77BFF" },
  { name: "Red", hex: "#FF4B4B" },
];

export const DEFAULT_PALETTE = "arena";
export const AUTO = "auto"; // follow the device: Arena when dark, Day game when light
const K_PALETTE = "d1h-palette", K_ACCENT = "d1h-accent", K_LEGACY = "d1h-theme";
const HEX = /^#[0-9a-f]{6}$/i;

export type ThemeChoice = { palette: string; accent: string | null };

export function hexToChannels(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function readChoice(): ThemeChoice {
  try {
    let palette = localStorage.getItem(K_PALETTE);
    if (!palette) { const legacy = localStorage.getItem(K_LEGACY); palette = legacy === "light" ? "daygame" : legacy === "dark" ? "arena" : AUTO; }
    const accent = localStorage.getItem(K_ACCENT);
    return { palette: palette === AUTO || PALETTES.some(p => p.id === palette) ? palette : AUTO, accent: accent && HEX.test(accent) ? accent : null };
  } catch { return { palette: AUTO, accent: null }; }
}

export function resolvePalette(id: string): Palette {
  if (id === AUTO) {
    const light = typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches;
    return PALETTES.find(p => p.id === (light ? "daygame" : DEFAULT_PALETTE))!;
  }
  return PALETTES.find(p => p.id === id) ?? PALETTES[0];
}

export function applyChoice(c: ThemeChoice) {
  const p = resolvePalette(c.palette), el = document.documentElement;
  el.dataset.palette = p.id;
  el.dataset.theme = p.mode;
  if (c.accent && HEX.test(c.accent)) el.style.setProperty("--bulb-rgb", hexToChannels(c.accent));
  else el.style.removeProperty("--bulb-rgb");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", p.themeColor);
}

export function saveChoice(c: ThemeChoice) {
  try {
    localStorage.setItem(K_PALETTE, c.palette);
    if (c.accent) localStorage.setItem(K_ACCENT, c.accent); else localStorage.removeItem(K_ACCENT);
    localStorage.removeItem(K_LEGACY);
  } catch { /* private mode: the choice lasts for this visit */ }
  applyChoice(c);
  window.dispatchEvent(new Event("d1h-theme-change"));
}

/** Inline script for <head>: applies the saved theme before first paint (no flash). */
export const THEME_SCRIPT = `(function(){try{var P=${JSON.stringify(PALETTES.map(p => [p.id, p.mode, p.themeColor]))};var s=localStorage,id=s.getItem("${K_PALETTE}");if(!id){var l=s.getItem("${K_LEGACY}");id=l==="light"?"daygame":l==="dark"?"arena":"auto"}if(id==="auto")id=matchMedia("(prefers-color-scheme: light)").matches?"daygame":"${DEFAULT_PALETTE}";var p=P.filter(function(x){return x[0]===id})[0]||P[0];var e=document.documentElement;e.dataset.palette=p[0];e.dataset.theme=p[1];var a=s.getItem("${K_ACCENT}");if(a&&/^#[0-9a-f]{6}$/i.test(a)){var n=parseInt(a.slice(1),16);e.style.setProperty("--bulb-rgb",(n>>16&255)+" "+(n>>8&255)+" "+(n&255))}var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",p[2])}catch(x){document.documentElement.dataset.palette="${DEFAULT_PALETTE}";document.documentElement.dataset.theme="dark"}})()`;
