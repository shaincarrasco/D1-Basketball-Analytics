"use client";
// One panel at a time. A sticky segmented bar picks which panel shows; the rest stay in the
// DOM (hidden) so the page is still fully rendered for search engines and print, but the
// reader only has to look at one thing. The choice lives in ?tab= (or a legacy #hash) so
// a tab can be linked and survives reload.
import { useEffect, useRef, useState, type ReactNode } from "react";

export type FocusTab = { id: string; label: string; content: ReactNode; badge?: string | number | null };

export default function FocusTabs({ tabs, param = "tab", sticky = true, className = "" }: {
  tabs: FocusTab[]; param?: string; sticky?: boolean; className?: string;
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  const bar = useRef<HTMLDivElement>(null);
  const ids = tabs.map(t => t.id).join(",");

  // Read ?tab= or #id after hydration (static export: no server-side query).
  useEffect(() => {
    const list = ids.split(",");
    const pick = () => {
      const q = new URLSearchParams(window.location.search).get(param);
      const h = window.location.hash.slice(1);
      const hit = list.find(id => id === q) ?? list.find(id => id === h);
      if (hit) setActive(hit);
      else if (h) {
        // A hash pointing at something inside a panel: open that panel.
        const el = document.getElementById(h);
        const owner = el?.closest<HTMLElement>("[data-focus-panel]")?.dataset.focusPanel;
        if (owner && list.includes(owner)) {
          setActive(owner);
          // The browser tried to scroll while the panel was hidden; scroll again once it shows.
          requestAnimationFrame(() => requestAnimationFrame(() => el?.scrollIntoView({ block: "start" })));
        }
      }
    };
    pick();
    window.addEventListener("hashchange", pick);
    window.addEventListener("popstate", pick);
    return () => { window.removeEventListener("hashchange", pick); window.removeEventListener("popstate", pick); };
  }, [ids, param]);

  const choose = (id: string) => {
    setActive(id);
    const url = new URL(window.location.href);
    if (id === tabs[0]?.id) url.searchParams.delete(param); else url.searchParams.set(param, id);
    url.hash = "";
    window.history.replaceState(window.history.state, "", url);
    // If the bar has stuck to the top, bring the new panel's start into view.
    const top = bar.current?.getBoundingClientRect().top ?? 0;
    const headerH = 56;
    if (top <= headerH + 1 && bar.current) window.scrollTo({ top: window.scrollY + bar.current.getBoundingClientRect().top - headerH, behavior: "instant" as ScrollBehavior });
  };

  // Keep the active tab visible when the bar scrolls sideways on narrow phones. Only the bar moves:
  // scrollIntoView also scrolls the page, which opened the home page a screen down on phones.
  useEffect(() => {
    const strip = bar.current, tab = strip?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    if (!strip || !tab) return;
    const scroller = tab.closest<HTMLElement>("[role='tablist']") ?? strip;
    const box = scroller.getBoundingClientRect(), t = tab.getBoundingClientRect();
    if (t.left < box.left) scroller.scrollLeft -= box.left - t.left + 12;
    else if (t.right > box.right) scroller.scrollLeft += t.right - box.right + 12;
  }, [active]);

  return (
    <div className={className}>
      <div ref={bar} role="tablist" aria-label="Sections"
        className={`no-scrollbar ${sticky ? "sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30" : ""} -mx-4 mb-4 flex gap-5 overflow-x-auto border-b border-line bg-night/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:px-1`}>
        {tabs.map(t => {
          const on = t.id === active;
          return (
            <button key={t.id} type="button" role="tab" data-tab={t.id} id={`tab-${t.id}`} aria-selected={on} aria-controls={`panel-${t.id}`}
              onClick={() => choose(t.id)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[3px] py-2.5 text-[14.5px] font-semibold transition-colors ${on ? "border-bulb text-ink" : "border-transparent text-mute hover:text-ink"}`}>
              {t.label}
              {t.badge != null && t.badge !== "" && <span className="rounded-full bg-deck2 px-1.5 text-[11px] font-bold leading-[18px] text-mute">{t.badge}</span>}
            </button>
          );
        })}
      </div>
      {tabs.map(t => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} data-focus-panel={t.id} hidden={t.id !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
