"use client";
// One-line note shown wherever live post-game ratings are applied.
import type { LiveRatings } from "@/lib/live-ratings";

export function RankMove({ now, before }: { now: number | null; before: number | null | undefined }) {
  if (!now || !before || now === before) return null;
  const up = now < before, n = Math.abs(before - now);
  return (
    <span className={`ml-1 text-[10.5px] font-semibold ${up ? "text-win" : "text-loss"}`} title={`${up ? "Up" : "Down"} ${n} since tonight's results (was ${before})`}>
      <span aria-hidden>{up ? "▲" : "▼"}</span>{n}<span className="sr-only">{up ? " up" : " down"}</span>
    </span>
  );
}

export default function LiveRatingsNote({ live, className = "" }: { live: LiveRatings | null; className?: string }) {
  if (!live) return null;
  const n = live.finals.length;
  return (
    <p className={`flex items-center gap-2 text-xs text-mute ${className}`} role="status">
      <span className="relative flex h-2 w-2" aria-hidden><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-win opacity-60 motion-reduce:hidden" /><span className="relative inline-flex h-2 w-2 rounded-full bg-win" /></span>
      Updated live with {n} result{n === 1 ? "" : "s"} since the last full refresh. Ratings and records already include them.
    </p>
  );
}
