"use client";
// Home hero, Apple Sports style: the day's title and date strip, followed teams as circles,
// the best game on a scoreboard card, the rest of the worthwhile games as grouped rows, and
// last night's finals. On today's slate ESPN's live scores are laid over the static data.
import Link from "next/link";
import { useMemo } from "react";
import { Plus } from "lucide-react";
import TeamLogo from "@/components/team-logo";
import TvBadges from "@/components/tv-badges";
import { Dots } from "@/components/dots";
import { dayLabel, etToday, fmt, pctFmt, timeLabel } from "@/lib/format";
import { useJson } from "@/lib/client-data";
import { toggleFavorite, useFavorites } from "@/lib/favorites";
import { useLiveScores, withLive, type LiveGame } from "@/lib/live";
import type { Game, GameDay, GameIndex, GameSide, TeamSummary } from "@/lib/types";

const gameHref = (day: string, id: string) => `/games/?d=${day}&g=${id}`;
const etDayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Team colour lifted toward white so navy and black teams still show on a dark card. */
const teamTint = (c: string | null) => (c ? `color-mix(in oklab, ${c} 78%, white)` : "var(--line-2)");

function pickDay(index: GameIndex) {
  const today = etToday();
  const days = index.days.filter(d => d.games > 0);
  return days.find(d => d.day === today)?.day ?? days.find(d => d.day > today)?.day ?? days.at(-1)?.day ?? null;
}

function status(g: Game, live?: LiveGame) {
  if (g.status === "in_progress") return { text: live?.label || "Live", live: true };
  if (g.status === "final") return { text: live?.label || "Final", live: false };
  if (g.status === "scheduled") return { text: timeLabel(g.date), live: false };
  return { text: g.status.replace("_", " ").replace(/^\w/, c => c.toUpperCase()), live: false };
}

