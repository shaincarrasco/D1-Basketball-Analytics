"use client";
// Phones (< 640px): swipe the scoreboard sideways to step to the previous or next listed day, the
// same days the date strip's arrows step to. The list follows the finger, slides out, and the new
// day slides in from the other side. Vertical scrolling is never taken over: the gesture only
// becomes a swipe when sideways movement clearly dominates, and touches that start on something
// that scrolls sideways (chip rows, tables) or at the screen edges (the browser's back swipe) are
// left alone. With reduced motion the day changes without any movement.
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { haptic } from "@/lib/haptics";
import { dragOffset, lockAxis, nearEdge, swipeDirection } from "./swipe-days-logic";

const EASE = [0.22, 1, 0.36, 1] as const;
const PHONE = "(max-width: 639px)";

/** True when the touch starts on (or inside) something that scrolls sideways, or a form control. */
function startsOnSideScroller(target: EventTarget | null, root: HTMLElement): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
    if (el.matches("input, select, textarea, [role='slider']")) return true;
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
  }
  return false;
}

type Props = { prev: string | null; next: string | null; onSelect: (day: string) => void; children: ReactNode };

export default function SwipeDays({ prev, next, onSelect, children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const x = useMotionValue(0);
  const width = useRef(360);
  const opacity = useTransform(x, v => 1 - Math.min(0.6, Math.abs(v) / (width.current * 1.4)));
  const latest = useRef({ prev, next, onSelect, reduce });
  latest.current = { prev, next, onSelect, reduce };

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let start: { x: number; y: number } | null = null;
    let axis: "x" | "y" | null = null;
    let busy = false;
    let alive = true;
    // A drag that ends over a card must not also open it.
    let swallowUntil = 0;
    const onClick = (e: MouseEvent) => { if (Date.now() < swallowUntil) { e.preventDefault(); e.stopPropagation(); } };

    const snapBack = () => { animate(x, 0, { duration: 0.3, ease: EASE }); };

    const commit = async (dir: "prev" | "next", target: string) => {
      const { reduce: still, onSelect: select } = latest.current;
      haptic("select");
      if (still) { x.set(0); select(target); return; }
      busy = true;
      const w = (width.current = el.offsetWidth || width.current);
      const out = dir === "next" ? -1 : 1;
      await animate(x, out * w * 0.5, { duration: 0.16, ease: EASE });
      if (!alive) return;
      select(target);
      // Deep in a long list? Bring the top of the new day into view before it slides in.
      const header = document.querySelector<HTMLElement>("header.sticky")?.offsetHeight ?? 0;
      const top = el.getBoundingClientRect().top;
      if (top < header) window.scrollBy({ top: top - header - 12, behavior: "auto" });
      x.set(-out * w * 0.35);
      await animate(x, 0, { duration: 0.34, ease: EASE });
      busy = false;
    };

    const onStart = (e: TouchEvent) => {
      start = null; axis = null;
      if (busy || e.touches.length !== 1 || !window.matchMedia(PHONE).matches) return;
      const t = e.touches[0];
      if (nearEdge(t.clientX, window.innerWidth) || startsOnSideScroller(e.target, el)) return;
      width.current = el.offsetWidth || width.current;
      start = { x: t.clientX, y: t.clientY };
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      if (e.touches.length !== 1) { if (axis === "x") snapBack(); start = null; return; }
      const t = e.touches[0];
      const dx = t.clientX - start.x, dy = t.clientY - start.y;
      if (!axis) {
        axis = lockAxis(dx, dy);
        if (!axis) return;
        // The browser may already be scrolling (the event can no longer be cancelled): leave it.
        if (axis === "y" || !e.cancelable) { start = null; return; }
      }
      e.preventDefault();
      const { prev: p, next: n, reduce: still } = latest.current;
      if (!still) x.set(dragOffset(dx, dx < 0 ? !!n : !!p));
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || axis !== "x") { start = null; return; }
      swallowUntil = Date.now() + 400;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x, dy = t.clientY - start.y;
      start = null; axis = null;
      const dir = swipeDirection(dx, dy);
      const target = dir === "next" ? latest.current.next : dir === "prev" ? latest.current.prev : null;
      if (dir && target) void commit(dir, target);
      else snapBack();
    };
    const onCancel = () => { if (start && axis === "x") snapBack(); start = null; axis = null; };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onCancel, { passive: true });
    el.addEventListener("click", onClick, true);
    return () => {
      alive = false;
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
      el.removeEventListener("click", onClick, true);
    };
  }, [x]);

  // pan-y (+ pinch-zoom): the browser keeps vertical scrolling and zoom; sideways movement is ours.
  // x never moves with reduced motion (commit skips the animation and drags don't follow).
  return (
    <motion.div ref={root} style={{ x, opacity, touchAction: "pan-y pinch-zoom" }}>
      {children}
    </motion.div>
  );
}
