"use client";
// Long-press peek: hold a team or player row for 450ms on a touch screen and a small card
// opens at the bottom with the basics, plus Open / Follow / Close. A shorter press is a normal
// tap; moving more than 10px (a scroll or a swipe) cancels it. Mouse users never peek.
//
//   const peek = usePeek();
//   <a {...peek.bind(() => teamPeek(team))}>…</a>
//   {peek.sheet}
//
// bind() returns pointer handlers plus `data-peek` (theme.css turns off the iOS callout and
// text selection there). After a peek opens, the click that follows the release is swallowed,
// so the row doesn't navigate. Rows with their own gestures call peek.cancel() when theirs starts.
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Star, X } from "lucide-react";
import TeamLogo from "@sports/ui/team-logo";
import { haptic } from "@/lib/haptics";
import { toggleFavorite, useFavorites } from "@/lib/favorites";
import { canPeek, LONG_PRESS_MS, movedTooFar, nextGameText, peekFavKey, peekHref, RELEASE_GUARD_MS, type PeekItem } from "./peek-logic";

export { headlineStats, teamPeek, type PeekItem, type PeekPlayer, type PeekTeam } from "./peek-logic";

export type PeekBind = {
  "data-peek": "";
  onPointerDown: (e: PointerEvent<Element>) => void;
  onPointerMove: (e: PointerEvent<Element>) => void;
  onPointerUp: (e: PointerEvent<Element>) => void;
  onPointerCancel: (e: PointerEvent<Element>) => void;
  onClickCapture: (e: MouseEvent<Element>) => void;
  onContextMenu: (e: MouseEvent<Element>) => void;
};

const EASE = [0.22, 1, 0.36, 1] as const;

export function usePeek() {
  const [item, setItem] = useState<PeekItem | null>(null);
  const [mounted, setMounted] = useState(false);
  const press = useRef<{ x: number; y: number; id: number; timer: number; get: () => PeekItem } | null>(null);
  const fired = useRef(false); // this gesture opened a peek: swallow the click it ends with
  const releasedAt = useRef(0);
  const lastType = useRef("mouse");
  useEffect(() => setMounted(true), []);
  useEffect(() => () => { if (press.current) clearTimeout(press.current.timer); }, []);

  const cancel = useCallback(() => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  }, []);
  const fire = useCallback((get: () => PeekItem) => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
    fired.current = true;
    releasedAt.current = performance.now() + 60_000; // finger still down: guard the card until it lifts
    try { window.getSelection()?.removeAllRanges(); } catch { /* no selection API */ }
    haptic("select");
    setItem(get());
  }, []);

  const release = useCallback(() => {
    cancel();
    if (!fired.current) return;
    releasedAt.current = performance.now();
    // The click (if the browser sends one) lands right after this; don't let a stale flag eat a later one.
    window.setTimeout(() => { fired.current = false; }, RELEASE_GUARD_MS);
  }, [cancel]);

  const bind = useCallback((get: () => PeekItem): PeekBind => ({
    "data-peek": "",
    onPointerDown: e => {
      lastType.current = e.pointerType;
      fired.current = false;
      cancel();
      if (!canPeek(e.pointerType) || !e.isPrimary) return;
      press.current = { x: e.clientX, y: e.clientY, id: e.pointerId, get, timer: window.setTimeout(() => fire(get), LONG_PRESS_MS) };
    },
    onPointerMove: e => {
      const p = press.current;
      if (p && p.id === e.pointerId && movedTooFar(e.clientX - p.x, e.clientY - p.y)) cancel();
    },
    onPointerUp: () => release(),
    onPointerCancel: () => release(),
    onClickCapture: e => {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    onContextMenu: e => {
      if (!canPeek(lastType.current)) return; // right-click keeps the browser's menu
      e.preventDefault(); // Android's link menu
      const p = press.current;
      if (p) fire(p.get);
    },
  }), [cancel, fire, release]);

  const close = useCallback(() => setItem(null), []);
  const sheet = mounted
    ? createPortal(<AnimatePresence>{item && <PeekCard key={peekHref(item)} item={item} onClose={close} releasedAt={releasedAt} />}</AnimatePresence>, document.body)
    : null;
  return { bind, cancel, sheet, open: item !== null };
}

