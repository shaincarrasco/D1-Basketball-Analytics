"use client";
// One team: record and ranks, season schedule with results, and the roster's statistical leaders.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useJson } from "@sports/ui/client-data";
import { ErrorState, Loading, Empty } from "@sports/ui/states";
import TeamLogo from "@sports/ui/team-logo";
import type { FootballRow } from "@sports/packs/football/types";
import { hex, kickoff, teamMap, type Games, type Team } from "@/lib/data";

const LEADERS: { label: string; key: keyof FootballRow; unit: string }[] = [
  { label: "Passing", key: "pYds", unit: "yds" }, { label: "Rushing", key: "rYds", unit: "yds" }, { label: "Receiving", key: "rcYds", unit: "yds" },
  { label: "Tackles", key: "dTkl", unit: "" }, { label: "Sacks", key: "dSacks", unit: "" }, { label: "Interceptions", key: "dInt", unit: "" },
];

export default function Profile() {
  const id = useSearchParams().get("id");
  const t = useJson<Team[]>("teams.json");
  const g = useJson<Games>("games.json");
  const p = useJson<{ rows: FootballRow[] }>("players.json");
  const teams = useMemo(() => teamMap(t.data ?? null), [t.data]);
  const roster = useMemo(() => (p.data?.rows ?? []).filter(r => r.team.id === id), [p.data, id]);
  if (t.status === "loading") return <Loading label="Loading team" />;
  if (t.status === "error") return <ErrorState message={t.error} retry={t.retry} />;
  const team = id ? teams.get(id) : undefined;
  if (!team) return <Empty title="Team not found">Pick one from the <Link className="link" href="/teams/">teams list</Link>.</Empty>;
  const games = (g.data?.weeks ?? []).flatMap(w => w.games.filter(x => x.home.id === id || x.away.id === id).map(x => ({ w, x })));
  const color = hex(team.color) ?? "#444";
  return (
    <>
      <header className="relative mb-6 overflow-hidden rounded-2xl border border-line p-6" style={{ background: `linear-gradient(120deg, ${color}55, transparent 70%)` }}>
        <div className="flex flex-wrap items-center gap-5">
          <TeamLogo src={team.logo} name={team.name} size={84} />
          <div>
            <h1 className="font-display text-4xl font-extrabold uppercase leading-none sm:text-5xl">{team.name}</h1>
            <p className="mt-1.5 text-mute">{team.confName}</p>
          </div>
          <dl className="ml-auto flex gap-6 text-center">
            <div><dt className="text-[12px] text-mute">Record</dt><dd className="font-display text-3xl font-extrabold tnum">{team.wins}–{team.losses}</dd></div>
            <div><dt className="text-[12px] text-mute">Conference</dt><dd className="font-display text-3xl font-extrabold tnum">{team.confWins}–{team.confLosses}</dd></div>
            {team.cfpRank && <div><dt className="text-[12px] text-mute">Playoff rank</dt><dd className="font-display text-3xl font-extrabold text-bulb tnum">{team.cfpRank}</dd></div>}
            {team.apRank && <div><dt className="text-[12px] text-mute">AP</dt><dd className="font-display text-3xl font-extrabold tnum">{team.apRank}</dd></div>}
          </dl>
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="deck p-4" aria-label="Schedule">
          <h2 className="mb-2 font-display text-xl font-extrabold uppercase">Schedule</h2>
          <ul className="divide-y divide-line">
            {games.map(({ w, x }) => {
              const home = x.home.id === id, us = home ? x.home : x.away, them = home ? x.away : x.home, opp = teams.get(them.id);
              return (
                <li key={x.id} className="flex items-center gap-3 py-2 text-[14px]">
                  <span className="w-12 text-[12px] text-dim">{w.label.replace("Week ", "Wk ")}</span>
                  <span className="w-5 text-dim">{x.neutral ? "vs" : home ? "vs" : "at"}</span>
                  <TeamLogo src={opp?.logo ?? null} name={opp?.name ?? "?"} size={22} />
                  <Link href={`/team/?id=${them.id}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">{them.rank ? <span className="mr-1 text-[12px] text-dim">{them.rank}</span> : null}{opp?.short ?? "TBD"}</Link>
                  {x.status === "post" ? (
                    <Link href={`/game/?id=${x.id}`} className="font-semibold tnum hover:underline"><span className={us.winner ? "text-win" : "text-loss"}>{us.winner ? "W" : "L"}</span> {us.score}–{them.score}</Link>
                  ) : <span className="text-[12.5px] text-mute">{x.status === "in" ? x.detail : kickoff(x.date)}</span>}
                </li>
              );
            })}
          </ul>
        </section>
        <section aria-label="Leaders">
          <h2 className="mb-2 font-display text-xl font-extrabold uppercase">Team leaders</h2>
          <div className="grid grid-cols-2 gap-3">
            {LEADERS.map(L => {
              const top = [...roster].filter(r => typeof r[L.key] === "number" && (r[L.key] as number) > 0).sort((a, b) => (b[L.key] as number) - (a[L.key] as number)).slice(0, 3);
              return (
                <div key={L.label} className="deck p-3">
                  <p className="text-[12px] font-semibold text-mute">{L.label}</p>
                  {top.length === 0 ? <p className="text-sm text-dim">No stats yet</p> : top.map((r, i) => (
                    <Link key={r.id} href={`/player/?id=${r.id}`} className={`flex items-baseline justify-between gap-2 hover:underline ${i ? "text-[13px] text-mute" : "mt-0.5"}`}>
                      <span className={`truncate ${i ? "" : "font-semibold"}`}>{r.name}</span>
                      <span className={i ? "tnum" : "font-display text-xl font-extrabold tnum"}>{r[L.key] as number}{L.unit && !i ? <span className="ml-0.5 text-[11px] font-semibold text-mute">{L.unit}</span> : null}</span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
