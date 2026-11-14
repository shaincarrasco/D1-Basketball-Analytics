// Lineup lab: data loader and helpers for /lineups/. The model itself lives in
// src/app/lineups/model.mjs (plain JS so the build script can check it against observed units).
import { useMemo } from "react";
import { useJson } from "@/lib/client-data";
import { projectLineup, type LabPlayer, type LineupProjection } from "@/app/lineups/model.mjs";

export * from "@/app/lineups/model.mjs";
export type { FitAdjustment, LabPlayer, LabWarning, LineupProjection, LineupTraits, Verdict } from "@/app/lineups/model.mjs";

export type CalibrationCheck = {
  units: number; poss: number;
  rmse: { zero: number; base: number; full: number };
  rmseLevel: { base: number; full: number };
  corrBase: number | null; meanResidual: number; avgFit: number; noiseSd: number;
  fitScale: { s: number; se: number; share: number } | null;
  byAdjustment: Record<string, { s: number; se: number; share: number } | null>;
  /** Observed net regressed on the DPR sum (in-sample, not opponent-adjusted). */
  slopeBase?: number | null;
};
/** Reality check: team AdjEM = intercept + k × minutes-weighted DPR sum, over every D-I team. */
export type LabScale = { k: number; se: number; r: number; intercept: number; rmse: number; teams: number };
/** Every team's projected starting five (top five by minutes), ascending, plus the best three. */
export type LabReference = { starters: number[]; best: { t: string; net: number }[] };
export type LabFile = {
  meta: {
    built: string; season: string; eff: number; minMpg: number; players: number;
    calibration: { all: CalibrationCheck | null; big: CalibrationCheck | null; note: string };
    scale: LabScale | null; reference: LabReference;
  };
  fields: (keyof LabPlayer)[];
  teams: Record<string, [name: string, short: string, color: string | null, logo: string | null, rank?: number | null]>;
  rows: (string | number | null)[][];
};
export type LabTeam = { slug: string; name: string; short: string; color: string | null; logo: string | null; rank: number | null };
/** k = the reality-check multiplier every projection on the page uses. */
export type LabData = { meta: LabFile["meta"]; players: LabPlayer[]; byId: Map<string, LabPlayer>; teams: Map<string, LabTeam>; k: number };

export function useLab() {
  const f = useJson<LabFile>("lineup-lab.json");
  const data = useMemo<LabData | null>(() => {
    if (!f.data) return null;
    const { fields, rows, teams, meta } = f.data;
    const players = rows.map(r => Object.fromEntries(fields.map((k, i) => [k, r[i]])) as unknown as LabPlayer);
    return {
      meta, players, byId: new Map(players.map(p => [p.id, p])), k: meta.scale?.k ?? 1,
      teams: new Map(Object.entries(teams).map(([slug, [name, short, color, logo, rank]]) => [slug, { slug, name, short, color, logo, rank: rank ?? null }])),
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
export function bestLineups(rotation: LabPlayer[], eff: number, scale = 1): RankedLineup[] {
  const out: RankedLineup[] = [];
  const n = rotation.length, pick: number[] = [];
  const walk = (start: number) => {
    if (pick.length === 5) {
      const players = pick.map(i => rotation[i]);
      const ids = players.map(p => p.id).sort();
      out.push({ key: ids.join("-"), ids, players, proj: projectLineup(players, eff, scale) });
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

/** Rating total (DPR offense + defense). */
export const dpr = (p: LabPlayer) => p.o + p.d;
const RELIABLE = 150; // play-by-play possessions before a player's DPR counts for the presets

/** One-tap starting points. Each returns player ids (empty when the data can't fill it). */
export function presets(data: LabData) {
  const top = (ps: LabPlayer[], n: number) => [...ps].sort((a, b) => dpr(b) - dpr(a)).slice(0, n);
  const reliable = data.players.filter(p => p.op >= RELIABLE);
  const ranked = [...data.teams.values()].filter(t => t.rank != null).sort((a, b) => a.rank! - b.rank!);
  const first = ranked.find(t => rotationOf(data.players, t.slug, 5).length === 5);
  const by = (pos: string) => reliable.filter(p => p.pos === pos);
  const best = [...top(by("G"), 2), ...top(by("F"), 2), ...top(by("C"), 1)];
  const out: { key: string; label: string; hint: string; ids: string[] }[] = [];
  if (first) out.push({ key: "top-team", label: `${first.name}'s top five`, hint: `The five who play the most for ${first.name}, our top-rated team`, ids: rotationOf(data.players, first.slug, 5).map(p => p.id) });
  if (best.length === 5) out.push({ key: "best", label: "Best five in the country", hint: `Top-rated two guards, two forwards and a center (${RELIABLE}+ possessions)`, ids: best.map(p => p.id) });
  const cs = top(by("C"), 5);
  if (cs.length === 5) out.push({ key: "centers", label: "Five centers", hint: "The five top-rated centers: see what the fit check says", ids: cs.map(p => p.id) });
  return out;
}

export const lastName = (name: string) => name.split(/\s+/).slice(1).join(" ") || name;
export const shortName = (name: string) => {
  const parts = name.split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name;
};
