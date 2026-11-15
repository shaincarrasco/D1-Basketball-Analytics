"use client";
// Every FBS team grouped by conference, sorted by conference record then overall record.
import Link from "next/link";
import { useMemo, useState } from "react";
import { useJson } from "@sports/ui/client-data";
import { ErrorState, Loading } from "@sports/ui/states";
import TeamLogo from "@sports/ui/team-logo";
import type { Team } from "@/lib/data";

const pct = (w: number, l: number) => (w + l ? w / (w + l) : 0);

export default function List() {
  const t = useJson<Team[]>("teams.json");
  const [q, setQ] = useState("");
  const confs = useMemo(() => {
    const m = new Map<string, { name: string; teams: Team[] }>();
    for (const x of t.data ?? []) (m.get(x.confSlug) ?? m.set(x.confSlug, { name: x.confName, teams: [] }).get(x.confSlug)!).teams.push(x);
    for (const c of m.values()) c.teams.sort((a, b) => pct(b.confWins, b.confLosses) - pct(a.confWins, a.confLosses) || pct(b.wins, b.losses) - pct(a.wins, a.losses));
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [t.data]);
  if (t.status === "loading") return <Loading label="Loading teams" />;
  if (t.status === "error") return <ErrorState message={t.error} retry={t.retry} />;
  const needle = q.trim().toLowerCase();
  return (
    <>
      <input className="field mb-5 max-w-sm" placeholder="Find a team" value={q} onChange={e => setQ(e.target.value)} aria-label="Find a team" />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {confs.map(c => {
          const ts = c.teams.filter(x => !needle || x.name.toLowerCase().includes(needle));
          if (!ts.length) return null;
          return (
            <section key={c.name} className="deck p-4" aria-label={c.name}>
              <h2 className="mb-2 font-display text-xl font-extrabold uppercase">{c.name}</h2>
              <table className="w-full text-[14px]">
                <thead><tr className="text-[12px] text-dim"><th className="text-left font-semibold">Team</th><th className="w-12 text-right font-semibold">Conf</th><th className="w-12 text-right font-semibold">All</th></tr></thead>
                <tbody>
                  {ts.map(x => (
                    <tr key={x.id} className="border-t border-line">
                      <td className="py-1.5">
                        <Link href={`/team/?id=${x.id}`} className="flex items-center gap-2 hover:underline">
                          <TeamLogo src={x.logo} name={x.name} size={22} />
                          {(x.cfpRank ?? x.apRank) && <span className="text-[12px] font-bold text-dim tnum">{x.cfpRank ?? x.apRank}</span>}
                          <span className="truncate font-semibold">{x.short}</span>
                        </Link>
                      </td>
                      <td className="text-right tnum">{x.confWins}–{x.confLosses}</td>
                      <td className="text-right font-semibold tnum">{x.wins}–{x.losses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </>
  );
}
