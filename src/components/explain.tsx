"use client";
// Wraps a stat label. Tap it to open a short plain-English definition with a "How it works" link.
// The popover is portalled to <body> and position: fixed (placed from the trigger's rect): overflow-hidden
// parents can't clip it, and it never ends up inside a <p> (a <div> there breaks hydration).
import Link from "next/link";
import { createPortal } from "react-dom";
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { getGlossary, lookupGlossary } from "@/lib/glossary";

const GAP = 8;
const EDGE = 8;

function textOf(node: ReactNode): string | undefined {
  return typeof node === "string" || typeof node === "number" ? String(node) : undefined;
}

export default function Explain({ id, label, children }: { id?: string; label?: string; children: ReactNode }) {
  const entry = (id ? getGlossary(id) : undefined) ?? lookupGlossary(label ?? textOf(children) ?? "");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  // Place the popover under the trigger (or above it if there is no room), clamped to the viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const btn = btnRef.current, pop = popRef.current;
      if (!btn || !pop) return;
      const r = btn.getBoundingClientRect();
      const w = pop.offsetWidth, h = pop.offsetHeight;
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      const left = Math.min(Math.max(EDGE, r.left), Math.max(EDGE, vw - w - EDGE));
      const below = r.bottom + GAP + h <= vh - EDGE || r.top - GAP - h < EDGE;
      setPos({ left, top: below ? r.bottom + GAP : Math.max(EDGE, r.top - GAP - h) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [open]);

  if (!entry) return <>{children}</>;

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 text-left underline decoration-dotted decoration-[color:var(--dim)] underline-offset-[3px] hover:text-ink"
      >
        {children}
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          id={panelId}
          role="dialog"
          aria-label={entry.term}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-64 max-w-[calc(100vw-16px)] rounded-xl border border-line2 bg-deck p-3 text-[13px] leading-snug text-ink shadow-[0_16px_40px_-16px_rgb(0_0_0/0.5)]"
        >
          <div className="font-semibold">{entry.term}</div>
          <p className="mt-1 text-mute">{entry.short}</p>
          {entry.href && (
            <Link href={entry.href} onClick={() => setOpen(false)} className="mt-2 inline-block font-semibold text-bulb-ink hover:underline">
              How it works
            </Link>
          )}
        </div>,
        document.body,
      )}
    </span>
  );
}
