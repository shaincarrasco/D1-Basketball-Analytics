// Lineup lab: data loader and helpers for /lineups/. The model itself lives in
// src/app/lineups/model.mjs (plain JS so the build script can check it against observed units).
import { useMemo } from "react";
import { useJson } from "@/lib/client-data";
import { projectLineup, type LabPlayer, type LineupProjection } from "@/app/lineups/model.mjs";

export * from "@/app/lineups/model.mjs";
export type { FitAdjustment, LabPlayer, LabWarning, LineupProjection, LineupTraits } from "@/app/lineups/model.mjs";

export type CalibrationCheck = {
  units: number; poss: number;
  rmse: { zero: number; base: number; full: number };
  rmseLevel: { base: number; full: number };
  corrBase: number | null; meanResidual: number; avgFit: number; noiseSd: number;
  fitScale: { s: number; se: number; share: number } | null;
  byAdjustment: Record<string, { s: number; se: number; share: number } | null>;
};
export type LabFile = {
  meta: { built: string; season: string; eff: number; minMpg: number; players: number; calibration: { all: CalibrationCheck | null; big: CalibrationCheck | null; note: string } };
  fields: (keyof LabPlayer)[];
  teams: Record<string, [name: string, short: string, color: string | null, logo: string | null]>;
  rows: (string | number | null)[][];
};
export type LabTeam = { slug: string; name: string; short: string; color: string | null; logo: string | null };
export type LabData = { meta: LabFile["meta"]; players: LabPlayer[]; byId: Map<string, LabPlayer>; teams: Map<string, LabTeam> };

export function useLab() {
  const f = useJson<LabFile>("lineup-lab.json");
  const data = useMemo<LabData | null>(() => {
    if (!f.data) return null;
    const { fields, rows, teams, meta } = f.data;
    const players = rows.map(r => Object.fromEntries(fields.map((k, i) => [k, r[i]])) as unknown as LabPlayer);
    return {
      meta, players, byId: new Map(players.map(p => [p.id, p])),
      teams: new Map(Object.entries(teams).map(([slug, [name, short, color, logo]]) => [slug, { slug, name, short, color, logo }])),
    };
  }, [f.data]);
  return { ...f, data };
}

/** Player ids from ?p=a,b,c (unknown and duplicate ids dropped, max five). */
export function parsePicks(raw: string | null, byId: Map<string, LabPlayer>) {
  const out: string[] = [];
  for (const id of (raw ?? "").split(",").map(s => s.trim())) if (id && byId.has(id) && !out.includes(id) && out.length < 5) out.push(id);
  return out;
}

export type RankedLineup = { key: string; ids: string[]; players: LabPlayer[]; proj: LineupProjection };

/** Every five-man combination from a rotation (n ≤ 11 keeps it to 462), best projected net first. */
export function bestLineups(rotation: LabPlayer[], eff: number): RankedLineup[] {
  const out: RankedLineup[] = [];
  const n = rotation.length, pick: number[] = [];
  const walk = (start: number) => {
    if (pick.length === 5) {
      const players = pick.map(i => rotation[i]);
      const ids = players.map(p => p.id).sort();
      out.push({ key: ids.join("-"), ids, players, proj: projectLineup(players, eff) });
      return;
    }
    for (let i = start; i <= n - (5 - pick.length); i++) { pick.push(i); walk(i + 1); pick.pop(); }
  };
  if (n >= 5) walk(0);
  return out.sort((a, b) => b.proj.net - a.proj.net);
}

/** A team's rotation for team mode: lab players on the team, most minutes first, up to `max`. */
export const rotationOf = (players: LabPlayer[], slug: string, max = 10) =>
  players.filter(p => p.t === slug).sort((a, b) => b.mpg - a.mpg).slice(0, max);

export const lastName = (name: string) => name.split(/\s+/).slice(1).join(" ") || name;
export const shortName = (name: string) => {
  const parts = name.split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name;
};
