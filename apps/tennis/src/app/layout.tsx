import type { Metadata, Viewport } from "next";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource-variable/big-shoulders-display";
import "@fontsource-variable/doto";
import "@sports/ui/theme.css";
import { THEME_SCRIPT } from "@sports/ui/theme";
import { Shell } from "@/site";

export const metadata: Metadata = { title: { default: "Baseline", template: "%s · Baseline" }, applicationName: "Baseline" };
export const viewport: Viewport = { themeColor: "#091826", width: "device-width", initialScale: 1, viewportFit: "cover" };

// Baseline's own palette ("night session": court navy, white lines, ball-yellow highlights)
// on top of the shared Blacktop theme, plus surface colours used by every chart.
// A viewer's own palette or accent pick in the colour picker still wins.
const ACCENT = `html[data-site="tennis"][data-palette="blacktop"]{--bg-rgb:9 24 38;--deck-rgb:15 34 52;--deck-2-rgb:22 45 68;--line-rgb:33 59 86;--line-2-rgb:50 80 110;--ink-rgb:240 245 250;--mute-rgb:160 178 196;--dim-rgb:112 132 154;--bulb-rgb:223 255 79;--off-rgb:232 112 58;--def-rgb:77 141 255;--good-rgb:92 214 140;--win-rgb:92 214 140;--bad-rgb:255 99 110;--loss-rgb:255 99 110;--scoreboard-rgb:5 14 22}
html[data-site="tennis"]{--hard:#3D7BFF;--clay:#E2703A;--grass:#4CB86A;--other:#8A99AD}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" data-palette="blacktop" data-site="tennis" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: ACCENT }} />
      </head>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
