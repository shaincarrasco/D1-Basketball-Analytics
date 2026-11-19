// Pure helpers for the game card's status track: how far along a game is, the tip-off
// countdown and the short team code. No React, no clock of its own: callers pass `now`.
import type { Game, GameSide } from "@/lib/types";

export const HALF_SEC = 20 * 60;
export const OT_SEC = 5 * 60;
export const REG_SEC = 2 * HALF_SEC;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Share of the game played, 0–1, from the period (1, 2 = halves; 3+ = overtimes) and the seconds
 * left on the clock. In overtime the game's length grows by 5 minutes per period, so the share is
 * measured against regulation plus every overtime started so far.
 */
export function progressFromClock(period: number, clockSec: number): number {
  if (!Number.isFinite(period) || period <= 0) return 0;
  const left = Math.max(0, Number.isFinite(clockSec) ? clockSec : 0);
  if (period <= 2) {
    const elapsed = (period - 1) * HALF_SEC + (HALF_SEC - Math.min(left, HALF_SEC));
    return clamp01(elapsed / REG_SEC);
  }
  const ots = period - 2;
  const total = REG_SEC + ots * OT_SEC;
  const elapsed = REG_SEC + (ots - 1) * OT_SEC + (OT_SEC - Math.min(left, OT_SEC));
  return clamp01(elapsed / total);
}

export type Phase = "live" | "final" | "scheduled" | "other";
export type Progress = { phase: Phase; /** 0–1, or null when a live game's clock is unknown. */ value: number | null };

/** Where a game stands for the track: finals are full, unplayed games empty, live games from the clock. */
export function gameProgress(
  g: Pick<Game, "status" | "flow">,
  live?: { state: string; period: number; clock: number } | null,
): Progress {
  if (g.status === "final") return { phase: "final", value: 1 };
  if (g.status === "in_progress") {
    if (live && live.state === "in" && live.period > 0) return { phase: "live", value: progressFromClock(live.period, live.clock) };
    // No live feed: the last point of the score flow says how much time had run.
    const last = g.flow?.length ? g.flow[g.flow.length - 1][0] : null;
    if (last != null && Number.isFinite(last)) {
      const total = last > REG_SEC ? REG_SEC + Math.ceil((last - REG_SEC) / OT_SEC) * OT_SEC : REG_SEC;
      return { phase: "live", value: clamp01(last / total) };
    }
    return { phase: "live", value: null };
  }
  if (g.status === "scheduled") return { phase: "scheduled", value: 0 };
  return { phase: "other", value: null };
}

/** "Tip in 2h 14m" / "Tip in 9m" while tip-off is under 24 hours away, else null. Minutes round up. */
export function tipCountdown(tipMs: number, now: number): string | null {
  if (!Number.isFinite(tipMs) || !Number.isFinite(now)) return null;
  const diff = tipMs - now;
  if (diff <= 0 || diff >= 24 * 3600_000) return null;
  const mins = Math.ceil(diff / 60_000);
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return `Tip in ${m}m`;
  return m === 0 ? `Tip in ${h}h` : `Tip in ${h}h ${m}m`;
}

/** The team's short code ("DUKE"), or initials from the name when the feed has none. */
export function teamCode(side: Pick<GameSide, "short" | "name">): string {
  if (side.short) return side.short.toUpperCase();
  const words = side.name.replace(/\(.*?\)/g, " ").split(/[^A-Za-z]+/).filter(Boolean);
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map(w => w[0]).join("").slice(0, 4).toUpperCase();
}
