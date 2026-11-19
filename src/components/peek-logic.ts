// Pure pieces of the long-press peek: gesture thresholds and the card's text.
import type { TeamSummary } from "@/lib/types";

/** Hold this long (ms) on a touch screen to peek. */
export const LONG_PRESS_MS = 450;
/** Moving the finger further than this (px) turns the press into a scroll or swipe. */
export const MOVE_CANCEL_PX = 10;
/** Taps on the card this soon (ms) after the finger lifts belong to the press, not the card. */
export const RELEASE_GUARD_MS = 350;

/** True once a press has moved far enough to stop being a long press. */
export const movedTooFar = (dx: number, dy: number, limit = MOVE_CANCEL_PX) => dx * dx + dy * dy > limit * limit;

/** Pointer types that can long-press (mouse users have right-click and hover; they never peek). */
export const canPeek = (pointerType: string) => pointerType === "touch" || pointerType === "pen";

export type PeekTeam = {
  kind: "team"; slug: string; name: string; logo: string | null; rank: number | null;
  w: number; l: number; confName: string; next: TeamSummary["next"];
};
export type PeekPlayer = {
  kind: "player"; id: string; name: string; pos: string | null;
  team: { name: string; slug: string; logo: string | null } | null;
  stats: { label: string; value: string }[];
};
export type PeekItem = PeekTeam | PeekPlayer;

export const teamPeek = (t: TeamSummary): PeekTeam => ({
  kind: "team", slug: t.slug, name: t.name, logo: t.logo, rank: t.rank, w: t.w, l: t.l, confName: t.confName, next: t.next,
});

/** Next game in one line, e.g. "Sat, Nov 22 at Duke (No. 4)". Dates are Eastern, like the rest of the site. */
export function nextGameText(next: TeamSummary["next"]): string | null {
  if (!next) return null;
  const d = new Date(next.date);
  const day = Number.isNaN(d.getTime()) ? "" : `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" })} `;
  const rank = next.oppRank ? ` (No. ${next.oppRank})` : "";
  return `${day}${next.venue === "A" ? "at" : "vs"} ${next.opp}${rank}${next.venue === "N" ? ", neutral" : ""}`;
}

const one = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(1));

/** Three headline numbers for a player card: points, rebounds and assists per game. */
export const headlineStats = (p: { pts: number | null; reb: number | null; ast: number | null }) => [
  { label: "PPG", value: one(p.pts) },
  { label: "RPG", value: one(p.reb) },
  { label: "APG", value: one(p.ast) },
];

export const peekHref = (item: PeekItem) => (item.kind === "team" ? `/teams/${item.slug}/` : `/player/?id=${item.id}`);
export const peekFavKey = (item: PeekItem) => (item.kind === "team" ? { kind: "teams" as const, id: item.slug } : { kind: "players" as const, id: item.id });
