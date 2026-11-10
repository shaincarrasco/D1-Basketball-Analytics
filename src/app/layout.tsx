import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "D1 Hoops Analytics",
  description: "Transparent NCAA Division I basketball analytics, scouting and projections."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
