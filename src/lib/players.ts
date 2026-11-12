import type { Player, PlayerTable } from "./types";

export function playerRows(table: Pick<PlayerTable, "fields">, rows: PlayerTable["rows"]): Player[] {
  return rows.map(row => {
    const p: Record<string, unknown> = {};
    table.fields.forEach((f, i) => { p[f] = row[i]; });
    return p as Player;
  });
}

/** Percentile (0–1) of `value` within `pool`; `invert` when lower is better. */
export function percentile(value: number | null, pool: number[], invert = false) {
  if (value === null || !pool.length) return null;
  let below = 0;
  for (const v of pool) if (invert ? v > value : v < value) below++;
  return below / pool.length;
}

export const pct = (m: number | null, a: number | null) => (m !== null && a ? (m / a) * 100 : null);
