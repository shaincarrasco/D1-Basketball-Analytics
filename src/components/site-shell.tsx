"use client";
// App chrome: sticky top bar (desktop nav + search), bottom tab bar on phones.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, CalendarDays, Home, Search, Swords, Users, Layers, BookOpen } from "lucide-react";
import CommandSearch from "./command-search";
import ThemeToggle from "./theme-toggle";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/rankings/", label: "Rankings", icon: BarChart3 },
  { href: "/games/", label: "Games", icon: CalendarDays },
  { href: "/players/", label: "Players", icon: Users },
  { href: "/matchup/", label: "Matchup", icon: Swords },
  { href: "/conferences/", label: "Conferences", icon: Layers },
  { href: "/methodology/", label: "Method", icon: BookOpen },
];
const MOBILE = NAV.slice(0, 5);

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  const root = href.replace(/\/$/, "");
  return path.startsWith(root) || (href === "/rankings/" && path.startsWith("/teams")) || (href === "/players/" && path.startsWith("/player"));
}

export default function SiteShell({ children, updated }: { children: React.ReactNode; updated: string }) {
  const path = usePathname() ?? "/";
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLSelectElement))) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-night">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-line bg-night/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="D1 Hoops home">
            <span className="relative grid h-7 w-7 place-items-center rounded-full bg-off shadow-[0_0_18px_rgb(var(--off-rgb)/.45)]" aria-hidden>
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#1a0a00" strokeWidth="1.4"><circle cx="12" cy="12" r="10.5" /><path d="M1.5 12h21M12 1.5v21M4.5 4.8c3 2.4 3 12 0 14.4M19.5 4.8c-3 2.4-3 12 0 14.4" /></svg>
            </span>
            <span className="font-display text-[1.55rem] font-black leading-none tracking-tight">D1 HOOPS</span>
          </Link>
          <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 lg:flex">
            {NAV.map(n => (
              <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? "page" : undefined}
                className="rounded-lg px-3 py-1.5 text-[14px] font-semibold text-mute hover:text-ink aria-[current=page]:bg-deck2 aria-[current=page]:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-dim xl:inline">Data {updated}</span>
            <button onClick={() => setSearchOpen(true)} className="flex items-center gap-2 rounded-lg border border-line2 bg-deck px-3 py-1.5 text-sm text-mute hover:text-ink" aria-label="Search teams and players">
              <Search size={15} aria-hidden />
              <span className="hidden sm:inline">Search teams &amp; players</span>
              <kbd className="ml-2 hidden rounded border border-line2 px-1.5 text-[11px] text-dim md:inline">⌘K</kbd>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1440px] px-4 pb-28 pt-6 sm:px-6 lg:pb-16">{children}</main>
      <footer className="mx-auto hidden max-w-[1440px] px-6 pb-10 text-xs text-dim lg:block">
        Box scores and schedules from College Basketball Data. Ratings and projections are D1 Hoops originals — see <Link className="underline hover:text-ink" href="/methodology/">methodology</Link>.
      </footer>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-night/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="grid grid-cols-5">
          {MOBILE.map(n => {
            const Icon = n.icon, active = isActive(path, n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${active ? "text-off" : "text-mute"}`}>
                <Icon size={20} aria-hidden />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {searchOpen && <CommandSearch onClose={() => setSearchOpen(false)} />}
    </>
  );
}
