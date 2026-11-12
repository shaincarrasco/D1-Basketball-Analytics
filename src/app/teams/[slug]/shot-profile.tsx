"use client";
// Offense vs defense shot charts with a zones/dots toggle. The charts render after hydration
// (zone shading is ~1,800 SVG cells per chart, too heavy to ship in the static HTML).
import { useState, useSyncExternalStore } from "react";
import ShotChart from "@/components/shot-chart";
import type { Shot, ZoneStats } from "@/lib/shots";

const noop = () => () => {};
const ASPECT = { aspectRatio: "51 / 37.25" };

export default function ShotProfile({ off, def, league }: { off: Shot[]; def: Shot[]; league: ZoneStats | null }) {
  const [mode, setMode] = useState<"zones" | "dots">(league ? "zones" : "dots");
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!off.length && !def.length) return <p className="text-sm text-mute">No shot locations have been tracked for this team yet.</p>;
  const panel = (shots: Shot[], side: "off" | "def") => (
    <div className="min-w-0">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <i className={`h-2.5 w-2.5 rounded-sm ${side === "off" ? "bg-off" : "bg-def"}`} aria-hidden />
        {side === "off" ? "Offense: our shots" : "Defense: opponents' shots"}
      </h3>
      {mounted
        ? <ShotChart shots={shots} mode={mode} league={league} title={`${side === "off" ? "Offense" : "Opponent"} shot chart, ${mode}`} />
        : <div className="w-full rounded-lg bg-deck2" style={ASPECT} aria-hidden />}
    </div>
  );
  return (
    <div>
      {league && (
        <div className="mb-3 flex gap-1.5" role="group" aria-label="Shot chart view">
          <button type="button" className="chip" aria-pressed={mode === "zones"} onClick={() => setMode("zones")} title="FG% by zone, shaded against the D-I average">Zones</button>
          <button type="button" className="chip" aria-pressed={mode === "dots"} onClick={() => setMode("dots")} title="Every tracked attempt">Every shot</button>
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        {panel(off, "off")}
        {panel(def, "def")}
      </div>
    </div>
  );
}