export default function Today() {
  const index = useJson<GameIndex>("games/index.json");
  const day = index.data ? pickDay(index.data) : null;
  const slate = useJson<GameDay>(day ? `games/${day}.json` : null);
  const prevDay = useMemo(() => (index.data && day ? index.data.days.filter(d => d.day < day && d.finals > 0).at(-1)?.day ?? null : null), [index.data, day]);
  const prev = useJson<GameDay>(prevDay ? `games/${prevDay}.json` : null);
  const isToday = day === etToday();
  const staticGames = slate.status === "ready" && slate.data.day === day ? slate.data.games : null;
  const live = useLiveScores(isToday ? day : null, staticGames);
  const games = useMemo(() => {
    const list = (staticGames ?? []).map(g => withLive(g, live.byGame.get(g.id)));
    const liveFirst = (g: Game) => (g.status === "in_progress" ? 0 : 1);
    return list.sort((a, b) => liveFirst(a) - liveFirst(b) || (b.watch ?? 0) - (a.watch ?? 0));
  }, [staticGames, live.byGame]);
  const showable = (g: Game) => g.status === "scheduled" || g.status === "in_progress" || g.status === "final";
  const best = games.find(g => showable(g) && g.pred && g.home.id && g.away.id) ?? games.find(showable) ?? games[0];
  const rest = games.filter(g => g !== best).slice(0, 6);
  const liveCount = games.filter(g => g.status === "in_progress").length;
  const finals = useMemo(() => {
    const list = (prev.data?.games ?? []).filter(g => g.status === "final" && g.home.score !== null && g.away.score !== null && g.home.id && g.away.id);
    const upsets = list.filter(g => g.upset !== null).sort((a, b) => a.upset! - b.upset!);
    const top = [...list].sort((a, b) => (b.watch ?? 0) - (a.watch ?? 0));
    return [...new Set([...upsets.slice(0, 1), ...top])].slice(0, 2);
  }, [prev.data]);
  const failed = index.status === "error" || slate.status === "error";

  return (
    <section aria-labelledby="today-h" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="today-h" className="font-display text-[2.75rem] font-black leading-[0.95] sm:text-[3.25rem]">
            {day ? dayLabel(day, { weekday: "long" }) : "Today"}
          </h1>
          <p className="mt-1.5 text-[15px] font-medium text-mute">
            {day ? dayLabel(day, { month: "long", day: "numeric" }) : "Loading the slate"}
            {staticGames ? <>, {games.length} games</> : null}
            {liveCount ? <span className="font-semibold text-hot">, {liveCount} live</span> : null}
          </p>
        </div>
        {day && <Link href={`/games/?d=${day}`} className="btn hidden sm:inline-flex">Full scoreboard</Link>}
      </div>

      {day && <DateStrip day={day} today={isToday} />}
      <FollowedCircles games={games} day={day} />

      {failed ? (
        <p className="deck p-4 text-sm text-mute">The schedule feed didn’t load. <button className="underline" onClick={() => { index.retry(); slate.retry(); }}>Try again</button></p>
      ) : !staticGames ? (
        <div className="grid gap-4 lg:grid-cols-2"><div className="deck h-[240px] animate-pulse" /><div className="deck h-[240px] animate-pulse" /></div>
      ) : !games.length ? (
        <p className="deck p-5 text-sm text-mute">No games on this day. <Link className="underline" href="/games/">Pick another date</Link>.</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2 lg:grid-rows-[auto_1fr] [&>*]:min-w-0">
          {best && <Scoreboard g={best} day={day!} live={live.byGame.get(best.id)} top={isToday ? "Best game tonight" : "Best game"} />}
          {rest.length > 0 && (
            <div className="lg:row-span-2">
              <div className="mb-2.5 flex items-baseline justify-between">
                <h2 className="h-section">Worth your time</h2>
                <Link href={`/games/?d=${day}`} className="text-sm font-semibold text-bulb-ink">All {games.length}</Link>
              </div>
              <ul className="overflow-hidden rounded-[18px] bg-deck">
                {rest.map(g => <GameRow key={g.id} g={g} day={day!} live={live.byGame.get(g.id)} />)}
              </ul>
            </div>
          )}
          {finals.length > 0 && prevDay && (
            <div>
              <div className="mb-2.5 flex items-baseline justify-between">
                <h2 className="h-section">{addDays(prevDay, 1) === day ? "Last night" : dayLabel(prevDay, { weekday: "long" })}</h2>
                <Link href={`/games/?d=${prevDay}`} className="text-sm font-semibold text-bulb-ink">All {dayLabel(prevDay, { weekday: "long" })} games</Link>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 [&>*]:min-w-0">
                {finals.map(g => <FinalCard key={g.id} g={g} day={prevDay} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DateStrip({ day, today }: { day: string; today: boolean }) {
  const days = [-2, -1, 0, 1, 2, 3].map(n => addDays(day, n));
  return (
    <nav aria-label="Dates" className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
      {days.map(d => {
        const cur = d === day;
        return (
          <Link key={d} href={cur ? "/" : `/games/?d=${d}`} aria-current={cur ? "date" : undefined}
            className={`flex min-w-[52px] flex-1 flex-col items-center rounded-xl py-2 transition-colors sm:max-w-[96px] ${cur ? "bg-ink text-night" : "text-mute hover:bg-deck"}`}>
            <span className="text-xs font-semibold">{cur && today ? "Today" : dayLabel(d, { weekday: "short" })}</span>
            <span className={`font-display text-xl font-bold leading-tight ${cur ? "" : d > day ? "text-ink" : ""}`}>{Number(d.slice(8))}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function FollowedCircles({ games, day }: { games: Game[]; day: string | null }) {
  const fav = useFavorites();
  const teams = useJson<TeamSummary[]>("teams.json");
  const list = useMemo(() => {
    const bySlug = new Map((teams.data ?? []).map(t => [t.slug, t]));
    return fav.teams.map(s => bySlug.get(s)).filter((t): t is TeamSummary => !!t);
  }, [teams.data, fav.teams]);
  const bySlug = useMemo(() => {
    const m = new Map<string, Game>();
    for (const g of games) { if (g.home.slug) m.set(g.home.slug, g); if (g.away.slug) m.set(g.away.slug, g); }
    return m;
  }, [games]);
  // Nobody followed yet: offer the top teams as one-tap follows, Apple Sports style.
  if (!fav.teams.length) {
    const top = (teams.data ?? []).filter(t => t.rank).sort((a, b) => a.rank! - b.rank!).slice(0, 10);
    if (!top.length) return null;
    return (
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-display text-[22px] font-extrabold leading-none">Pick your teams</h2>
          <Link href="/rankings/" className="text-sm font-semibold text-bulb-ink">All teams</Link>
        </div>
        <ul aria-label="Suggested teams to follow" className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
          {top.map(t => (
            <li key={t.id} className="w-[64px] shrink-0">
              <button type="button" onClick={() => toggleFavorite("teams", t.slug)} className="group flex w-full flex-col items-center gap-1.5 text-center" aria-label={`Follow ${t.name}`}>
                <span className="relative grid h-[60px] w-[60px] place-items-center rounded-full bg-deck transition-transform group-active:scale-90" style={{ boxShadow: `inset 0 0 0 2px ${teamTint(t.color)}` }}>
                  <TeamLogo src={t.logo} name={t.name} size={36} />
                  <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-bulb text-scoreboard ring-2 ring-night" aria-hidden><Plus size={12} strokeWidth={3} /></span>
                </span>
                <span className="w-full truncate text-[11.5px] font-semibold text-mute">{t.short ?? t.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <ul aria-label="Your teams" className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
      {list.map(t => {
        const g = bySlug.get(t.slug);
        const playing = g && g.status !== "final" && g.status !== "canceled";
        let label: React.ReactNode;
        if (g && g.status === "in_progress") label = <span className="text-hot">{g.away.score}-{g.home.score}</span>;
        else if (g && g.status === "final") { const mine = g.home.slug === t.slug ? g.home : g.away, opp = mine === g.home ? g.away : g.home; label = <span>{(mine.score ?? 0) > (opp.score ?? 0) ? "W" : "L"} {mine.score}-{opp.score}</span>; }
        else if (g && g.status === "scheduled") label = <span className="text-bulb-ink">{timeLabel(g.date)}</span>;
        else if (t.next) label = <span>{dayLabel(etDayOf(t.next.date), { weekday: "short" })} {t.next.venue === "A" ? "at" : "vs"} {t.next.opp}</span>;
        else label = <span>Off</span>;
        return (
          <li key={t.id} className="w-[64px] shrink-0">
            <Link href={g && day ? gameHref(day, g.id) : `/teams/${t.slug}/`} className="group flex flex-col items-center gap-1.5 text-center">
              <span className="grid h-[60px] w-[60px] place-items-center rounded-full bg-deck transition-transform group-active:scale-90" style={{ boxShadow: `inset 0 0 0 ${playing ? 2.5 : 2}px ${playing ? "var(--bulb)" : teamTint(t.color)}` }}>
                <TeamLogo src={t.logo} name={t.name} size={36} />
              </span>
              <span className="w-full truncate text-[11.5px] font-semibold text-mute">{label}</span>
              <span className="sr-only">{t.name}</span>
            </Link>
          </li>
        );
      })}
      <li className="w-[64px] shrink-0">
        <Link href="/rankings/" className="flex flex-col items-center gap-1.5 text-center">
          <span className="grid h-[60px] w-[60px] place-items-center rounded-full border-2 border-dashed border-line2 text-mute"><Plus size={20} aria-hidden /></span>
          <span className="text-[11.5px] font-semibold text-mute">Follow</span>
        </Link>
      </li>
    </ul>
  );
}

function why(g: Game) {
  if (!g.pred) return null;
  const m = Math.abs(g.pred.margin);
  const unbeaten = (s: GameSide) => !!s.record && /^\d+-0$/.test(s.record) && s.record !== "0-0";
  const top25 = (s: GameSide) => (s.rank ?? 999) <= 25;
  if (unbeaten(g.home) && unbeaten(g.away)) return `Both unbeaten. Margin: ${fmt(m, 1)} pts`;
  if (top25(g.home) && top25(g.away)) return `Two top-25 teams, ${fmt(m, 1)}-point margin`;
  return m < 3 ? `Projected within ${fmt(Math.max(1, Math.ceil(m)), 0)} pts` : `${g.pred.margin >= 0 ? g.home.name : g.away.name} by ${fmt(m, 1)}`;
}

function Scoreboard({ g, day, live, top }: { g: Game; day: string; live?: LiveGame; top: string }) {
  const st = status(g, live);
  const scheduled = g.status === "scheduled";
  const score = (k: "home" | "away") => (scheduled ? (g.pred ? Math.round(g.pred[k]) : null) : g[k].score);
  const awayWP = g.pred ? 1 - g.pred.wp : null;
  return (
    <article className="press relative rounded-[22px] border border-line bg-deck p-[18px]">
      <Link href={gameHref(day, g.id)} className="absolute inset-0 rounded-[22px]" aria-label={`${g.away.name} ${g.neutral ? "vs" : "at"} ${g.home.name}, open game`} />
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-medium text-mute">{top}</span>
        <span className="flex items-center gap-2 font-semibold">{st.live && <span className="live-dot" aria-hidden />}<span className={st.live ? "text-hot" : ""}>{st.text}</span>{g.tv?.length && (scheduled || g.status === "in_progress") ? <span className="relative z-[1]"><TvBadges tv={g.tv} max={1} /></span> : null}</span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <Side s={g.away} />
        <div className="flex flex-col items-center gap-1">
          <div className="plate flex items-center gap-2.5 px-3 py-2">
            <Dots glow ghost className="text-[40px]">{String(score("away") ?? "--")}</Dots>
            <Dots dim className="text-[20px]">:</Dots>
            <Dots glow ghost className="text-[40px]">{String(score("home") ?? "--")}</Dots>
          </div>
          <span className="text-[11px] font-medium text-mute">{scheduled ? "projected" : g.status === "final" ? "final" : g.status === "in_progress" ? "live" : st.text}</span>
        </div>
        <Side s={g.home} />
      </div>
      {g.pred && awayWP !== null && (
        <div className="mt-3">
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-label={`Win probability: ${g.away.name} ${pctFmt(awayWP)}, ${g.home.name} ${pctFmt(g.pred.wp)}`}>
            <div style={{ width: `${awayWP * 100}%`, background: teamTint(g.away.color) }} />
            <div className="flex-1" style={{ background: teamTint(g.home.color) }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[13px]">
            <b className="tnum">{pctFmt(awayWP)}</b>
            <span className="truncate text-mute">{scheduled ? why(g) : `Pregame: ${pctFmt(Math.max(g.pred.wp, awayWP))} favorite`}</span>
            <b className="tnum">{pctFmt(g.pred.wp)}</b>
          </div>
        </div>
      )}
    </article>
  );
}

function Side({ s }: { s: GameSide }) {
  const inner = (
    <>
      <TeamLogo src={s.logo} name={s.name} size={52} />
      <span className="mt-1.5 max-w-[104px] truncate font-display text-[19px] font-extrabold leading-tight">{s.name}</span>
      <span className="text-xs text-mute">{[s.rank ? `No. ${s.rank}` : null, s.record].filter(Boolean).join(", ")}</span>
    </>
  );
  return s.slug
    ? <Link href={`/teams/${s.slug}/`} className="relative z-[1] flex w-[104px] flex-col items-center text-center hover:opacity-90">{inner}</Link>
    : <div className="flex w-[104px] flex-col items-center text-center">{inner}</div>;
}

function GameRow({ g, day, live }: { g: Game; day: string; live?: LiveGame }) {
  const st = status(g, live);
  const played = g.status === "final" || g.status === "in_progress";
  const fav = g.pred ? (g.pred.wp >= 0.5 ? g.home : g.away) : null;
  const favWP = g.pred ? Math.max(g.pred.wp, 1 - g.pred.wp) : null;
  const line = (s: GameSide, win: boolean) => (
    <div className="flex items-center gap-2">
      <i className="h-[18px] w-1 shrink-0 rounded-full" style={{ background: teamTint(s.color) }} aria-hidden />
      <span className="w-6 text-right text-[11px] font-semibold text-dim tnum">{s.rank ?? ""}</span>
      <span className={`truncate font-display text-[19px] font-extrabold leading-tight ${played && !win ? "text-mute" : ""}`}>{s.name}</span>
      <span className="shrink-0 text-xs text-dim">{s.record}</span>
      {played && <Dots dim={!win} className="ml-auto text-[19px]">{s.score ?? ""}</Dots>}
    </div>
  );
  const awayWin = (g.away.score ?? 0) > (g.home.score ?? 0);
  return (
    <li className="relative flex items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-0 hover:bg-deck2 active:bg-deck2">
      <Link href={gameHref(day, g.id)} className="absolute inset-0" aria-label={`${g.away.name} ${g.neutral ? "vs" : "at"} ${g.home.name}, open game`} />
      <div className="min-w-0 flex-1 space-y-1.5">{line(g.away, awayWin)}{line(g.home, !awayWin)}</div>
      {!played ? (
        <>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-sm font-bold tnum">{st.text}</span>
            <span className="max-w-[78px] truncate text-xs text-mute">{g.tv?.[0]?.name ?? "No TV listed"}</span>
          </div>
          {fav && favWP !== null && (
            <div className="flex w-[50px] shrink-0 flex-col items-end">
              <span className="font-display text-xl font-extrabold tnum">{Math.round(favWP * 100)}%</span>
              <span className="text-[11px] text-mute">{fav.short ?? ""}</span>
            </div>
          )}
        </>
      ) : (
        <span className={`w-[52px] shrink-0 text-right text-xs font-semibold ${st.live ? "text-hot" : "text-mute"}`}>{st.text}</span>
      )}
    </li>
  );
}

function FinalCard({ g, day }: { g: Game; day: string }) {
  const homeWon = (g.home.score ?? 0) > (g.away.score ?? 0);
  const w = homeWon ? g.home : g.away, l = homeWon ? g.away : g.home;
  const wWP = g.pred ? (homeWon ? g.pred.wp : 1 - g.pred.wp) : null;
  const note = g.upset !== null ? `${w.name} had a ${pctFmt(g.upset)} chance` : wWP !== null ? `${w.name} was a ${pctFmt(wWP)} favorite` : null;
  return (
    <article className="press relative flex flex-col gap-2 rounded-[18px] bg-deck px-4 py-3 hover:bg-deck2">
      <Link href={gameHref(day, g.id)} className="absolute inset-0 rounded-[18px]" aria-label={`${w.name} ${w.score}, ${l.name} ${l.score}. Open game`} />
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-mute">Final</span>
        {g.upset !== null ? <span className="rounded-md bg-bulb px-2 py-0.5 text-[11px] font-bold text-scoreboard">Upset</span> : <span className="font-semibold text-mute">{g.neutral ? "Neutral site" : `at ${g.home.name}`}</span>}
      </div>
      {[w, l].map((s, i) => (
        <div key={i} className="flex items-center justify-between gap-2">
          <span className={`truncate font-display text-[19px] leading-tight ${i ? "font-bold text-mute" : "font-extrabold"}`}>{s.name}</span>
          <Dots dim={i === 1} className="text-[24px]">{s.score}</Dots>
        </div>
      ))}
      {note && <span className="text-xs text-mute">{note}</span>}
    </article>
  );
}
