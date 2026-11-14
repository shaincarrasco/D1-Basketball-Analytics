"use client";
// Basketball data adapter: every D-I player joined to his team, with derived rates,
// in the SportData shape the sport kit's pages expect.
import { useMemo } from "react";
import { useJson } from "@sports/ui/client-data";
import { playerRows } from "@/lib/players";
import type { PlayerTable, TeamSummary } from "@/lib/types";
import { derive, type PlayerRow } from "@/app/players/player-stats";
import type { SportData } from "@sports/kit";

export function useBasketball(): SportData<PlayerRow> {
  const players = useJson<PlayerTable>("players.json");
  const teams = useJson<TeamSummary[]>("teams.json");
  const rows = useMemo<PlayerRow[]>(() => {
    if (!players.data || !teams.data) return [];
    const byId = new Map(teams.data.map(t => [t.id, t]));
    return playerRows(players.data, players.data.rows).map(p => derive(p, byId.get(p.teamId) ?? null));
  }, [players.data, teams.data]);
  const lists = useMemo(() => ({
    conf: [...new Map((teams.data ?? []).map(t => [t.confSlug, t.confName])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
  }), [teams.data]);
  return {
    rows, lists, ready: !!players.data && !!teams.data, error: players.error ?? teams.error ?? null,
    retry: () => { players.retry(); teams.retry(); },
  };
}
