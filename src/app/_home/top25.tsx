// Top-five stack adapted from Componentry's Sticky Scroll Cards (MIT, Harsh Jadhav, https://componentry.dev).
"use client";
// Home-page top 25, with live post-game ratings applied as soon as results are final.
// On phones the top five are large cards that pin as you scroll, each one settling over the last
// (which scales down a touch and dims); ranks 6-25 follow in the usual table. Wide screens keep
// the full table. With reduced motion the cards simply sit one after another.
import Link from "next/link";
import { useRef, type RefObject } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import RollingNumber from "@sports/ui/rolling-number";
import { IfProjections } from "@/components/projection-toggle";
import TeamLogo from "@sports/ui/team-logo";
import PerfBars from "@/components/perf-bars";
import { LinkRow } from "@sports/ui/data-table";
import LiveRatingsNote, { RankMove } from "@/components/live-ratings-note";
import { fmt, pctFmt, signed, heat } from "@sports/ui/format";
import { useLiveTeams } from "@/lib/live-ratings";
import type { TeamSummary } from "@/lib/types";

const etDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));

export default function Top25({ teams: published, total }: { teams: TeamSummary[]; total: number }) {
  const { teams, prevRank, live } = useLiveTeams(published);
  const top = teams.filter(t => t.rank).slice(0, 25);
  const projLink = (t: TeamSummary) => t.next && t.next.wp !== null && (
    <IfProjections><Link href={`/games/?d=${etDay(t.next.date)}&g=${t.next.id}`} className="relative z-[1] ml-1.5 font-bold text-ink hover:underline" title={`${t.name}'s pregame win probability, open the game`}>{pctFmt(t.next.wp)}</Link></IfProjections>
  );
  return (
  <section aria-labelledby="top25" className="min-w-0">
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 id="top25" className="h-section">DHR top 25</h2>
      <Link href="/rankings/" className="text-sm font-semibold text-mute hover:text-ink">All {total} teams</Link>
    </div>
    <LiveRatingsNote live={live} className="mb-2" />
    <Stack teams={top.slice(0, STACK)} prevRank={prevRank} projLink={projLink} />
    <div className="scroll-x rounded-xl border border-line">
      <table className="dt">
        <caption className="sr-only">Top 25 teams by adjusted efficiency margin</caption>
        <thead>
          <tr><th title="DHR rank, of every rated D-I team">Rk</th><th className="l">Team</th><th title="DHR rating: points per 100 possessions better than an average D-I team (adjusted efficiency margin)">AdjEM</th><th className="grp-off">AdjO</th><th className="grp-def">AdjD</th><th className="l hidden md:table-cell">Form</th><th className="l" title="Next game, with this team's pregame win chance from DHR">Next</th></tr>
        </thead>
        <tbody>
          {top.map((t, i) => (
            <LinkRow key={t.id} href={`/teams/${t.slug}/`} className={i < STACK ? "hidden md:table-row" : ""}>
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
                    {projLink(t)}
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

const STACK = 5;
/** Card geometry in px. Cards pin under the 56px site header with a 12px gap; each later card pins STEP lower so the edge of the one beneath peeks out. */
const TOP = 68, STEP = 10, CARD_H = 156, GAP = 12;
const STRETCH = "after:absolute after:inset-0 after:content-['']";
/** Team colour lifted toward white so navy and black teams still show on a dark card. */
const teamTint = (c: string | null) => (c ? `color-mix(in oklab, ${c} 78%, white)` : "var(--line-2)");

function Stack({ teams, prevRank, projLink }: { teams: TeamSummary[]; prevRank: Map<string, number | null>; projLink: (t: TeamSummary) => React.ReactNode }) {
  const list = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion() ?? false;
  if (!teams.length) return null;
  return (
    <ol ref={list} aria-label="Top five" className="mb-4 md:hidden">
      {teams.map((t, i) => (
        <StackCard key={t.id} t={t} i={i} last={i === teams.length - 1} list={list} reduce={reduce} before={prevRank.get(t.id)} projLink={projLink} />
      ))}
    </ol>
  );
}

function StackCard({ t, i, last, list, reduce, before, projLink }: {
  t: TeamSummary; i: number; last: boolean; list: RefObject<HTMLOListElement | null>; reduce: boolean;
  before: number | null | undefined; projLink: (t: TeamSummary) => React.ReactNode;
}) {
  // Card i+1 starts its natural run (i+1) card-heights below the list's top. It begins to cover card i
  // when it reaches card i's bottom edge and is fully settled when it pins STEP below card i.
  const reach = (i + 1) * (CARD_H + GAP);
  const { scrollYProgress } = useScroll({
    target: list,
    offset: [`start ${TOP + i * STEP + CARD_H - reach}px`, `start ${TOP + (i + 1) * STEP - reach}px`],
  });
  const still = reduce || last;
  const scale = useTransform(scrollYProgress, [0, 1], still ? [1, 1] : [1, 0.94]);
  const dim = useTransform(scrollYProgress, [0, 1], still ? [0, 0] : [0, 0.5]);
  return (
    <li className="mb-3 motion-safe:sticky" style={{ top: `calc(3.5rem + env(safe-area-inset-top) + ${TOP - 56 + i * STEP}px)` }}>
      <motion.article style={{ scale, transformOrigin: "50% 0%" }}
        className="relative flex h-[156px] flex-col justify-between overflow-hidden rounded-[18px] border border-line bg-deck py-3.5 pl-5 pr-4">
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: teamTint(t.color) }} />
        <div className="flex items-center gap-3">
          <TeamLogo src={t.logo} name={t.name} size={40} />
          <div className="min-w-0 flex-1">
            <Link href={`/teams/${t.slug}/`} className={`block truncate text-[19px] font-semibold leading-tight hover:underline ${STRETCH}`}>{t.name}</Link>
            <span className="text-[13px] text-mute"><span className="tnum">{t.w}–{t.l}</span>{t.conf ? `, ${t.conf}` : ""}</span>
          </div>
          <span className="flex shrink-0 items-baseline text-[34px] font-semibold leading-none" title="DHR rank, of every rated D-I team">
            <span className="sr-only">Rank </span><RollingNumber value={t.rank} />
            <RankMove now={t.rank} before={before} />
          </span>
        </div>
        <p className="flex items-baseline gap-3 text-[13px] text-mute">
          <span title="DHR rating: points per 100 possessions better than an average D-I team (adjusted efficiency margin)"><b className="text-[17px] font-semibold text-ink tnum">{signed(t.adjEM, 1)}</b> AdjEM</span>
          <span><span className="font-semibold text-ink tnum">{fmt(t.adjO)}</span> AdjO</span>
          <span><span className="font-semibold text-ink tnum">{fmt(t.adjD)}</span> AdjD</span>
        </p>
        <p className="truncate text-[13px] text-mute">
          {t.next ? (
            <>
              Next: {t.next.venue === "A" ? "at " : "vs "}
              {t.next.oppSlug ? <Link className="relative z-[1] text-ink hover:underline" href={`/teams/${t.next.oppSlug}/`}>{t.next.opp}</Link> : t.next.opp}
              {projLink(t)}
            </>
          ) : "No game scheduled"}
        </p>
        <motion.span aria-hidden className="pointer-events-none absolute inset-0 z-[2] bg-night" style={{ opacity: dim }} />
      </motion.article>
    </li>
  );
}
