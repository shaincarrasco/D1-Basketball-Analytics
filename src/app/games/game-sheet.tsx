"use client";
// Game detail sheet: modal on desktop, bottom sheet on phones.
// Escape / backdrop / close button dismiss it; focus is trapped inside and restored on close.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import TeamLogo from "@/components/team-logo";
import WinProb from "@/components/win-prob";
import { dayLabel, fmt, pctFmt, timeLabel } from "@/lib/format";
import { withLive, type LiveGame } from "@/lib/live";
import { LIVE_GAME_POLL_MS, progressOf, summaryAsLive, useLiveGame, type LiveGameMode, type LiveGameState, type LiveSummary } from "@/lib/live-game";
import PlayerBox from "./live/player-box";
import PlayByPlay from "./live/play-by-play";
import type { BoxLine, Game, GameSide } from "@/lib/types";
import { winProb, remainingAt, clockLabel } from "@/lib/win-prob";
import FlowChart from "./flow-chart";
import { WatchBadge } from "./game-card";
import TvBadges from "@/components/tv-badges";
import ArticleList from "@/components/article-list";
import PickEm from "./pick-em";
import WhosOut from "@/components/whos-out";
import { useInjuries } from "@/lib/injury-hooks";
import { setShowProjections, useShowProjections } from "@/lib/show-projections";
import { actualMarginText, favoriteWon, isFinal, isLive, lineInfo, marginText, matchupHref, periodLabel, statusLabel, teamHref, winner } from "./game-utils";

