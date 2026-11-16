"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { TeamHealth } from "@/lib/types";
import TeamLogo from "@sports/ui/team-logo";
import { lossText, pct } from "@/lib/injuries";
import { teamHex } from "@sports/ui/color";
import type { TeamMetaMap } from "./parts";

export default function TeamHealthBars({ teams, meta }: { teams: TeamHealth[]; meta: TeamMetaMap }) {
  const [top50, setTop50] = useState(false);
  const list = useMemo(() => teams.filter(t => !top50 || (t.rank ?? 999) <= 50).sort((a, b) => b.netLoss - a.netLoss || (a.rank ?? 999) - (b.rank ?? 999)).slice(0, 15), [teams, top50]);
  const max = Math.max(0.01, ...list.map(t => t.minShare));
  return (
    <div>
      <div className="mb-3 seg max-w-xs" role="group" aria-label="Which teams">
        <button aria-pressed={!top50} onClick={() => setTop50(false)}>All teams</button>
        <button aria-pressed={top50} onClick={() => setTop50(true)} title="Teams in the DHR top 50">Top 50</button>
      </div>
      {!list.length ? <div className="deck p-5 text-sm text-mute">No teams with missing minutes right now.</div> : (
        <ol className="deck divide-y divide-line overflow-hidden">
          {list.map(t => (
            <li key={t.slug}>
              <Link href={`/teams/${t.slug}/`} className="block px-3.5 py-3 hover:bg-deck2">
                <div className="flex items-center gap-2.5">
                  <TeamLogo src={meta[t.slug]?.logo ?? null} name={t.team} size={24} />
                  <span className="font-display text-[18px] font-bold leading-none">{t.team}</span>
                  {t.rank ? <span className="dots text-[11px] text-dim" title={`DHR rank ${t.rank}`}>{t.rank}</span> : null}
                  <span className="ml-auto text-right text-[13px] text-mute"><span className="font-display text-[18px] font-bold text-loss">{lossText(t.netLoss)}</span> <span className="text-[11px]">est. pts/100</span></span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-deck2" role="img" aria-label={`${pct(t.minShare)} of minutes missing`}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(3, (t.minShare / max) * 100)}%`, background: teamHex(meta[t.slug]?.color) ?? "var(--loss)" }} />
                  </div>
                  <span className="w-[150px] shrink-0 text-right text-[12.5px] text-mute sm:w-[210px]">{pct(t.minShare)} of minutes · {t.out} out{t.limited ? ` · ${t.limited} limited` : ""}</span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-xs text-dim">Est. rating lost is our estimate of points per 100 possessions, based on each player&apos;s minutes and production.</p>
    </div>
  );
}
