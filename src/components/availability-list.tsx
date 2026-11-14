"use client";
// Current absences with how we know: status pill, timeline, credited source, confidence, impact and with/without record.
// Client component because the shared injury helpers live in a "use client" module.
import Link from "next/link";
import type { Availability } from "@/lib/types";
import InjuryPill, { ConfidenceTag } from "./injury-pill";
import { SOURCE_LABEL, etaText, lossText, shortDate } from "@/lib/injuries";

const signed = (v: number | null) => (v == null ? "" : ` (${v > 0 ? "+" : ""}${Math.round(v)})`);
const rec = (r: [number, number, number | null]) => `${r[0]}–${r[1]}${signed(r[2])}`;

export function WithWithout({ ww, first }: { ww: NonNullable<Availability["ww"]>; first?: string }) {
  return <span className="tnum">With {first ?? "him"} {rec(ww.with)} · Without {rec(ww.without)}</span>;
}

/** One absence as a row. `slug` links players without a stats line to their team; `linkName=false` on the player's own page. */
export function AvailabilityRow({ a, slug, linkName = true, big = false }: { a: Availability; slug?: string; linkName?: boolean; big?: boolean }) {
  const inferred = a.confidence === "inferred";
  const when = etaText(a);
  const href = a.pid ? `/player/?id=${a.pid}` : slug ? `/teams/${slug}/` : null;
  const imp = a.impact, hasStats = a.pid != null && imp.mpg != null;
  const bits = [
    a.body ?? (inferred ? "Reason not reported" : null),
    when,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {linkName && href ? <Link href={href} className={`link font-display font-extrabold leading-tight ${big ? "text-[26px]" : "text-[19px]"}`}>{a.name}</Link>
          : <span className={`font-display font-extrabold leading-tight ${big ? "text-[26px]" : "text-[19px]"}`}>{a.name}</span>}
        {a.pos && <span className="text-xs text-dim">{a.pos}</span>}
        <InjuryPill state={a.state} label={a.status} />
      </div>
      {bits.length > 0 && <p className="text-[14px] font-semibold text-ink">{bits.join(" · ")}</p>}
      {inferred && a.body && <p className="text-xs text-mute">Reason not reported</p>}
      {a.detail && !inferred && (
        <p className="text-[13px] text-mute">
          {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline decoration-line2 underline-offset-2 hover:text-ink">{a.detail}</a> : a.detail}
          {a.publisher ? <span className="text-dim"> ({a.publisher})</span> : null}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-mute">
        <ConfidenceTag value={a.confidence} />
        <span>{SOURCE_LABEL[a.source]}</span>
        {a.since && <span>since {shortDate(a.since)}</span>}
        {a.yetToPlay ? <span>has not played this season</span> : a.missed > 0 ? (
          <span className="tnum">missed {a.missed} {a.missed === 1 ? "game" : "games"}{a.lastPlayed ? `, last played ${shortDate(a.lastPlayed)}` : ""}</span>
        ) : null}
      </p>
      {hasStats && (
        <p className="flex flex-wrap gap-x-3 text-xs text-mute tnum">
          <span>{imp.mpg} mpg{imp.ppg != null ? `, ${imp.ppg} ppg` : ""}</span>
          {imp.netLoss != null && imp.netLoss >= 0.05 && <span title="Estimated team rating lost while he is out, points per 100 possessions">est. {lossText(imp.netLoss)} pts/100</span>}
          {a.ww && <WithWithout ww={a.ww} />}
        </p>
      )}
    </div>
  );
}

export default function AvailabilityList({ items, showEmpty = true, slug, linkNames = true }: { items: Availability[] | null | undefined; showEmpty?: boolean; slug?: string; linkNames?: boolean }) {
  if (!items?.length) return showEmpty ? <p className="text-sm text-mute">No absences flagged. We check ESPN&apos;s injury list, box scores and injury headlines every hour.</p> : null;
  return (
    <ul className="divide-y divide-line">
      {items.map(a => <li key={a.key} className="py-3 first:pt-1 last:pb-0"><AvailabilityRow a={a} slug={slug} linkName={linkNames} /></li>)}
    </ul>
  );
}
