// How many of the phone filter sheet's choices differ from their defaults (the "Filters" button's
// count). Projections is a display preference, not a filter, so it never counts.
export function activeFilterCount({ conf, sort, liveView }: { conf: string; sort: string; liveView: boolean }): number {
  // The Live view always sorts most exciting first, so the sort choice doesn't apply there.
  return (conf !== "all" ? 1 : 0) + (!liveView && sort !== "time" ? 1 : 0);
}
