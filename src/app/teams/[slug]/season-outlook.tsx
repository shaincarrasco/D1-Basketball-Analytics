// Server-rendered season outlook: simulation summary tiles + final win-total distribution.
import Link from "next/link";
import { fmt, pctFmt } from "@/lib/format";
import type { TeamDetail, TeamSummary } from "@/lib/types";

type Sim = NonNullable<TeamSummary["sim"]>;

function Tile({ label, value, sub, hint, href }: { label: string; value: string; sub?: React.ReactNode; hint: string; href?: string }) {
  const body = (
    <>
      <div className="label">{label}</div>
      <div className="font-display text-[1.75rem] font-extrabold leading-tight tnum">{value}</div>
      {sub && <div className="text-xs text-mute tnum">{sub}</div>}
    </>
  );
  return href
    ? <Link href={href} title={hint} className="block bg-deck px-4 py-3 hover:bg-deck2 focus-visible:bg-deck2">{body}</Link>
    : <div title={hint} className="bg-deck px-4 py-3">{body}</div>;
}

export default function SeasonOutlook({ team, hist, sims }: { team: TeamSummary; hist: TeamDetail["winHist"]; sims: number }) {
  const sim = team.sim;
  if (!sim) return <p className="text-sm text-mute">No season simulation is available for this team yet.</p>;
  return (
    <div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        <Tile label="Expected wins" value={fmt(sim.wins, 1)} sub={<>80% range {sim.p10}–{sim.p90}</>}
          hint={`Average final win total across ${sims.toLocaleString()} simulations; 10% of runs finish at ${sim.p10} or fewer, 10% at ${sim.p90} or more`} />
        <Tile label="Conference wins" value={fmt(sim.confWins, 1)} sub={<>{team.confName} regular season</>} href={`/conferences/${team.confSlug}/#standings-h`}
          hint="Expected final conference wins (regular season)" />
        <Tile label="Conference title" value={pctFmt(sim.title)} sub={<>Outright {pctFmt(sim.outright)}</>} href={`/conferences/${team.confSlug}/#standings-h`}
          hint="Share of simulations finishing first in the conference regular season (ties share the title); outright = alone in first" />
        <Tile label="20+ wins" value={pctFmt(sim.win20)} sub={<>Now {team.w}–{team.l}</>} hint="Share of simulations where the team finishes with at least 20 wins (all games, including non-D-I)" />
      </div>
      {hist && hist.counts.length > 0 && (
        <figure className="mt-5">
          {/* Two sizes so labels stay legible: wide on tablet/desktop, narrow on phones. */}
          <div className="hidden sm:block"><WinChart sim={sim} hist={hist} w={team.w} l={team.l} W={900} H={210} /></div>
          <div className="sm:hidden"><WinChart sim={sim} hist={hist} w={team.w} l={team.l} W={380} H={190} /></div>
          <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-ink/60 align-middle" />80% of simulations ({sim.p10}–{sim.p90} wins)</span>
            <span><i className="mr-1 inline-block h-2.5 w-[2px] bg-off align-middle" />Expected {fmt(sim.wins, 1)}</span>
            <span>Most likely {hist.counts.indexOf(Math.max(...hist.counts)) + hist.from} wins ({pctFmt(Math.max(...hist.counts))})</span>
          </figcaption>
        </figure>
      )}
    </div>
  );
}

function WinChart({ sim, hist, w, l, W, H }: { sim: Sim; hist: NonNullable<TeamDetail["winHist"]>; w: number; l: number; W: number; H: number }) {
  const { from, counts } = hist;
  const hi = from + counts.length - 1;
  // Keep the current win total on the axis; if it sits far left of the distribution, break the axis.
  const broken = from - w > 3;
  const lo = broken ? from : Math.min(w, from);
  const nSlots = (broken ? 2 : 0) + (hi - lo + 1);
  const slot = (k: number) => (broken ? (k === w ? 0 : 2 + k - from) : k - lo);
  const padL = 4, padR = 4, top = 26, base = H - 40;
  const sw = (W - padL - padR) / nSlots;
  const cx = (i: number) => padL + sw * (i + 0.5);
  const max = Math.max(...counts);
  const y = (p: number) => base - (p / max) * (base - top);
  const step = Math.max(1, Math.ceil(nSlots / (W / 30)));
  const expX = (() => { // expected wins, interpolated between slots
    const k = Math.min(hi, Math.max(lo, sim.wins));
    return padL + sw * (slot(Math.floor(k)) + 0.5 + (k - Math.floor(k)));
  })();
  const twenty = 20 >= from && 20 <= hi ? cx(slot(20)) - sw / 2 : null;
  const mode = counts.indexOf(max) + from;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
        aria-label={`Final win total distribution: most likely ${mode} wins, expected ${sim.wins.toFixed(1)}, 80% range ${sim.p10} to ${sim.p90}`}>
        <line x1={padL} x2={W - padR} y1={base} y2={base} stroke="var(--line-2)" />
        {twenty !== null && (
          <g>
            <line x1={twenty} x2={twenty} y1={top - 14} y2={base} stroke="var(--line-2)" strokeDasharray="3 3" />
            <text x={twenty + 4} y={top - 6} fontSize="11" fill="var(--mute)">20+ wins {pctFmt(sim.win20)}</text>
          </g>
        )}
        {counts.map((p, i) => {
          const k = from + i, x = cx(slot(k)), inBand = k >= sim.p10 && k <= sim.p90;
          const h = Math.max(p > 0 ? 1.5 : 0, base - y(p));
          return (
            <g key={k}>
              <title>{`${k} wins: ${(p * 100).toFixed(1)}% of simulations`}</title>
              <rect x={x - sw * 0.38} y={base - h} width={sw * 0.76} height={h} rx="1.5" fill={inBand ? "var(--ink)" : "var(--mute)"} opacity={inBand ? 0.6 : 0.28} />
            </g>
          );
        })}
        {/* expected wins */}
        <line x1={expX} x2={expX} y1={top - 2} y2={base} stroke="var(--off)" strokeWidth="1.5" />
        {/* x ticks */}
        {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter(k => (k - lo) % step === 0 || k === w).map(k => (
          <text key={k} x={cx(slot(k))} y={base + 15} textAnchor="middle" fontSize="11" fill={k === w ? "var(--ink)" : "var(--dim)"} fontWeight={k === w ? 700 : 400}>{k}</text>
        ))}
        {broken && (
          <g>
            <text x={cx(0)} y={base + 15} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)">{w}</text>
            <rect x={cx(1) - sw / 2} y={base - 3} width={sw} height="6" fill="var(--deck)" />
            <path d={`M ${cx(1) - 5} ${base + 5} l 4 -10 M ${cx(1) + 1} ${base + 5} l 4 -10`} stroke="var(--dim)" strokeWidth="1.2" />
          </g>
        )}
        {/* current record marker */}
        <g>
          <line x1={cx(slot(w))} x2={cx(slot(w))} y1={base - 34} y2={base} stroke="var(--ink)" strokeWidth="1.5" />
          <circle cx={cx(slot(w))} cy={base - 34} r="3" fill="var(--ink)" />
          <text x={cx(slot(w)) + (slot(w) < nSlots / 2 ? 6 : -6)} y={base - 38} textAnchor={slot(w) < nSlots / 2 ? "start" : "end"} fontSize="11" fontWeight="600" fill="var(--ink)">Now {w}–{l}</text>
        </g>
        <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--mute)">Final wins</text>
    </svg>
  );
}
