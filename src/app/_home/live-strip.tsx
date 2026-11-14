"use client";
// Home: a compact "Live now: N games" link into the games hub's Live view, shown only while games are on.
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function LiveStrip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Link href="/games/?live=1" data-testid="home-live-strip"
      className="press inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[rgb(var(--hot-rgb)/0.45)] bg-deck py-2 pl-3.5 pr-2.5 text-[15px] font-semibold hover:bg-deck2">
      <span className="live-dot" aria-hidden />
      <span>Live now: <span className="tnum text-hot">{count}</span> {count === 1 ? "game" : "games"}</span>
      <ChevronRight size={16} className="text-mute" aria-hidden />
    </Link>
  );
}
