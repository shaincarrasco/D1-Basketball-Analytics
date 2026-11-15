"use client";
// The three polls side by side on a picker: CFP committee, AP, Coaches. Movement since last week.
import Link from "next/link";
import { useState } from "react";
import { useJson } from "@sports/ui/client-data";
import { ErrorState, Loading } from "@sports/ui/states";
import TeamLogo from "@sports/ui/team-logo";
import { teamMap, type Rankings, type Team } from "@/lib/data";

function Move({ now, prev }: { now: number; prev: number | null }) {
  if (!prev) return <span className="text-[12px] font-semibold text-bulb">new</span>;
  const d = prev - now;
  if (!d) return <span className="text-dim">–</span>;
  return <span className={`text-[12.5px] font-bold tnum ${d > 0 ? "text-win" : "text-loss"}`}>{d > 0 ? "▲" : "▼"}{Math.abs(d)}</span>;
}

export default function Board() {
  const r = useJson<Rankings>("rankings.json");
  const t = useJson<Team[]>("teams.json");
  const [key, setKey] = useState<string | null>(null);
  if (r.status === "loading") return <Loading label="Loading polls" />;
  if (r.status === "error") return <ErrorState message={r.error} retry={r.retry} />;
  const teams = teamMap(t.data ?? null);
  const poll = r.data.polls.find(p => p.key === key) ?? r.data.polls[0];
  if (!poll) return <p className="deck p-5 text-mute">No polls have been released yet this season.</p>;
  return (
    <section aria-label={poll.name}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Poll">
          {r.data.polls.map(p => <button key={p.key} aria-pressed={p.key === poll.key} onClick={() => setKey(p.key)}>{p.key === "cfp" ? "Playoff committee" : p.key === "ap" ? "AP Top 25" : "Coaches"}</button>)}
        </div>
        <span className="text-sm text-mute">{poll.name}, released {new Date(poll.date).toLocaleDateString([], { month: "long", day: "numeric" })}</span>
      </div>
      <ol className="deck divide-y divide-line">
        {poll.ranks.map(x => {
          const tm = teams.get(x.teamId);
          return (
            <li key={x.teamId} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-8 font-display text-[26px] font-extrabold leading-none tnum">{x.rank}</span>
              <span className="w-9 text-center"><Move now={x.rank} prev={x.previous} /></span>
              <TeamLogo src={tm?.logo ?? null} name={tm?.name ?? x.teamId} size={30} />
              <span className="min-w-0 flex-1">
                <Link href={`/team/?id=${x.teamId}`} className="block truncate font-semibold hover:underline">{tm?.name ?? `Team ${x.teamId}`}</Link>
                <span className="text-[12.5px] text-mute">{tm?.confName ?? ""}</span>
              </span>
              <span className="font-semibold tnum">{x.record}</span>
              {!!x.points && <span className="hidden w-24 text-right text-[12.5px] text-mute tnum sm:block">{x.points} pts{x.firstPlace ? ` (${x.firstPlace})` : ""}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
