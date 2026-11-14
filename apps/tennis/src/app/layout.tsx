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
export const viewport: Viewport = { themeColor: "#0E0F12", width: "device-width", initialScale: 1, viewportFit: "cover" };

// Site default accent (a viewer's own pick in the colour picker still wins).
const ACCENT = `html[data-site="tennis"][data-palette="blacktop"]{--bulb-rgb:212 255 58}`;

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
