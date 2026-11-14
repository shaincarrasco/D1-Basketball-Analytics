"use client";
// Team hero numbers with live post-game ratings applied (record, DHR rank, rating tiles).
import Link from "next/link";
import { fmt, ordinal, signed } from "@/lib/format";
import { useLiveRatings, withLiveTeam } from "@/lib/live-ratings";
import { RankMove } from "@/components/live-ratings-note";
import type { TeamSummary } from "@/lib/types";

function useTeam(team: TeamSummary) {
  const live = useLiveRatings();
  return { t: withLiveTeam(team, live), live: !!live?.teams.get(team.id) };
}

export function LiveRecord({ team, conf = false }: { team: TeamSummary; conf?: boolean }) {
  const { t } = useTeam(team);
  return <>{conf ? `${t.cw}–${t.cl}` : `${t.w}–${t.l}`}</>;
}

export function LiveRank({ team }: { team: TeamSummary }) {
  const { t } = useTeam(team);
  return (
    <>
      <div className="outline-num font-display text-[3rem] font-black leading-none tnum sm:text-[3.75rem]">{t.rank ?? "—"}</div>
      <div className="h-4 text-right"><RankMove now={t.rank} before={team.rank} /></div>
    </>
  );
}

export function LiveTiles({ team }: { team: TeamSummary }) {
  const { t, live } = useTeam(team);
  const tiles: [string, string, number | null, string][] = [
    ["AdjEM", signed(t.adjEM, 1), t.rank, "Points per 100 possessions better than an average D-I team"],
    ["Adj offense", fmt(t.adjO), t.adjORank, "Points per 100 vs an average defense"],
    ["Adj defense", fmt(t.adjD), t.adjDRank, "Points allowed per 100 vs an average offense"],
    ["Tempo", fmt(t.adjT), t.adjTRank, "Adjusted possessions per 40 minutes"],
    ["Schedule", signed(t.sos, 1), t.sosRank, "Average AdjEM of opponents so far"],
  ];
  return (
    <dl className="relative mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-5" title={live ? "Includes results since the last full refresh" : undefined}>
      {tiles.map(([label, value, rank, hint]) => (
        <div key={label} className="bg-deck px-4 py-3 last:col-span-2 sm:last:col-span-1" title={hint}>
          <dt className="label">{label}</dt>
          <dd className="font-display text-[1.6rem] font-extrabold tnum">{value}<span className="ml-2 font-sans text-xs font-semibold text-mute">{rank ? ordinal(rank) : ""}</span></dd>
        </div>
      ))}
    </dl>
  );
}

/** The "Next game" card, swapped for the result once that game has gone final (before the next data refresh). */
export function LiveNextGate({ nextId, slug, opp, day, children }: { nextId: string; slug: string; opp: string; day: string; children: React.ReactNode }) {
  const live = useLiveRatings();
  const f = live?.finals.find(x => x.id === nextId);
  if (!f) return <>{children}</>;
  const home = f.game.home.slug === slug;
  const pts = home ? f.homePts : f.awayPts, oppPts = home ? f.awayPts : f.homePts;
  const won = pts > oppPts;
  return (
    <section className="deck flex flex-wrap items-center gap-3 p-5">
      <div className="label basis-full">Final</div>
      <Link href={`/games/?d=${day}&g=${nextId}`} className="link text-[1.15rem] font-semibold">
        <span className={won ? "text-win" : "text-loss"}>{won ? "W" : "L"}</span> {pts}–{oppPts} {home ? "vs" : "at"} {opp}
      </Link>
      <span className="text-[13px] text-mute">Ratings and rankings on this page already include it.</span>
    </section>
  );
}
