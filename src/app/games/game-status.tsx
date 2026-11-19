"use client";
// Adapted from Componentry's Flight Status Card (MIT, Harsh Jadhav, https://componentry.dev).
// The flight card's route line, kept quiet for a dense scoreboard: the two team codes at the ends,
// a hairline track between them filled as far as the game has run, a small marker at the front,
// and for an unplayed game the countdown to tip-off in the middle of the line.
import { useSyncExternalStore } from "react";
import type { LiveGame } from "@/lib/live";
import type { Game } from "@/lib/types";
import { gameProgress, teamCode, tipCountdown } from "./game-progress";
import { isTBA, winner } from "./game-utils";

// One shared clock for every card's countdown: a 15-second tick, started only while a card needs it.
const TICK = 15_000;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!timer) timer = setInterval(() => listeners.forEach(l => l()), TICK);
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer) { clearInterval(timer); timer = null; }
  };
}
const noSubscribe = () => () => {};
const clockNow = () => Math.floor(Date.now() / TICK) * TICK;
// No clock on the server: the countdown appears once the page runs, the tip time is there before.
const serverNow = () => 0;

/** Ticking "now" for countdowns; a constant 0 when `on` is false so idle cards keep no timer. */
function useNow(on: boolean): number {
  return useSyncExternalStore(on ? subscribe : noSubscribe, on ? clockNow : serverNow, serverNow);
}

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export default function GameStatus({ g, live }: { g: Game; live?: LiveGame }) {
  const { phase, value } = gameProgress(g, live);
  const tip = new Date(g.date).getTime();
  // A countdown only for a game still waiting to tip at a known time (not delayed or postponed).
  const waiting = phase === "scheduled" && Number.isFinite(tip) && !isTBA(g)
    && (!live || (live.state === "pre" && !/Delayed|Postponed/.test(live.label)));
  const now = useNow(waiting);
  // More than a day out (or tip time passed) gives null: the status column's tip time is the answer then.
  const countdown = waiting && now ? tipCountdown(tip, now) : null;

  // A code is lit while its team leads or after it won; otherwise it sits in grey.
  const w = winner(g);
  const lead = phase === "live" && g.home.score != null && g.away.score != null && g.home.score !== g.away.score
    ? (g.home.score > g.away.score ? "home" : "away") : null;
  const lit = (which: "home" | "away") => w === which || lead === which;
  const code = (which: "home" | "away") => (
    <span className={`dots ${lit(which) ? "" : "dots-off"} w-[38px] shrink-0 truncate text-[11px] leading-none ${which === "home" ? "text-right" : ""}`}>
      {teamCode(g[which])}
    </span>
  );

  const tone = phase === "live" ? "bg-hot" : "bg-dim";
  const f = value ?? 0;
  const title = phase === "live" ? (value != null ? `About ${Math.round(f * 100)}% of the game played` : "In progress")
    : phase === "final" ? "Final" : countdown ?? undefined;

  return (
    <div className="mt-1.5 flex h-3 items-center gap-2" aria-hidden title={title} data-testid="game-track" data-phase={phase}>
      {code("away")}
      {countdown ? (
        <>
          <span className="h-px min-w-[12px] flex-1 bg-line" />
          <span className="shrink-0 whitespace-nowrap text-[11px] font-medium leading-none text-mute tnum">{countdown}</span>
          <span className="h-px min-w-[12px] flex-1 bg-line" />
        </>
      ) : (
        <span className="relative h-[2px] flex-1 rounded-full bg-line">
          {value != null && phase !== "scheduled" && (
            <>
              <span className={`absolute inset-0 origin-left rounded-full ${tone}`}
                style={{ transform: `scaleX(${f})`, transition: `transform 700ms ${EASE}` }} />
              {/* The marker rides a full-width layer moved by transform, so it tracks the fill without animating layout. */}
              <span className="absolute inset-0" style={{ transform: `translateX(${f * 100}%)`, transition: `transform 700ms ${EASE}` }}>
                <span className={`absolute left-0 top-1/2 h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full ${tone}`} />
              </span>
            </>
          )}
        </span>
      )}
      {code("home")}
    </div>
  );
}
