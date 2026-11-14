"use client";
// Sticky segmented tabs for the team page. The active tab follows the scroll position
// (whichever section's top has passed under the bar), and tapping a tab smooth-scrolls there.
import { useEffect, useRef, useState } from "react";

export default function TeamTabs({ items }: { items: [string, string][] }) {
  const [active, setActive] = useState(items[0][0]);
  const bar = useRef<HTMLElement>(null);

  useEffect(() => {
    const sections = items.map(([id]) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    let raf = 0;
    const pick = () => {
      raf = 0;
      const line = (bar.current?.getBoundingClientRect().bottom ?? 110) + 24;
      // The section whose top most recently passed under the bar. Comparing tops (not list
      // order) keeps a side column, like Stats on wide screens, from claiming the tab early.
      let cur = items[0][0], best = -Infinity;
      for (const el of sections) { const top = el.getBoundingClientRect().top; if (top <= line && top > best) { best = top; cur = el.id; } }
      setActive(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(pick); };
    pick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [items]);

  // Keep the active tab visible when the bar scrolls sideways on narrow phones.
  useEffect(() => {
    bar.current?.querySelector<HTMLElement>(`a[href="#${active}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <nav ref={bar} aria-label="On this page" className="no-scrollbar sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mx-4 mb-5 flex gap-6 overflow-x-auto border-b border-line bg-night/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:px-1">
      {items.map(([id, label]) => (
        <a key={id} href={`#${id}`} aria-current={active === id ? "location" : undefined}
          className={`whitespace-nowrap border-b-[3px] py-3 text-[15px] font-semibold transition-colors ${active === id ? "border-bulb text-ink" : "border-transparent text-mute hover:text-ink"}`}>
          {label}
        </a>
      ))}
    </nav>
  );
}
