"use client";
// One scoreboard card. The whole card opens the detail sheet (a full-cover button);
// team names sit above it as real links to the team pages.
import Link from "next/link";
import { useMemo } from "react";
import TeamLogo from "@sports/ui/team-logo";
import RollingNumber from "@sports/ui/rolling-number";
import WinProb from "@/components/win-prob";
import { DHR_RANK_TITLE, fmt, pctFmt } from "@sports/ui/format";
import type { LiveGame } from "@/lib/live";
import type { LiveSummary } from "@/lib/live-game";
import { gameMoments, momentWhen, type Moment } from "@/lib/moments";
import type { Game, GameSide } from "@/lib/types";
import type { KeyAbsence } from "@/components/whos-out";
import { useShowProjections } from "@/lib/show-projections";
import GameStatus from "./game-status";
import { favoriteWon, isFinal, isLive, lineInfo, marginText, statusLabel, teamHref, winner } from "./game-utils";

export function WatchBadge({ value }: { value: number | null }) {
  // A low score on every card is noise: only games worth flagging get the badge.
  if (value == null || value < 50) return null;
  const tone = value >= 80 ? "border-[rgb(var(--off-rgb)/0.6)] text-off" : value >= 60 ? "border-line2 text-ink" : "border-line text-mute";
  return (
    <span title="Watchability, 0–100: how good the teams are and how even the matchup is" className={`inline-flex items-baseline gap-1 rounded-md border px-1.5 py-0.5 ${tone}`}>
      <span className="text-[10.5px] font-semibold text-mute">Interest</span>
      <span className="font-display text-[15px] font-extrabold leading-none tnum">{value}</span>
    </span>
  );
}

export function TeamName({ side, className = "" }: { side: GameSide; className?: string }) {
  const href = teamHref(side);
  return href
    ? <Link href={href} className={`link relative z-10 truncate ${className}`}>{side.name}</Link>
    : <span className={`truncate ${className}`} title="Non-Division I opponent">{side.name}</span>;
}

/** Subtle red-dot chip: key players out. Text says it in words; names go in the tooltip and aria-label. */
function AbsenceChip({ a }: { a: KeyAbsence }) {
  const word = a.inferredOnly ? "missing" : "out";
  const label = `${a.out} ${word}: ${a.names.join(", ")}${a.inferredOnly ? ". Reason not reported" : ""}`;
  return (
    <span title={label} aria-label={label} className="ml-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-loss/40 bg-loss/10 px-1.5 text-[10.5px] font-semibold leading-[16px] text-loss">
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{a.out} {word}
    </span>
  );
}

function Row({ g, side, which, absence }: { g: Game; side: GameSide; which: "home" | "away"; absence?: KeyAbsence }) {
  const w = winner(g);
  const final = isFinal(g), live = isLive(g);
  const lost = final && w != null && w !== which;
  // A live game at 0–0 is a stale snapshot of tip-off; show no score rather than a fake one.
  const showScore = (final || (live && ((g.home.score ?? 0) + (g.away.score ?? 0)) > 0)) && side.score != null;
  // Projected points only when the reader turned them on; otherwise an unplayed game shows no number.
  const showProj = useShowProjections();
  const proj = showProj && g.pred ? g.pred[which] : null;
  return (
    <div className="flex h-[30px] items-center gap-2.5">
      {teamHref(side)
        ? <Link href={teamHref(side)!} tabIndex={-1} aria-hidden className="relative z-10 shrink-0"><TeamLogo src={side.logo} name={side.name} size={24} /></Link>
        : <TeamLogo src={side.logo} name={side.name} size={24} />}
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        {side.rank ? <span className="shrink-0 text-[11.5px] font-semibold text-dim tnum" title={DHR_RANK_TITLE} aria-label={`DHR rank ${side.rank}`}>{side.rank}</span> : null}
        <TeamName side={side} className={`text-[14.5px] font-semibold ${lost ? "!text-mute" : ""}`} />
        <span className="shrink-0 text-[12px] text-dim tnum">{side.id ? side.record ?? "" : ""}</span>
        {absence && <AbsenceChip a={absence} />}
      </div>
      {showScore ? (
        <span className={`font-display text-[1.45rem] font-extrabold leading-none tnum ${lost ? "text-mute" : "text-ink"}`}>
          {/* Rolls like an odometer when a live score changes; static on first paint. */}
          <RollingNumber value={side.score} />
          {final && w === which && <span className="sr-only"> (winner)</span>}
        </span>
      ) : proj != null ? (
        <span className="font-display text-[1.2rem] font-bold leading-none text-dim tnum" title="Projected points (game not finished)">{fmt(proj, 0)}</span>
      ) : null}
    </div>
  );
}

/** One live moment in plain words: a short coloured lead ("12–0 run") and the sentence. */
export function MomentLine({ m, className = "" }: { m: Moment; className?: string }) {
  return (
    <p data-testid="moment" data-kind={m.kind} className={`text-[13.5px] leading-snug text-ink ${className}`}>
      {m.lead && <span className="font-semibold text-hot">{m.lead}: </span>}
      {m.body}
    </p>
  );
}

