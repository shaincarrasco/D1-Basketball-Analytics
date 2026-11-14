"use client";
// One scoreboard card. The whole card opens the detail sheet (a full-cover button);
// team names sit above it as real links to the team pages.
import Link from "next/link";
import { useMemo } from "react";
import TeamLogo from "@sports/ui/team-logo";
import WinProb from "@/components/win-prob";
import { DHR_RANK_TITLE, fmt, pctFmt } from "@sports/ui/format";
import type { LiveGame } from "@/lib/live";
import type { LiveSummary } from "@/lib/live-game";
import { gameMoments, momentWhen, type Moment } from "@/lib/moments";
import type { Game, GameSide } from "@/lib/types";
import TvBadges from "@/components/tv-badges";
import type { KeyAbsence } from "@/components/whos-out";
import { useShowProjections } from "@/lib/show-projections";
import { favoriteWon, isFinal, isLive, lineInfo, marginText, statusLabel, teamHref, winner } from "./game-utils";

export function WatchBadge({ value }: { value: number | null }) {
  if (value == null) return null;
  const tone = value >= 80 ? "border-[rgb(var(--off-rgb)/0.6)] text-off" : value >= 60 ? "border-line2 text-ink" : "border-line text-mute";
  return (
    <span title="Watchability, 0–100: half team quality, half how close the projection is" className={`inline-flex items-baseline gap-1 rounded-md border px-1.5 py-0.5 ${tone}`}>
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
    <div className="flex items-center gap-2.5">
      {teamHref(side)
        ? <Link href={teamHref(side)!} tabIndex={-1} aria-hidden className="relative z-10 shrink-0"><TeamLogo src={side.logo} name={side.name} size={28} /></Link>
        : <TeamLogo src={side.logo} name={side.name} size={28} />}
      <span className="w-6 shrink-0 text-right font-display text-[13px] font-bold leading-none text-dim tnum" title={side.rank ? DHR_RANK_TITLE : undefined} aria-label={side.rank ? `DHR rank ${side.rank}` : undefined}>
        {side.rank ?? ""}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <TeamName side={side} className={`inline-block max-w-full align-top text-[15px] font-semibold ${lost ? "!text-mute" : ""}`} />
        <span className="block text-[11.5px] text-dim">{side.id ? side.record ?? "—" : "Non-D-I"}{side.conf ? ` · ${side.conf}` : ""}{absence && <AbsenceChip a={absence} />}</span>
      </div>
      {showScore ? (
        <span className={`font-display text-[1.75rem] font-extrabold leading-none tnum ${lost ? "text-mute" : "text-ink"}`}>
          {side.score}
          {final && w === which && <span className="sr-only"> (winner)</span>}
        </span>
      ) : proj != null ? (
        <span className="flex items-baseline gap-1.5 text-right leading-none" title="Projected points (game not finished)">
          <span className="text-[10px] font-semibold text-dim">Proj</span>
          <span className="font-display text-[1.35rem] font-bold text-mute tnum">{fmt(proj, 0)}</span>
        </span>
      ) : null}
    </div>
  );
}

const MODEL_TITLE = "Uses DHR's model: the pregame win probability set before tip-off";

/** One live moment in plain words: a short coloured lead ("12–0 run") and the sentence. */
export function MomentLine({ m, className = "" }: { m: Moment; className?: string }) {
  return (
    <p data-testid="moment" data-kind={m.kind} className={`text-[13.5px] leading-snug text-ink ${className}`} title={m.model ? MODEL_TITLE : undefined}>
      {m.lead && <span className="font-semibold text-hot">{m.lead}: </span>}
      {m.body}
    </p>
  );
}

/** The game sheet's "Moments" list for a live game: the best few candidates, newest context first. */
export function MomentList({ g, live, summary }: { g: Game; live?: LiveGame; summary: LiveSummary | null }) {
  const list = useMemo(() => gameMoments(g, live, summary && summary.state === "in" ? summary : null).slice(0, 5), [g, live, summary]);
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
      {list.some(m => m.model) && <p className="mt-1.5 text-[12px] text-dim">&ldquo;Our pregame chance&rdquo; and &ldquo;our model&rdquo; are DHR&apos;s win probabilities, not betting odds.</p>}
    </section>
  );
}

export default function GameCard({ g, live: lg, onOpen, absences, moment }: { g: Game; live?: LiveGame; onOpen: (id: string, el: HTMLElement) => void; absences?: Map<string, KeyAbsence>; moment?: Moment | null }) {
  const final = isFinal(g), live = isLive(g);
  const fw = favoriteWon(g);
  const status = statusLabel(g, lg);
  const li = lineInfo(g);
  // Only unplayed games: for finals we don't store who was available at the time.
  const abs = (side: GameSide) => (!final && side.slug ? absences?.get(side.slug) : undefined);
  const label = `${g.away.name} ${g.neutral ? "vs" : "at"} ${g.home.name}: ${status}${final || live ? `, ${g.away.score ?? "—"} to ${g.home.score ?? "—"}` : ""}.${live && moment ? ` ${moment.text}.` : ""} Open game details`;
  return (
    <article className={`deck relative flex w-full flex-col gap-3 p-4 transition-colors hover:border-line2 ${live ? "!border-[rgb(var(--hot-rgb)/0.5)]" : ""}`}>
      <button type="button" aria-label={label} onClick={e => onOpen(g.id, e.currentTarget)} className="absolute inset-0 rounded-[10px] focus-visible:outline-offset-[-2px]" />
      <div className="flex items-center gap-2 text-[12px] text-mute">
        {live && <span className="live-dot" aria-hidden />}
        <span className={`font-semibold tnum ${live ? "text-hot" : final ? "text-ink" : ""}`}>{status}</span>
        {lg?.state === "in" && <span className="rounded bg-[rgb(var(--hot-rgb)/0.14)] px-1 text-[10.5px] font-semibold text-hot" title="Live score from ESPN, refreshed every 30 seconds">Live</span>}
        {g.neutral && <span className="text-dim">· Neutral</span>}
        {g.confGame && <span className="text-dim">· Conf</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {g.upset != null && final && <span className="rounded-md bg-[rgb(var(--hot-rgb)/0.15)] px-1.5 py-0.5 text-[11px] font-bold text-hot">Upset</span>}
          <WatchBadge value={g.watch} />
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <Row g={g} side={g.away} which="away" absence={abs(g.away)} />
        <Row g={g} side={g.home} which="home" absence={abs(g.home)} />
      </div>
      {live && moment && <MomentLine m={moment} className="-mt-0.5" />}
      {g.tv?.length && !final ? <div className="-mt-1"><TvBadges tv={g.tv} /></div> : null}
      {g.pred && (
        <div className="mt-auto">
          <WinProb awayName={g.away.name} homeName={g.home.name} homeWP={g.pred.wp} compact />
          <div className="mt-1.5 flex items-center gap-2 text-[12px] text-mute tnum">
            <span className="truncate" title="DHR's projected margin, set before tip-off">Proj: <span className="font-semibold text-ink">{marginText(g)}</span></span>
            <span className="shrink-0 text-dim" title="The favorite's pregame win chance">{pctFmt(Math.max(g.pred.wp, 1 - g.pred.wp))}</span>
            {fw != null && (
              <span className={`ml-auto shrink-0 font-semibold ${fw ? "text-win" : "text-loss"}`} title={fw ? "Pregame favorite won" : "Pregame favorite lost"}>
                <span aria-hidden>{fw ? "✓" : "✗"}</span><span className="sr-only">{fw ? "Model pick correct" : "Model pick wrong"}</span>
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
