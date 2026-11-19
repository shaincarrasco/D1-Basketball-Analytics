"use client";
// Pull to refresh for phones. Touch only, and only when the page is scrolled to the very top: a
// downward pull drags the content with resistance and eases a small spinner into the gap; past the
// threshold, letting go runs `onRefresh` while the spinner turns, then the content settles back.
// While mounted the page's own overscroll (the browser's pull to refresh) is off; other pages keep it.
// With reduced motion nothing moves: a quiet label says what a release will do.
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { dataUrl } from "@sports/ui/client-data";
import { haptic } from "@/lib/haptics";
import { PULL, pullArmed, pullDistance, readPull, updatedAgo } from "@/lib/pull-refresh";

const EASE = [0.22, 1, 0.36, 1] as const;
const PHONE = "(max-width: 639px)";
const SIZE = 28;
const R = 9, C = 2 * Math.PI * R;

type Phase = "idle" | "pull" | "armed" | "refreshing";

/** True when the touch starts inside a vertical scroller that is itself scrolled down (a sheet, a list). */
function inScrolledBox(target: EventTarget | null, root: HTMLElement): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
    if (el instanceof HTMLElement && el.scrollTop > 0) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll") return true;
    }
  }
  return false;
}

const pageTop = () => (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;

export default function PullRefresh({ onRefresh, children, className = "" }: { onRefresh: () => Promise<unknown>; children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const y = useMotionValue(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [said, setSaid] = useState("");
  // The indicator depends on the reduced-motion setting, so it only renders after mount (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const live = useRef({ onRefresh, reduce });
  live.current = { onRefresh, reduce };

  // The spinner sits centred in the gap the content leaves, fading and drawing its ring as you pull.
  const spinY = useTransform(y, v => v / 2 - SIZE / 2);
  const spinOpacity = useTransform(y, [0, 18, PULL.threshold], [0, 0.35, 1]);
  const dash = useTransform(y, v => C * (1 - Math.min(1, v / PULL.threshold) * 0.82));
  const turn = useTransform(y, v => v * 2.2);

  // Take over the page's overscroll only while this is mounted.
  useEffect(() => {
    const els = [document.documentElement, document.body];
    const prev = els.map(el => el.style.overscrollBehaviorY);
    els.forEach(el => { el.style.overscrollBehaviorY = "none"; });
    return () => els.forEach((el, i) => { el.style.overscrollBehaviorY = prev[i]; });
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let alive = true;
    // A drag that ends over a card must not also open it.
    let swallowUntil = 0;
    const onClick = (e: MouseEvent) => { if (Date.now() < swallowUntil) { e.preventDefault(); e.stopPropagation(); } };
    let start: { x: number; y: number } | null = null;
    let pulling = false;
    let busy = false;
    let distance = 0;
    let shown: Phase = "idle";
    const show = (p: Phase) => { if (p !== shown) { shown = p; setPhase(p); } };

    const settle = () => {
      if (live.current.reduce) y.set(0);
      else animate(y, 0, { duration: 0.32, ease: EASE });
    };
    const reset = () => {
      start = null; pulling = false; distance = 0;
      if (!busy) show("idle");
    };

    const run = async () => {
      busy = true;
      show("refreshing");
      setSaid("Refreshing");
      if (!live.current.reduce) animate(y, PULL.hold, { duration: 0.25, ease: EASE });
      const began = Date.now();
      try {
        await Promise.race([live.current.onRefresh(), new Promise(r => setTimeout(r, PULL.timeoutMs))]);
      } catch { /* the page keeps what it had */ }
      const left = PULL.minSpinMs - (Date.now() - began);
      if (left > 0) await new Promise(r => setTimeout(r, left));
      if (!alive) return;
      haptic("success");
      setSaid("Updated");
      busy = false;
      show("idle");
      settle();
    };

    const onStart = (e: TouchEvent) => {
      start = null; pulling = false;
      if (busy || e.touches.length !== 1 || !window.matchMedia(PHONE).matches) return;
      if (!pageTop() || document.body.style.overflow === "hidden" || inScrolledBox(e.target, el)) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY };
    };
    const onMove = (e: TouchEvent) => {
      if (!start || busy) return;
      if (e.touches.length !== 1) { if (pulling) settle(); reset(); return; }
      const t = e.touches[0];
      const dx = t.clientX - start.x, dy = t.clientY - start.y;
      if (!pulling) {
        const read = readPull(dx, dy);
        if (read === null) return;
        // Not a pull, or the browser has already taken the gesture: leave it alone.
        if (read === "other" || !pageTop() || !e.cancelable) { start = null; return; }
        pulling = true;
      }
      // Back above where it started: the pull is over and the page scrolls as usual.
      if (dy <= 0) { y.set(0); reset(); return; }
      // Ours from here: keep the browser from scrolling or bouncing the page.
      if (e.cancelable) e.preventDefault();
      distance = pullDistance(dy);
      if (!live.current.reduce) y.set(distance);
      show(pullArmed(distance) ? "armed" : "pull");
    };
    const onEnd = () => {
      if (!start || !pulling) { start = null; return; }
      swallowUntil = Date.now() + 400;
      const armed = pullArmed(distance);
      start = null; pulling = false; distance = 0;
      if (armed) void run();
      else { settle(); show("idle"); }
    };
    const onCancel = () => { if (pulling) settle(); reset(); };

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
  }, [y]);

  const spinning = phase === "refreshing";
  return (
    <div ref={root} className={`relative ${className}`}>
      {!mounted ? null : reduce ? (
        phase !== "idle" && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center" aria-hidden>
            <span className="rounded-full border border-line bg-deck2 px-3 py-1 text-xs font-medium text-mute">
              {phase === "refreshing" ? "Refreshing" : phase === "armed" ? "Release to refresh" : "Pull to refresh"}
            </span>
          </div>
        )
      ) : (
        <motion.div aria-hidden className="pointer-events-none absolute left-1/2 top-0 z-10 grid place-items-center rounded-full bg-deck2 text-mute"
          style={{ y: spinY, opacity: spinOpacity, width: SIZE, height: SIZE, marginLeft: -SIZE / 2 }}>
          <motion.span className="grid place-items-center" style={{ rotate: spinning ? 0 : turn }}>
            <svg width={20} height={20} viewBox="0 0 24 24" className={spinning ? "animate-spin" : ""}>
              <circle cx={12} cy={12} r={R} fill="none" stroke="var(--line-2)" strokeWidth={2.25} />
              {spinning ? (
                <circle cx={12} cy={12} r={R} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * 0.72} />
              ) : (
                <motion.circle cx={12} cy={12} r={R} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round"
                  strokeDasharray={C} style={{ strokeDashoffset: dash }} transform="rotate(-90 12 12)" />
              )}
            </svg>
          </motion.span>
        </motion.div>
      )}
      {/* y never moves with reduced motion. */}
      <motion.div style={{ y }}>{children}</motion.div>
      <span className="sr-only" role="status" aria-live="polite">{said}</span>
    </div>
  );
}

/** "Updated 12s ago": a quiet line that keeps ticking. Rendered only after mount (it depends on the clock). */
export function UpdatedAgo({ at, className = "" }: { at: number | null; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(() => { if (!document.hidden) tick(); }, 5000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [at]);
  if (now == null || at == null) return null;
  return <span className={`tnum ${className}`}>{updatedAgo(now - at)}</span>;
}

/** Fetch a published data file again, past the in-memory and HTTP caches. Null on any failure. */
export async function refetchJson<T>(file: string): Promise<T | null> {
  try {
    const res = await fetch(dataUrl(file), { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
