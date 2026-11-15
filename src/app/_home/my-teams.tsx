"use client";
// "My teams": the reader's followed teams as cards on the home page (record, DHR rank, streak,
// next game, injuries). Renders nothing until teams.json has loaded and when no team is followed,
// so the home page is unchanged for new readers. Every card has the same fixed-height lines,
// so a missing line is an empty line of the same height and the cards stay rigid.
import Link from "next/link";
import { useMemo } from "react";
import TeamLogo from "@sports/ui/team-logo";
import { DHR_RANK_TITLE, dayLabel, pctFmt, record, venueWord } from "@sports/ui/format";
import { useJson } from "@sports/ui/client-data";
import { useFavorites } from "@/lib/favorites";
import type { TeamSummary } from "@/lib/types";

const MAX_TEAMS = 8;
const etDayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));

export default function MyTeams() {
  const fav = useFavorites();
  const teams = useJson<TeamSummary[]>("teams.json");
  const list = useMemo(() => {
    const bySlug = new Map((teams.data ?? []).map(t => [t.slug, t]));
    return fav.teams.map(s => bySlug.get(s)).filter((t): t is TeamSummary => !!t).slice(0, MAX_TEAMS);
  }, [teams.data, fav.teams]);

  if (!list.length) return null;

  return (
    <section aria-labelledby="my-teams-h">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 id="my-teams-h" className="h-section">My teams</h2>
        <Link href="/following/" className="text-sm font-semibold text-bulb-ink">Edit</Link>
      </div>
      <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
        {list.map(t => (
          <li key={t.id} className="contents">
            <TeamCard t={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeamCard({ t }: { t: TeamSummary }) {
  const streakWins = t.streak ? Number(t.streak.slice(1)) : 0;
  const streak = streakWins >= 2 ? t.streak : null;
  const out = t.health?.out ?? 0;
  return (
    <Link href={`/teams/${t.slug}/`} className="press deck flex w-[78%] shrink-0 snap-start flex-col gap-2 p-4 sm:w-auto">
      <div className="flex min-w-0 items-center gap-3">
        <TeamLogo src={t.logo} name={t.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[19px] font-extrabold leading-tight">{t.name}</div>
          <div className="h-5 truncate text-xs leading-5 text-mute tnum">{record(t.w, t.l)}</div>
        </div>
      </div>

      <div className="flex h-5 items-center justify-between gap-2 text-[13px] leading-5">
        <span className="truncate text-mute" title={t.rank ? DHR_RANK_TITLE : undefined}>{t.rank ? `DHR No. ${t.rank}` : ""}</span>
        {streak && <span className={`shrink-0 font-semibold ${streak.startsWith("W") ? "text-win" : "text-loss"}`}>{streak} streak</span>}
      </div>

      <div className="h-5 truncate text-[13px] leading-5 text-mute">
        {t.next && (
          <>
            {dayLabel(etDayOf(t.next.date), { weekday: "short" })} {venueWord(t.next.venue)} {t.next.opp}
            {t.next.wp !== null && <> · <b className="font-bold text-ink tnum">{pctFmt(t.next.wp)}</b></>}
          </>
        )}
      </div>

      <div className="h-5 text-[13px] leading-5 font-semibold text-loss">{out > 0 ? `${out} out` : ""}</div>
    </Link>
  );
}