export type Peek = ReturnType<typeof usePeek>;

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function PeekCard({ item, onClose, releasedAt }: { item: PeekItem; onClose: () => void; releasedAt: { current: number } }) {
  const reduce = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const favs = useFavorites();
  const fav = peekFavKey(item);
  const followed = favs[fav.kind].includes(fav.id);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    // Backstop in case the row never hears the finger lift: the card works from the first lift on.
    const lifted = () => { releasedAt.current = Math.min(releasedAt.current, performance.now()); };
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerup", lifted, true);
    window.addEventListener("pointercancel", lifted, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerup", lifted, true);
      window.removeEventListener("pointercancel", lifted, true);
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, []);

  // The tap that opened the card can land on it when the finger lifts (iOS hit-tests at release).
  const guard = (e: MouseEvent) => {
    if (performance.now() - releasedAt.current < RELEASE_GUARD_MS) { e.preventDefault(); e.stopPropagation(); }
  };
  const follow = () => {
    haptic(followed ? "tick" : "success");
    toggleFavorite(fav.kind, fav.id);
  };
  const t = { duration: reduce ? 0 : 0.26, ease: EASE };

  return (
    <div className="fixed inset-0 z-50 touch-none" onClickCapture={guard}>
      <motion.div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-6">
        <motion.div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
          className="pointer-events-auto w-full max-w-[420px] rounded-[18px] border border-line2 bg-deck p-4 outline-none"
          initial={{ opacity: 0, y: reduce ? 0 : 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : 16 }} transition={t}>
          {item.kind === "team" ? <TeamBody item={item} titleId={titleId} /> : <PlayerBody item={item} titleId={titleId} />}
          <div className="mt-4 flex items-center gap-2">
            <Link href={peekHref(item)} onClick={onClose} className="btn btn-primary min-h-[44px] flex-1">
              Open<span className="sr-only"> {item.name}</span>
            </Link>
            <button type="button" onClick={follow} aria-pressed={followed} className="btn min-h-[44px] flex-1">
              <Star size={16} aria-hidden fill={followed ? "currentColor" : "none"} />{followed ? "Following" : "Follow"}<span className="sr-only"> {item.name}</span>
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="btn h-11 w-11 shrink-0 !p-0">
              <X size={18} aria-hidden />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function TeamBody({ item, titleId }: { item: Extract<PeekItem, { kind: "team" }>; titleId: string }) {
  const next = nextGameText(item.next);
  return (
    <>
      <div className="flex items-center gap-3">
        <TeamLogo src={item.logo} name={item.name} size={40} />
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-[17px] font-semibold leading-tight">{item.name}</h2>
          <p className="truncate text-[13px] text-mute tnum">{[item.rank ? `No. ${item.rank} DHR` : "Unranked", `${item.w}–${item.l}`, item.confName].join(" · ")}</p>
        </div>
      </div>
      {next && <p className="mt-3 rounded-xl bg-deck2 px-3 py-2 text-[13px]"><span className="text-mute">Next </span><span className="tnum">{next}</span></p>}
    </>
  );
}

function PlayerBody({ item, titleId }: { item: Extract<PeekItem, { kind: "player" }>; titleId: string }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <TeamLogo src={item.team?.logo ?? null} name={item.team?.name ?? "?"} size={40} />
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-[17px] font-semibold leading-tight">{item.name}</h2>
          <p className="truncate text-[13px] text-mute">{[item.team?.name ?? "Unknown team", item.pos].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {item.stats.map(s => (
          <div key={s.label} className="rounded-xl bg-deck2 px-3 py-2">
            <dt className="text-[11.5px] text-mute">{s.label}</dt>
            <dd className="text-[17px] font-semibold tnum">{s.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