const ROW_TH = "l !static !border-line !bg-transparent !text-[13.5px] !font-normal !text-mute";
const DHR_RANK_TITLE = "D1 Hoops rank (DHR power rating), not the AP poll";
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function GameSheet({ g: gIn, live: liveIn, onClose }: { g: Game; live?: LiveGame; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    closeBtn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
    };
  }, []);

  // Live detail from ESPN's game summary: polled while the game is on, fetched once for a game
  // that went final today (before the nightly refresh adds its flow), or on request for older finals.
  const espnId = liveIn?.espnId ?? gIn.espnId ?? null;
  const [wantDetail, setWantDetail] = useState(false);
  const inProgress = liveIn ? liveIn.state === "in" : isLive(gIn);
  const mode: LiveGameMode = !espnId ? null : inProgress ? "poll"
    : isFinal(gIn) && (wantDetail || (liveIn?.state === "post" && !gIn.flow?.length)) ? "once" : null;
  const detail = useLiveGame(espnId, mode, { homeTeamId: liveIn?.homeTeamId, awayTeamId: liveIn?.awayTeamId, home: gIn.home.score, away: gIn.away.score });
  // Whichever feed is further along (summary every 15 s, scoreboard every 30 s) drives the header.
  const summaryLive = useMemo(() => (detail.data && detail.data.state !== "pre" ? summaryAsLive(detail.data) : null), [detail.data]);
  const live = summaryLive && progressOf(summaryLive) >= progressOf(liveIn) ? summaryLive : liveIn;
  const g = useMemo(() => (live && live !== liveIn ? withLive(gIn, live) : gIn), [gIn, live, liveIn]);

  const final = isFinal(g), isLiveNow = isLive(g);
  const played = final || isLiveNow;
  const titleId = `game-${g.id}-title`;
  const matchup = matchupHref(g);
  const place = [g.city, g.state].filter(Boolean).join(", ");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-[rgba(3,5,14,0.72)] backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="sheet-in relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[18px] border border-line2 bg-deck sm:max-h-[90vh] sm:max-w-[860px] sm:rounded-[18px]">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line2 sm:hidden" aria-hidden />
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3 sm:px-6">
          {isLiveNow && <span className="live-dot" aria-hidden />}
          <span className={`text-sm font-semibold ${isLiveNow ? "text-hot" : "text-ink"}`}>{statusLabel(g, live)}</span>
          {live?.state === "in" && <span className="rounded bg-[rgb(var(--hot-rgb)/0.14)] px-1.5 py-0.5 text-[11px] font-semibold text-hot" title="Score and clock from ESPN, refreshed every 15 to 30 seconds while this is open">Live</span>}
          <span className="truncate text-sm text-mute">· {dayLabel(etDay(g.date), { weekday: "short", month: "short", day: "numeric" })}{final || isLiveNow ? "" : timeLabel(g.date) === "TBA" ? " · tip time TBA" : ""}</span>
          <span className="ml-auto"><WatchBadge value={g.watch} /></span>
          <button ref={closeBtn} onClick={onClose} className="btn ml-1 !p-2" aria-label="Close game details"><X size={18} aria-hidden /></button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 pb-8 pt-5 sm:px-6">
          <h2 id={titleId} className="sr-only">{g.away.name} {g.neutral ? "vs" : "at"} {g.home.name}</h2>
          <Scoreline g={g} />
          <PickEm g={g} started={played || (!!live && live.state !== "pre") || new Date(g.date).getTime() <= Date.now()} />

          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-[12.5px] text-mute">
            {(g.venue || place) && <span>{[g.venue, place].filter(Boolean).join(" · ")}</span>}
            {g.neutral && <span className="chip !px-2 !py-0.5 !text-[11.5px]">Neutral site</span>}
            {g.confGame && <span className="chip !px-2 !py-0.5 !text-[11.5px]">Conference game</span>}
            {g.tournament && <span className="chip !px-2 !py-0.5 !text-[11.5px]">{g.tournament}</span>}
            {final && g.upset != null && <span className="rounded-full bg-[rgb(var(--hot-rgb)/0.15)] px-2 py-0.5 text-[11.5px] font-bold text-hot">Upset · winner had a {pctFmt(g.upset)} pregame chance</span>}
          </div>

          {played && <LineScore g={g} />}
          {played && mode === "poll" && <LiveStatus d={detail} />}
          {played && <GameFlow g={g} live={live} summary={detail.data} />}
          {played && <LiveDetail g={g} d={detail} mode={mode} espnId={espnId} onLoad={() => setWantDetail(true)} />}
          {!final && <Availability g={g} />}
          <Projection g={g} />
          <BoxCompare g={g} summary={detail.data} />

          <div className="mt-6 flex flex-wrap gap-2">
            {[g.away, g.home].map(s => {
              const href = teamHref(s);
              return href ? <Link key={s.name} href={href} className="btn">{s.name} team page</Link> : null;
            })}
            {matchup && <Link href={matchup} className="btn btn-primary">Open in matchup tool</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Eastern calendar day for an ISO timestamp. */
const etDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));

