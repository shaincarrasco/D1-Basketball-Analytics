// Pure helpers for the app shell's phone niceties: remembering scroll positions per URL,
// deciding when a remembered position can be restored after Back, tapping the active tab,
// and the swipe-down threshold for the pinned live bar. No DOM access here, so it tests in node.

export const SCROLL_STORE = "d1h-scroll";
export const MAX_REMEMBERED = 60;
export const RESTORE_TIMEOUT_MS = 2000;

/** Paths compare without a trailing slash ("/games/" and "/games" are the same page). */
export const normPath = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") || "/" : p || "/");

/** The key a scroll position is stored under: pathname + search, normalised. */
export function scrollKey(pathname: string, search: string): string {
  const s = search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : "";
  return normPath(pathname) + s;
}

export type Positions = Record<string, number>;

/** Parse the stored map, tolerating junk. */
export function parsePositions(raw: string | null): Positions {
  try {
    const v = JSON.parse(raw ?? "null");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Positions = {};
    for (const [k, y] of Object.entries(v)) if (typeof y === "number" && Number.isFinite(y) && y >= 0) out[k] = y;
    return out;
  } catch {
    return {};
  }
}

/** Store y under key, newest last, dropping the oldest entries past `max`. */
export function remember(map: Positions, key: string, y: number, max = MAX_REMEMBERED): Positions {
  const next: Positions = {};
  for (const [k, v] of Object.entries(map)) if (k !== key) next[k] = v;
  next[key] = Math.max(0, Math.round(y));
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) delete next[k];
  return next;
}

export type RestoreInput = {
  /** The remembered scrollY for the URL we came back to. */
  target: number;
  /** document.documentElement.scrollHeight and window.innerHeight right now. */
  docHeight: number;
  viewport: number;
  /** window.scrollY right now. */
  current: number;
  /** ms since the Back navigation. */
  elapsed: number;
  timeout?: number;
};
export type RestoreStep = "done" | "scroll" | "wait" | "give-up";

/**
 * One step of restoring a remembered position after Back. "done" when we're already there
 * (the browser or Next restored it), "scroll" once the page is tall enough to reach the target
 * (or nearly: the last screen may legitimately be shorter), "wait" while client data is still
 * loading, "give-up" after the timeout.
 */
export function restoreStep({ target, docHeight, viewport, current, elapsed, timeout = RESTORE_TIMEOUT_MS }: RestoreInput): RestoreStep {
  if (target <= 0) return "done";
  if (Math.abs(current - target) <= 2) return "done";
  const reachable = Math.max(0, docHeight - viewport);
  if (reachable >= target - 2) return "scroll";
  if (elapsed >= timeout) return reachable > current + 2 ? "scroll" : "give-up";
  return "wait";
}

/**
 * Whether a tap on a tab is a tap on the page you're already on (so it should scroll to the
 * top instead of navigating). Same pathname and no query string: tapping "Games" on a dated
 * scoreboard still navigates back to the hub's root, like a native tab popping to root.
 */
export function isSameTab(pathname: string, search: string, href: string): boolean {
  const [hrefPath, hrefSearch = ""] = href.split("?");
  return normPath(pathname) === normPath(hrefPath) && scrollKey("/", search) === scrollKey("/", hrefSearch);
}

/** What tapping the active tab does: nothing when already at the top. */
export const tabTopAction = (scrollY: number): "scroll" | "none" => (scrollY > 1 ? "scroll" : "none");

/** Swipe-down dismissal for a small bar: far enough, or a quick flick downward. */
export function swipeDismiss(dy: number, ms: number, distance = 36): boolean {
  if (dy <= 0) return false;
  if (dy >= distance) return true;
  const velocity = dy / Math.max(1, ms); // px per ms
  return dy >= 12 && velocity > 0.6;
}
