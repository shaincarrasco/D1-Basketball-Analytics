"use client";
// App chrome: sticky top bar (desktop nav + search), bottom tab bar on phones.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string; label: string; icon: LucideIcon;
  /** Other path prefixes that light this item up (/teams under Rankings). */
  match?: string[];
  /** Desktop: show only the icon until wide screens (e.g. Following). */
  compact?: boolean; title?: string;
};
export type ShellConfig = {
  brand: { name: string; mark: React.ReactNode };
  nav: NavItem[];
  /** Phone tab bar (up to 5). */
  mobile: NavItem[];
  footer?: React.ReactNode;
};

function isActive(path: string, n: NavItem) {
  if (n.href === "/") return path === "/";
  return [n.href, ...(n.match ?? [])].some(h => path.startsWith(h.replace(/\/$/, "")));
}

/**
 * App chrome: sticky top bar (desktop nav, search, colour picker, account) and a bottom
 * tab bar on phones. Every site passes its own brand, nav and slots.
 */
export default function SiteShell({ config, children, updated, picker, account, search }: {
  config: ShellConfig; children: React.ReactNode; updated?: string;
  picker?: React.ReactNode; account?: React.ReactNode;
  /** Renders the search dialog; omit for sites without search. */
  search?: (close: () => void) => React.ReactNode;
}) {
  const { brand, nav, mobile, footer } = config;
  const path = usePathname() ?? "/";
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    if (!search) return;
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
  }, [search]);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-night">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-line bg-night/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label={`${brand.name} home`}>
            {brand.mark}
            <span className="whitespace-nowrap font-display text-[22px] font-black tracking-[0.01em]">{brand.name}</span>
          </Link>
          <nav aria-label="Primary" className="ml-2 hidden items-center gap-0.5 lg:flex xl:ml-4 xl:gap-1">
            {nav.map(n => (
              <Link key={n.href} href={n.href} title={n.title} aria-current={isActive(path, n) ? "page" : undefined}
                className="relative flex items-center gap-1.5 whitespace-nowrap px-2.5 py-[17px] xl:px-3 text-[14px] font-semibold text-mute hover:text-ink aria-[current=page]:text-ink aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-3 aria-[current=page]:after:bottom-0 aria-[current=page]:after:h-[3px] aria-[current=page]:after:rounded-full aria-[current=page]:after:bg-bulb">
                {n.compact ? <><n.icon size={14} aria-hidden /><span className="sr-only xl:not-sr-only">{n.label}</span></> : n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {updated && <span className="hidden whitespace-nowrap text-xs text-dim min-[1400px]:inline">Data {updated}</span>}
            {search && <button onClick={() => setSearchOpen(true)} className="flex h-9 items-center gap-2 rounded-full border border-line bg-deck px-3 text-[14px] text-mute hover:text-ink sm:w-56 lg:w-40 xl:w-56" aria-label="Search teams and players">
              <Search size={15} aria-hidden />
              <span className="hidden sm:inline">Search</span>
              <kbd className="ml-auto hidden rounded border border-line2 px-1.5 text-[11px] text-dim md:inline">⌘K</kbd>
            </button>}
            {picker}
            {account}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1440px] px-4 pb-28 pt-6 sm:px-6 lg:pb-16">{children}</main>
      {footer && <footer className="mx-auto hidden max-w-[1440px] px-6 pb-10 text-xs text-dim lg:block">{footer}</footer>}
      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-night/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${mobile.length}, minmax(0, 1fr))` }}>
          {mobile.map(n => {
            const Icon = n.icon, active = isActive(path, n);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-1 pb-1.5 pt-2.5 text-[11px] font-semibold transition-colors ${active ? "text-bulb-ink" : "text-dim"}`}>
                <Icon size={22} strokeWidth={active ? 2.3 : 1.8} aria-hidden fill={active && n.compact ? "currentColor" : "none"} />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {searchOpen && search?.(() => setSearchOpen(false))}
    </>
  );
}