function SideBlock({ side, align, tone }: { side: GameSide; align: "l" | "r"; tone: "def" | "off" }) {
  const href = teamHref(side);
  const name = <span className="block text-[15px] font-semibold leading-tight sm:text-lg">{side.name}</span>;
  return (
    <div className={`flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 ${align === "r" ? "sm:flex-row-reverse sm:text-right" : "sm:text-left"}`}>
      {href ? <Link href={href} tabIndex={-1} aria-hidden className="shrink-0"><TeamLogo src={side.logo} name={side.name} size={52} /></Link> : <TeamLogo src={side.logo} name={side.name} size={52} />}
      <div className="min-w-0">
        <span className="flex items-center justify-center gap-1.5 sm:justify-start" style={align === "r" ? { justifyContent: "flex-end" } : undefined}>
          <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--${tone})` }} aria-hidden />
          {side.rank && <span className="font-display text-sm font-bold text-dim" title={DHR_RANK_TITLE} aria-label={`DHR rank ${side.rank}`}>{side.rank}</span>}
        </span>
        {href ? <Link href={href} className="link">{name}</Link> : name}
        <span className="block text-[12px] text-dim">{side.id ? side.record ?? "—" : "Non-D-I"}{side.conf ? ` · ${side.conf}` : ""}</span>
      </div>
    </div>
  );
}

function Scoreline({ g }: { g: Game }) {
  const played = (isFinal(g) || isLive(g)) && g.home.score != null && g.away.score != null;
  const w = winner(g);
  const showProj = useShowProjections() && !played && !!g.pred;
  const num = (side: "home" | "away") => {
    const v = played ? g[side].score : showProj ? Math.round(g.pred![side]) : null;
    const dim = !played || (w != null && w !== side);
    return <span className={`font-display text-[2.75rem] font-black leading-none tnum sm:text-[3.5rem] ${dim ? "text-mute" : "text-ink"}`}>{v ?? "—"}</span>;
  };
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
      <SideBlock side={g.away} align="l" tone="def" />
      <div className="text-center">
        <div className="flex items-center gap-2 sm:gap-4">{num("away")}<span className="font-display text-2xl text-dim">–</span>{num("home")}</div>
        <div className="mt-1 text-[11.5px] text-mute">{played ? (isFinal(g) ? "Final score" : "Current score") : showProj ? "Projected score" : isLive(g) ? "Just tipped off" : "Not started"}</div>
      </div>
      <SideBlock side={g.home} align="r" tone="off" />
    </div>
  );
}

function LineScore({ g }: { g: Game }) {
  const n = Math.max(g.home.periods?.length ?? 0, g.away.periods?.length ?? 0);
  return (
    <section className="mt-7" aria-labelledby={`ls-${g.id}`}>
      <h3 id={`ls-${g.id}`} className="h-section mb-2 !text-xl">Line score</h3>
      {n === 0 ? <p className="text-sm text-mute">Period scores aren&apos;t available for this game yet.</p> : (
        <div className="scroll-x">
          <table className="dt">
            <thead><tr><th className="l" scope="col">Team</th>{Array.from({ length: n }, (_, i) => <th key={i} scope="col">{periodLabel(i)}</th>)}<th scope="col">Total</th></tr></thead>
            <tbody>
              {(["away", "home"] as const).map(k => (
                <tr key={k}>
                  <th scope="row" className={`${ROW_TH} !font-semibold !text-ink`}><span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: k === "away" ? "var(--def)" : "var(--off)" }} aria-hidden />{g[k].name}</th>
                  {Array.from({ length: n }, (_, i) => <td key={i}>{g[k].periods?.[i] ?? "—"}</td>)}
                  <td className="font-display !text-lg font-extrabold">{g[k].score ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GameFlow({ g, live, summary }: { g: Game; live?: LiveGame; summary: LiveSummary | null }) {
  const inGame = live?.state === "in" && live.elapsed != null && g.home.score != null && g.away.score != null;
  // ESPN's live plays when they cover at least as much of the game as the published flow.
  const liveFlow = summary && summary.state !== "pre" && summary.flow.length >= 2 && summary.flow.length >= (g.flow?.length ?? 0) ? summary.flow : null;
  // Extend a stale in-progress flow to the live clock and score.
  const flowGame = useMemo(() => {
    if (liveFlow) return { ...g, flow: liveFlow };
    if (!inGame || !g.flow?.length) return g;
    const last = g.flow[g.flow.length - 1];
    const now: [number, number, number] = [Math.max(last[0], live!.elapsed!), g.home.score!, g.away.score!];
    return { ...g, flow: [...g.flow, now] };
  }, [g, inGame, live, liveFlow]);
  const hasFlow = (flowGame.flow?.length ?? 0) >= 2;
  const homeS = g.home.short ?? g.home.name, awayS = g.away.short ?? g.away.name;
  return (
    <section className="mt-7" aria-labelledby={`gf-${g.id}`}>
      <h3 id={`gf-${g.id}`} className="h-section mb-2 !text-xl">{isFinal(g) ? "Game flow" : "Win probability"}</h3>
      {hasFlow ? (
        <FlowChart g={flowGame} now={inGame ? live!.elapsed : null} />
      ) : inGame ? (() => {
        const wp = winProb(g.home.score! - g.away.score!, remainingAt(live!.elapsed!), g.pred?.margin ?? 0);
        return (
          <div className="deck-flat p-3">
            <div className="mb-1 flex justify-between text-xs text-mute"><span>{awayS}</span><span>Live win probability · {clockLabel(live!.elapsed!)}</span><span>{homeS}</span></div>
            <WinProb awayName={g.away.name} homeName={g.home.name} homeWP={wp} />
            <p className="mt-2 text-[11.5px] text-dim">From the live score, time left and the pregame projection. {summary ? "The chart starts with the first basket." : "The full game-flow chart appears after the nightly data refresh."}</p>
          </div>
        );
      })() : (
        <p className="text-sm text-mute">Play-by-play isn&apos;t available for this game{isFinal(g) ? "" : " yet"}.</p>
      )}
    </section>
  );
}

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** One line under the line score while polling: where the live detail comes from and how fresh it is. */
function LiveStatus({ d }: { d: LiveGameState }) {
  const text = d.data
    ? `Box score and plays live from ESPN · updated ${d.updated ? timeOf(d.updated) : "just now"}${d.data.state === "post" ? " · game over" : ` · refreshes every ${LIVE_GAME_POLL_MS / 1000} s`}`
    : d.error ? "" : "Loading live box score and plays from ESPN…";
  if (d.error && !d.data) return null; // LiveDetail explains it
  return (
    <p className="mt-3 text-[12px] text-mute" aria-live="polite" data-testid="live-status">
      {d.data?.state === "in" && <span className="live-dot mr-1.5 inline-block align-middle" aria-hidden />}
      {text}
      {d.error && d.data && <span className="ml-1 text-loss">Couldn&apos;t refresh just now; showing the last update.</span>}
    </p>
  );
}

/** Player box score and play-by-play from the ESPN summary, with honest loading / unavailable states. */
function LiveDetail({ g, d, mode, espnId, onLoad }: { g: Game; d: LiveGameState; mode: LiveGameMode; espnId: string | null; onLoad: () => void }) {
  const final = isFinal(g);
  const sum = d.data;
  if (!sum) {
    // Older finals: nothing is fetched until the reader asks.
    if (!mode) {
      if (!final || !espnId) return null;
      return (
        <section className="mt-7" aria-labelledby={`ld-${g.id}`}>
          <h3 id={`ld-${g.id}`} className="h-section mb-2 !text-xl">Player stats &amp; plays</h3>
          <p className="mb-2 text-sm text-mute">Player box score and full play-by-play come from ESPN and load on request.</p>
          <button type="button" className="btn" onClick={onLoad}>Load from ESPN</button>
        </section>
      );
    }
    return (
      <section className="mt-7" aria-labelledby={`ld-${g.id}`}>
        <h3 id={`ld-${g.id}`} className="h-section mb-2 !text-xl">Player box score</h3>
        {d.error ? (
          <p className="text-sm text-mute" data-testid="live-unavailable">
            Live details are unavailable right now: ESPN&apos;s game feed didn&apos;t respond. The score above still updates{mode === "poll" ? ", and we'll keep trying" : ""}.
            {mode === "once" && <> <button type="button" className="underline" onClick={d.reload}>Try again</button></>}
          </p>
        ) : <p className="text-sm text-mute">Loading from ESPN…</p>}
      </section>
    );
  }
  const live = sum.state === "in";
  return (
    <>
      <section className="mt-7" aria-labelledby={`pb-${g.id}`}>
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
          <h3 id={`pb-${g.id}`} className="h-section !text-xl">Player box score</h3>
          {live && <span className="text-[12px] font-semibold text-hot">Live</span>}
        </div>
        {!sum.box.home && !sum.box.away
          ? <p className="text-sm text-mute">ESPN hasn&apos;t posted player stats for this game yet.</p>
          : <PlayerBox away={sum.box.away} home={sum.box.home} awaySide={g.away} homeSide={g.home} live={live} />}
      </section>
      <section className="mt-7" aria-labelledby={`pp-${g.id}`}>
        <h3 id={`pp-${g.id}`} className="h-section mb-2 !text-xl">Play-by-play</h3>
        {sum.plays.length ? <PlayByPlay plays={sum.plays} away={g.away} home={g.home} final={sum.state === "post"} />
          : <p className="text-sm text-mute">ESPN hasn&apos;t posted any plays yet.</p>}
      </section>
    </>
  );
}

/** Current availability for unplayed games. Finals get nothing: we don't store who was available at the time. */
function Availability({ g }: { g: Game }) {
  const injuries = useInjuries(); // sheet only mounts when open, so this loads lazily (cached after the first fetch)
  const teams = [g.away, g.home].filter(s => s.slug).map(s => ({ slug: s.slug!, name: s.name }));
  if (!teams.length) return null;
  return (
    <section className="mt-7" aria-labelledby={`wo-${g.id}`}>
      <h3 id={`wo-${g.id}`} className="h-section mb-2 !text-xl">Who&apos;s out</h3>
      {injuries.status === "error" ? <p className="text-sm text-mute">Availability didn&apos;t load. <button className="underline" onClick={injuries.retry}>Try again</button></p> : <WhosOut file={injuries.data} teams={teams} />}
    </section>
  );
}

function LineRow({ g }: { g: Game }) {
  const li = lineInfo(g);
  if (!li) return null;
  const res = li.result;
  return (
    <div className="deck-flat mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px] text-mute tnum">
      <span title={li.provider ? `Pregame spread from ${li.provider}, as shown by ESPN` : "Pregame spread as shown by ESPN"}>Line: <b className="text-ink">{li.market}</b></span>
      {li.model && <span title="DHR projected margin written as a spread">· DHR: <b className="text-ink">{li.model}</b></span>}
      {li.total != null && <span>· Total {li.total}</span>}
      {li.pick ? (
        <span className="ml-auto" title="DHR's side against the line (counts when the model and line differ by at least half a point)">
          DHR pick <b className="text-ink">{li.pick.text}</b>
          {res && <b className={`ml-1.5 ${res === "W" ? "text-win" : res === "L" ? "text-loss" : "text-mute"}`}>{res === "W" ? "✓ covered" : res === "L" ? "✗ didn't cover" : "push"}</b>}
        </span>
      ) : li.model ? <span className="ml-auto text-dim">No DHR pick (within half a point of the line)</span> : null}
    </div>
  );
}

function Projection({ g }: { g: Game }) {
  const p = g.pred;
  const final = isFinal(g);
  const fw = favoriteWon(g);
  const showProj = useShowProjections();
  const poss = g.box?.home?.poss != null && g.box?.away?.poss != null ? (g.box.home.poss + g.box.away.poss) / 2 : g.box?.home?.poss ?? g.box?.away?.poss ?? null;
  return (
    <section className="mt-7" aria-labelledby={`pj-${g.id}`}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h3 id={`pj-${g.id}`} className="h-section !text-xl">{final ? "Projection vs result" : "Pregame projection"}</h3>
        {fw != null && <span className={`text-sm font-semibold ${fw ? "text-win" : "text-loss"}`}>{fw ? "✓ Favorite won" : "✗ Favorite lost"}</span>}
      </div>
      {!p ? <p className="text-sm text-mute">No projection was made for this game.</p> : (
        <>
          {g.tv?.length ? <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-mute">Where to watch <TvBadges tv={g.tv} max={6} size="md" /></div> : null}
          <LineRow g={g} />
          {g.articles?.length ? (
            <section className="mb-4" aria-label="Previews and recaps">
              <h3 className="mb-1 text-[13px] font-semibold text-mute">Previews &amp; recaps</h3>
              <ArticleList items={g.articles} max={4} />
            </section>
          ) : null}
          <div className="deck-flat mb-3 p-3">
            <div className="mb-1 flex justify-between text-xs text-mute"><span>{g.away.name}</span><span>Pregame win probability</span><span>{g.home.name}</span></div>
            <WinProb awayName={g.away.name} homeName={g.home.name} homeWP={p.wp} />
          </div>
          <div className="scroll-x">
            <table className="dt [&_td]:!whitespace-normal [&_th]:!whitespace-normal">
              <thead><tr><th className="l" scope="col">Measure</th><th scope="col">Projected</th>{final && <th scope="col">Actual</th>}</tr></thead>
              <tbody>
                {showProj && <tr><th scope="row" className={ROW_TH}>Score ({g.away.short ?? g.away.name}–{g.home.short ?? g.home.name})</th><td>{fmt(p.away)}–{fmt(p.home)}</td>{final && <td className="font-semibold">{g.away.score ?? "—"}–{g.home.score ?? "—"}</td>}</tr>}
                <tr><th scope="row" className={ROW_TH}>Margin</th><td>{marginText(g)}</td>{final && <td className="font-semibold">{actualMarginText(g)}</td>}</tr>
                {g.line && (
                  <tr><th scope="row" className={ROW_TH}>Market spread</th><td>{lineInfo(g)?.market ?? "—"}</td>{final && <td className="font-semibold">{(() => { const c = lineInfo(g)?.covered; return c ? `${g[c].short ?? g[c].name} covered` : g.home.score != null ? "Push" : "—"; })()}</td>}</tr>
                )}
                {showProj && <tr><th scope="row" className={ROW_TH}>Total points</th><td>{fmt(p.away + p.home)}</td>{final && <td className="font-semibold">{g.home.score != null && g.away.score != null ? g.home.score + g.away.score : "—"}</td>}</tr>}
                <tr><th scope="row" className={ROW_TH}>Tempo (possessions)</th><td>{fmt(p.tempo)}</td>{final && <td className="font-semibold">{fmt(poss)}</td>}</tr>
              </tbody>
            </table>
          </div>
          <button type="button" className="mt-2 text-[13px] font-semibold text-bulb-ink hover:underline" onClick={() => setShowProjections(!showProj)}>
            {showProj ? "Hide projected scores" : "Show projected score"}
          </button>
        </>
      )}
    </section>
  );
}

type Stat = { label: string; a: number | null; h: number | null; text?: (s: BoxLine) => string; lowerBetter?: boolean; scale?: "pct" };
const pct = (m: number | null, a: number | null) => (m != null && a ? m / a : null);
const shoot = (m: number | null, a: number | null) => `${m ?? "—"}-${a ?? "—"} · ${pctFmt(pct(m, a), 1)}`;

function BoxCompare({ g, summary }: { g: Game; summary: LiveSummary | null }) {
  // Published box score first; for a game the nightly build hasn't covered, ESPN's live team line.
  const fromLive = !(g.box?.away && g.box?.home) && !!summary?.box.away?.team && !!summary?.box.home?.team;
  const a = fromLive ? summary!.box.away!.team : g.box?.away, h = fromLive ? summary!.box.home!.team : g.box?.home;
  return (
    <section className="mt-7" aria-labelledby={`bx-${g.id}`}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h3 id={`bx-${g.id}`} className="h-section !text-xl">Team box score</h3>
        {fromLive && <span className="text-[12px] text-mute">{summary!.state === "in" ? "Live from ESPN, so far" : "From ESPN"}</span>}
      </div>
      {!a || !h ? (
        <p className="text-sm text-mute">Team box scores aren&apos;t available for this game yet.{isFinal(g) ? "" : " They appear once the game is final."}</p>
      ) : (
        <BoxRows a={a} h={h} awayName={g.away.name} homeName={g.home.name} />
      )}
    </section>
  );
}

function BoxRows({ a, h, awayName, homeName }: { a: BoxLine; h: BoxLine; awayName: string; homeName: string }) {
  const rows: (Stat & { at?: string; ht?: string })[] = [
    { label: "Field goals", a: pct(a.fgm, a.fga), h: pct(h.fgm, h.fga), at: shoot(a.fgm, a.fga), ht: shoot(h.fgm, h.fga), scale: "pct" },
    { label: "3-pointers", a: pct(a.tpm, a.tpa), h: pct(h.tpm, h.tpa), at: shoot(a.tpm, a.tpa), ht: shoot(h.tpm, h.tpa), scale: "pct" },
    { label: "Free throws", a: pct(a.ftm, a.fta), h: pct(h.ftm, h.fta), at: shoot(a.ftm, a.fta), ht: shoot(h.ftm, h.fta), scale: "pct" },
    { label: "Offensive rebounds", a: a.orb, h: h.orb },
    { label: "Defensive rebounds", a: a.drb, h: h.drb },
    { label: "Assists", a: a.ast, h: h.ast },
    { label: "Turnovers", a: a.tov, h: h.tov, lowerBetter: true },
    { label: "Steals", a: a.stl, h: h.stl },
    { label: "Blocks", a: a.blk, h: h.blk },
    { label: "Points in the paint", a: a.paint, h: h.paint },
    { label: "Fast-break points", a: a.fastBreak, h: h.fastBreak },
    { label: "Points off turnovers", a: a.offTov, h: h.offTov },
    { label: "Largest lead", a: a.largestLead, h: h.largestLead },
  ];
  return (
    <div>
      <div className="mb-2 grid grid-cols-2 text-xs font-semibold">
        <span className="flex items-center gap-1.5 text-def"><i className="inline-block h-2 w-2 rounded-full bg-def" aria-hidden />{awayName}</span>
        <span className="flex items-center justify-end gap-1.5 text-off">{homeName}<i className="inline-block h-2 w-2 rounded-full bg-off" aria-hidden /></span>
      </div>
      <dl className="flex flex-col gap-2.5">
        {rows.map(r => {
          const max = r.scale === "pct" ? 1 : Math.max(r.a ?? 0, r.h ?? 0, 1);
          const lead = r.a == null || r.h == null || r.a === r.h ? null : (r.a > r.h) !== !!r.lowerBetter ? "a" : "h";
          const val = (v: number | null, t?: string) => t ?? (v == null ? "—" : String(v));
          return (
            <div key={r.label}>
              <div className="mb-1 grid grid-cols-[1fr_auto_1fr] items-baseline gap-2 text-[13px] tnum">
                <dd className={lead === "a" ? "font-bold text-ink" : "text-mute"}>{val(r.a, r.at)}</dd>
                <dt className="text-center text-[12px] text-mute">{r.label}{r.lowerBetter ? <span className="sr-only"> (fewer is better)</span> : null}</dt>
                <dd className={`text-right ${lead === "h" ? "font-bold text-ink" : "text-mute"}`}>{val(r.h, r.ht)}</dd>
              </div>
              <div className="grid grid-cols-2 gap-1" aria-hidden>
                <div className="flex h-1.5 justify-end overflow-hidden rounded-l-full bg-line">
                  <div style={{ width: `${((r.a ?? 0) / max) * 100}%`, background: "var(--def)", opacity: lead === "h" ? 0.45 : 1 }} />
                </div>
                <div className="flex h-1.5 overflow-hidden rounded-r-full bg-line">
                  <div style={{ width: `${((r.h ?? 0) / max) * 100}%`, background: "var(--off)", opacity: lead === "a" ? 0.45 : 1 }} />
                </div>
              </div>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
