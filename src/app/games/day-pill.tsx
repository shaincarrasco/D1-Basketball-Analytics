// The face of one day on the date strip and the phone wheel: weekday (or "Today"), date, game count.
import { dayLabel } from "@sports/ui/format";

export type StripDay = { day: string; games: number };

export const dayAria = (d: StripDay, today: string) =>
  `${dayLabel(d.day, { weekday: "long", month: "long", day: "numeric" })}${d.day === today ? " (today)" : ""}, ${d.games} games`;

export function DayFace({ d, today, sel }: { d: StripDay; today: string; sel: boolean }) {
  const isToday = d.day === today;
  return (
    <>
      <span className={`relative text-[11px] font-semibold ${isToday && !sel ? "text-off" : ""}`}>{isToday ? "Today" : dayLabel(d.day, { weekday: "short" })}</span>
      <span className={`relative mt-1.5 whitespace-nowrap text-[15px] font-semibold ${sel ? "" : "text-ink"}`}>{dayLabel(d.day, { month: "short", day: "numeric" })}</span>
      <span className="relative mt-1.5 whitespace-nowrap text-[11px] tnum">{d.games} {d.games === 1 ? "game" : "games"}</span>
    </>
  );
}
