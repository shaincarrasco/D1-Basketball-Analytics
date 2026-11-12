"use client";
// Hero: the viewer's "today" (Eastern) slate, best games first. On today's slate ESPN's live
// scores are laid over the static data (see lib/live.ts).
// Each card opens the game sheet (a full-cover link); team names and logos sit above it as their own links.
import Link from "next/link";
import { useLayoutEffect, useMemo, useRef } from "react";
import TeamLogo from "@/components/team-logo";
import WinProb from "@/components/win-prob";
import TvBadges from "@/components/tv-badges";
import { dayLabel, etToday, fmt, timeLabel } from "@/lib/format";
import { useJson } from "@/lib/client-data";
import { useLiveScores, withLive, type LiveGame } from "@/lib/live";
import type { Game, GameDay, GameIndex, GameSide } from "@/lib/types";
import { lineInfo } from "../games/game-utils";

function pickDay(index: GameIndex) {
  const today = etToday();
  const days = index.days.filter(d => d.games > 0);
  return days.find(d => d.day === today)?.day ?? days.find(d => d.day > today)?.day ?? days.at(-1)?.day ?? null;
}

function Row({ side, score, fav, projected }: { side: GameSide; score: number | null; fav: boolean; projected: boolean }) {
  const href = side.slug ? `/teams/${side.slug}/` : null;
  return (
    <div className="flex items-center gap-2.5">
      {href
        ? <Link href={href} tabIndex={-1} aria-hidden className="relative z-10 shrink-0"><TeamLogo src={side.logo} name={side.name} size={24} /></Link>
        : <TeamLogo src={side.logo} name={side.name} size={24} />}
      <span className="w-6 text-right text-xs text-dim tnum">{side.rank ?? ""}</span>
      <span className="min-w-0 flex-1 truncate">
        {href
          ? <Link href={href} className={`link relative z-10 font-semibold ${fav ? "" : "!text-mute hover:!text-off"}`}>{side.name}</Link>
          : <span className={`font-semibold ${fav ? "" : "text-mute"}`} title="Non-Division I opponent">{side.name}</span>}
      </span>
      <span className="flex items-baseline gap-1.5" title={projected ? "Projected score (game not finished)" : undefined}>
        {projected && score != null && <span className="text-[10px] font-semibold text-dim">Proj</span>}
        <span className={`font-display tnum ${projected ? "text-lg font-semibold text-dim" : "text-xl font-extrabold"}`}>{score ?? ""}</span>
      </span>
    </div>
  );
}

function Status({ g, live }: { g: Game; live?: LiveGame }) {
  if (g.status === "in_progress") {
    return live
      ? <><span className="live-dot" aria-hidden /><span className="font-semibold text-hot tnum">{live.label || "In progress"}</span></>
      : <><span className="live-dot" aria-hidden /><span className="text-hot" title="Status as of the last data refresh">In progress</span></>;
  }
  if (g.status === "final") return <span className="font-semibold text-ink">{live?.label || "Final"}</span>;
  if (g.status === "scheduled") return <>{timeLabel(g.date)}</>;
  return <span className="capitalize">{g.status.replace("_", " ")}</span>;
}

