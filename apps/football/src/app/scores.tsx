"use client";
// Live FBS scoreboard from ESPN, refreshed every 30 seconds. Ranked and live games first.
import { useMemo, useState } from "react";
import { usePolledJson } from "@sports/ui/polling";
import { useJson } from "@sports/ui/client-data";
import { Loading } from "@sports/ui/states";
import GameCard from "@/components/game-card";
import { SCOREBOARD, parseScoreboard } from "@/lib/espn";
import { teamMap, type Team } from "@/lib/data";

const ORDER = { in: 0, pre: 1, post: 2 } as const;

export default function Scores() {
  const live = usePolledJson<unknown>(SCOREBOARD, 30_000);
  const teamsFile = useJson<Team[]>("teams.json");
  const [only, setOnly] = useState<"top" | "all">("top");
  const sb = useMemo(() => parseScoreboard(live.data), [live.data]);
  const known = useMemo(() => teamMap(teamsFile.data ?? null), [teamsFile.data]);
  const team = (id: string) => known.get(id) ?? sb.teams.get(id);
  const games = useMemo(() => sb.games
    .filter(g => only === "all" || g.home.rank || g.away.rank)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || Math.min(a.home.rank ?? 99, a.away.rank ?? 99) - Math.min(b.home.rank ?? 99, b.away.rank ?? 99) || a.date.localeCompare(b.date)), [sb, only]);
  if (!live.at) return live.error ? <p className="deck p-5 text-mute">The scoreboard isn&apos;t reachable right now. Try again in a minute, or see the <a className="link" href="schedule/">schedule</a>.</p> : <Loading label="Loading scores" />;
  const n = sb.games.filter(g => g.status === "in").length;
  return (
    <section aria-label="Scores">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Which games">
          <button aria-pressed={only === "top"} onClick={() => setOnly("top")}>Top 25</button>
          <button aria-pressed={only === "all"} onClick={() => setOnly("all")}>All FBS</button>
        </div>
        <span className="text-sm text-mute">{sb.week ? `Week ${sb.week}. ` : ""}{n ? <><b className="text-ink">{n}</b> live now. </> : null}Updates every 30 seconds.</span>
      </div>
      {games.length === 0 ? <p className="deck p-5 text-mute">{only === "top" ? "No ranked teams on this week's board. Switch to All FBS." : "No FBS games on the board right now."}</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{games.map(g => <GameCard key={g.id} g={g} team={team} />)}</div>
      )}
    </section>
  );
}
