"use client";
// Day picker with prev/next, Today and a native date picker. Phones (< 640px) get a flickable
// wheel of days (date-wheel.tsx); wider screens get a scrolling pill strip whose selection slides
// from day to day. Arrow keys move one game day in either.
import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayLabel } from "@sports/ui/format";
import type { GameIndex } from "@/lib/types";
import DateWheel from "./date-wheel";
import { DayFace, dayAria } from "./day-pill";

/** `home` is where Today jumps: today if it has games, else the nearest game day. */
type Props = { index: GameIndex; day: string; today: string; home: string; onSelect: (day: string) => void };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = [0.22, 1, 0.36, 1] as const;

export default function DateStrip({ index, day, today, home, onSelect }: Props) {
  const days = index.days;
  const scroller = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const highlight = useId();
  const reduce = useReducedMotion() ?? false;
  const pos = days.findIndex(d => d.day === day);
  // Prev/next step to the nearest listed day even when the selected day has no games.
  const prev = pos >= 0 ? days[pos - 1] : [...days].reverse().find(d => d.day < day);
  const next = pos >= 0 ? days[pos + 1] : days.find(d => d.day > day);
  const todayListed = days.some(d => d.day === today);
  // A day without games has no pill: the next listed day takes the keyboard stop.
  const anchorDay = days.find(d => d.day >= day)?.day ?? days[days.length - 1]?.day;

  const centre = (smooth: boolean) => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>(`[data-day="${anchorDay}"]`) ?? null;
    if (!box || !el || !box.clientWidth) return;
    box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2, behavior: smooth && !reducedMotion() ? "smooth" : "auto" });
  };
  useLayoutEffect(() => {
    centre(!first.current);
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);
  useEffect(() => {
    const onResize = () => centre(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  // Arrow keys move one game day; Home/End jump to the ends. Focus follows the new day.
  const focusIn = useRef<HTMLElement | null>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.key === "ArrowLeft" ? prev?.day : e.key === "ArrowRight" ? next?.day
      : e.key === "Home" ? days[0]?.day : e.key === "End" ? days[days.length - 1]?.day : undefined;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    if (!target || target === day) return;
    focusIn.current = e.currentTarget;
    onSelect(target);
  };
  useEffect(() => {
    const box = focusIn.current;
    focusIn.current = null;
    box?.querySelector<HTMLElement>(`[data-day="${day}"]`)?.focus({ preventScroll: true });
  }, [day]);

  return (
    <div className="mb-5">
      <div className="flex items-stretch gap-2">
        <button className="btn shrink-0 !px-2.5 disabled:opacity-40" onClick={() => prev && onSelect(prev.day)} disabled={!prev} aria-label={prev ? `Previous day, ${dayLabel(prev.day)}` : "No earlier games"}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        {/* Phones: the wheel. */}
        <div className="flex min-w-0 flex-1 sm:hidden">
          <DateWheel days={days} day={day} today={today} onSelect={onSelect} onKeyDown={onKeyDown} />
        </div>
        {/* Wider screens: the pill strip, with one highlight that slides to the picked day. */}
        <motion.div ref={scroller} layoutScroll onKeyDown={onKeyDown}
          className="no-scrollbar relative hidden min-w-0 flex-1 gap-1.5 overflow-x-auto scroll-px-4 sm:flex" role="group" aria-label="Pick a day">
          {days.map(d => {
            const sel = d.day === day;
            return (
              <button key={d.day} data-day={d.day} onClick={() => onSelect(d.day)} aria-pressed={sel} aria-label={dayAria(d, today)} tabIndex={d.day === anchorDay ? 0 : -1}
                className={`relative flex w-[68px] shrink-0 flex-col items-center rounded-xl border border-transparent px-1 py-2 leading-none transition-colors ${sel ? "text-ink" : "text-mute hover:bg-deck hover:text-ink"}`}>
                {sel && (
                  <motion.span layoutId={`day-hl-${highlight}`} aria-hidden className="absolute inset-0 rounded-xl bg-deck2"
                    transition={reduce ? { duration: 0 } : { duration: 0.38, ease: EASE }} />
                )}
                <DayFace d={d} today={today} sel={sel} />
              </button>
            );
          })}
        </motion.div>
        <button className="btn shrink-0 !px-2.5 disabled:opacity-40" onClick={() => next && onSelect(next.day)} disabled={!next} aria-label={next ? `Next day, ${dayLabel(next.day)}` : "No later games"}>
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {day !== home && <button className="btn !py-1.5" onClick={() => onSelect(home)} title={todayListed ? undefined : "No games today, so this jumps to the nearest game day"}>{todayListed ? "Today" : "Nearest game day"}</button>}
        <label className="flex items-center gap-2 text-sm text-mute">
          <span className="sr-only">Go to date</span>
          <input type="date" className="field !py-1.5" value={day} min={days[0]?.day} max={days[days.length - 1]?.day}
            onChange={e => e.target.value && onSelect(e.target.value)} />
        </label>
        <span className="ml-auto hidden text-xs text-dim sm:inline">Times shown in your time zone · days follow Eastern time</span>
      </div>
    </div>
  );
}
