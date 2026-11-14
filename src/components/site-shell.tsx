"use client";
// App chrome. Desktop: five hubs in the top bar, each opening a panel with its pages and a
// live preview; a section bar under the header on every page in a hub. Phones: the same
// five hubs in the bottom tab bar, with the section bar as swipeable tabs.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Search, Star } from "lucide-react";
import AccountButton from "./account-button";
import CommandSearch from "./command-search";
import ThemePicker from "./theme-picker";
import HubPreview from "./nav/hub-preview";
import { HUBS, hubFor, sectionFor, type HubKey } from "@/lib/nav";

const OPEN_DELAY = 90, CLOSE_DELAY = 180;

function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="D1 Hoops home">
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden><circle cx="12" cy="12" r="11" fill="var(--bulb)" /><path d="M1 12h22M12 1v22M4.2 4.4c3.2 2.6 3.2 12.6 0 15.2M19.8 4.4c-3.2 2.6-3.2 12.6 0 15.2" fill="none" stroke="var(--bg)" strokeWidth="1.3" /></svg>
      <span className="whitespace-nowrap font-display text-[22px] font-black tracking-[0.01em]">D1 Hoops</span>
    </Link>
  );
}

export default function SiteShell({ children, updated }: { children: React.ReactNode; updated: string }) {
  const path = usePathname() ?? "/";
  const [searchOpen, setSearchOpen] = useState(false);
  const [open, setOpen] = useState<HubKey | null>(null);
  const [seen, setSeen] = useState(false); // load previews only after a panel has opened once
  // While a text field has focus (phone keyboard up), hide the tab bar: iOS would otherwise
  // float it above the keyboard, on top of the page.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isText = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !["checkbox", "radio", "range", "button", "submit", "color", "file"].includes(t.type));
    const on = (e: FocusEvent) => { if (isText(e.target)) setTyping(true); };
    const off = (e: FocusEvent) => { if (isText(e.target) && !isText(e.relatedTarget)) setTyping(false); };
    document.addEventListener("focusin", on);
    document.addEventListener("focusout", off);
    return () => { document.removeEventListener("focusin", on); document.removeEventListener("focusout", off); };
  }, []);
  const header = useRef<HTMLElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const activeHub = hubFor(path);
  const current = sectionFor(path);

  const schedule = useCallback((next: HubKey | null, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setOpen(next); if (next) setSeen(true); }, delay);
  }, []);
  const show = (k: HubKey) => { window.clearTimeout(timer.current); setOpen(k); setSeen(true); };

  // Close the panel on navigation, Escape, a click outside, or focus leaving the header.
  useEffect(() => { setOpen(null); }, [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) { const k = open; setOpen(null); header.current?.querySelector<HTMLElement>(`[data-hub="${k}"]`)?.focus(); }
    };
    const outside = (e: Event) => { if (open && header.current && !header.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); };
  }, [open]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

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

  const panelHub = HUBS.find(h => h.key === open && h.sections.length);
  const following = path.startsWith("/following");

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-night">Skip to content</a>
      <header ref={header} className="sticky top-0 z-40 border-b border-line bg-night/90 pt-[env(safe-area-inset-top)] backdrop-blur-md"
        onMouseLeave={() => schedule(null, CLOSE_DELAY)}>
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Primary" className="ml-4 hidden h-full items-stretch lg:flex">
            {HUBS.map(h => {
              const isCur = activeHub?.key === h.key, isOpen = open === h.key;
              const cls = `relative flex items-center gap-1 whitespace-nowrap px-3.5 text-[15px] font-semibold transition-colors hover:text-ink ${isCur || isOpen ? "text-ink" : "text-mute"} ${isCur ? "after:absolute after:inset-x-3.5 after:bottom-0 after:h-[3px] after:rounded-full after:bg-bulb" : ""}`;
              if (!h.sections.length) return <Link key={h.key} href={h.href} aria-current={isCur ? "page" : undefined} className={cls} onMouseEnter={() => schedule(null, OPEN_DELAY)}>{h.label}</Link>;
              return (
                <button key={h.key} type="button" data-hub={h.key} className={cls} aria-expanded={isOpen} aria-controls="hub-panel"
                  onMouseEnter={() => schedule(h.key, open ? 0 : OPEN_DELAY)}
                  onClick={() => (isOpen ? setOpen(null) : show(h.key))}
                  onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); show(h.key); window.setTimeout(() => document.querySelector<HTMLElement>("#hub-panel a")?.focus(), 0); } }}>
                  {h.label}
                  <ChevronDown size={14} aria-hidden className={`opacity-60 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <span className="hidden whitespace-nowrap text-xs text-dim min-[1400px]:inline">Data {updated}</span>
            <button onClick={() => setSearchOpen(true)} className="flex h-9 w-9 items-center justify-center gap-2 rounded-full border border-line bg-deck text-[14px] text-mute hover:text-ink sm:w-60 sm:justify-start sm:px-3" aria-label="Search teams and players">
              <Search size={15} aria-hidden />
              <span className="hidden sm:inline">Search teams, players</span>
              <kbd className="ml-auto hidden rounded border border-line2 px-1.5 text-[11px] text-dim md:inline">⌘K</kbd>
            </button>
            <Link href="/following/" aria-current={following ? "page" : undefined} title="Teams and players you follow"
              className={`flex h-9 w-9 items-center justify-center rounded-full border border-line bg-deck hover:text-ink ${following ? "text-bulb-ink" : "text-mute"}`}>
              <Star size={16} aria-hidden fill={following ? "currentColor" : "none"} /><span className="sr-only">Following</span>
            </Link>
            <ThemePicker />
            <AccountButton />
          </div>
        </div>

        {panelHub && (
          <div id="hub-panel" role="region" aria-label={`${panelHub.label} pages`} className="absolute inset-x-0 top-full hidden border-b border-line bg-deck shadow-[0_24px_48px_-24px_rgb(0_0_0/0.45)] lg:block"
            onMouseEnter={() => window.clearTimeout(timer.current)}
            onClick={e => { if ((e.target as HTMLElement).closest("a")) setOpen(null); }}>
            <div className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)_380px] gap-x-8 px-6 py-7">
              <div className="col-span-2">
                <p className="mb-4 font-display text-[28px] font-black leading-none">{panelHub.label}<span className="ml-3 align-middle font-sans text-[14px] font-medium text-mute">{panelHub.blurb}</span></p>
                <ul className="grid grid-cols-2 gap-1.5">
                  {panelHub.sections.map(s => {
                    const Icon = s.icon, cur = current?.section.href === s.href;
                    return (
                      <li key={s.href}>
                        <Link href={s.href} aria-current={cur ? "page" : undefined}
                          className="group flex items-start gap-3.5 rounded-xl p-3 hover:bg-deck2 focus-visible:bg-deck2 aria-[current=page]:bg-deck2">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-line2 bg-night text-bulb-ink group-hover:border-[rgb(var(--bulb-rgb)/0.5)]">
                            <Icon size={19} aria-hidden />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[15.5px] font-semibold leading-tight text-ink">{s.label}</span>
                            <span className="mt-0.5 block text-[13px] leading-snug text-mute">{s.desc}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {panelHub.quick?.length ? (
                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-5">
                    <span className="mr-1 text-[13px] font-semibold text-mute">{panelHub.quickLabel}</span>
                    {panelHub.quick.map(q => (
                      <Link key={q.href} href={q.href} className="chip !py-1.5 text-[13px] hover:border-line2 hover:text-ink">{q.label}</Link>
                    ))}
                  </div>
                ) : null}
              </div>
              <div>{seen && <HubPreview hub={panelHub.key} />}</div>
            </div>
          </div>
        )}
      </header>

      {current && current.hub.sections.length > 1 && (
        <div className="border-b border-line bg-night/40">
          <nav aria-label={`${current.hub.label} sections`} className="no-scrollbar mx-auto flex max-w-[1440px] items-stretch gap-1 overflow-x-auto px-4 sm:px-6">
            <span className="mr-3 hidden items-center font-display text-[17px] font-extrabold text-mute sm:flex">{current.hub.label}</span>
            {current.hub.sections.map(s => {
              const cur = current.section.href === s.href;
              return (
                <Link key={s.href} href={s.href} aria-current={cur ? "page" : undefined}
                  className={`relative flex shrink-0 items-center whitespace-nowrap px-3 py-3 text-[14px] font-semibold transition-colors hover:text-ink ${cur ? "text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full after:bg-bulb" : "text-mute"}`}>
                  {s.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      <main id="main" className="mx-auto max-w-[1440px] px-4 pb-28 pt-6 sm:px-6 lg:pb-16">{children}</main>
      <footer className="mx-auto hidden max-w-[1440px] px-6 pb-10 text-xs text-dim lg:block">
        Box scores and schedules from College Basketball Data. Ratings and projections are D1 Hoops originals — see <Link className="underline hover:text-ink" href="/methodology/">methodology</Link>.
      </footer>
      <nav aria-label="Tabs" className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-night/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden ${typing ? "hidden" : ""}`}>
        <div className="grid grid-cols-5">
          {HUBS.map(h => {
            const Icon = h.icon, active = activeHub?.key === h.key;
            return (
              <Link key={h.key} href={h.href} aria-current={active ? "page" : undefined} className={`tab-item flex flex-col items-center gap-1 pb-1.5 pt-2.5 text-[11px] font-semibold transition-colors ${active ? "text-bulb-ink" : "text-dim"}`}>
                <Icon size={22} strokeWidth={active ? 2.3 : 1.8} aria-hidden />
                {h.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {searchOpen && <CommandSearch onClose={() => setSearchOpen(false)} />}
    </>
  );
}
