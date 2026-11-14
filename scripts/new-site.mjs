#!/usr/bin/env node
// Create a new sport site from the shared blocks:
//   npm run new-site -- <id> "<Brand>" --pack <pack> [--accent "#D4FF3A"]
//   e.g. npm run new-site -- tennis "Baseline" --pack tennis --accent "#D4FF3A"
// Writes apps/<id>/: a Next.js static site with the shared shell, palettes, colour picker,
// player rankings, chart gallery and chart builder already wired to the pack. Sport-specific
// pages (scores, player pages) go in apps/<id>/src/app/ alongside.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const [id, brand] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const pack = flag("pack");
const accent = flag("accent", "");
if (!id || !/^[a-z][a-z0-9-]*$/.test(id) || !brand || !pack) {
  console.error('Usage: npm run new-site -- <id> "<Brand>" --pack <pack> [--accent "#hex"]');
  process.exit(1);
}
if (!existsSync(path.join(root, "packages/packs", pack))) { console.error(`No pack at packages/packs/${pack} (run npm run new-pack first).`); process.exit(1); }
const dir = path.join(root, "apps", id);
if (existsSync(dir)) { console.error(`apps/${id} already exists.`); process.exit(1); }
const rgb = /^#[0-9a-f]{6}$/i.test(accent) ? [1, 3, 5].map(i => parseInt(accent.slice(i, i + 2), 16)).join(" ") : null;

