"use client";
// Sport lab: every sport pack running through the same gallery, rankings and builder on
// fictional sample rows. Proves a pack works end to end before it has a data feed.
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Lists, SportData } from "@/sport-kit";
import Builder from "@/sport-kit/ui/builder";
import Gallery from "@/sport-kit/ui/gallery";
import RankingsBoard from "@/sport-kit/ui/rankings-board";
import { SPORTS, type SportEntry } from "@/sports/registry";

const VIEWS = [["charts", "Charts"], ["rankings", "Rankings"], ["build", "Make a chart"]] as const;
type View = (typeof VIEWS)[number][0];

function useFixtureData(entry: SportEntry): SportData<unknown> {
  return useMemo(() => {
    const rows = entry.fixtures(), { pack } = entry;
    const lists: Lists = {};
    if (pack.groups) {
      const m = new Map<string, string>();
      for (const r of rows) { const t = pack.entity.team(r); if (t?.group) m.set(t.group, t.groupName ?? t.group); }
      lists[pack.groups.list] = [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }
    return { rows, lists, ready: true, error: null, retry: () => {} };
  }, [entry]);
}

export default function Lab() {
  // Read from the router so "Remix" and "Chart the top three" links (same page, new query) switch views.
  const sp = useSearchParams(), router = useRouter();
  const sportParam = sp.get("sport"), viewParam = sp.get("view");
  const state = {
    sport: SPORTS.some(s => s.pack.id === sportParam) ? sportParam! : SPORTS[0].pack.id,
    view: (VIEWS.some(([k]) => k === viewParam) ? viewParam : "charts") as View,
  };
  const go = (sport: string, view: View) => router.replace(`?sport=${sport}&view=${view}`, { scroll: false });
  const entry = SPORTS.find(s => s.pack.id === state.sport)!;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Sport">
          {SPORTS.map(s => <button key={s.pack.id} aria-pressed={s.pack.id === state.sport} onClick={() => go(s.pack.id, state.view)}>{s.pack.name}</button>)}
        </div>
        <div className="seg" role="group" aria-label="View">
          {VIEWS.map(([k, label]) => <button key={k} aria-pressed={k === state.view} onClick={() => go(state.sport, k)}>{label}</button>)}
        </div>
      </div>
      <p className="mb-5 rounded-lg border border-line bg-deck px-3 py-2 text-[13px] text-mute" role="note">
        <b className="text-ink">Sample data.</b> Every {entry.pack.nouns.player} here is made up (names like &ldquo;Alex Sample&rdquo;). This page shows the {entry.pack.name.toLowerCase()} pack running on the shared engine: {entry.pack.metrics.length} stats, {entry.pack.frameworks.length} ranking lenses, {entry.pack.charts.presets.length} charts.
      </p>
      <LabView key={`${state.sport}-${state.view}`} entry={entry} view={state.view} />
    </>
  );
}

function LabView({ entry, view }: { entry: SportEntry; view: View }) {
  const data = useFixtureData(entry);
  const id = entry.pack.id;
  const routes = { builder: `/lab/sports/?sport=${id}&view=build`, rankings: `/lab/sports/?sport=${id}&view=rankings` };
  const keep = useMemo(() => ({ sport: id, view }), [id, view]);
  if (view === "rankings") return <RankingsBoard pack={entry.pack} data={data} routes={routes} keep={keep} />;
  if (view === "build") return <Builder pack={entry.pack} data={data} keep={keep} />;
  return <Gallery pack={entry.pack} data={data} routes={routes} />;
}
