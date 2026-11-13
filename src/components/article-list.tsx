// Credited headlines: publisher, time, link out. No article text or images are copied.
import { ExternalLink } from "lucide-react";
import type { Article } from "@/lib/types";

const KIND: Record<string, string> = { Preview: "Preview", Recap: "Recap", HeadlineNews: "News", Story: "Story", Media: "Video" };
export function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ArticleList({ items, max = 8, empty = "No recent coverage yet." }: { items: Article[] | null | undefined; max?: number; empty?: string }) {
  if (!items?.length) return <p className="text-sm text-mute">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {items.slice(0, max).map(a => (
        <li key={a.url}>
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-snug group-hover:text-off">{a.h}</span>
              <span className="mt-0.5 block text-xs text-mute">
                {KIND[a.kind] ? <span className="mr-1.5 rounded bg-deck2 px-1.5 py-px text-[10.5px] font-semibold text-ink">{KIND[a.kind]}</span> : null}
                {a.src}{a.by ? ` · ${a.by}` : ""} · <time dateTime={a.t} suppressHydrationWarning>{ago(a.t)}</time>
              </span>
            </span>
            <ExternalLink size={14} className="mt-1 shrink-0 text-dim group-hover:text-off" aria-label="Opens the publisher's site" />
          </a>
        </li>
      ))}
    </ul>
  );
}
