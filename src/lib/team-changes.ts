// "What changed since the last game": DHR rank and rating now vs the latest snapshot before a team's last game.
// Build-time only (reads public/data/rating-history-2027.json). Mirrors server-data.ts path handling, but this file
// lives under public/data, not public/data/app.
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

type RatingHistory = {
  v: number; season: number;
  /** Team ids, in the column order of `em`. */
  teams: string[];
  /** Snapshot dates (YYYY-MM-DD). The first entry is null (preseason). */
  through: (string | null)[];
  /** em[snapshotIndex][teamIndex]: adjusted efficiency margin (DHR) after that day's results. */
  em: (number | null)[][];
};

export type TeamChanges = {
  rankNow: number | null;
  rankBefore: number | null;
  emNow: number | null;
  emBefore: number | null;
  /** Date of the "before" snapshot. */
  since: string | null;
};

const FILE = path.join(process.cwd(), "public", "data", "rating-history-2027.json");
let cache: RatingHistory | null = null;
const history = (): RatingHistory => (cache ??= JSON.parse(readFileSync(FILE, "utf8")) as RatingHistory);

/** 1 + number of teams with a higher em on that snapshot. Nulls are ignored. */
function rankAt(h: RatingHistory, snap: number, col: number): number | null {
  const row = h.em[snap];
  const v = row?.[col];
  if (typeof v !== "number") return null;
  let higher = 0;
  for (const x of row) if (typeof x === "number" && x > v) higher++;
  return 1 + higher;
}

/**
 * `lastGameDay` is the team's most recent game day (YYYY-MM-DD). "Before" is the latest snapshot dated strictly
 * before it; "now" is the latest snapshot. Returns null when the team is missing or there is no earlier snapshot.
 */
export function teamChanges(teamId: string, lastGameDay: string | null): TeamChanges | null {
  if (!lastGameDay) return null;
  const h = history();
  const col = h.teams.indexOf(teamId);
  if (col < 0 || h.em.length === 0) return null;

  const nowIdx = h.em.length - 1;
  let beforeIdx = -1;
  for (let i = nowIdx; i >= 0; i--) {
    const d = h.through[i];
    if (d && d < lastGameDay) { beforeIdx = i; break; }
  }
  if (beforeIdx < 0) return null;

  const emNow = h.em[nowIdx]?.[col] ?? null;
  const emBefore = h.em[beforeIdx]?.[col] ?? null;
  return {
    rankNow: rankAt(h, nowIdx, col),
    rankBefore: rankAt(h, beforeIdx, col),
    emNow: typeof emNow === "number" ? emNow : null,
    emBefore: typeof emBefore === "number" ? emBefore : null,
    since: h.through[beforeIdx] ?? null,
  };
}
