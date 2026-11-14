import type { Metadata, Viewport } from "next";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource-variable/big-shoulders-display";
import "@fontsource-variable/doto";
import "./globals.css";
import SiteShell from "@/components/site-shell";
import { getMeta } from "@/lib/server-data";
import { THEME_SCRIPT } from "@/lib/theme";

// Metadata URLs are not basePath-aware, so prefix them (GitHub Pages serves under /D1-Basketball-Analytics).
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: { default: "D1 Hoops — College Basketball Analytics", template: "%s · D1 Hoops" },
  description: "Opponent-adjusted power ratings, game predictions, team scouting and player leaderboards for every NCAA Division I men's basketball team.",
  applicationName: "D1 Hoops",
  appleWebApp: { capable: true, title: "D1 Hoops", statusBarStyle: "black-translucent" },
  manifest: `${BASE}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${BASE}/icons/icon.svg`, type: "image/svg+xml" },
      { url: `${BASE}/icons/favicon-32.png`, sizes: "32x32", type: "image/png" },
      { url: `${BASE}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: `${BASE}/icons/apple-touch-icon.png`, sizes: "180x180" }],
  },
};
export const viewport: Viewport = { themeColor: "#0F1B2E", width: "device-width", initialScale: 1, viewportFit: "cover" };

// THEME_SCRIPT runs before first paint: saved palette + accent, else the device setting.

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const meta = getMeta();
  const updated = new Date(meta.updated.teams ?? meta.updated.built).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" });
  return (
    <html lang="en" data-theme="dark" data-palette="arena" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <SiteShell updated={updated}>{children}</SiteShell>
      </body>
    </html>
  );
}
