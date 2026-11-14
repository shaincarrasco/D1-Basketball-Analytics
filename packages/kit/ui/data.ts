"use client";
// Generic data hook: loads a site's players.json ({ rows: R[] }) and derives the group
// list (conferences, leagues, tours) from the rows using the pack's team accessor.
// Sites with richer data (basketball joins teams.json) write their own hook instead.
import { useMemo } from "react";
import { useJson } from "@sports/ui/client-data";
import type { Lists, SportData, SportPack } from "../index";

export function useSportData<R>(pack: SportPack<R>, file = "players.json"): SportData<R> {
  const q = useJson<{ rows: R[] }>(file);
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const lists = useMemo<Lists>(() => {
    if (!pack.groups) return {};
    const m = new Map<string, string>();
    for (const r of rows) { const t = pack.entity.team(r); if (t?.group) m.set(t.group, t.groupName ?? t.group); }
    return { [pack.groups.list]: [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])) };
  }, [pack, rows]);
  return { rows, lists, ready: !!q.data, error: q.error ?? null, retry: q.retry };
}
