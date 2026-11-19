"use client";
// Phones: the scoreboard's conference, sort and Projections controls live in one bottom sheet,
// opened from a "Filters" button. The sheet fits any phone (at most 85dvh, scrolling inside), locks
// the page's scroll only while open, traps focus, and closes on the backdrop, Escape, Done or the
// Back gesture (opening it adds a history entry that Back pops). Rendered into <body> so a
// transformed ancestor (the swipeable day list) can't trap its fixed positioning.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const EASE = [0.22, 1, 0.36, 1] as const;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function FilterButton({ count, open, onOpen, controls, className = "" }: { count: number; open: boolean; onOpen: () => void; controls: string; className?: string }) {
  return (
    // Chip-sized to sit in the chip row; the hit area reaches 44px tall.
    <button type="button" className={`chip relative shrink-0 before:absolute before:inset-x-0 before:-inset-y-[6px] before:content-[''] ${count ? "!border-line2" : ""} ${className}`} onClick={onOpen}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? controls : undefined}
      aria-label={count ? `Filters, ${count} on` : "Filters"} data-testid="filters-button">
      <SlidersHorizontal size={15} aria-hidden />
      Filters
      {count > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ink px-1 text-[11px] font-semibold text-[var(--bg)] tnum" aria-hidden>{count}</span>}
    </button>
  );
}

type SheetProps = { id: string; open: boolean; onClose: () => void; onReset: () => void; canReset: boolean; children: ReactNode };

export default function FilterSheet({ id, open, onClose, onReset, canReset, children }: SheetProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>{open && <Sheet id={id} onClose={onClose} onReset={onReset} canReset={canReset}>{children}</Sheet>}</AnimatePresence>,
    document.body,
  );
}

function Sheet({ id, onClose, onReset, canReset, children }: Omit<SheetProps, "open">) {
  const reduce = useReducedMotion() ?? false;
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Closing goes through history when the sheet added an entry, so Back and Done end the same way.
  const close = useRef<() => void>(() => onCloseRef.current());

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Lock the page behind (keeping its width steady where a scrollbar disappears).
    const body = document.body;
    const prev = { overflow: body.style.overflow, pad: body.style.paddingRight };
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    panel.current?.focus({ preventScroll: true });

    // Back gesture: one history entry for the open sheet; popping it closes the sheet.
    let pushed = true;
    window.history.pushState(null, "", window.location.href);
    const onPop = () => { pushed = false; onCloseRef.current(); };
    window.addEventListener("popstate", onPop);
    close.current = () => { if (pushed) window.history.back(); else onCloseRef.current(); };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close.current(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement) || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("popstate", onPop);
      body.style.overflow = prev.overflow;
      body.style.paddingRight = prev.pad;
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  const fade = reduce ? { duration: 0 } : { duration: 0.22, ease: EASE };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <motion.div className="absolute inset-0 bg-[rgba(3,5,14,0.72)]" onClick={() => close.current()} aria-hidden
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} />
      <motion.div ref={panel} id={id} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-[18px] border border-b-0 border-line2 bg-deck outline-none [&_.field]:!bg-deck2"
        initial={reduce ? { opacity: 0 } : { y: "100%" }} animate={reduce ? { opacity: 1 } : { y: 0 }} exit={reduce ? { opacity: 0 } : { y: "100%" }}
        transition={reduce ? { duration: 0 } : { duration: 0.34, ease: EASE }}>
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line2" aria-hidden />
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-1.5">
          <h2 id={titleId} className="text-[17px] font-semibold">Filters</h2>
          <button type="button" className="min-h-[44px] rounded-full px-3 text-[15px] font-semibold text-mute hover:text-ink disabled:opacity-40" onClick={onReset} disabled={!canReset}>Reset</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">{children}</div>
        <div className="shrink-0 border-t border-line px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
          <button type="button" className="btn btn-primary min-h-[48px] w-full" onClick={() => close.current()}>Done</button>
        </div>
      </motion.div>
    </div>
  );
}
