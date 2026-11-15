"use client";
/* eslint-disable @next/next/no-img-element */
// One player: who they are, their season line by role, the animated touch map (targets for
// receivers, every throw for quarterbacks, every carry for backs), the depth × direction grid,
// the game log, and how they rank in each framework.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useJson } from "@sports/ui/client-data";
import { Empty, ErrorState, Loading } from "@sports/ui/states";
import TeamLogo from "@sports/ui/team-logo";
import type { FootballRow } from "@sports/packs/football/types";
import TouchMap, { ZoneGrid } from "@/components/touch-map";
import { pack, SiteFrameworkRanks, useSportData } from "@/site";
import { hex, teamMap, type PlayerFile, type Team } from "@/lib/data";

type Stat = [label: string, value: (r: FootballRow) => string | number | null];
const n = (v: number | null | undefined) => (v == null ? null : v);
const per = (a: number | null, b: number | null, d = 1) => (a == null || !b ? null : (a / b).toFixed(d));
const pc = (a: number | null, b: number | null) => (a == null || !b ? null : `${Math.round((a / b) * 100)}%`);

const LINES: Record<"pass" | "rush" | "rec" | "def", Stat[]> = {
  pass: [["Yards", r => n(r.pYds)], ["Comp", r => pc(r.pCmp, r.pAtt)], ["TD", r => n(r.pTd)], ["INT", r => n(r.pInt)], ["Yds/att", r => per(r.pYds, r.pAtt)], ["Air yds/att", r => per(r.pAir, r.pAirAtt)], ["Deep comp", r => pc(r.pDeepCmp, r.pDeepAtt)], ["Sacked", r => n(r.pSacks)]],
  rush: [["Yards", r => n(r.rYds)], ["Carries", r => n(r.rCar)], ["Yds/carry", r => per(r.rYds, r.rCar)], ["TD", r => n(r.rTd)], ["10+ runs", r => n(r.rRuns10)], ["Stuffed", r => pc(r.rStuffs, r.rCar)], ["1st downs", r => n(r.rFirst)], ["Long", r => n(r.rLong)]],
  rec: [["Yards", r => n(r.rcYds)], ["Catches", r => n(r.rcRec)], ["Targets", r => n(r.rcTgt)], ["Catch rate", r => pc(r.rcRec, r.rcTgt)], ["TD", r => n(r.rcTd)], ["aDOT", r => per(r.rcAir, r.rcTgt)], ["YAC/catch", r => per(r.rcYac, r.rcRec)], ["Deep catches", r => n(r.rcDeepRec)]],
  def: [["Tackles", r => n(r.dTkl)], ["Solo", r => n(r.dSolo)], ["TFL", r => n(r.dTfl)], ["Sacks", r => n(r.dSacks)], ["QB hurries", r => n(r.dHur)], ["Passes defended", r => n(r.dPd)], ["INT", r => n(r.dInt)], ["Def TD", r => n(r.dTd)]],
};
const ROLE: Record<FootballRow["pos"], ("pass" | "rush" | "rec" | "def")[]> = { QB: ["pass", "rush"], RB: ["rush", "rec"], WR: ["rec", "rush"], TE: ["rec"], DL: ["def"], LB: ["def"], DB: ["def"] };
const LINE_NAME = { pass: "Passing", rush: "Rushing", rec: "Receiving", def: "Defense" };
const POS_NAME = { QB: "Quarterback", RB: "Running back", WR: "Wide receiver", TE: "Tight end", DL: "Defensive line", LB: "Linebacker", DB: "Defensive back" };

function Line({ r, k }: { r: FootballRow; k: keyof typeof LINES }) {
  const cells = LINES[k].map(([l, f]) => [l, f(r)] as const).filter(([, v]) => v !== null);
  if (!cells.length) return null;
  return (
    <section aria-label={LINE_NAME[k]}>
      <h2 className="mb-2 text-[13px] font-semibold text-mute">{LINE_NAME[k]}</h2>
      <dl className="grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-8">
        {cells.map(([l, v]) => <div key={l} className="bg-deck px-3 py-2.5"><dt className="text-[11.5px] text-mute">{l}</dt><dd className="font-display text-2xl font-extrabold leading-tight tnum">{v}</dd></div>)}
      </dl>
    </section>
  );
}