/** The game sheet's "Moments" list for a live game: the best few candidates, newest context first. */
export function MomentList({ g, live, summary }: { g: Game; live?: LiveGame; summary: LiveSummary | null }) {
  const projections = useShowProjections();
  const list = useMemo(() => gameMoments(g, live, summary && summary.state === "in" ? summary : null, { projections }).slice(0, 5), [g, live, summary, projections]);
  if (!list.length) return null;
  return (
    <section className="mt-7" aria-labelledby={`mo-${g.id}`}>
      <h3 id={`mo-${g.id}`} className="h-section mb-2 !text-xl">Moments</h3>
      <ul className="overflow-hidden rounded-[14px] border border-line" data-testid="moment-list">
        {list.map((m, i) => (
          <li key={`${m.kind}-${i}`} className="flex min-h-[44px] items-baseline gap-3 border-b border-line px-3.5 py-2.5 last:border-0">
            <span className="w-[66px] shrink-0 whitespace-nowrap text-[12.5px] font-semibold text-mute tnum">{momentWhen(m)}</span>
            <MomentLine m={m} className="min-w-0 flex-1" />
          </li>
        ))}
      </ul>
      {list.some(m => m.model) && <p className="mt-1.5 text-[12px] text-dim">Win chances are projections, not betting odds.</p>}
    </section>
  );
}

export default function GameCard({ g, live: lg, onOpen, absences, moment }: { g: Game; live?: LiveGame; onOpen: (id: string, el: HTMLElement) => void; absences?: Map<string, KeyAbsence>; moment?: Moment | null }) {
  const final = isFinal(g), live = isLive(g);
  const fw = favoriteWon(g);
  const status = statusLabel(g, lg);
  const li = lineInfo(g);
  // Win chances, margins and picks are projections: nothing below the teams until the reader asks.
  const showProj = useShowProjections();
  // Only unplayed games: for finals we don't store who was available at the time.
  const abs = (side: GameSide) => (!final && side.slug ? absences?.get(side.slug) : undefined);
  const label = `${g.away.name} ${g.neutral ? "vs" : "at"} ${g.home.name}: ${status}${final || live ? `, ${g.away.score ?? "—"} to ${g.home.score ?? "—"}` : ""}.${live && moment ? ` ${moment.text}.` : ""} Open game details`;
  // Scoreboard-app layout: teams and scores on the left, one narrow status column on the right.
  return (
    <article className="relative flex w-full flex-col px-4 py-3 transition-colors hover:bg-deck2">
      <button type="button" aria-label={label} onClick={e => onOpen(g.id, e.currentTarget)} className="absolute inset-0 focus-visible:outline-offset-[-2px]" />
      <div className="flex items-stretch gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Row g={g} side={g.away} which="away" absence={abs(g.away)} />
          <Row g={g} side={g.home} which="home" absence={abs(g.home)} />
        </div>
        <div className="flex w-[72px] shrink-0 flex-col whitespace-nowrap items-end justify-center gap-0.5 border-l border-line pl-3 text-right text-[12px] leading-tight text-mute">
          <span className={`flex items-center gap-1.5 font-semibold tnum ${live ? "text-hot" : final ? "text-ink" : "text-ink"}`}>{live && <span className="live-dot" aria-hidden />}{status}</span>
          {g.upset != null && final ? <span className="font-semibold text-hot">Upset</span>
            : !final && g.tv?.length ? <span className="max-w-full truncate text-dim">{g.tv[0].name}</span>
            : g.neutral ? <span className="text-dim">Neutral</span> : null}
        </div>
      </div>
      <GameStatus g={g} live={lg} />
      {live && moment && <MomentLine m={moment} className="mt-1.5" />}
      {showProj && g.pred && (
        <div className="mt-2.5">
          <WinProb awayName={g.away.name} homeName={g.home.name} homeWP={g.pred.wp} compact />
          <div className="mt-1.5 flex items-center gap-2 text-[12px] text-mute tnum">
            <span className="truncate" title="Projected margin, set before tip-off">Proj: <span className="font-semibold text-ink">{marginText(g)}</span></span>
            <span className="shrink-0 text-dim" title="The favorite's pregame win chance">{pctFmt(Math.max(g.pred.wp, 1 - g.pred.wp))}</span>
            {fw != null && (
              <span className={`ml-auto shrink-0 font-semibold ${fw ? "text-win" : "text-loss"}`} title={fw ? "Pregame favorite won" : "Pregame favorite lost"}>
                <span aria-hidden>{fw ? "✓" : "✗"}</span><span className="sr-only">{fw ? "Favorite won" : "Favorite lost"}</span>
              </span>
            )}
            {g.upset != null && final && <span className={`${fw == null ? "ml-auto" : ""} shrink-0 text-hot`} title="The winner's pregame win chance">{pctFmt(g.upset)} winner</span>}
          </div>
          {li && (
            <div className="mt-1 flex items-center gap-2 text-[11.5px] text-dim tnum">
              <span className="truncate" title={`Pregame line${li.provider ? ` (${li.provider})` : ""}${li.model ? ` · DHR ${li.model}` : ""}`}>
                Line <span className="text-mute">{li.market}</span>{li.total != null ? <> · Total <span className="text-mute">{li.total}</span></> : null}
              </span>
              {li.pick && (
                <span className={`ml-auto shrink-0 ${li.result === "W" ? "font-semibold text-win" : li.result === "L" ? "font-semibold text-loss" : ""}`}
                  title={`DHR pick against the line: ${li.pick.text}${li.result === "W" ? ", covered" : li.result === "L" ? ", didn't cover" : li.result === "P" ? ", push" : ""}`}>
                  {li.result ? <>ATS <span aria-hidden>{li.result === "W" ? "✓" : li.result === "L" ? "✗" : "–"}</span><span className="sr-only">{li.result === "W" ? "DHR pick covered" : li.result === "L" ? "DHR pick did not cover" : "push"}</span></> : <>Pick <span className="text-mute">{li.pick.text}</span></>}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
