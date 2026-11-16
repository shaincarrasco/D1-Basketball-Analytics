// A player's name, linked to their Baseline page when Deuce matched them to one, with their ranking.
import Link from "next/link";
import type { DPlayer } from "@/lib/deuce";

export default function PlayerName({ p, won, className = "" }: { p: DPlayer; won?: boolean; className?: string }) {
  return (
    <span className={`min-w-0 truncate ${className}`}>
      {p.baseline_id ? <Link href={`/player/?id=${p.baseline_id}`} className="link relative z-10">{p.name}</Link> : p.name}
      {p.rank != null && <span className="ml-1 text-[12.5px] font-normal text-dim">#{p.rank}</span>}
      {won && <span className="sr-only"> (winner)</span>}
    </span>
  );
}
