import type { Metadata, Viewport } from "next";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource-variable/big-shoulders-display";
import "@fontsource-variable/doto";
import "@sports/ui/theme.css";
import "./maps.css";
import { THEME_SCRIPT } from "@sports/ui/theme";
import { Shell } from "@/site";

export const metadata: Metadata = { title: { default: "Gridiron", template: "%s · Gridiron" }, applicationName: "Gridiron" };
export const viewport: Viewport = { themeColor: "#0F1114", width: "device-width", initialScale: 1, viewportFit: "cover" };

// Site default accent (a viewer's own pick in the colour picker still wins).
// "Game film": dark film-room charcoal, chalk-white lines, pylon orange accent, turf greens for the field.
const ACCENT = `html[data-site="football"][data-palette="blacktop"]{--bg-rgb:15 17 20;--deck-rgb:24 27 32;--deck-2-rgb:33 37 44;--line-rgb:44 49 58;--line-2-rgb:64 71 83;--ink-rgb:244 244 240;--mute-rgb:170 174 180;--dim-rgb:120 126 134;--bulb-rgb:255 90 54;--def-rgb:90 160 255;--off-rgb:255 196 61;--good-rgb:94 214 133;--win-rgb:94 214 133;--bad-rgb:255 92 102;--loss-rgb:255 92 102}
html[data-site="football"]{--turf:#1d5b33;--turf-2:#226a3b;--chalk:rgba(255,255,255,.85)}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" data-palette="blacktop" data-site="football" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: ACCENT }} />
      </head>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
