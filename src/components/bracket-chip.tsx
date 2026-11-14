"use client";
// Projected NCAA tournament status for one team ("Proj. 4 seed", "Last four in", "Out"),
// read client-side from bracket.json. Links to the bracket. Renders nothing until the
// projection loads, or if it isn't published.
import Link from "next/link";
import { useJson } from "@/lib/client-data";
import { bracketStatus, pctLabel, type BracketFile } from "@/lib/bracket";

export function useBracket() {
  return useJson<BracketFile>("bracket.json");
}

export default function BracketChip({ slug, className = "" }: { slug: string; className?: string }) {
  const { data } = useBracket();
  if (!data?.ok) return null;
  const entry = data.index[slug];
  if (!entry) return null;
  const st = bracketStatus(entry);
  const dot = st.tone === "in" ? "bg-win" : st.tone === "bubble" ? "bg-bulb" : "bg-dim";
  const odds = entry.x ? "" : ` In the field in ${pctLabel(entry.p)} of ${data.config.sims.toLocaleString("en-US")} simulated seasons.`;
  const title = `Unofficial D1 Hoops bracket projection.${st.detail ? ` ${st.detail}.` : ""}${odds}`;
  return (
    <Link href={`/bracket/${entry.g ? "?tab=bubble" : ""}`} title={title} className={`chip !py-1 text-[12.5px] ${className}`}>
      <i className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      {st.label}
      {st.detail && st.tone !== "out" && <span className="font-medium text-mute">· {st.detail}</span>}
      <span className="sr-only"> ({title})</span>
    </Link>
  );
}
