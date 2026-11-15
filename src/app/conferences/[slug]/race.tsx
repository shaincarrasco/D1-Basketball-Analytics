import Link from "next/link";
import TeamLogo from "@sports/ui/team-logo";
import { pctLabel } from "@/lib/bracket";
import type { StandingRow } from "./standings-table";

type Props = {
  /** Conference standings in place order (pos 1 first), as built by page.tsx. */
  rows: StandingRow[];
  /** Total league games per team id (completed + scheduled), from the team files. Missing ids are unknown. */
  leagueGames: Record<string, number>;
};

const gbLabel = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export default function Race({ rows, leagueGames }: Props) {
  const contenders = rows
    .filter(r => r.sim)
    .sort((a, b) => (b.sim!.title - a.sim!.title) || a.pos - b.pos)
    .slice(0, 6);
  if (!contenders.length) return null;

  const leader = rows.find(r => r.pos === 1) ?? rows[0];
  const second = rows.find(r => r.pos === 2) ?? null;
  const top = contenders[0];
  const runnerUp = contenders[1];
  const leagueStarted = rows.some(r => r.cw + r.cl > 0);

  // Headline: built only from the title odds shown below.
  let headline: string;
  if (top.sim!.title > 0.6) {
    headline = `${top.name} is a heavy favorite (${pctLabel(top.sim!.title)}).`;
  } else if (runnerUp) {
    headline = `${top.name} is the favorite at ${pctLabel(top.sim!.title)}, ahead of ${runnerUp.name} at ${pctLabel(runnerUp.sim!.title)}.`;
  } else {
    headline = `${top.name} is the favorite at ${pctLabel(top.sim!.title)}.`;
  }
  if (!leagueStarted) headline += " No league games yet; odds come from the full simulated schedule.";

  // Magic number: only once the leader has played at least 60% of its league games,
  // and only when both the leader's and the second-place team's league totals are known.
  let magic: number | null = null;
  if (leader && second) {
    const leaderTotal = leagueGames[leader.id];
    const secondTotal = leagueGames[second.id];
    const leaderPlayed = leader.cw + leader.cl;
    if (leaderTotal && secondTotal !== undefined && leaderPlayed >= 0.6 * leaderTotal) {
      const secondRemaining = secondTotal - (second.cw + second.cl);
      magic = Math.max(0, secondRemaining + second.cw - leader.cw + 1);
    }
  }

  return (
    <section aria-labelledby="race-h" className="deck mb-8 p-5">
      <h2 id="race-h" className="h-section mb-1">The race</h2>
      <p className="mb-4 text-[15px] font-medium">{headline}</p>

      <div className="mb-1 hidden grid-cols-[minmax(0,1.3fr)_4.5rem_minmax(0,2fr)_5rem_5rem_3.5rem] items-center gap-3 px-1 sm:grid">
        <span className="label">Team</span>
        <span className="label text-right">Title odds</span>
        <span className="label">Share of simulations</span>
        <span className="label text-center">Conf now</span>
        <span className="label text-center">Proj conf</span>
        <span className="label text-right">GB</span>
      </div>

      <ol className="divide-y divide-line">
        {contenders.map(r => {
          const odds = r.sim!.title;
          const gb = r.id === leader.id ? null : ((leader.cw - r.cw) + (r.cl - leader.cl)) / 2;
          return (
            <li key={r.id} className="grid h-12 grid-cols-[minmax(0,1fr)_auto_3.5rem] items-center gap-3 px-1 sm:grid-cols-[minmax(0,1.3fr)_4.5rem_minmax(0,2fr)_5rem_5rem_3.5rem]">
              <Link href={`/teams/${r.slug}/`} className="link flex min-w-0 items-center gap-2.5">
                <TeamLogo src={r.logo} name={r.name} size={24} />
                <span className="min-w-0 truncate font-semibold">{r.short}</span>
              </Link>
              <span className="font-display text-right text-[1.35rem] font-extrabold leading-none tnum">{pctLabel(odds)}</span>
              <span className="relative hidden h-1.5 rounded-full bg-line sm:block" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-full bg-ink/70" style={{ width: `${Math.max(odds > 0 ? 2 : 0, odds * 100)}%` }} />
              </span>
              <b className="hidden text-center tnum sm:block">{r.cw}–{r.cl}</b>
              <span className="hidden text-center font-semibold tnum sm:block">{r.projCW.toFixed(1)}–{r.projCL.toFixed(1)}</span>
              <span className="text-right text-sm text-mute tnum">{gb === null ? "—" : gbLabel(gb)}</span>
            </li>
          );
        })}
      </ol>

      {magic !== null ? <p className="mt-3 text-sm text-mute tnum">Magic number: {magic}</p> : null}
    </section>
  );
}
