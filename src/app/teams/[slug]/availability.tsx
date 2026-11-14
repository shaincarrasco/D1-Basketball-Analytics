"use client";
// Team availability block: health header (out / limited / minutes missing / rating lost), current list, season log.
import Link from "next/link";
import AvailabilityList from "@/components/availability-list";
import InjuryHistory from "@/components/injury-history";
import type { Availability, InjuryLogEntry, ReportLink, TeamSummary } from "@/lib/types";
import { lossText, pct } from "@/lib/injuries";

export default function TeamAvailability({ slug, health, items, log, links }: {
  slug: string; health: TeamSummary["health"]; items: Availability[] | undefined; log: InjuryLogEntry[] | undefined; links: ReportLink[];
}) {
  const share = Math.min(1, Math.max(0, health?.minShare ?? 0));
  return (
    <>
      {health && (health.out > 0 || health.limited > 0) && (
        <div className="mb-3 rounded-2xl bg-deck2 p-3.5">
          <div className="flex gap-5">
            <div><span className="font-display text-[28px] font-black leading-none tnum">{health.out}</span><span className="block text-[11px] font-semibold text-mute">out</span></div>
            <div><span className="font-display text-[28px] font-black leading-none tnum">{health.limited}</span><span className="block text-[11px] font-semibold text-mute">limited</span></div>
            <div title="Estimated team rating lost while these players are out, points per 100 possessions"><span className="font-display text-[28px] font-black leading-none tnum">{lossText(health.netLoss)}</span><span className="block text-[11px] font-semibold text-mute">est. rating lost</span></div>
          </div>
          <div className="mt-3" role="img" aria-label={`${pct(share)} of team minutes missing`}>
            <div className="h-1.5 overflow-hidden rounded-full bg-line2"><div className="h-full rounded-full bg-loss" style={{ width: `${share * 100}%` }} /></div>
            <p className="mt-1 text-[11px] text-mute">{pct(share)} of team minutes missing</p>
          </div>
        </div>
      )}
      <AvailabilityList items={items} slug={slug} />
      {log && log.length > 0 && (
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-mute hover:text-ink">Season injury log ({log.length})</summary>
          <div className="mt-3"><InjuryHistory log={log} slug={slug} /></div>
        </details>
      )}
      <div className="mt-4 flex flex-col gap-1 text-sm font-semibold">
        <Link href="/injuries/" className="link">League-wide injuries →</Link>
        {links.map(l => l.url && <a key={l.conf} href={l.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-mute underline decoration-line2 underline-offset-2 hover:text-ink">Official availability report (conference games){l.conf ? `, ${l.conf}` : ""}</a>)}
      </div>
    </>
  );
}
