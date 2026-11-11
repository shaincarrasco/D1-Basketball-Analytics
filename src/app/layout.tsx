import type { Metadata, Viewport } from "next";
import "@fontsource-variable/big-shoulders-display";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "./globals.css";
import SiteShell from "@/components/site-shell";
import { getMeta } from "@/lib/server-data";

export const metadata: Metadata = {
  title: { default: "D1 Hoops — College Basketball Analytics", template: "%s · D1 Hoops" },
  description: "Opponent-adjusted power ratings, game predictions, team scouting and player leaderboards for every NCAA Division I men's basketball team.",
  applicationName: "D1 Hoops",
  appleWebApp: { capable: true, title: "D1 Hoops", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#070b1a", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const meta = getMeta();
  const updated = new Date(meta.updated.teams ?? meta.updated.built).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" });
  return (
    <html lang="en">
      <body>
        <SiteShell updated={updated}>{children}</SiteShell>
      </body>
    </html>
  );
}
