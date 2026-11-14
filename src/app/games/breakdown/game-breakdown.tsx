"use client";
// Matchup breakdown in the game sheet: keys to the game (unplayed games), how the projection is
// built (collapsed; opening it is asking for projections, so projected points show inside), and the
// tale of the tape (collapsed).
import { useEffect, useMemo, useState } from "react";
import { gameBuild, modelBefore, reproduces, type DhrInput } from "@/lib/breakdown";
import { loadJson, useJson } from "@sports/ui/client-data";
import { dayLabel } from "@sports/ui/format";
import { OUT_STATES } from "@/lib/injuries";
import { useInjuries } from "@/lib/injury-hooks";
import type { Game, GameDay, InjuryFile, TeamSummary } from "@/lib/types";
import BuildTable, { Disclosure, type InjuryWhatIf } from "./build-table";
import Keys from "./keys";
import Tape from "./tape";

const A_COLOR = "var(--def)", B_COLOR = "var(--off)"; // away, home (the sheet's colours)
const etDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
const isFinal = (g: Game) => g.status === "final";

export default function GameBreakdown({ g }: { g: Game }) {
  const teams = useJson<TeamSummary[]>("teams.json");
  const bySlug = useMemo(() => new Map((teams.data ?? []).map(t => [t.slug, t])), [teams.data]);
  const a = g.away.slug ? bySlug.get(g.away.slug) ?? null : null;
  const b = g.home.slug ? bySlug.get(g.home.slug) ?? null : null;
  const final = isFinal(g);
  if (!g.pred && !(a && b)) return null;
  return (
    <section className="mt-7" aria-labelledby={`mb-${g.id}`} data-testid="matchup-breakdown">
      <h3 id={`mb-${g.id}`} className="h-section mb-2 !text-xl">Matchup breakdown</h3>
      {!final && a && b && (
        <div className="mb-3">
          <h4 className="mb-1.5 text-[13px] font-semibold text-mute">Keys to the game</h4>
          <Keys a={a} b={b} aColor={A_COLOR} bColor={B_COLOR} compact />
        </div>
      )}
      <div className="space-y-2">
        {g.pred && (
          <Disclosure title="How this projection is built" sub="Line by line from an average D-I game to the final margin · includes projected points" testId="build-toggle">
            <GameBuild g={g} />
          </Disclosure>
        )}
        {a && b && (
          <Disclosure title="Tale of the tape" sub="National ranks side by side, each offense against the other defense" testId="tape-toggle">
            <Tape a={a} b={b} aColor={A_COLOR} bColor={B_COLOR} total={teams.data?.length ?? 365} />
          </Disclosure>
        )}
      </div>
    </section>
  );
}

type Loaded = { input: DhrInput; day: GameDay } | { error: string };

function GameBuild({ g }: { g: Game }) {
  const day = etDay(g.date);
  const [data, setData] = useState<Loaded | null>(null);
  const injuries = useInjuries();
  useEffect(() => {
    let live = true;
    Promise.all([loadJson<DhrInput>("dhr-input.json"), loadJson<GameDay>(`games/${day}.json`)])
      .then(([input, d]) => live && setData({ input, day: d }))
      .catch(e => live && setData({ error: e instanceof Error ? e.message : "Could not load the ratings." }));
    return () => { live = false; };
  }, [day]);

  const built = useMemo(() => {
    if (!data || "error" in data) return null;
    const ids = new Set(data.day.games.map(x => x.id));
    ids.add(g.id);
    const model = modelBefore(data.input, ids);
    const b = gameBuild(model, data.input, g);
    return { b, ok: reproduces(b, g) };
  }, [data, g]);

  if (!data) return <p className="text-sm text-mute">Loading the ratings behind this projection…</p>;
  if ("error" in data || !built) return <p className="text-sm text-mute">The ratings behind this projection didn&apos;t load. {"error" in data ? data.error : ""}</p>;

  const injury = isFinal(g) ? null : whatIf(injuries.data, g);
  return (
    <BuildTable
      b={built.b}
      A={{ name: g.away.name, short: g.away.short ?? g.away.name, color: A_COLOR, pooled: !g.away.id }}
      B={{ name: g.home.name, short: g.home.short ?? g.home.name, color: B_COLOR, pooled: !g.home.id }}
      sign={-1}
      injury={injury}
      verified={built.ok}
      asOf={<>{isFinal(g) ? "The pregame projection" : "This projection"} uses ratings from every game completed before {dayLabel(day, { weekday: "long", month: "short", day: "numeric" })}.</>}
    />
  );
}

/** Current absences (the same estimate as the matchup tool). Finals get none: we don't store who was out at the time. */
function whatIf(file: InjuryFile | null, g: Game): InjuryWhatIf | null {
  if (!file) return null;
  const loss = (slug: string | null) => (slug ? file.teams.find(t => t.slug === slug)?.netLoss ?? 0 : 0);
  const out = (slug: string | null) => (slug ? file.rows.filter(r => r.slug === slug && OUT_STATES.has(r.state) && (r.impact.netLoss ?? 0) >= 0.05)
    .sort((x, y) => (y.impact.netLoss ?? 0) - (x.impact.netLoss ?? 0)).map(r => `${r.name} (−${(r.impact.netLoss ?? 0).toFixed(1)})`) : []);
  return { aLoss: loss(g.away.slug), bLoss: loss(g.home.slug), aOut: out(g.away.slug), bOut: out(g.home.slug) };
}