export default function Tonight() {
  const index = useJson<GameIndex>("games/index.json");
  const day = index.data ? pickDay(index.data) : null;
  const slate = useJson<GameDay>(day ? `games/${day}.json` : null);
  const isToday = day === etToday();
  const staticGames = slate.status === "ready" && slate.data.day === day ? slate.data.games : null;
  const live = useLiveScores(isToday ? day : null, staticGames);
  const games = useMemo(() => {
    const list = (staticGames ?? []).map(g => withLive(g, live.byGame.get(g.id)));
    // Live games first, then the best matchups.
    const liveFirst = (g: Game) => (g.status === "in_progress" ? 0 : 1);
    return list.sort((a, b) => liveFirst(a) - liveFirst(b) || (b.watch ?? 0) - (a.watch ?? 0));
  }, [staticGames, live.byGame]);
  // Scroll snapping keeps the previously snapped card in view when a live game jumps to the front; go back to the start.
  const strip = useRef<HTMLDivElement>(null);
  const firstId = games[0]?.id;
  useLayoutEffect(() => { if (strip.current) strip.current.scrollLeft = 0; }, [firstId]);
  const liveCount = games.filter(g => g.status === "in_progress").length;
  const best = useMemo(() => games.reduce<Game | undefined>((m, g) => (!m || (g.watch ?? -1) > (m.watch ?? -1) ? g : m), undefined), [games]);

  return (
    <section aria-labelledby="tonight">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="tonight" className="text-[1.75rem] font-bold leading-tight tracking-[-0.02em] sm:text-[2rem]">
            {day ? (isToday ? "Tonight" : dayLabel(day, { weekday: "long", month: "short", day: "numeric" })) : "Tonight"}
            {live.hasData && (
              <span className="ml-3 inline-flex items-center gap-1.5 align-middle text-[12px] font-semibold tracking-normal text-hot"
                title={`Live scores from ESPN${live.updated ? `, updated ${new Date(live.updated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}. Refreshes every 30 seconds while games are on.`}>
                <span className="rounded bg-[rgb(var(--hot-rgb)/0.14)] px-1.5 py-0.5">Live</span>
              </span>
            )}
          </h1>
          <p className="mt-0.5 text-[14px] text-mute">
            {staticGames ? (
              <>
                <Link href={`/games/?d=${day}`} className="link !text-mute hover:!text-ink">{games.length} games</Link>
                {liveCount ? <> · <span className="text-hot">{liveCount} {live.hasData ? "live now" : "in progress at last refresh"}</span></> : null}
                {best && best.pred ? <> · best matchup <Link href={`/games/?d=${day}&g=${best.id}`} className="link font-semibold">{best.away.name} {best.neutral ? "vs" : "at"} {best.home.name}</Link></> : null}
              </>
            ) : "Loading the slate…"}
          </p>
        </div>
        {day && <Link href={`/games/?d=${day}`} className="btn">Full scoreboard</Link>}
      </div>
      {index.status === "error" || slate.status === "error" ? (
        <p className="deck p-4 text-sm text-mute">The schedule feed didn’t load. <button className="underline" onClick={() => { index.retry(); slate.retry(); }}>Try again</button></p>
      ) : (
        <div ref={strip} className="no-scrollbar -mx-4 flex snap-x [overflow-anchor:none] scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
          {(staticGames ? games.slice(0, 8) : Array.from({ length: 4 }, () => null)).map((g, i) => g ? (
            <GameTile key={g.id} g={g} day={day!} live={live.byGame.get(g.id)} />
          ) : <div key={i} className="deck h-[150px] w-[82vw] max-w-[340px] shrink-0 animate-pulse sm:w-auto sm:max-w-none" />)}
        </div>
      )}
    </section>
  );
}

function GameTile({ g, day, live }: { g: Game; day: string; live?: LiveGame }) {
  const scheduled = g.status === "scheduled";
  const played = g.status === "final" || g.status === "in_progress";
  const score = (k: "home" | "away") => (scheduled ? (g.pred ? Math.round(g.pred[k]) : null) : played ? g[k].score : null);
  const li = lineInfo(g);
  const isLive = g.status === "in_progress";
  return (
    <article className={`deck relative w-[82vw] max-w-[340px] shrink-0 snap-start p-4 hover:border-line2 sm:w-auto sm:max-w-none ${isLive ? "!border-[rgb(var(--hot-rgb)/0.5)]" : ""}`}>
      <Link href={`/games/?d=${day}&g=${g.id}`} className="absolute inset-0 rounded-[10px] focus-visible:outline-offset-[-2px]"
        aria-label={`${g.away.name} ${g.neutral ? "vs" : "at"} ${g.home.name}${played ? `, ${g.away.score ?? "—"} to ${g.home.score ?? "—"}` : ""}. Open game details`} />
      <div className="mb-3 flex items-center justify-between text-xs text-mute">
        <span className="flex items-center gap-2">
          <Status g={g} live={live} />
          {g.neutral && <span>· neutral</span>}
        </span>
        {g.watch !== null && <span title="Watchability: team quality + projected closeness">Interest {g.watch}</span>}
      </div>
      <div className="space-y-1.5">
        <Row side={g.away} score={score("away")} fav={!g.pred || g.pred.wp < 0.5} projected={scheduled} />
        <Row side={g.home} score={score("home")} fav={!g.pred || g.pred.wp >= 0.5} projected={scheduled} />
      </div>
      {g.tv?.length && g.status !== "final" ? <div className="mt-2.5"><TvBadges tv={g.tv} /></div> : null}
      {g.pred && (
        <div className="mt-3">
          <WinProb awayName={g.away.name} homeName={g.home.name} homeWP={g.pred.wp} compact />
          <p className="mt-1.5 truncate text-xs text-mute">
            {scheduled ? "Projected" : "Pregame"}: {g.pred.margin >= 0 ? g.home.name : g.away.name} by {fmt(Math.abs(g.pred.margin), 1)} · {Math.round(Math.max(g.pred.wp, 1 - g.pred.wp) * 100)}%
            {li ? <span className="text-dim"> · Line {li.market}</span> : null}
          </p>
        </div>
      )}
    </article>
  );
}
