"use client";
// Team hero numbers with live post-game ratings applied (record, DHR rank, rating tiles).
import Link from "next/link";
import { fmt, ordinal, signed } from "@/lib/format";
import { useLiveRatings, withLiveTeam } from "@/lib/live-ratings";
import { RankMove } from "@/components/live-ratings-note";
import { Dots } from "@/components/dots";
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
    <span className="flex items-start gap-1">
      <Dots glow ghost className="text-[56px]">{String(t.rank ?? "—")}</Dots>
      <RankMove now={t.rank} before={team.rank} />
    </span>
  );
}

export function LiveTiles({ team, total }: { team: TeamSummary; total: number }) {
  const { t, live } = useTeam(team);
  const cells: [string, string, number | null, string][] = [
    ["Offense", fmt(t.adjO), t.adjORank, "Points per 100 possessions vs an average D-I defense"],
    ["Defense", fmt(t.adjD), t.adjDRank, "Points allowed per 100 possessions vs an average D-I offense (lower is better)"],
    ["Tempo", fmt(t.adjT), t.adjTRank, "Adjusted possessions per 40 minutes (style, not quality)"],
  ];
  return (
    <div title={live ? "Includes results since the last full refresh" : undefined}>
      <dl className="grid grid-cols-3 overflow-hidden rounded-[18px] bg-deck">
        {cells.map(([label, value, rank, hint], i) => (
          <div key={label} className={`flex flex-col gap-1.5 px-3.5 py-3.5 ${i ? "border-l border-line" : ""}`} title={hint}>
            <dt className="text-[13px] font-semibold text-mute">{label}</dt>
            <dd className="font-display text-[28px] font-extrabold leading-none tnum">{value}</dd>
            <dd className="flex items-baseline gap-1"><span className="text-xs text-mute">No.</span><Dots className="text-[20px]">{rank ?? "—"}</Dots></dd>
            <dd className="h-1 rounded-full bg-line" aria-hidden><div className="h-1 rounded-full bg-ink" style={{ width: rank ? `${Math.max(3, (1 - (rank - 1) / total) * 100)}%` : 0 }} /></dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[13px] text-mute tnum">
        Rating <b className="text-ink">{signed(t.adjEM, 1)}</b> per 100 possessions{t.rank ? `, ${ordinal(t.rank)} of ${total}` : ""}. Schedule so far <b className="text-ink">{signed(t.sos, 1)}</b>{t.sosRank ? `, ${ordinal(t.sosRank)}` : ""}.
      </p>
    </div>
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
