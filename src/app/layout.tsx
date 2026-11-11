import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "D1 Hoops — College Basketball Intelligence",
  description: "A transparent, data-first analytics workspace for 2026–27 NCAA Division I men's basketball.",
  applicationName: "D1 Hoops",
  appleWebApp: { capable: true, title: "D1 Hoops", statusBarStyle: "black-translucent" },
  themeColor: "#090d14",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
