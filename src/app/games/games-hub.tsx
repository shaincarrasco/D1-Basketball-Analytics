"use client";
// Scoreboard + predictions hub. URL is the source of truth for the day (?d=) and the open game (?g=);
// Next.js keeps useSearchParams in sync with history.pushState / replaceState.
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Empty, ErrorState, Loading } from "@/components/states";
import { useJson } from "@/lib/client-data";
import { dayLabel, etToday, pctFmt } from "@/lib/format";
import type { Game, GameDay, GameIndex } from "@/lib/types";
import DateStrip from "./date-strip";
import GameCard from "./game-card";
import GameSheet from "./game-sheet";
import { FILTERS, SORTS, defaultDay, isDay, matchesFilter, sortGames, summarize, winner, type FilterId, type SortId } from "./game-utils";

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
  const home = index.data ? defaultDay(index.data, today) : null;
  const day = isDay(dParam) ? dParam : home;
  const listed = index.data && day ? index.data.days.find(d => d.day === day && d.games > 0) : undefined;
  const dayData = useJson<GameDay>(listed ? `games/${listed.day}.json` : null);
  // useJson keeps the previous day's data for one render after the file changes.
  const games = dayData.status === "ready" && dayData.data.day === day ? dayData.data.games : null;

  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("time");
  const [conf, setConf] = useState("all");

  const pushed = useRef(false);
  const returnFocus = useRef<string | null>(null);

  const selectDay = useCallback((d: string) => {
    setUrl(p => { p.set("d", d); p.delete("g"); }, "replace");
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
        {summary && <DaySummaryLine s={summary} onOpen={openGame} />}
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
              {FILTERS.map(f => (
                <button key={f.id} className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}<span className="tnum opacity-60">{counts[f.id]}</span>
                </button>
              ))}
            </div>
            <div className="ml-auto flex w-full gap-2 sm:w-auto">
              <label className="flex-1 sm:flex-none">
                <span className="sr-only">Conference</span>
                <select className="field w-full" value={conf} onChange={e => setConf(e.target.value)}>
                  <option value="all">All conferences</option>
                  {confs.map(c => <option key={c} value={c}>{c}</option>)}
                  {conf !== "all" && !confs.includes(conf) && <option value={conf}>{conf}</option>}
                </select>
              </label>
              <label className="flex flex-1 items-center gap-2 sm:flex-none">
                <span className="hidden text-sm text-mute sm:inline">Sort</span>
                <span className="sr-only sm:hidden">Sort by</span>
                <select className="field w-full" value={sort} onChange={e => setSort(e.target.value as SortId)}>
                  {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            </div>
          </div>

          {shown.length === 0 ? (
            <Empty title="No games match these filters">
              <p>{filter === "upsets" && summary?.finals === 0 ? "Upsets show up once games go final." : "Try a different filter or conference."}</p>
              <button className="btn mt-3" onClick={() => { setFilter("all"); setConf("all"); }}>Show all {games.length} games</button>
            </Empty>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-label={`${shown.length} games`}>
              {shown.map(g => (
                <li key={g.id} data-game={g.id} className="flex">
                  <GameCard g={g} onOpen={openGame} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-dim">
            Bar = pregame win probability (<span className="text-def">away</span> / <span className="text-off">home</span>). Gray numbers on unplayed games are projected points.
            ✓/✗ marks whether the pregame favorite won. Small numeral before a team = D1 Hoops national rank.
          </p>
        </>
      )}

      {open && <GameSheet key={open.id} g={open} onClose={closeGame} />}
    </div>
  );
}

function DaySummaryLine({ s, onOpen }: { s: ReturnType<typeof summarize>; onOpen: (id: string) => void }) {
  const b: Game | null = s.biggest;
  const w = b ? winner(b) : null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute tnum">
      <span><b className="text-ink">{s.games}</b> games</span>
      {s.live > 0 && <span className="flex items-center gap-1.5"><span className="live-dot" aria-hidden /><b className="text-hot">{s.live}</b> live</span>}
      <span><b className="text-ink">{s.finals}</b> final</span>
      {s.graded > 0 && (
        <span title="Finals where the pregame favorite won">Model <b className="text-ink">{s.correct}–{s.graded - s.correct}</b> ({Math.round((s.correct / s.graded) * 100)}%)</span>
      )}
      {b && w && (
        <span>
          Biggest upset:{" "}
          <button className="font-semibold text-hot underline-offset-2 hover:underline" onClick={() => onOpen(b.id)}>
            {b[w].name} over {b[w === "home" ? "away" : "home"].name}
          </button>{" "}({pctFmt(b.upset)})
        </span>
      )}
    </p>
  );
}
