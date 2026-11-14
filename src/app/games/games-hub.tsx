"use client";
// Scoreboard + predictions hub. URL is the source of truth for the day (?d=) and the open game (?g=);
// Next.js keeps useSearchParams in sync with history.pushState / replaceState.
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Empty, ErrorState, Loading } from "@/components/states";
import { useJson } from "@/lib/client-data";
import { useInjuries } from "@/lib/injury-hooks";
import { keyAbsences } from "@/components/whos-out";
import { liveDay, useLiveScores, withLive } from "@/lib/live";
import { useLiveSummaries, type SummaryTarget } from "@/lib/live-game";
import { bestMoment, type Moment } from "@/lib/moments";
import { dayLabel, etToday, pctFmt, timeLabel } from "@/lib/format";
import type { Game, GameDay, GameIndex } from "@/lib/types";
import DateStrip from "./date-strip";
import GameCard from "./game-card";
import GameSheet from "./game-sheet";
import ProjectionToggle from "@/components/projection-toggle";
import { FILTERS, SORTS, defaultDay, lineInfo, isDay, isLive, liveGames, matchesFilter, nextTip, sortGames, summarize, winner, type FilterId, type SortId } from "./game-utils";

/** A summary older than this (relative to the last scoreboard update) is too stale to quote. */
const SUMMARY_STALE_MS = 3 * 60_000;

