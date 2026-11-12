// Availability notes with their source spelled out, so a box-score inference never reads as a confirmed injury.
import Link from "next/link";
import type { Availability } from "@/lib/types";

const SRC: Record<Availability["source"], string> = { espn: "ESPN injury report", box: "Box scores", news: "Headline" };
export default function AvailabilityList({ items, showEmpty = true }: { items: Availability[] | null | undefined; showEmpty?: boolean }) {
  if (!items?.length) return showEmpty ? <p className="text-sm text-mute">No players flagged. We check ESPN&apos;s injury list, recent box scores and injury headlines.</p> : null;
  return (
    <ul className="divide-y divide-line">
      {items.map(a => (
        <li key={a.pid + a.status} className="flex items-start gap-3 py-2.5">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.source === "espn" ? "bg-loss" : a.source === "box" ? "bg-off" : "bg-dim"}`} aria-hidden />
          <span className="min-w-0 flex-1">
            <Link href={`/player/?id=${a.pid}`} className="link font-semibold">{a.name}</Link>
            <span className="ml-2 text-sm text-ink">{a.status}</span>
            <span className="block text-xs text-mute">
              {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline decoration-line2 underline-offset-2 hover:text-ink">{a.detail}</a> : a.detail}
              {" · "}{SRC[a.source]}{a.since ? ` · since ${new Date(`${a.since.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : ""}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
