"use client";
// Team mode: every five-man mix from a team's rotation, best projected first, next to the units that
// have actually played (play-by-play). Tapping a row loads it into the builder.
import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Search } from "lucide-react";
import TeamLogo from "@sports/ui/team-logo";
import { Empty, ErrorState } from "@sports/ui/states";
import { useJson } from "@sports/ui/client-data";
import { fmt, signed } from "@sports/ui/format";
import { bestLineups, lastName, observedSd, projectLineup, rotationOf, shortName, type LabData, type LabPlayer } from "@/lib/lineup-lab";
import type { TeamDetail } from "@/lib/types";
import { NavRow, labStyles } from "./parts";

type Unit = NonNullable<TeamDetail["lineups"]>[number];
const SMALL = 40;
const STEP = 10;
const COLS_RANK = "grid-cols-[26px_minmax(0,1fr)_64px_72px]", COLS = "grid-cols-[minmax(0,1fr)_64px_72px]";
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tone = (v: number) => (v > 0.05 ? "text-win" : v < -0.05 ? "text-loss" : "text-mute");

/** Last names, or initial + last name where two players share one. */
function names(ps: (LabPlayer | null)[]) {
  const counts = new Map<string, number>();
  for (const p of ps) if (p) counts.set(lastName(p.n), (counts.get(lastName(p.n)) ?? 0) + 1);
  return ps.map(p => (p ? ((counts.get(lastName(p.n)) ?? 0) > 1 ? shortName(p.n) : lastName(p.n)) : "Unlisted player")).join(", ");
}

