import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import { getConferences, getMeta, getTeams } from "@/lib/server-data";
import { signed } from "@/lib/format";
import ConferencesTable, { type ConfRow } from "./conferences-table";

export const metadata: Metadata = { title: "Conferences", description: "Every Division I conference ranked by average adjusted efficiency margin, with depth charts and non-conference records." };

// Phone labels for long conference names.
const SHORT: Record<string, string> = {
  "atlantic-10": "A-10", "mountain-west": "Mountain W", "missouri-valley": "Missouri Val", "united-athletic": "United Ath", "conference-usa": "C-USA",
  "ohio-valley": "Ohio Valley", "patriot-league": "Patriot", "summit-league": "Summit", "ivy-league": "Ivy", "big-south": "Big South", "southland": "Southland",
};

export default function ConferencesPage() {
  const meta = getMeta(), confs = getConferences(), teams = getTeams();
  const byId = new Map(teams.map(t => [t.id, t]));
  const rows: ConfRow[] = confs.map(c => {
    const best = c.best ? byId.get(c.best) ?? null : null;
    return {
      slug: c.slug, name: c.name, rank: c.rank, size: c.size, avgEM: c.avgEM, avgO: c.avgO, avgD: c.avgD, avgT: c.avgT, ncW: c.ncW, ncL: c.ncL,
      best: best ? { name: best.name, slug: best.slug, logo: best.logo, rank: best.rank, adjEM: best.adjEM } : null,
    };
  });

  // Spread chart: every member team as a dot on a shared AdjEM axis.
  const ems = teams.map(t => t.adjEM).filter((v): v is number => v !== null);
  const lo = Math.floor(Math.min(...ems, -10) / 10) * 10, hi = Math.ceil(Math.max(...ems, 10) / 10) * 10;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += 10) ticks.push(v);

  return (
    <>
      <PageHeader title="Conferences">Ranked by the average AdjEM of their members.</PageHeader>

      <section aria-labelledby="strength-h" className="mb-10">
        <h2 id="strength-h" className="h-section mb-4">Strength ranking</h2>
        <ConferencesTable rows={rows} />
      </section>

      <section aria-labelledby="spread-h">
        <h2 id="spread-h" className="h-section mb-1">Depth chart</h2>
        <p className="mb-4 max-w-3xl text-sm text-mute">
          Each dot is one team, placed by AdjEM. A tight cluster to the right means a deep league; a long tail means a few strong teams carrying the average.
          The white tick marks the conference average; 0 is an average D-I team.
        </p>
        <div className="deck p-3 sm:p-5">
          <div className="grid grid-cols-[6.25rem_1fr] gap-x-2 sm:grid-cols-[11rem_1fr] sm:gap-x-4">
            <div />
            <div className="relative mb-2 h-4 text-[11px] text-dim" aria-hidden>
              {ticks.map(v => (
                <span key={v} className={`absolute -translate-x-1/2 tnum ${v % 20 !== 0 ? "hidden sm:inline" : ""}`} style={{ left: `${x(v)}%` }}>{v > 0 ? `+${v}` : v}</span>
              ))}
            </div>
            {confs.map(c => {
              const members = c.teams.map(id => byId.get(id)).filter(t => t && t.adjEM !== null).sort((a, b) => a!.adjEM! - b!.adjEM!);
              const vals = members.map(t => t!.adjEM!);
              return (
                <div key={c.slug} className="contents">
                  <Link href={`/conferences/${c.slug}/`} className="link flex items-center gap-2 truncate py-1.5 text-[13px] font-semibold">
                    <span className="w-5 shrink-0 text-right font-display text-base font-extrabold text-mute tnum">{c.rank}</span>
                    <span className="truncate"><span className="sm:hidden">{SHORT[c.slug] ?? c.name}</span><span className="hidden sm:inline">{c.name}</span></span>
                  </Link>
                  <div className="relative h-full min-h-[30px] border-b border-line" role="img"
                    aria-label={`${c.name}: ${vals.length} teams from ${signed(vals[0])} to ${signed(vals[vals.length - 1])}, average ${signed(c.avgEM)}`}>
                    {ticks.map(v => <span key={v} className="absolute inset-y-0 w-px" style={{ left: `${x(v)}%`, background: v === 0 ? "var(--line-2)" : "var(--line)" }} aria-hidden />)}
                    {vals.length > 1 && <span className="absolute top-1/2 h-px -translate-y-1/2" style={{ background: "rgb(var(--mute-rgb) / .35)", left: `${x(vals[0])}%`, width: `${x(vals[vals.length - 1]) - x(vals[0])}%` }} aria-hidden />}
                    {members.map(t => (
                      <span key={t!.id} title={`${t!.name} ${signed(t!.adjEM)}`} aria-hidden
                        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-night"
                        style={{ left: `${x(t!.adjEM!)}%`, background: "var(--mute)", opacity: 0.85 }} />
                    ))}
                    {c.avgEM !== null && <span className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" style={{ left: `${x(c.avgEM)}%` }} aria-hidden />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <p className="mt-3 text-xs text-dim">Ratings through {new Date(meta.updated.teams ?? meta.updated.built).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}, {meta.seasonLabel} season. Early-season ratings lean on conference priors, which pulls teams toward their league average.</p>
      </section>
    </>
  );
}
