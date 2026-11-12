import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";
import SiteShell from "@/components/site-shell";
import { getMeta } from "@/lib/server-data";

export const metadata: Metadata = {
  title: { default: "D1 Hoops — College Basketball Analytics", template: "%s · D1 Hoops" },
  description: "Opponent-adjusted power ratings, game predictions, team scouting and player leaderboards for every NCAA Division I men's basketball team.",
  applicationName: "D1 Hoops",
  appleWebApp: { capable: true, title: "D1 Hoops", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#0b0d12", width: "device-width", initialScale: 1, viewportFit: "cover" };

// Runs before first paint: saved choice, else the device setting.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("d1h-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="light"?"#f5f6fa":"#0b0d12")}catch(e){document.documentElement.dataset.theme="dark"}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const meta = getMeta();
  const updated = new Date(meta.updated.teams ?? meta.updated.built).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" });
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <SiteShell updated={updated}>{children}</SiteShell>
      </body>
    </html>
  );
}