export default function TeamMode({ data, slug, setTeam, load, onHow }: {
  data: LabData; slug: string | null; setTeam: (slug: string) => void; load: (ids: string[]) => void; onHow: () => void;
}) {
  const teamOptions = useMemo(() => [...data.teams.values()].filter(t => data.players.some(p => p.t === t.slug)).sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const team = slug ? data.teams.get(slug) ?? null : null;
  return (
    <div className="space-y-6">
      <div className="team-accent flex items-center gap-3 rounded-[20px] bg-deck p-3 pr-4 shadow-[var(--shadow)]" style={team?.color ? ({ "--team": team.color } as React.CSSProperties) : undefined}>
        {team ? <TeamLogo src={team.logo} name={team.name} size={44} /> : <span className="h-11 w-11 rounded-full bg-deck2" aria-hidden />}
        <div className="relative min-w-0 flex-1">
          <label htmlFor="lab-team" className="sr-only">Team</label>
          <select id="lab-team" className="h-12 w-full appearance-none truncate rounded-xl bg-transparent pr-8 font-display text-[24px] font-extrabold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-bulb" value={slug ?? ""} onChange={e => setTeam(e.target.value)}>
            {!team && <option value="">Pick a team</option>}
            {teamOptions.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
          </select>
          <ChevronDown aria-hidden size={20} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-mute" />
        </div>
        {team && <Link href={`/teams/${team.slug}/`} className="hidden shrink-0 text-[15px] font-semibold text-bulb-ink hover:underline sm:inline">Team page</Link>}
      </div>
      {team ? <TeamLineups key={team.slug} data={data} slug={team.slug} load={load} /> : <Empty title="Pick a team">Choose a team to rank every lineup from its rotation.</Empty>}
      <NavRow onClick={onHow}>How the lab works</NavRow>
    </div>
  );
}

function TeamLineups({ data, slug, load }: { data: LabData; slug: string; load: (ids: string[]) => void }) {
  const detail = useJson<TeamDetail>(`team/${slug}.json`);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(STEP);
  const rotation = useMemo(() => rotationOf(data.players, slug, 10), [data, slug]);
  const ranked = useMemo(() => bestLineups(rotation, data.meta.eff, data.k), [rotation, data.meta.eff, data.k]);
  // Ranks come from the full list, before any name filter: search never changes a rank.
  const rankOf = useMemo(() => new Map(ranked.map((l, i) => [l.key, i + 1])), [ranked]);
  const observed = useMemo(() => new Map((detail.data?.lineups ?? []).map(u => [[...u.pids].sort().join("-"), u])), [detail.data]);
  const filtered = useMemo(() => {
    const s = fold(q.trim());
    return s ? ranked.filter(l => l.players.some(p => fold(p.n).includes(s))) : ranked;
  }, [ranked, q]);

  if (rotation.length < 5) return <Empty title="Not enough players yet">This team has fewer than five players averaging {data.meta.minMpg}+ minutes with a rating.</Empty>;

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
      <section aria-labelledby="best-h">
        <h2 id="best-h" className="px-1 font-display text-[22px] font-extrabold">Best projected fives</h2>
        <p className="mb-3 px-1 text-[14px] text-mute">Every mix of the top {rotation.length} by minutes: {ranked.length} lineups. Tap one to open it.</p>
        <div className="relative mb-3">
          <Search aria-hidden size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-dim" />
          <input type="search" aria-label="Show lineups with a player" className="h-11 w-full rounded-xl border border-line2 bg-deck pl-10 pr-3 text-[16px] text-ink placeholder:text-dim focus:border-mute focus:outline-none" placeholder="Lineups with a player" value={q} onChange={e => { setQ(e.target.value); setShown(STEP); }} />
        </div>
        {filtered.length ? (
          <ListShell first="Projected" second="Real">
            {filtered.slice(0, shown).map(l => {
              const u = observed.get(l.key);
              const warn = l.proj.warnings.filter(w => w.level === "high" || w.level === "mid");
              return (
                <LineupRow key={l.key} rank={rankOf.get(l.key)!} label={names(l.players)} onOpen={() => load(l.ids)}
                  aria={`Rank ${rankOf.get(l.key)}: ${l.players.map(p => p.n).join(", ")}, projected ${signed(l.proj.net, 1)}${u ? `, real ${signed(u.net, 1)} over ${fmt(u.poss, 0)} possessions` : ""}`}
                  sub={warn.length ? <span className={`inline-flex items-center gap-1 ${warn.some(w => w.level === "high") ? "text-loss" : "text-off"}`}><AlertTriangle size={13} aria-hidden />{warn[0].title}{warn.length > 1 ? ` +${warn.length - 1}` : ""}</span> : null}
                  first={<Value v={l.proj.net} strong />}
                  second={u ? <Value v={u.net} poss={u.poss} /> : <span className="block text-right text-[13px] text-dim">Not yet</span>} />
              );
            })}
          </ListShell>
        ) : <p className="rounded-2xl bg-deck px-4 py-4 text-[15px] text-mute">No lineup here includes &ldquo;{q.trim()}&rdquo;.</p>}
        {filtered.length > shown && (
          <button type="button" onClick={() => setShown(n => n + STEP * 2)} className="mt-2 w-full rounded-xl py-3 text-[15px] font-semibold text-bulb-ink hover:bg-deck">
            Show more ({filtered.length - shown} left)
          </button>
        )}
      </section>

      <section aria-labelledby="real-h">
        <h2 id="real-h" className="px-1 font-display text-[22px] font-extrabold">Real lineups</h2>
        <p className="mb-3 px-1 text-[14px] text-mute">Fives that have played 2+ minutes together, most possessions first. Real nets aren&apos;t opponent-adjusted; faded ones are under {SMALL} possessions, mostly luck.</p>
        {detail.status === "error" ? <ErrorState message={detail.error ?? "Could not load this team's lineups."} retry={detail.retry} />
          : !detail.data ? <div className="h-64 animate-pulse rounded-2xl bg-deck" role="status" aria-label="Loading real lineups" />
          : <Observed units={detail.data.lineups ?? []} data={data} load={load} />}
      </section>
    </div>
  );
}

function ListShell({ first, second, children, rank = true }: { first: string; second: string; children: React.ReactNode; rank?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-deck shadow-[var(--shadow)]">
      <div className={`grid ${rank ? COLS_RANK : COLS} gap-x-2 border-b border-line px-3 py-2 text-[12px] font-semibold text-mute`} aria-hidden>
        {rank && <span />}
        <span>Lineup</span>
        <span className="text-right">{first}</span>
        <span className="text-right">{second}</span>
      </div>
      <ul>{children}</ul>
    </div>
  );
}

function Value({ v, poss, strong = false, faded = poss != null && poss < SMALL }: { v: number; poss?: number; strong?: boolean; faded?: boolean }) {
  return (
    <span className={`block text-right ${faded ? "opacity-55" : ""}`}>
      <span className={`block tabular-nums ${strong ? "text-[17px] font-bold" : "text-[15px] font-semibold"} ${tone(v)}`}>{signed(v, 1)}</span>
      {poss != null && <span className="block text-[12px] tabular-nums text-mute">{fmt(poss, 0)} poss</span>}
    </span>
  );
}

function LineupRow({ rank, label, sub, first, second, onOpen, aria }: {
  rank?: number; label: string; sub?: React.ReactNode; first: React.ReactNode; second: React.ReactNode; onOpen?: () => void; aria: string;
}) {
  // Two rows: the names get the full width, the numbers sit on the second row with the detail.
  const cols = rank != null ? COLS_RANK : COLS;
  const body = (
    <>
      {rank != null && <span className="rank-cell row-span-2 self-center text-center !text-[15px]">{rank}</span>}
      <span className="col-span-3 text-[15px] font-semibold leading-snug">{label}</span>
      <span className="min-w-0 self-center text-[13px] leading-snug">{sub}</span>
      {first}
      {second}
    </>
  );
  return (
    <li className="border-t border-line first:border-t-0">
      {onOpen ? (
        <button type="button" onClick={onOpen} aria-label={`${aria}. Open in the builder`} className={`${labStyles.row} grid w-full ${cols} items-start gap-x-2 gap-y-1 px-3 py-3 text-left`}>{body}</button>
      ) : <div className={`grid ${cols} items-start gap-x-2 gap-y-1 px-3 py-3`} aria-label={aria}>{body}</div>}
    </li>
  );
}

function Observed({ units, data, load }: { units: Unit[]; data: LabData; load: (ids: string[]) => void }) {
  const [shown, setShown] = useState(8);
  const rows = useMemo(() => units.map(u => {
    const players = u.pids.map(id => data.byId.get(id) ?? null);
    const proj = players.every(Boolean) ? projectLineup(players as LabPlayer[], data.meta.eff, data.k).net : null;
    return { ...u, players, proj };
  }).sort((a, b) => b.poss - a.poss), [units, data]);
  if (!rows.length) return <p className="rounded-2xl bg-deck px-4 py-4 text-[15px] text-mute">No five-man units in the play-by-play yet.</p>;
  return (
    <>
      <ListShell first="Real" second="Projected" rank={false}>
        {rows.slice(0, shown).map(u => (
          <LineupRow key={u.pids.join("-")} label={names(u.players)}
            aria={`${u.players.map(p => p?.n ?? "Unlisted player").join(", ")}: real ${signed(u.net, 1)} over ${fmt(u.poss, 0)} possessions${u.proj != null ? `, projected ${signed(u.proj, 1)}` : ""}`}
            sub={<span className="text-mute">{fmt(u.poss, 0)} poss, {fmt(u.min, 0)} min, luck ±{Math.round(observedSd(u.poss) ?? 0)}</span>}
            onOpen={u.proj != null ? () => load(u.pids) : undefined}
            first={<Value v={u.net} faded={u.poss < SMALL} strong />}
            second={u.proj != null ? <Value v={u.proj} /> : <span className="block text-right text-[13px] text-dim" title={`A player here averages under ${data.meta.minMpg} minutes`}>n/a</span>} />
        ))}
      </ListShell>
      {rows.length > shown && (
        <button type="button" onClick={() => setShown(n => n + 16)} className="mt-2 w-full rounded-xl py-3 text-[15px] font-semibold text-bulb-ink hover:bg-deck">Show more ({rows.length - shown} left)</button>
      )}
    </>
  );
}