export default function Profile() {
  const id = useSearchParams().get("id");
  const data = useSportData(pack);
  const file = useJson<PlayerFile>(id ? `p/${id}.json` : null);
  const teams = useJson<Team[]>("teams.json");
  const tm = useMemo(() => teamMap(teams.data ?? null), [teams.data]);
  const p = useMemo(() => data.rows.find(r => r.id === id) ?? null, [data.rows, id]);
  const [week, setWeek] = useState<number | "all">("all");
  if (!data.ready && !data.error) return <Loading label="Loading player" />;
  if (data.error) return <ErrorState message={data.error} retry={data.retry} />;
  if (!p) return <Empty title="Player not found">Search the <Link className="link" href="/players/">player rankings</Link>.</Empty>;
  const roles = ROLE[p.pos];
  const touches = (file.data?.touches ?? []).filter(t => week === "all" || t.week === week);
  const throws = touches.filter(t => t.kind === "throw"), targets = touches.filter(t => t.kind === "rec" || t.kind === "inc"), carries = touches.filter(t => t.kind === "rush");
  const weeks = [...new Set((file.data?.touches ?? []).map(t => t.week))].sort((a, b) => a - b);
  const color = hex(p.team.color) ?? "#555";
  const maps: { key: string; title: string; note: string; el: React.ReactNode }[] = [];
  if (throws.length) maps.push({ key: "throws", title: "Every throw", note: "From the pocket to where the ball was caught or thrown, then yards after the catch.", el: <TouchMap touches={throws} mode="air" label={`${p.name} pass attempts`} /> });
  if (targets.length) maps.push({ key: "targets", title: "Every target", note: "Where the ball arrived and how far he took it after the catch.", el: <TouchMap touches={targets} mode="air" label={`${p.name} targets`} /> });
  if (carries.length) maps.push({ key: "carries", title: "Every carry", note: "Lane and distance of each run from the line of scrimmage.", el: <TouchMap touches={carries} mode="run" label={`${p.name} carries`} /> });
  return (
    <>
      <header className="relative mb-6 overflow-hidden rounded-2xl border border-line" style={{ background: `linear-gradient(110deg, ${color}66, ${color}11 55%, transparent)` }}>
        <span aria-hidden className="pointer-events-none absolute -right-4 -top-10 font-display text-[200px] font-extrabold leading-none text-white/[.06]">{p.jersey ?? ""}</span>
        <div className="relative flex flex-wrap items-end gap-5 p-6">
          {p.headshot ? <img src={p.headshot} alt="" className="h-32 w-32 rounded-xl bg-deck2 object-cover object-top" /> : <TeamLogo src={p.team.logo} name={p.team.name} size={96} />}
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-mute">
              <TeamLogo src={p.team.logo} name={p.team.name} size={20} />
              <Link href={`/team/?id=${p.team.id}`} className="hover:underline">{p.team.name}</Link>
              <span>{POS_NAME[p.pos]}{p.jersey ? `, #${p.jersey}` : ""}</span>
            </p>
            <h1 className="font-display text-5xl font-extrabold uppercase leading-[.9] sm:text-6xl">{p.name}</h1>
            <p className="mt-2 text-mute">{p.games} games, {p.team.confName}</p>
          </div>
        </div>
      </header>
      <div className="flex flex-col gap-4">{roles.map(k => <Line key={k} r={p} k={k} />)}</div>

      {file.status === "loading" && <Loading label="Loading plays" />}
      {maps.length > 0 && (
        <section className="mt-8" aria-label="Play maps">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-extrabold uppercase">Play map</h2>
            <select className="field ml-auto w-auto" value={String(week)} onChange={e => setWeek(e.target.value === "all" ? "all" : Number(e.target.value))} aria-label="Game">
              <option value="all">Whole season</option>
              {weeks.map(w => { const g = file.data!.games.find(x => x.week === w); return <option key={w} value={w}>Week {w}{g ? ` ${g.home ? "vs" : "at"} ${tm.get(g.opp)?.short ?? ""}` : ""}</option>; })}
            </select>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {maps.map(m => (
              <div key={m.key + week}>
                <h3 className="font-semibold">{m.title} <span className="font-normal text-mute">({(m.key === "throws" ? throws : m.key === "targets" ? targets : carries).length})</span></h3>
                <p className="mb-2 text-[13px] text-mute">{m.note}</p>
                {m.el}
                {m.key !== "carries" && <div className="mt-3"><ZoneGrid touches={m.key === "throws" ? throws : targets} /></div>}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-dim">Spots and directions come from ESPN play-by-play. College football has no public route tracking, so these show where the ball went, not the full route run.</p>
        </section>
      )}

      {file.data && file.data.games.length > 0 && (
        <section className="mt-8" aria-label="Game log">
          <h2 className="mb-2 font-display text-2xl font-extrabold uppercase">Game log</h2>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-[13.5px] tnum">
              <thead className="bg-deck text-[12px] text-mute"><tr>
                <th className="px-3 py-2 text-left font-semibold">Wk</th><th className="px-3 py-2 text-left font-semibold">Opponent</th><th className="px-3 py-2 text-left font-semibold">Result</th>
                {roles.flatMap(k => LINES[k].slice(0, 4)).map(([l], i) => <th key={i} className="px-3 py-2 text-right font-semibold">{l}</th>)}
              </tr></thead>
              <tbody>
                {file.data.games.map(g => {
                  const row = { ...p, ...g.stats } as FootballRow;
                  return (
                    <tr key={g.gid} className="border-t border-line">
                      <td className="px-3 py-1.5">{g.week}</td>
                      <td className="px-3 py-1.5"><Link href={`/game/?id=${g.gid}`} className="hover:underline">{g.home ? "vs" : "at"} {tm.get(g.opp)?.short ?? g.opp}</Link></td>
                      <td className={`px-3 py-1.5 font-semibold ${g.result.startsWith("W") ? "text-win" : g.result.startsWith("L") ? "text-loss" : ""}`}>{g.result}</td>
                      {roles.flatMap(k => LINES[k].slice(0, 4)).map(([, f], i) => <td key={i} className="px-3 py-1.5 text-right">{f(row) ?? "—"}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-8" aria-label="Framework ranks"><SiteFrameworkRanks p={p} all={data.rows} /></section>
    </>
  );
}
