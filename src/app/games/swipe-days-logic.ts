// Pure pieces of swiping the phone scoreboard between days (swipe-days.tsx). Free of the DOM for tests.

export const SWIPE = {
  /** Finger travel before the gesture is read as sideways or as a scroll. */
  slop: 10,
  /** Sideways travel needed to change day on release. */
  commit: 60,
  /** Sideways travel has to beat vertical travel by this factor, both to start and to commit. */
  dominance: 1.5,
  /** Touches starting this close to a screen edge belong to the browser's back/forward swipe. */
  edge: 20,
} as const;

/**
 * Read the first moves of a touch: "x" when sideways movement clearly dominates, "y" otherwise
 * (a scroll, never hijacked), null while still inside the slop.
 */
export function lockAxis(dx: number, dy: number): "x" | "y" | null {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < SWIPE.slop && ay < SWIPE.slop) return null;
  return ax > SWIPE.dominance * ay ? "x" : "y";
}

/** On release: "next" for a clear swipe left, "prev" for a clear swipe right, else null. */
export function swipeDirection(dx: number, dy: number): "prev" | "next" | null {
  const ax = Math.abs(dx);
  if (ax <= SWIPE.commit || ax <= SWIPE.dominance * Math.abs(dy)) return null;
  return dx < 0 ? "next" : "prev";
}

/** How far the list follows the finger: closely when there is a day that way, barely when there isn't. */
export function dragOffset(dx: number, canMove: boolean): number {
  if (canMove) return dx * 0.85;
  const s = Math.sign(dx), a = Math.abs(dx);
  return s * 40 * (1 - 1 / (a / 160 + 1));
}

/** The listed days before and after `day`, the same ones the date strip's arrows step to. */
export function neighbourDays(days: readonly { day: string }[], day: string): { prev: string | null; next: string | null } {
  const pos = days.findIndex(d => d.day === day);
  const prev = pos >= 0 ? days[pos - 1] : [...days].reverse().find(d => d.day < day);
  const next = pos >= 0 ? days[pos + 1] : days.find(d => d.day > day);
  return { prev: prev?.day ?? null, next: next?.day ?? null };
}

/** Touches near the screen edges are left to the browser's own back and forward swipes. */
export const nearEdge = (x: number, width: number) => x < SWIPE.edge || x > width - SWIPE.edge;
