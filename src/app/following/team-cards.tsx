"use client";
// Followed-team cards: full card for /following/, compact card for the home strip.
import Link from "next/link";
import FavoriteButton from "@/components/favorite-button";
import TeamLogo from "@/components/team-logo";
import { dayLabel, fmt, pctFmt, timeLabel } from "@/lib/format";
import type { TeamSummary } from "@/lib/types";

/** Eastern calendar day (YYYY-MM-DD) of an ISO timestamp — the key used by /games/?d=. */
export const etDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
export const gameHref = (iso: string, id: string) => `/games/?d=${etDay(iso)}&g=${id}`;

function NextGame({ t, compact }: { t: TeamSummary; compact?: boolean }) {
  const n = t.next;
  if (!n) return <p className="text-xs text-mute">No game scheduled</p>;
  const when = `${dayLabel(etDay(n.date), { weekday: "short", month: "short", day: "numeric" })}${compact ? "" : ` · ${timeLabel(n.date)}`}`;
  return (
    <p className="relative z-[1] flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[13px] text-mute">
      <Link href={gameHref(n.date, n.id)} className="hover:text-ink hover:underline">{when}</Link>
      <span className="min-w-0 truncate">
        {n.venue === "A" ? "at" : "vs"}{" "}
        {n.oppRank ? <span className="text-dim tnum">{n.oppRank} </span> : null}
        {n.oppSlug ? <Link href={`/teams/${n.oppSlug}/`} className="font-medium text-ink hover:text-off">{n.opp}</Link> : <span className="text-ink">{n.opp}</span>}
        {n.venue === "N" ? <span className="text-dim"> (neutral)</span> : null}
      </span>
      {n.wp !== null && <Link href={gameHref(n.date, n.id)} className="font-semibold text-ink tnum hover:underline" title="Pregame win probability">{pctFmt(n.wp)}</Link>}
    </p>
  );
}

function Form({ t }: { t: TeamSummary }) {
  const last = t.last.slice(-5);
  if (!last.length) return null;
  return (
    <ul className="flex gap-1" aria-label="Last results, oldest first">
      {last.map((g, i) => (
        <li key={i} className={`grid h-5 w-5 place-items-center rounded text-[10.5px] font-bold ${g.r === "W" ? "bg-win/15 text-win" : "bg-loss/15 text-loss"}`} title={`${g.r === "W" ? "Won" : "Lost"} by ${Math.abs(g.m)}`}>{g.r}</li>
      ))}
    </ul>
  );
}

export function TeamCard({ t }: { t: TeamSummary }) {
  return (
    <article className="deck relative flex flex-col gap-3 p-4 transition-colors hover:border-line2 focus-within:border-line2">
      <div className="flex items-start gap-3">
        <TeamLogo src={t.logo} name={t.name} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="flex items-baseline gap-2 text-[17px] font-semibold leading-tight">
            {t.rank ? <span className="text-sm font-medium text-mute tnum" title="DHR rank">{t.rank}</span> : null}
            <Link href={`/teams/${t.slug}/`} className="link truncate after:absolute after:inset-0 after:rounded-[10px] after:content-['']">{t.name}</Link>
          </h3>
          <p className="mt-0.5 text-xs text-mute">
            <Link href={`/conferences/${t.confSlug}/`} className="relative z-[1] hover:text-ink hover:underline">{t.confName}</Link>
            {" · "}<b className="font-semibold text-ink">{t.w}–{t.l}</b>{" · "}{t.cw}–{t.cl} conf{t.streak ? ` · ${t.streak}` : ""}
          </p>
        </div>
        <div className="relative z-[1] -mr-1 -mt-1"><FavoriteButton kind="teams" id={t.slug} name={t.name} compact /></div>
      </div>
      <NextGame t={t} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3 text-xs text-mute">
        <Form t={t} />
        {t.sim ? (
          <span title="10,000 season simulations: expected wins (10th–90th percentile) and conference title share">
            <b className="text-ink tnum">{fmt(t.sim.wins, 1)}</b> exp. wins <span className="tnum">({t.sim.p10}–{t.sim.p90})</span> · <b className="text-ink tnum">{pctFmt(t.sim.title)}</b> title
          </span>
        ) : <span>Proj {fmt(t.projW)}–{fmt(t.projL)}</span>}
      </div>
    </article>
  );
}

export function TeamChip({ t }: { t: TeamSummary }) {
  return (
    <article className="deck-flat relative flex h-full w-[248px] shrink-0 flex-col gap-1.5 px-3 py-2.5 transition-colors hover:border-line2 focus-within:border-line2">
      <div className="flex items-center gap-2.5">
        <TeamLogo src={t.logo} name={t.name} size={26} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            {t.rank ? <span className="text-xs text-mute tnum">{t.rank}</span> : null}
            <Link href={`/teams/${t.slug}/`} className="link truncate font-semibold after:absolute after:inset-0 after:content-['']">{t.name}</Link>
          </span>
        </span>
        <b className="text-sm tnum">{t.w}–{t.l}</b>
      </div>
      <NextGame t={t} compact />
    </article>
  );
}
