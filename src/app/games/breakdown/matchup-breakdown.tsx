"use client";
// /matchup/: keys to the game and the projection build-up for any two teams. The build uses the same
// team table and arithmetic as lib/predict project(), so its bottom lines are the numbers this page shows.
import { summaryBuild } from "@/lib/breakdown";
import { OUT_STATES } from "@/lib/injuries";
import type { InjuryFile, Meta, TeamSummary } from "@/lib/types";
import BuildTable, { Disclosure } from "./build-table";
import Keys from "./keys";

export default function MatchupBreakdown({ meta, a, b, site, injuries, aColor, bColor }: {
  meta: Meta; a: TeamSummary; b: TeamSummary; site: "a" | "n" | "b"; injuries: InjuryFile | null; aColor: string; bColor: string;
}) {
  const { leagueAverage: mu, leagueTempo: muT, estimatedHomeEdge: h } = meta.model;
  const build = summaryBuild(mu, muT, h, a, b, site === "a" ? 1 : site === "b" ? -1 : 0);
  const out = (slug: string) => (injuries?.rows ?? []).filter(r => r.slug === slug && OUT_STATES.has(r.state) && (r.impact.netLoss ?? 0) >= 0.05)
    .sort((x, y) => (y.impact.netLoss ?? 0) - (x.impact.netLoss ?? 0)).map(r => `${r.name} (−${(r.impact.netLoss ?? 0).toFixed(1)})`);
  const loss = (slug: string) => injuries?.teams.find(t => t.slug === slug)?.netLoss ?? 0;
  return (
    <section aria-labelledby="mbk-h" className="space-y-3" data-testid="matchup-breakdown">
      <div>
        <h2 id="mbk-h" className="h-section mb-2">Keys to the game</h2>
        <Keys a={a} b={b} aColor={aColor} bColor={bColor} />
      </div>
      {build && (
        <Disclosure title="How this projection is built" sub="Line by line from an average D-I game to the margin above" testId="build-toggle">
          <BuildTable
            b={build}
            A={{ name: a.name, short: a.short, color: aColor }}
            B={{ name: b.name, short: b.short, color: bColor }}
            sign={1}
            injury={injuries ? { aLoss: loss(a.slug), bLoss: loss(b.slug), aOut: out(a.slug), bOut: out(b.slug) } : null}
            verified={null}
            asOf={<>Built from each team&apos;s current DHR rating, the same numbers as the projection above.</>}
          />
        </Disclosure>
      )}
    </section>
  );
}
