"use client";
// Hero: the viewer's "today" (Eastern) slate, best games first.
import Link from "next/link";
import { useMemo } from "react";
import TeamLogo from "@/components/team-logo";
import WinProb from "@/components/win-prob";
import { dayLabel, etToday, fmt, timeLabel } from "@/lib/format";
import { useJson } from "@/lib/client-data";
import type { Game, GameDay, GameIndex } from "@/lib/types";

function pickDay(index: GameIndex) {
  const today = etToday();
  const days = index.days.filter(d => d.games > 0);
  return days.find(d => d.day === today)?.day ?? days.find(d => d.day > today)?.day ?? days.at(-1)?.day ?? null;
}

function Row({ side, score, fav, projected }: { side: Game["home"]; score: number | null; fav: boolean; projected: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <TeamLogo src={side.logo} name={side.name} size={24} />
      <span className="w-6 text-right text-xs text-dim tnum">{side.rank ?? ""}</span>
      <span className={`min-w-0 flex-1 truncate font-semibold ${fav ? "" : "text-mute"}`}>{side.name}</span>
      <span className={`font-display tnum ${projected ? "text-xl font-bold text-mute" : "text-2xl font-black"}`} title={projected ? "Projected score" : undefined}>{score ?? ""}</span>
    </div>
  );
}

export default function Tonight() {
  const index = useJson<GameIndex>("games/index.json");
  const day = index.data ? pickDay(index.data) : null;
  const slate = useJson<GameDay>(day ? `games/${day}.json` : null);
  const games = useMemo(() => [...(slate.data?.games ?? [])].sort((a, b) => (b.watch ?? 0) - (a.watch ?? 0)), [slate.data]);
  const isToday = day === etToday();
  const live = games.filter(g => g.status === "in_progress").length;
  const best = games[0];

  return (
    <section aria-labelledby="tonight">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="tonight" className="font-display text-[3rem] font-black leading-[0.9] tracking-tight sm:text-7xl">
            {day ? (isToday ? "Tonight" : dayLabel(day, { weekday: "long", month: "short", day: "numeric" })) : "Tonight"}
          </h1>
          <p className="mt-2 text-mute">
            {slate.data ? (
              <>
                {games.length} games{live ? <> · <span className="text-hot">{live} in progress at last refresh</span></> : null}
                {best && best.pred ? <> · best matchup by quality and closeness: <b className="text-ink">{best.away.name} {best.neutral ? "vs" : "at"} {best.home.name}</b></> : null}
              </>
            ) : "Loading the slate…"}
          </p>
        </div>
        {day && <Link href={`/games/?d=${day}`} className="btn">Full scoreboard</Link>}
      </div>
      {index.status === "error" || slate.status === "error" ? (
        <p className="deck p-4 text-sm text-mute">The schedule feed didn’t load. <button className="underline" onClick={() => { index.retry(); slate.retry(); }}>Try again</button></p>
      ) : (
        <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
          {(slate.data ? games.slice(0, 8) : Array.from({ length: 4 }, () => null)).map((g, i) => g ? (
            <Link key={g.id} href={`/games/?d=${day}&g=${g.id}`} className="deck w-[82vw] max-w-[340px] shrink-0 snap-start p-4 hover:border-line2 sm:w-auto sm:max-w-none">
              <div className="mb-3 flex items-center justify-between text-xs text-mute">
                <span className="flex items-center gap-2">
                  {g.status === "in_progress" ? <><span className="live-dot" /><span className="text-hot" title="Status as of the last data refresh">In progress</span></> : g.status === "final" ? "Final" : g.status === "scheduled" ? <>{timeLabel(g.date)} · projected score</> : <span className="capitalize">{g.status.replace("_", " ")}</span>}
                  {g.neutral && <span>· neutral</span>}
                </span>
                {g.watch !== null && <span title="Watchability: team quality + projected closeness">Watch {g.watch}</span>}
              </div>
              <div className="space-y-1.5">
                <Row side={g.away} score={g.status === "scheduled" ? (g.pred ? Math.round(g.pred.away) : null) : g.status === "final" || g.status === "in_progress" ? g.away.score : null} fav={!g.pred || g.pred.wp < 0.5} projected={g.status === "scheduled"} />
                <Row side={g.home} score={g.status === "scheduled" ? (g.pred ? Math.round(g.pred.home) : null) : g.status === "final" || g.status === "in_progress" ? g.home.score : null} fav={!g.pred || g.pred.wp >= 0.5} projected={g.status === "scheduled"} />
              </div>
              {g.pred && (
                <div className="mt-3">
                  <WinProb awayName={g.away.name} homeName={g.home.name} homeWP={g.pred.wp} compact />
                  <p className="mt-1.5 text-xs text-mute">
                    {g.status === "scheduled" ? "Projected" : "Pregame"}: {g.pred.margin >= 0 ? g.home.name : g.away.name} by {fmt(Math.abs(g.pred.margin), 1)} · {Math.round(Math.max(g.pred.wp, 1 - g.pred.wp) * 100)}%
                  </p>
                </div>
              )}
            </Link>
          ) : <div key={i} className="deck h-[150px] w-[82vw] max-w-[340px] shrink-0 animate-pulse sm:w-auto sm:max-w-none" />)}
        </div>
      )}
    </section>
  );
}
