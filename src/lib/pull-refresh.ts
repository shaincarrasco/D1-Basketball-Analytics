// Pure pieces of pull to refresh (src/components/pull-refresh.tsx): how far the content follows the
// finger, when a pull counts, and the "Updated 12s ago" text. Kept free of the DOM for tests.

export const PULL = {
  /** Finger travel before the gesture is read as a pull or as something else. */
  slop: 8,
  /** How far the content has to follow the finger (after resistance) to refresh on release. */
  threshold: 60,
  /** The content never follows further than this. */
  max: 140,
  /** Where the content rests while the refresh runs: room for the spinner. */
  hold: 52,
  /** A refresh shows its spinner at least this long, so a fast one still reads as a refresh. */
  minSpinMs: 550,
  /** Give up waiting on a refresh after this long. */
  timeoutMs: 15_000,
} as const;

/**
 * Finger travel (px, downward positive) to how far the content follows: most of the travel at
 * first, then easing off so it never passes PULL.max. Upward or no travel follows not at all.
 */
export function pullDistance(dy: number): number {
  if (!(dy > 0)) return 0;
  const k = 0.7;
  return PULL.max * (1 - 1 / ((dy * k) / PULL.max + 1));
}

/** Whether a pull this far (as returned by pullDistance) refreshes on release. */
export const pullArmed = (distance: number) => distance >= PULL.threshold;

/**
 * Read the first moves of a touch: "pull" when it is mostly downward, "other" when it is upward or
 * mostly sideways, null while it is still inside the slop.
 */
export function readPull(dx: number, dy: number, slop: number = PULL.slop): "pull" | "other" | null {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return null;
  return dy > 0 && dy > Math.abs(dx) ? "pull" : "other";
}

/** "Updated just now", "Updated 12s ago", "Updated 3 min ago", "Updated 2 hr ago". */
export function updatedAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 5) return "Updated just now";
  if (s < 60) return `Updated ${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `Updated ${m} min ago`;
  return `Updated ${Math.floor(m / 60)} hr ago`;
}
