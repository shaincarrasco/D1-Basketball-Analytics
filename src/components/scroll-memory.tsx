"use client";
// Back keeps your place. Remembers window scroll per URL (pathname + search) in sessionStorage
// and, on Back/Forward (popstate), puts the reader back where they were once the page is tall
// enough, retrying for ~2 s while client data loads. New pages are left alone: Next scrolls
// them to the top as usual. The reader scrolling, tapping or pressing a key cancels a restore.
import { useEffect } from "react";
import { MAX_REMEMBERED, parsePositions, remember, restoreStep, SCROLL_STORE, scrollKey } from "@/lib/scroll-memory";

const SAVE_MS = 150;
const CANCEL = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

function load() {
  try { return parsePositions(sessionStorage.getItem(SCROLL_STORE)); } catch { return {}; }
}
function save(key: string, y: number) {
  try { sessionStorage.setItem(SCROLL_STORE, JSON.stringify(remember(load(), key, y, MAX_REMEMBERED))); } catch { /* storage full or blocked */ }
}
const currentKey = () => scrollKey(location.pathname, location.search);

export default function ScrollMemory() {
  useEffect(() => {
    let restoring = false; // while true, scroll events don't overwrite the remembered target
    let raf = 0, timer: number | undefined;
    // The latest position, keyed by the URL it was read under, so a save that lands after the
    // URL has already changed (Back) still goes to the right page.
    let pending: { key: string; y: number } | null = null;

    const flush = () => {
      window.clearTimeout(timer); timer = undefined;
      if (pending) { save(pending.key, pending.y); pending = null; }
    };
    // After a link tap the old page can shrink before the URL changes; that clamped scroll must
    // not overwrite the position we just saved for it.
    let frozen: { key: string; until: number } | null = null;
    const onScroll = () => {
      if (restoring) return;
      const key = currentKey();
      if (frozen && frozen.key === key && performance.now() < frozen.until) return;
      pending = { key, y: window.scrollY };
      if (timer === undefined) timer = window.setTimeout(flush, SAVE_MS);
    };
    const saveNow = () => { if (restoring) return; pending = { key: currentKey(), y: window.scrollY }; flush(); };

    const stop = () => {
      restoring = false;
      cancelAnimationFrame(raf);
      for (const ev of CANCEL) window.removeEventListener(ev, stop, true);
    };

    const onPop = () => {
      flush(); // the page we're leaving
      // Read the target before the old page swapping out can fire a scroll event.
      const key = currentKey();
      const target = load()[key];
      stop();
      if (!target) return;
      restoring = true;
      for (const ev of CANCEL) window.addEventListener(ev, stop, { capture: true, passive: true });
      const start = performance.now();
      const step = () => {
        if (!restoring || currentKey() !== key) return stop();
        const s = restoreStep({ target, docHeight: document.documentElement.scrollHeight, viewport: window.innerHeight, current: window.scrollY, elapsed: performance.now() - start });
        if (s === "wait") { raf = requestAnimationFrame(step); return; }
        // Back should land, not glide: always an instant jump.
        if (s === "scroll") window.scrollTo({ top: target, behavior: "instant" as ScrollBehavior });
        stop();
        saveNow();
      };
      raf = requestAnimationFrame(step); // let Next render the restored page first
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPop);
    window.addEventListener("pagehide", saveNow);
    // Save right before a link click navigates away (the throttle may not have fired yet).
    const onClick = (e: MouseEvent) => {
      saveNow();
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (a) frozen = { key: currentKey(), until: performance.now() + 1500 };
    };
    document.addEventListener("click", onClick, true);
    return () => {
      stop();
      flush();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("pagehide", saveNow);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
