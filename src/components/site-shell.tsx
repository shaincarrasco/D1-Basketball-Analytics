"use client";
// App chrome: sticky top bar (desktop nav + search), bottom tab bar on phones.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, CalendarDays, LayoutGrid, Search, Swords, Users, Layers, BookOpen, Star, Newspaper } from "lucide-react";
import AccountButton from "./account-button";
import CommandSearch from "./command-search";
import ThemePicker from "./theme-picker";

const NAV = [
  { href: "/", label: "Today", icon: LayoutGrid },
  { href: "/rankings/", label: "Rankings", icon: BarChart3 },
  { href: "/games/", label: "Games", icon: CalendarDays },
  { href: "/news/", label: "News", icon: Newspaper },
  { href: "/players/", label: "Players", icon: Users },
  { href: "/matchup/", label: "Matchup", icon: Swords },
  { href: "/conferences/", label: "Conferences", icon: Layers },
  { href: "/methodology/", label: "Method", icon: BookOpen },
  { href: "/following/", label: "Following", icon: Star },
];
// Phone tab bar, Apple Sports style: the five things people open most.
const MOBILE = [NAV[0], NAV[1], NAV[2], { href: "/following/", label: "My teams", icon: Star }, NAV[4]];

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
        // Don't stack search on top of another open dialog (e.g. a game sheet).
        if (document.querySelector('[aria-modal="true"]')) return;
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
      <header className="sticky top-0 z-40 border-b border-line bg-night/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="D1 Hoops home">
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden><circle cx="12" cy="12" r="11" fill="var(--bulb)" /><path d="M1 12h22M12 1v22M4.2 4.4c3.2 2.6 3.2 12.6 0 15.2M19.8 4.4c-3.2 2.6-3.2 12.6 0 15.2" fill="none" stroke="var(--bg)" strokeWidth="1.3" /></svg>
            <span className="whitespace-nowrap font-display text-[22px] font-black tracking-[0.01em]">D1 Hoops</span>
          </Link>
          <nav aria-label="Primary" className="ml-2 hidden items-center gap-0.5 lg:flex xl:ml-4 xl:gap-1">
            {NAV.map(n => (
              <Link key={n.href} href={n.href} title={n.href === "/following/" ? "Teams and players you follow" : undefined} aria-current={isActive(path, n.href) ? "page" : undefined}
                className="relative flex items-center gap-1.5 whitespace-nowrap px-2.5 py-[17px] xl:px-3 text-[14px] font-semibold text-mute hover:text-ink aria-[current=page]:text-ink aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-3 aria-[current=page]:after:bottom-0 aria-[current=page]:after:h-[3px] aria-[current=page]:after:rounded-full aria-[current=page]:after:bg-bulb">
                {n.href === "/following/" ? <><Star size={14} aria-hidden /><span className="sr-only xl:not-sr-only">{n.label}</span></> : n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden whitespace-nowrap text-xs text-dim min-[1400px]:inline">Data {updated}</span>
            <button onClick={() => setSearchOpen(true)} className="flex h-9 items-center gap-2 rounded-full border border-line bg-deck px-3 text-[14px] text-mute hover:text-ink sm:w-56 lg:w-40 xl:w-56" aria-label="Search teams and players">
              <Search size={15} aria-hidden />
              <span className="hidden sm:inline">Search</span>
              <kbd className="ml-auto hidden rounded border border-line2 px-1.5 text-[11px] text-dim md:inline">⌘K</kbd>
            </button>
            <ThemePicker />
            <AccountButton />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1440px] px-4 pb-28 pt-6 sm:px-6 lg:pb-16">{children}</main>
      <footer className="mx-auto hidden max-w-[1440px] px-6 pb-10 text-xs text-dim lg:block">
        Box scores and schedules from College Basketball Data. Ratings and projections are D1 Hoops originals — see <Link className="underline hover:text-ink" href="/methodology/">methodology</Link>.
      </footer>
      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-night/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5">
          {MOBILE.map(n => {
            const Icon = n.icon, active = isActive(path, n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-1 pb-1.5 pt-2.5 text-[11px] font-semibold transition-colors ${active ? "text-bulb-ink" : "text-dim"}`}>
                <Icon size={22} strokeWidth={active ? 2.3 : 1.8} aria-hidden fill={active && n.icon === Star ? "currentColor" : "none"} />
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