function setUrl(mutate: (p: URLSearchParams) => void, mode: "push" | "replace") {
  const p = new URLSearchParams(window.location.search);
  mutate(p);
  const s = p.toString();
  const url = s ? `?${s}` : window.location.pathname;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

export default function GamesHub() {
  const params = useSearchParams();
  const index = useJson<GameIndex>("games/index.json");
  const today = useMemo(() => etToday(), []);

  const dParam = params.get("d");
  const gParam = params.get("g");
  const liveView = params.get("live") === "1";
  const home = index.data ? defaultDay(index.data, today) : null;
  const day = isDay(dParam) ? dParam : home;
  const listed = index.data && day ? index.data.days.find(d => d.day === day && d.games > 0) : undefined;
  const dayData = useJson<GameDay>(listed ? `games/${listed.day}.json` : null);
  // useJson keeps the previous day's data for one render after the file changes.
  const staticGames = dayData.status === "ready" && dayData.data.day === day ? dayData.data.games : null;
  // Today's slate (and recent days the data hasn't caught up on) gets ESPN's live scores laid over the static data.
  const liveFor = liveDay(day, today, staticGames);
  const live = useLiveScores(liveFor, staticGames);
  const games = useMemo(() => (staticGames && live.byGame.size ? staticGames.map(g => withLive(g, live.byGame.get(g.id))) : staticGames), [staticGames, live.byGame]);

  // One cached fetch for every card; failures just mean no badges.
  const injuries = useInjuries();
  const absences = useMemo(() => keyAbsences(injuries.data), [injuries.data]);

  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("time");
  const [conf, setConf] = useState("all");

  const pushed = useRef(false);
  const returnFocus = useRef<string | null>(null);

  const selectDay = useCallback((d: string) => {
    setUrl(p => { p.set("d", d); p.delete("g"); p.delete("live"); }, "replace");
  }, []);
  const setLiveView = useCallback((on: boolean) => {
    setUrl(p => { if (on) p.set("live", "1"); else p.delete("live"); }, "replace");
  }, []);
  const openGame = useCallback((id: string) => {
    returnFocus.current = id;
    pushed.current = true;
    setUrl(p => { if (day) p.set("d", day); p.set("g", id); }, "push");
  }, [day]);
  const closeGame = useCallback(() => {
    if (pushed.current) { pushed.current = false; window.history.back(); }
    else setUrl(p => p.delete("g"), "replace");
  }, []);
  // Back button closes the sheet; return focus to the card that opened it.
  useEffect(() => {
    if (gParam) { returnFocus.current = gParam; return; }
    pushed.current = false;
    const id = returnFocus.current;
    returnFocus.current = null;
    if (id) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-game="${CSS.escape(id)}"] article > button`)?.focus({ preventScroll: true }));
  }, [gParam]);

  const confs = useMemo(() => {
    if (!games) return [];
    const s = new Set<string>();
    for (const g of games) { if (g.home.conf) s.add(g.home.conf); if (g.away.conf) s.add(g.away.conf); }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [games]);
  const confGames = useMemo(() => (games ?? []).filter(g => conf === "all" || g.home.conf === conf || g.away.conf === conf), [games, conf]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(f => [f.id, confGames.filter(g => matchesFilter(g, f.id)).length])) as Record<FilterId, number>, [confGames]);
  const shown = useMemo(() => sortGames(confGames.filter(g => matchesFilter(g, filter)), sort), [confGames, filter, sort]);
  const summary = useMemo(() => (games ? summarize(games) : null), [games]);

  // Live view: games in progress, most exciting first. Play-by-play (ESPN summaries) is fetched
  // only while the Live view is on, for live games only; cards fall back to scoreboard moments.
  const liveList = useMemo(() => liveGames(confGames, live.byGame), [confGames, live.byGame]);
  const targets = useMemo<SummaryTarget[]>(() => (liveView ? liveList : []).flatMap(g => {
    const l = live.byGame.get(g.id);
    return l?.state === "in" && l.espnId ? [{ id: g.id, espnId: l.espnId, orient: { homeTeamId: l.homeTeamId, awayTeamId: l.awayTeamId, home: l.home, away: l.away } }] : [];
  }), [liveView, liveList, live.byGame]);
  const summaries = useLiveSummaries(targets, liveView);
  const moments = useMemo(() => {
    const m = new Map<string, Moment | null>();
    for (const g of games ?? []) {
      if (!isLive(g)) continue;
      const e = summaries.get(g.id);
      const fresh = e && e.data.state === "in" && e.at >= (live.updated ?? 0) - SUMMARY_STALE_MS ? e.data : null;
      m.set(g.id, bestMoment(g, live.byGame.get(g.id), fresh));
    }
    return m;
  }, [games, summaries, live.byGame, live.updated]);
  // Give the first scoreboard poll a moment before saying nothing is live.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!liveView || live.hasData) return;
    const t = setTimeout(() => setWaited(true), 4000);
    return () => clearTimeout(t);
  }, [liveView, live.hasData]);
  const open = gParam && games ? games.find(g => g.id === gParam) ?? null : null;

  if (index.status === "loading") return <Loading label="Loading the schedule" />;
  if (index.status === "error") return <ErrorState message={`The season schedule didn't load: ${index.error}`} retry={index.retry} />;
  if (!day || !home) return <Empty title="No games published yet">The schedule for this season hasn&apos;t been released. Check back closer to tip-off.</Empty>;

  const days = index.data.days;
  const before = [...days].reverse().find(d => d.day < day), after = days.find(d => d.day > day);

  return (
    <div>
      <DateStrip index={index.data} day={day} today={today} home={home} onSelect={selectDay} />

      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="h-section">{dayLabel(day, { weekday: "long", month: "long", day: "numeric" })}{day === today ? <span className="ml-2 text-off">Today</span> : null}</h2>
        {summary && games && <DaySummaryLine s={summary} games={games} onOpen={openGame} liveData={live.hasData} updated={live.updated} />}
      </div>

      {!listed ? (
        <Empty title={`No Division I games on ${dayLabel(day)}`}>
          <p>Pick another day from the strip above.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {before && <button className="btn" onClick={() => selectDay(before.day)}>Previous game day · {dayLabel(before.day)}</button>}
            {after && <button className="btn" onClick={() => selectDay(after.day)}>Next game day · {dayLabel(after.day)}</button>}
          </div>
        </Empty>
      ) : dayData.status === "error" ? (
        <ErrorState message={`Games for ${dayLabel(day)} didn't load: ${dayData.error}`} retry={dayData.retry} />
      ) : !games ? (
        <Loading label="Loading games" />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="no-scrollbar -mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1" role="group" aria-label="Filter games">
              {(liveFor || liveView) && <LiveToggle on={liveView} count={liveList.length} onChange={setLiveView} />}
              {FILTERS.map(f => (
                <button key={f.id} className="chip" aria-pressed={!liveView && filter === f.id} onClick={() => { setFilter(f.id); if (liveView) setLiveView(false); }} title={f.title}>
                  {f.label}<span className="tnum opacity-60">{counts[f.id]}</span>
                </button>
              ))}
            </div>
            {!liveView && <ProjectionToggle className="shrink-0" />}
            <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
              <label className="flex-1 sm:flex-none">
                <span className="sr-only">Conference</span>
                <select className="field w-full" value={conf} onChange={e => setConf(e.target.value)}>
                  <option value="all">All conferences</option>
                  {confs.map(c => <option key={c} value={c}>{c}</option>)}
                  {conf !== "all" && !confs.includes(conf) && <option value={conf}>{conf}</option>}
                </select>
              </label>
              {liveView ? (
                <span className="flex-1 text-right text-sm text-mute sm:flex-none" title="Close and late games first, then overtime, an underdog ahead, and how far our win chance has moved since tip-off">Most exciting first</span>
              ) : (
                <label className="flex flex-1 items-center gap-2 sm:flex-none">
                  <span className="hidden text-sm text-mute sm:inline">Sort</span>
                  <span className="sr-only sm:hidden">Sort by</span>
                  <select className="field w-full" value={sort} onChange={e => setSort(e.target.value as SortId)}>
                    {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>

          {liveView && liveList.length === 0 ? (
            liveFor && !live.hasData && !waited ? <Loading label="Checking for live games" /> : (
              <LiveEmpty day={day} today={today} next={liveFor ? nextTip(games, live.byGame) : null} conf={conf} total={games.length} onAll={() => { setLiveView(false); setFilter("all"); }} onClearConf={() => setConf("all")} />
            )
          ) : (liveView ? liveList : shown).length === 0 ? (
            <Empty title="No games match these filters">
              <p>{filter === "upsets" && summary?.finals === 0 ? "Upsets show up once games go final." : "Try a different filter or conference."}</p>
              <button className="btn mt-3" onClick={() => { setFilter("all"); setConf("all"); }}>Show all {games.length} games</button>
            </Empty>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-label={liveView ? `${liveList.length} live games, most exciting first` : `${shown.length} games`} data-testid="game-list">
              {(liveView ? liveList : shown).map(g => (
                <li key={g.id} data-game={g.id} className="flex">
                  <GameCard g={g} live={live.byGame.get(g.id)} onOpen={openGame} absences={absences} moment={moments.get(g.id)} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-dim">
            Bar = pregame win probability (<span className="text-def">away</span> / <span className="text-off">home</span>). Proj = DHR&apos;s margin set before tip-off, with the favorite&apos;s win chance beside it. Projected scores are hidden until you turn them on; when on, they show in gray on unplayed games.
            ✓/✗ marks whether the pregame favorite won. Line = the pregame spread ESPN shows; ATS ✓/✗ = whether DHR&apos;s pick against it covered. Small numeral before a team = DHR national rank (not the AP poll).
          </p>
        </>
      )}

      {open && <GameSheet key={open.id} g={open} live={live.byGame.get(open.id)} onClose={closeGame} />}
    </div>
  );
}

/** "Live now" chip: pulsing dot and the count of games in progress; on = the Live view (?live=1). */
function LiveToggle({ on, count, onChange }: { on: boolean; count: number; onChange: (on: boolean) => void }) {
  return (
    <button type="button" className={`chip shrink-0 ${on ? "!border-hot !bg-hot !text-[var(--bg)]" : "!border-[rgb(var(--hot-rgb)/0.55)]"}`} aria-pressed={on}
      onClick={() => onChange(!on)} aria-label={`Live now, ${count} ${count === 1 ? "game" : "games"} in progress`} data-testid="live-toggle"
      title={on ? "Show all games" : "Show only games in progress, most exciting first"}>
      {count > 0 ? <span className={`live-dot ${on ? "!bg-[var(--bg)]" : ""}`} aria-hidden /> : <span className="h-[7px] w-[7px] rounded-full bg-dim" aria-hidden />}
      Live now<span className="tnum opacity-70">{count}</span>
    </button>
  );
}

/** Live view with nothing in progress: when the next game tips, and a way back to every game. */
function LiveEmpty({ day, today, next, conf, total, onAll, onClearConf }: { day: string; today: string; next: Game | null; conf: string; total: number; onAll: () => void; onClearConf: () => void }) {
  const isToday = day === today;
  return (
    <div className="deck flex flex-col items-start gap-1 p-6" data-testid="live-empty">
      <p className="font-semibold">{isToday ? "Nothing live right now" : `No games are live on ${dayLabel(day)}`}{conf !== "all" ? ` in the ${conf}` : ""}</p>
      <p className="text-sm text-mute">
        {next ? <>Next tip: <b className="text-ink tnum">{timeLabel(next.date)}</b>, {next.away.name} {next.neutral ? "vs" : "at"} {next.home.name}.</>
          : isToday ? "No more games are scheduled to tip today." : "Live scores are only shown for today's games."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={onAll}>Show all {total} games</button>
        {conf !== "all" && <button type="button" className="btn" onClick={onClearConf}>All conferences</button>}
      </div>
    </div>
  );
}

function DaySummaryLine({ s, games, onOpen, liveData, updated }: { s: ReturnType<typeof summarize>; games: Game[]; onOpen: (id: string) => void; liveData: boolean; updated: number | null }) {
  const b: Game | null = s.biggest;
  const ats = { w: 0, l: 0, p: 0 };
  for (const g of games) { const r = lineInfo(g)?.result; if (r === "W") ats.w++; else if (r === "L") ats.l++; else if (r === "P") ats.p++; }
  const w = b ? winner(b) : null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute tnum">
      <span><b className="text-ink">{s.games}</b> games</span>
      {liveData ? (
        <span className="flex items-center gap-1.5" title={`Live scores from ESPN${updated ? `, updated ${new Date(updated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : ""}. Refreshes every 30 seconds while games are on.`}>
          <span className="rounded bg-[rgb(var(--hot-rgb)/0.14)] px-1.5 py-0.5 text-[11px] font-semibold text-hot">Live</span>
          {s.live > 0 ? <><span className="live-dot" aria-hidden /><b className="text-hot">{s.live}</b> in progress</> : <span className="text-dim">scores update automatically</span>}
        </span>
      ) : s.live > 0 && <span className="flex items-center gap-1.5" title="Status as of the last data refresh"><span className="live-dot" aria-hidden /><b className="text-hot">{s.live}</b> in progress at last refresh</span>}
      <span><b className="text-ink">{s.finals}</b> final</span>
      {s.graded > 0 && (
        <span title="Finals where the pregame favorite won">Model <b className="text-ink">{s.correct}–{s.graded - s.correct}</b> ({Math.round((s.correct / s.graded) * 100)}%)</span>
      )}
      {ats.w + ats.l > 0 && (
        <span title="DHR picks against the pregame spread on today's finals (only where the model and line differ by at least half a point)">ATS <b className="text-ink">{ats.w}–{ats.l}{ats.p ? `–${ats.p}` : ""}</b></span>
      )}
      {b && w && (
        <span>
          Biggest upset:{" "}
          <button className="font-semibold text-hot underline-offset-2 hover:underline" onClick={() => onOpen(b.id)}>
            {b[w].name} over {b[w === "home" ? "away" : "home"].name}
          </button>{" "}({pctFmt(b.upset)} pregame chance)
        </span>
      )}
    </p>
  );
}
