"use client";
// Every FBS week of the season. Defaults to the current week; arrows and a strip of week chips.
import { useMemo, useState } from "react";
import { useJson } from "@sports/ui/client-data";
import { ErrorState, Loading } from "@sports/ui/states";
import GameCard from "@/components/game-card";
import { teamMap, type Games, type Team } from "@/lib/data";

export default function Weeks() {
  const g = useJson<Games>("games.json");
  const t = useJson<Team[]>("teams.json");
  const [pick, setPick] = useState<number | null>(null);
  const [conf, setConf] = useState("all");
  const teams = useMemo(() => teamMap(t.data ?? null), [t.data]);
  const confs = useMemo(() => [...new Map((t.data ?? []).map(x => [x.confSlug, x.confName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [t.data]);
  if (g.status === "loading") return <Loading label="Loading schedule" />;
  if (g.status === "error") return <ErrorState message={g.error} retry={g.retry} />;
  const weeks = g.data.weeks;
  const cur = pick ?? g.data.currentWeek;
  const wk = weeks.find(w => w.week === cur) ?? weeks[weeks.length - 1];
  const idx = weeks.indexOf(wk);
  const inConf = (id: string) => conf === "all" || teams.get(id)?.confSlug === conf;
  const games = wk.games.filter(x => inConf(x.home.id) || inConf(x.away.id)).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <section aria-label={wk.label}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn !px-3" disabled={idx <= 0} onClick={() => setPick(weeks[idx - 1].week)} aria-label="Previous week">‹</button>
        <h2 className="min-w-28 text-center font-display text-2xl font-extrabold uppercase">{wk.label}</h2>
        <button className="btn !px-3" disabled={idx >= weeks.length - 1} onClick={() => setPick(weeks[idx + 1].week)} aria-label="Next week">›</button>
        <select className="field ml-auto w-auto" value={conf} onChange={e => setConf(e.target.value)} aria-label="Conference">
          <option value="all">All conferences</option>
          {confs.map(([s, n]) => <option key={s} value={s}>{n}</option>)}
        </select>
      </div>
      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Weeks">
        {weeks.map(w => <button key={w.week} aria-pressed={w.week === wk.week} onClick={() => setPick(w.week)} className="chip shrink-0">{w.label.replace("Week ", "Wk ")}</button>)}
      </div>
      {games.length === 0 ? <p className="deck p-5 text-mute">No games for that conference this week.</p> :
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{games.map(x => <GameCard key={x.id} g={x} team={id => teams.get(id)} />)}</div>}
    </section>
  );
}