const files = {
  "package.json": JSON.stringify({
    name: `@sites/${id}`, version: "0.1.0", private: true,
    scripts: { dev: "next dev", build: "next build", start: "npx serve@latest out", typecheck: "tsc --noEmit" },
    dependencies: { "@sports/ui": "*", "@sports/kit": "*", "@sports/packs": "*" },
  }, null, 2) + "\n",
  "next.config.mjs": `/** @type {import('next').NextConfig} */
// SITE_BASE_PATH is set by CI when the site is served under a sub-path (GitHub Pages).
const basePath = process.env.SITE_BASE_PATH ?? "";
export default {
  output: "export",
  trailingSlash: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  transpilePackages: ["@sports/ui", "@sports/kit", "@sports/packs"],
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  ...(basePath ? { basePath } : {}),
};
`,
  "tsconfig.json": JSON.stringify({
    compilerOptions: {
      target: "ES2022", lib: ["dom", "dom.iterable", "es2022"], allowJs: false, skipLibCheck: true, strict: true, noEmit: true,
      esModuleInterop: true, module: "esnext", moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true,
      jsx: "react-jsx", incremental: true, plugins: [{ name: "next" }], paths: { "@/*": ["./src/*"] },
    },
    include: ["next-env.d.ts", ".next/types/**/*.ts", "**/*.ts", "**/*.tsx"], exclude: ["node_modules", "scripts"],
  }, null, 2) + "\n",
  "tailwind.config.ts": `import type { Config } from "tailwindcss";
import preset from "../../packages/ui/tailwind-preset";

export default {
  presets: [preset as Config],
  content: ["./src/**/*.{ts,tsx}", "../../packages/{ui,kit}/**/*.{ts,tsx}"],
} satisfies Config;
`,
  "postcss.config.mjs": `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`,
  ".gitignore": ".next/\nout/\nnext-env.d.ts\n",
  "src/site.tsx": `"use client";
// ${brand}: brand, nav and the sport pack wiring. This file plus the pack is what makes the
// site ${id}; everything else comes from @sports/ui and @sports/kit.
import { BarChart3, LayoutGrid, ScatterChart, SlidersHorizontal } from "lucide-react";
import SiteShell, { type ShellConfig } from "@sports/ui/site-shell";
import ThemePicker from "@sports/ui/theme-picker";
import Builder from "@sports/kit/ui/builder";
import Gallery from "@sports/kit/ui/gallery";
import RankingsBoard from "@sports/kit/ui/rankings-board";
import { useSportData } from "@sports/kit/ui/data";
import { pack } from "@sports/packs/${pack}";

export const routes = { builder: "/charts/build/", rankings: "/players/" };

const NAV: ShellConfig["nav"] = [
  { href: "/", label: "Today", icon: LayoutGrid },
  { href: "/players/", label: "Players", icon: BarChart3, match: ["/player/"] },
  { href: "/charts/", label: "Charts", icon: ScatterChart },
  { href: "/charts/build/", label: "Make a chart", icon: SlidersHorizontal },
];
const CONFIG: ShellConfig = {
  brand: { name: ${JSON.stringify(brand)}, mark: <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden><circle cx="12" cy="12" r="11" fill="var(--bulb)" /></svg> },
  nav: NAV,
  mobile: NAV,
};

export function Shell({ children, updated }: { children: React.ReactNode; updated?: string }) {
  return <SiteShell config={CONFIG} updated={updated} picker={<ThemePicker />}>{children}</SiteShell>;
}
export function SiteGallery() { return <Gallery pack={pack} data={useSportData(pack)} routes={routes} />; }
export function SiteBuilder() { return <Builder pack={pack} data={useSportData(pack)} />; }
export function SiteRankings() { return <RankingsBoard pack={pack} data={useSportData(pack)} routes={routes} />; }
`,
  "src/app/layout.tsx": `import type { Metadata, Viewport } from "next";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource-variable/big-shoulders-display";
import "@fontsource-variable/doto";
import "@sports/ui/theme.css";
import { THEME_SCRIPT } from "@sports/ui/theme";
import { Shell } from "@/site";

export const metadata: Metadata = { title: { default: ${JSON.stringify(brand)}, template: ${JSON.stringify(`%s · ${brand}`)} }, applicationName: ${JSON.stringify(brand)} };
export const viewport: Viewport = { themeColor: "#0E0F12", width: "device-width", initialScale: 1, viewportFit: "cover" };
${rgb ? `\n// Site default accent (a viewer's own pick in the colour picker still wins).\nconst ACCENT = \`html[data-site="${id}"][data-palette="blacktop"]{--bulb-rgb:${rgb}}\`;\n` : ""}
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" data-palette="blacktop" data-site="${id}" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />${rgb ? `\n        <style dangerouslySetInnerHTML={{ __html: ACCENT }} />` : ""}
      </head>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
`,
  "src/app/page.tsx": `import Link from "next/link";
import PageHeader from "@sports/ui/page-header";

export default function Home() {
  return (
    <>
      <PageHeader title=${JSON.stringify(brand)}>Rankings, charts and stats.</PageHeader>
      <div className="flex flex-wrap gap-2">
        <Link className="btn btn-primary" href="/players/">Player rankings</Link>
        <Link className="btn" href="/charts/">Charts</Link>
      </div>
    </>
  );
}
`,
  "src/app/players/page.tsx": `import type { Metadata } from "next";
import PageHeader from "@sports/ui/page-header";
import { SiteRankings } from "@/site";

export const metadata: Metadata = { title: "Player rankings" };
export default function Page() {
  return <><PageHeader title="Player rankings">Pick a lens, or build your own formula. Every ranking shows what went into it.</PageHeader><SiteRankings /></>;
}
`,
  "src/app/charts/page.tsx": `import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@sports/ui/page-header";
import { SiteGallery } from "@/site";

export const metadata: Metadata = { title: "Charts" };
export default function Page() {
  return <><PageHeader title="Charts" actions={<Link href="/charts/build/" className="btn btn-primary">Make your own</Link>}>Who stands out, drawn every way we could think of.</PageHeader><SiteGallery /></>;
}
`,
  "src/app/charts/build/page.tsx": `import type { Metadata } from "next";
import PageHeader from "@sports/ui/page-header";
import { SiteBuilder } from "@/site";

export const metadata: Metadata = { title: "Chart builder" };
export default function Page() {
  return <><PageHeader title="Chart builder">Pick any two stats and who to call out. Every setting is saved in the link.</PageHeader><SiteBuilder /></>;
}
`,
  "public/data/app/.gitkeep": "",
};

for (const [f, body] of Object.entries(files)) {
  const p = path.join(dir, f);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, body);
}
console.log(`Created apps/${id}/ (${brand}) on the ${pack} pack.

Next:
  1. npm install                       # links the new workspace
  2. Put data at apps/${id}/public/data/app/players.json  ({ "rows": [...] } in the pack's row shape)
  3. npm run dev -w @sites/${id}
  4. Add sport pages (scores, player pages) under apps/${id}/src/app/`);
