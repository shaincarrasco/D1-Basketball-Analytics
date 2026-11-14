// Player pools: which rows count, built from the pack's filter definitions.
import type { FilterDef, Lists, Option, Pool, SportPack } from "./types";

export const filterOptions = <R>(f: FilterDef<R>, lists: Lists): Option[] => (typeof f.options === "function" ? f.options(lists) : f.options);

export const defaultPool = <R>(pack: SportPack<R>): Pool => Object.fromEntries(pack.filters.map(f => [f.key, f.default]));

/** Fill missing keys with defaults and drop unknown ones. */
export const withDefaults = <R>(pack: SportPack<R>, over?: Pool): Pool => {
  const p = defaultPool(pack);
  if (over) for (const f of pack.filters) if (typeof over[f.key] === "string") p[f.key] = over[f.key];
  return p;
};

export const inPool = <R>(pack: SportPack<R>, pool: Pool, r: R) => {
  for (const f of pack.filters) if (!f.test(r, pool[f.key] ?? f.default)) return false;
  return true;
};

/** Write the non-default filter values into URL params. */
export function writePool<R>(pack: SportPack<R>, pool: Pool, p: URLSearchParams) {
  for (const f of pack.filters) { const v = pool[f.key]; if (v !== undefined && v !== f.default) p.set(f.key, v); }
}

/**
 * Read filter values from URL params. Static options are validated; data-driven options
 * (conferences, leagues) can't be checked before data loads, so they're length-capped
 * and an unknown value simply matches nobody.
 */
export function readPool<R>(pack: SportPack<R>, p: URLSearchParams, base?: Pool): Pool {
  const pool = withDefaults(pack, base);
  for (const f of pack.filters) {
    const v = p.get(f.key);
    if (v === null) continue;
    if (Array.isArray(f.options)) { if (f.options.some(o => o.value === v)) pool[f.key] = v; }
    else if (v.length <= 40) pool[f.key] = v;
  }
  return pool;
}

/** "Big Ten guards, 15+ mpg, 2+ games" */
export function poolText<R>(pack: SportPack<R>, pool: Pool, lists: Lists) {
  let noun = pack.nouns.pool;
  const suffixes: string[] = [];
  for (const f of pack.filters) {
    const d = f.describe?.(pool[f.key] ?? f.default, lists);
    if (!d) continue;
    if (d.noun) noun = d.noun;
    if (d.suffix) suffixes.push(d.suffix);
  }
  const pos = pack.positions.find(p => p.key === pool.pos);
  if (pos) noun = noun.includes(pack.nouns.players) ? noun.replace(pack.nouns.players, pos.plural.toLowerCase()) : `${noun} (${pos.plural.toLowerCase()})`;
  return [noun, ...suffixes].join(", ");
}

/**
 * Standard position filter. Every pack with positions should include it under the key "pos":
 * the engine uses pool.pos to decide whether swarms split into position bands.
 */
export function positionFilter<R>(pack: Pick<SportPack<R>, "positions" | "entity">, label = "Position"): FilterDef<R> {
  return {
    key: "pos", label, default: "all", compact: true,
    options: [{ value: "all", label: "All positions" }, ...pack.positions.map(p => ({ value: p.key, label: p.plural }))],
    test: (r, v) => v === "all" || pack.entity.pos(r) === v,
  };
}

/**
 * Standard "at least N of something" filter (minutes per game, matches, snaps).
 * The first step is the "anyone" option: it gets `anyLabel` and adds nothing to subtitles.
 */
export function floorFilter<R>(o: { key: string; label: string; get: (r: R) => number | null; steps: number[]; default: number; fmt: (n: number) => string; anyLabel: string; suffix?: (n: number) => string; compact?: boolean }): FilterDef<R> {
  const any = o.steps[0];
  return {
    key: o.key, label: o.label, default: String(o.default), compact: o.compact,
    options: o.steps.map(n => ({ value: String(n), label: n === any ? o.anyLabel : o.fmt(n) })),
    test: (r, v) => (o.get(r) ?? 0) >= Number(v),
    describe: v => (Number(v) !== any && o.suffix ? { suffix: o.suffix(Number(v)) } : null),
  };
}
