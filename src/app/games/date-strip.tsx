"use client";
// Scrollable day pills centred on the selected day, with prev/next, Today and a native date picker.
import { useEffect, useLayoutEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayLabel } from "@/lib/format";
import type { GameIndex } from "@/lib/types";

/** `home` is where Today jumps: today if it has games, else the nearest game day. */
type Props = { index: GameIndex; day: string; today: string; home: string; onSelect: (day: string) => void };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function DateStrip({ index, day, today, home, onSelect }: Props) {
  const days = index.days;
  const scroller = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const pos = days.findIndex(d => d.day === day);
  // Prev/next step to the nearest listed day even when the selected day has no games.
  const prev = pos >= 0 ? days[pos - 1] : [...days].reverse().find(d => d.day < day);
  const next = pos >= 0 ? days[pos + 1] : days.find(d => d.day > day);
  const todayListed = days.some(d => d.day === today);

  const centre = (smooth: boolean) => {
    const box = scroller.current;
    // A day without games has no pill: centre on the next listed day instead.
    const target = days.find(d => d.day >= day)?.day ?? days[days.length - 1]?.day;
    const el = box?.querySelector<HTMLElement>(`[data-day="${target}"]`) ?? null;
    if (!box || !el) return;
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

  return (
    <div className="mb-5">
      <div className="flex items-stretch gap-2">
        <button className="btn shrink-0 !px-2.5 disabled:opacity-40" onClick={() => prev && onSelect(prev.day)} disabled={!prev} aria-label={prev ? `Previous day, ${dayLabel(prev.day)}` : "No earlier games"}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        <div ref={scroller} className="no-scrollbar relative flex min-w-0 flex-1 gap-1.5 overflow-x-auto scroll-px-4" role="group" aria-label="Pick a day">
          {days.map(d => {
            const sel = d.day === day, isToday = d.day === today;
            return (
              <button key={d.day} data-day={d.day} onClick={() => onSelect(d.day)} aria-pressed={sel} aria-label={`${dayLabel(d.day, { weekday: "long", month: "long", day: "numeric" })}${isToday ? " (today)" : ""}, ${d.games} games`}
                className={`flex w-[68px] shrink-0 flex-col items-center rounded-xl border px-1 py-1.5 leading-none transition-colors ${sel ? "border-ink bg-ink text-night" : "border-line bg-deck text-mute hover:border-line2 hover:text-ink"}`}>
                <span className={`text-[11px] font-semibold ${isToday && !sel ? "text-off" : ""}`}>{isToday ? "Today" : dayLabel(d.day, { weekday: "short" })}</span>
                <span className={`mt-1 font-display text-[1.2rem] font-extrabold ${sel ? "" : "text-ink"}`}>{dayLabel(d.day, { month: "short", day: "numeric" })}</span>
                <span className="mt-1 text-[11px] tnum">{d.games} {d.games === 1 ? "game" : "games"}</span>
              </button>
            );
          })}
        </div>
        <button className="btn shrink-0 !px-2.5 disabled:opacity-40" onClick={() => next && onSelect(next.day)} disabled={!next} aria-label={next ? `Next day, ${dayLabel(next.day)}` : "No later games"}>
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button className="btn !py-1.5 disabled:opacity-40" onClick={() => onSelect(home)} disabled={day === home} title={todayListed ? undefined : "No games today, so this jumps to the nearest game day"}>Today</button>
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
