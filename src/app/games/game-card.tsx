"use client";
// One scoreboard card. The whole card opens the detail sheet (a full-cover button);
// team names sit above it as real links to the team pages.
import Link from "next/link";
import TeamLogo from "@/components/team-logo";
import WinProb from "@/components/win-prob";
import { fmt, pctFmt } from "@/lib/format";
import type { Game, GameSide } from "@/lib/types";
import { favoriteWon, isFinal, isLive, marginText, statusLabel, teamHref, winner } from "./game-utils";

export function WatchBadge({ value }: { value: number | null }) {
  if (value == null) return null;
  const tone = value >= 80 ? "border-[rgba(255,122,26,0.6)] text-off" : value >= 60 ? "border-line2 text-ink" : "border-line text-mute";
  return (
    <span title="Watchability, 0–100: half team quality, half how close the projection is" className={`inline-flex items-baseline gap-1 rounded-md border px-1.5 py-0.5 ${tone}`}>
      <span className="text-[10.5px] font-semibold text-mute">Watch</span>
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

function Row({ g, side, which }: { g: Game; side: GameSide; which: "home" | "away" }) {
  const w = winner(g);
  const final = isFinal(g), live = isLive(g);
  const lost = final && w != null && w !== which;
  // A live game at 0–0 is a stale snapshot of tip-off; show no score rather than a fake one.
  const showScore = (final || (live && ((g.home.score ?? 0) + (g.away.score ?? 0)) > 0)) && side.score != null;
  const proj = g.pred ? g.pred[which] : null;
  return (
    <div className="flex items-center gap-2.5">
      <TeamLogo src={side.logo} name={side.name} size={28} />
      <span className="w-6 shrink-0 text-right font-display text-[13px] font-bold leading-none text-dim tnum" aria-label={side.rank ? `Ranked ${side.rank}` : undefined}>
        {side.rank ?? ""}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <TeamName side={side} className={`inline-block max-w-full align-top text-[15px] font-semibold ${lost ? "!text-mute" : ""}`} />
        <span className="block text-[11.5px] text-dim">{side.id ? side.record ?? "—" : "Non-D-I"}{side.conf ? ` · ${side.conf}` : ""}</span>
      </div>
      {showScore ? (
        <span className={`font-display text-[1.75rem] font-extrabold leading-none tnum ${lost ? "text-mute" : "text-ink"}`}>
          {side.score}
          {final && w === which && <span className="sr-only"> (winner)</span>}
        </span>
      ) : (
        <span className="text-right leading-none" title="Projected points">
          <span className="font-display text-[1.35rem] font-bold text-mute tnum">{fmt(proj, 0)}</span>
        </span>
      )}
    </div>
  );
}

export default function GameCard({ g, onOpen }: { g: Game; onOpen: (id: string, el: HTMLElement) => void }) {
  const final = isFinal(g), live = isLive(g);
  const fw = favoriteWon(g);
  const label = `${g.away.name} ${g.neutral ? "vs" : "at"} ${g.home.name}: ${statusLabel(g)}${final || live ? `, ${g.away.score ?? "—"} to ${g.home.score ?? "—"}` : ""}. Open game details`;
  return (
    <article className={`deck relative flex w-full flex-col gap-3 p-4 transition-colors hover:border-line2 ${live ? "!border-[rgba(255,62,165,0.5)]" : ""}`}>
      <button type="button" aria-label={label} onClick={e => onOpen(g.id, e.currentTarget)} className="absolute inset-0 rounded-[18px] focus-visible:outline-offset-[-2px]" />
      <div className="flex items-center gap-2 text-[12px] text-mute">
        {live && <span className="live-dot" aria-hidden />}
        <span className={`font-semibold ${live ? "text-hot" : final ? "text-ink" : ""}`}>{statusLabel(g)}</span>
        {g.neutral && <span className="text-dim">· Neutral</span>}
        {g.confGame && <span className="text-dim">· Conf</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {g.upset != null && final && <span className="rounded-md bg-[rgba(255,62,165,0.15)] px-1.5 py-0.5 text-[11px] font-bold text-hot">Upset</span>}
          <WatchBadge value={g.watch} />
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <Row g={g} side={g.away} which="away" />
        <Row g={g} side={g.home} which="home" />
      </div>
      {g.pred && (
        <div className="mt-auto">
          <WinProb awayName={g.away.name} homeName={g.home.name} homeWP={g.pred.wp} compact />
          <div className="mt-1.5 flex items-center gap-2 text-[12px] text-mute tnum">
            <span className="truncate">{final ? "Proj: " : ""}<span className="font-semibold text-ink">{marginText(g)}</span></span>
            <span className="shrink-0 text-dim">{pctFmt(Math.max(g.pred.wp, 1 - g.pred.wp))}</span>
            {fw != null && (
              <span className={`ml-auto shrink-0 font-semibold ${fw ? "text-win" : "text-loss"}`} title={fw ? "Pregame favorite won" : "Pregame favorite lost"}>
                <span aria-hidden>{fw ? "✓" : "✗"}</span><span className="sr-only">{fw ? "Model pick correct" : "Model pick wrong"}</span>
              </span>
            )}
            {g.upset != null && final && <span className={`${fw == null ? "ml-auto" : ""} shrink-0 text-hot`}>{pctFmt(g.upset)} winner</span>}
          </div>
        </div>
      )}
    </article>
  );
}
