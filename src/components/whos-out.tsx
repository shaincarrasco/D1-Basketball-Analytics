"use client";
// Compact "Who's out" for one or two teams: who is off the floor, how we know, and what it costs.
import Link from "next/link";
import InjuryPill, { ConfidenceTag } from "@/components/injury-pill";
import { OUT_STATES, STATE_ORDER, SOURCE_LABEL, STATE_SHORT, etaText, lossText, pct } from "@/lib/injuries";
import type { InjuryFile, InjuryRow, TeamHealth } from "@/lib/types";

export type WhosOutTeam = { slug: string; name: string };

/** Per-team summary for subtle badges on game cards. */
export type KeyAbsence = { out: number; netLoss: number; names: string[]; inferredOnly: boolean };

const MPG_KEY = 15;
const isKey = (r: InjuryRow) => OUT_STATES.has(r.state) && ((r.impact.mpg ?? 0) >= MPG_KEY || r.confidence !== "inferred");

/** slug → key absences (out with mpg ≥ 15, or any confirmed/reported out). Teams with none are left out of the map. */
export function keyAbsences(file: InjuryFile | null | undefined): Map<string, KeyAbsence> {
  const m = new Map<string, KeyAbsence>();
  if (!file) return m;
  const health = new Map<string, TeamHealth>(file.teams.map(t => [t.slug, t]));
  for (const r of file.rows) {
    if (!isKey(r)) continue;
    const e = m.get(r.slug) ?? { out: 0, netLoss: health.get(r.slug)?.netLoss ?? 0, names: [], inferredOnly: true };
    e.out++;
    e.names.push(`${r.name} (${r.status})`);
    if (r.confidence !== "inferred") e.inferredOnly = false;
    m.set(r.slug, e);
  }
  return m;
}

/** Absences worth showing for one team: out first, then questionable / day-to-day; "monitor" only when nothing else. */
export function teamAbsences(rows: InjuryRow[], slug: string): InjuryRow[] {
  const mine = rows.filter(r => r.slug === slug);
  const real = mine.filter(r => r.state !== "monitor");
  const list = real.length ? real : mine;
  return [...list].sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || (b.impact.mpg ?? 0) - (a.impact.mpg ?? 0));
}

function Row({ r }: { r: InjuryRow }) {
  const href = r.pid ? `/player/?id=${r.pid}` : `/teams/${r.slug}/`;
  const timeline = [r.body, etaText(r)].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-line px-3 py-2.5 first:border-t-0">
      <InjuryPill state={r.state} label={r.state === "missed" ? "Missed" : r.status.length > 22 ? STATE_SHORT[r.state] : r.status} size="sm" />
      <span className="min-w-0 flex-1">
        <Link href={href} className="link block truncate font-display text-[17px] font-bold leading-tight">{r.name}</Link>
        <span className="block truncate text-[12px] text-mute">
          {r.confidence === "inferred" && r.state === "missed" ? "Reason not reported" : timeline || SOURCE_LABEL[r.source]}
        </span>
      </span>
      {r.impact.mpg != null && (
        <span className="text-right text-[12px] leading-tight text-mute tnum" title="Minutes and points per game this season">
          {r.impact.mpg.toFixed(0)} mpg{r.impact.ppg != null ? <> · {r.impact.ppg.toFixed(1)} ppg</> : null}
        </span>
      )}
      <ConfidenceTag value={r.confidence} />
    </li>
  );
}

function Side({ team, rows, health, heading }: { team: WhosOutTeam; rows: InjuryRow[]; health: TeamHealth | undefined; heading: boolean }) {
  const list = teamAbsences(rows, team.slug);
  return (
    <div className="deck-flat overflow-hidden">
      {heading && <h4 className="border-b border-line px-3 py-2 text-[13.5px] font-semibold"><Link href={`/teams/${team.slug}/`} className="link">{team.name}</Link></h4>}
      {list.length === 0 ? (
        <p className="px-3 py-3 text-sm text-mute">No absences flagged{heading ? "" : ` for ${team.name}`}.</p>
      ) : (
        <ul aria-label={`${team.name} absences`}>{list.map(r => <Row key={r.key} r={r} />)}</ul>
      )}
      {health && health.out > 0 && health.minShare > 0 && (
        <p className="border-t border-line px-3 py-2 text-[12px] text-mute tnum">
          Missing <b className="text-ink">{pct(health.minShare)}</b> of minutes{health.netLoss >= 0.05 ? <> · est. <b className="text-ink">{lossText(health.netLoss)} pts/100</b></> : null}
        </p>
      )}
    </div>
  );
}

export default function WhosOut({ file, teams }: { file: InjuryFile | null; teams: WhosOutTeam[] }) {
  if (!file) return <p className="text-sm text-mute">Loading availability…</p>;
  const health = new Map(file.teams.map(t => [t.slug, t]));
  return (
    <div>
      <div className={`grid gap-3 ${teams.length > 1 ? "md:grid-cols-2" : ""}`}>
        {teams.map(t => <Side key={t.slug} team={t} rows={file.rows} health={health.get(t.slug)} heading={teams.length > 1} />)}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 text-[12px] text-dim">
        <span>From ESPN&apos;s injury list, news reports and box scores. Box-score absences carry no reason.</span>
        <Link href="/injuries/" className="link ml-auto font-semibold text-bulb-ink">All injuries →</Link>
      </p>
    </div>
  );
}
