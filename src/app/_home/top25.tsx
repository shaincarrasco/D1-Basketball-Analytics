"use client";
// Home-page top 25, with live post-game ratings applied as soon as results are final.
import Link from "next/link";
import TeamLogo from "@/components/team-logo";
import PerfBars from "@/components/perf-bars";
import { LinkRow } from "@/components/data-table";
import LiveRatingsNote, { RankMove } from "@/components/live-ratings-note";
import { fmt, pctFmt, signed, heat } from "@/lib/format";
import { useLiveTeams } from "@/lib/live-ratings";
import type { TeamSummary } from "@/lib/types";

const etDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));

export default function Top25({ teams: published, total }: { teams: TeamSummary[]; total: number }) {
  const { teams, prevRank, live } = useLiveTeams(published);
  const top = teams.filter(t => t.rank).slice(0, 25);
  return (
  <section aria-labelledby="top25" className="min-w-0">
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 id="top25" className="h-section">DHR top 25</h2>
      <Link href="/rankings/" className="text-sm font-semibold text-mute hover:text-ink">All {total} teams</Link>
    </div>
    <LiveRatingsNote live={live} className="mb-2" />
    <div className="scroll-x rounded-xl border border-line">
      <table className="dt">
        <caption className="sr-only">Top 25 teams by adjusted efficiency margin</caption>
        <thead>
          <tr><th>Rk</th><th className="l">Team</th><th>AdjEM</th><th className="grp-off">AdjO</th><th className="grp-def">AdjD</th><th className="l hidden md:table-cell">Form</th><th className="l">Next</th></tr>
        </thead>
        <tbody>
          {top.map(t => (
            <LinkRow key={t.id} href={`/teams/${t.slug}/`}>
              <td className="whitespace-nowrap"><span className="rank-cell">{t.rank}</span><RankMove now={t.rank} before={prevRank.get(t.id)} /></td>
              <td className="l">
                <Link href={`/teams/${t.slug}/`} className="link flex items-center gap-2.5">
                  <TeamLogo src={t.logo} name={t.name} size={22} />
                  <span className="font-semibold group-hover/row:text-off">{t.name}</span>
                  <span className="text-xs text-mute">{t.w}–{t.l}</span>
                </Link>
              </td>
              <td><b>{signed(t.adjEM, 1)}</b></td>
              <td><span className="rounded px-1.5 py-0.5" style={{ background: heat(t.adjORank, total) }}>{fmt(t.adjO)}</span></td>
              <td><span className="rounded px-1.5 py-0.5" style={{ background: heat(t.adjDRank, total) }}>{fmt(t.adjD)}</span></td>
              <td className="l hidden md:table-cell"><PerfBars values={t.perf} width={70} height={20} /></td>
              <td className="l text-[13px] text-mute">
                {t.next ? (
                  <span>
                    {t.next.venue === "A" ? "at " : "vs "}
                    {t.next.oppSlug ? <Link className="link" href={`/teams/${t.next.oppSlug}/`}>{t.next.opp}</Link> : t.next.opp}
                    {t.next.wp !== null && <Link href={`/games/?d=${etDay(t.next.date)}&g=${t.next.id}`} className="ml-1.5 font-bold text-ink hover:underline" title={`${t.name}'s pregame win probability — open the game`}>{pctFmt(t.next.wp)}</Link>}
                  </span>
                ) : "—"}
              </td>
            </LinkRow>
          ))}
        </tbody>
      </table>
    </div>
  </section>
  );
}
