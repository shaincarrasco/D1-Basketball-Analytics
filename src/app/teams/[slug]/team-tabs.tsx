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
      let cur = items[0][0];
      for (const el of sections) if (el.getBoundingClientRect().top <= line) cur = el.id;
      // At the very bottom the last section may be too short to reach the line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = sections.at(-1)?.id ?? cur;
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
