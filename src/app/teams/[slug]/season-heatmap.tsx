// Adapted from Componentry's GitHub Calendar (MIT, Harsh Jadhav, https://componentry.dev).
"use client";
// The season as a calendar: one column per week (Monday first), one square per day. Wins and
// losses are shaded by margin, upcoming games are outlined, quiet days stay faint. Hover, tap or
// focus a game for a small card. The grid is in the server HTML; the column-by-column fade only
// runs on the client, and only when the grid starts out of view.
import Link from "next/link";
import { AnimatePresence, motion, useInView, useReducedMotion, type Variants } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { TeamGame } from "@/lib/types";
import { useLiveRatings } from "@/lib/live-ratings";
import { timeLabel } from "@sports/ui/format";
import { buildSeasonCalendar, summaryText, withLiveFinals, type CalCell } from "./season-heatmap-data";

const EASE = [0.22, 1, 0.36, 1] as const;
const ALPHA = [0, 0.34, 0.6, 0.92] as const;
const LABEL_W = 28; // px, day-name gutter
const CARD_W = 212;
const DAY_NAMES = ["Mon", "", "Wed", "", "Fri", "", ""];

const gameHref = (g: TeamGame) => `/games/?d=${g.day}&g=${g.id}`;
const dayText = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const oppText = (g: TeamGame) => `${g.venue === "A" ? "at" : "vs"} ${g.opp}`;

function statusText(c: CalCell): string {
  const g = c.game!;
  if (c.kind === "win" || c.kind === "loss") return `${g.result} ${g.pts}–${g.oppPts}`;
  if (c.kind === "live") return "in progress";
  if (c.kind === "off") return g.status;
  return "upcoming";
}

function squareStyle(c: CalCell): CSSProperties {
  switch (c.kind) {
    case "win": return { background: `rgb(var(--win-rgb) / ${ALPHA[c.level || 1]})` };
    case "loss": return { background: `rgb(var(--loss-rgb) / ${ALPHA[c.level || 1]})` };
    case "upcoming": return { border: "1px solid rgb(var(--dim-rgb) / 0.75)" };
    case "live": return { border: "1.5px solid rgb(var(--hot-rgb))" };
    case "off": return { border: "1px dashed rgb(var(--dim-rgb) / 0.6)" };
    default: return { background: "rgb(var(--line-rgb) / 0.6)" };
  }
}

const columnVariants: Variants = {
  hidden: { opacity: 0, y: 4, transition: { duration: 0 } },
  shown: (col: number) => ({ opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE, delay: Math.min(col * 0.022, 0.5) } }),
};

export default function SeasonHeatmap({ games: published, slug }: { games: TeamGame[]; slug: string }) {
  const live = useLiveRatings();
  const games = useMemo(() => withLiveFinals(published, live?.finals, slug), [published, live, slug]);
  const cal = useMemo(() => buildSeasonCalendar(games), [games]);

  const reduce = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  // Roving tab stop: the latest finished game (or the first game before the season starts).
  const defaultStop = useMemo(() => {
    if (!cal) return 0;
    for (let i = cal.games.length - 1; i >= 0; i--) {
      const k = cal.games[i].kind;
      if (k === "win" || k === "loss" || k === "live") return i;
    }
    return 0;
  }, [cal]);
  const [stop, setStop] = useState<number | null>(null);
  const tabStop = stop ?? defaultStop;

  // Entrance: only arm the hidden start state on the client, and only if the grid is out of view
  // (below the fold or in a hidden tab), so nothing that is already on screen blinks.
  const inView = useInView(gridRef, { once: true, amount: 0.25 });
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (reduce || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = gridRef.current?.getBoundingClientRect();
    if (!r) return;
    const visible = r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
    if (!visible) setArmed(true);
  }, [reduce]);
  const phase = armed && !inView ? "hidden" : "shown";

  // Wide seasons scroll inside the card, starting at the most recent week. The scroller may be in a
  // hidden tab at first, so wait until it has a width.
  const scrolled = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !cal) return;
    const place = () => {
      if (scrolled.current || el.clientWidth === 0) return;
      scrolled.current = true;
      if (el.scrollWidth <= el.clientWidth) return;
      const pitch = el.querySelector<HTMLElement>("[data-col]")?.offsetWidth ?? 16;
      const right = LABEL_W + (cal.recentCol + 1) * pitch + 2 * pitch; // show two weeks ahead too
      el.scrollLeft = Math.max(0, right - el.clientWidth);
    };
    place();
    if (scrolled.current) return;
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cal]);

  const measure = useCallback((gi: number | null) => {
    const wrap = wrapRef.current, btn = gi == null ? null : btnRefs.current[gi];
    const cell = gi == null ? null : cal?.games[gi];
    if (!wrap || !btn || !cell) { setPos(null); return; }
    const w = wrap.getBoundingClientRect(), b = btn.getBoundingClientRect();
    const below = cell.row <= 2;
    const center = b.left - w.left + b.width / 2;
    const left = Math.max(0, Math.min(center - CARD_W / 2, w.width - CARD_W));
    setPos({ left, top: below ? b.bottom - w.top + 6 : b.top - w.top - 6, below });
  }, [cal]);
  useLayoutEffect(() => { measure(active); }, [active, measure]);

  const close = useCallback(() => { setActive(null); setPinned(false); }, []);
  const cancelLeave = () => { if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; } };

  // A tap elsewhere closes a pinned card.
  useEffect(() => {
    if (active == null) return;
    const onDown = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) close(); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [active, close]);
  useEffect(() => cancelLeave, []);

  if (!cal) return null;

  const focusGame = (gi: number) => {
    const n = cal.games.length;
    const i = Math.max(0, Math.min(n - 1, gi));
    const btn = btnRefs.current[i], sc = scrollRef.current;
    setStop(i);
    if (!btn) return;
    btn.focus({ preventScroll: true });
    if (sc) {
      const s = sc.getBoundingClientRect(), b = btn.getBoundingClientRect();
      if (b.left < s.left + LABEL_W) sc.scrollLeft -= s.left + LABEL_W - b.left + 8;
      else if (b.right > s.right) sc.scrollLeft += b.right - s.right + 8;
    }
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, gi: number) => {
    const moves: Record<string, number> = { ArrowLeft: gi - 1, ArrowUp: gi - 1, ArrowRight: gi + 1, ArrowDown: gi + 1, Home: 0, End: cal.games.length - 1 };
    if (e.key in moves) { e.preventDefault(); focusGame(moves[e.key]); }
    else if (e.key === "Escape" && active != null) { e.preventDefault(); close(); }
  };

  const cell = active == null ? null : cal.games[active];
  const g = cell?.game ?? null;
  const summary = summaryText(cal.summary);

  return (
    <section className="deck p-4 sm:p-5" aria-labelledby="season-cal-h">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="season-cal-h" className="h-section">Season calendar</h2>
        <p className="flex items-center gap-1.5 text-xs text-mute">
          <span>Margin</span>
          {[3, 2, 1].map(l => <i key={`l${l}`} aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `rgb(var(--loss-rgb) / ${ALPHA[l]})` }} />)}
          {[1, 2, 3].map(l => <i key={`w${l}`} aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `rgb(var(--win-rgb) / ${ALPHA[l]})` }} />)}
          <span className="sr-only">Losses in red and wins in green, darker for margins of 6–12 and 13 or more points.</span>
          <i aria-hidden className="ml-1.5 h-2.5 w-2.5 rounded-[3px]" style={{ border: "1px solid rgb(var(--dim-rgb) / 0.75)" }} />
          <span>upcoming</span>
        </p>
      </div>

      <div ref={wrapRef} className="relative"
        onPointerLeave={e => { if (e.pointerType === "mouse" && !pinned) { cancelLeave(); leaveTimer.current = setTimeout(close, 160); } }}
        onPointerEnter={cancelLeave}
        onBlur={e => { if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) close(); }}>
        <div ref={scrollRef} className="scroll-x pb-1" onScroll={() => { if (active != null) measure(active); }}>
          <div className="relative inline-flex pt-[18px] [--pitch:16px] sm:[--pitch:20px]">
            <div aria-hidden className="absolute top-0 h-4" style={{ left: LABEL_W }}>
              {cal.months.map(m => (
                <span key={m.col} className="absolute whitespace-nowrap text-[11px] leading-4 text-mute" style={{ left: `calc(var(--pitch) * ${m.col})` }}>{m.label}</span>
              ))}
            </div>
            <div aria-hidden className="flex shrink-0 flex-col text-[10px] text-dim" style={{ width: LABEL_W }}>
              {DAY_NAMES.map((d, i) => <span key={i} className="flex h-[var(--pitch)] items-center">{d}</span>)}
            </div>
            <div ref={gridRef} role="group" aria-label={`${cal.games.length} games by date. Arrow keys move between games.`} className="flex">
              {cal.weeks.map((week, col) => (
                <motion.div key={week[0].day} data-col className="flex w-[var(--pitch)] flex-col"
                  custom={col} variants={columnVariants} initial={false} animate={phase}>
                  {week.map(c => {
                    const sq = "block h-[calc(var(--pitch)_-_3px)] w-[calc(var(--pitch)_-_3px)] rounded-[3px]";
                    if (!c.game) return <span key={c.day} aria-hidden className="flex h-[var(--pitch)] items-center"><i className={sq} style={squareStyle(c)} /></span>;
                    const on = active === c.gi;
                    return (
                      <button key={c.day} ref={el => { btnRefs.current[c.gi] = el; }} type="button"
                        tabIndex={c.gi === tabStop ? 0 : -1}
                        aria-label={`${dayText(c.day)}, ${oppText(c.game)}, ${statusText(c)}`}
                        className="flex h-[var(--pitch)] w-[var(--pitch)] items-center rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ink"
                        onPointerEnter={e => { if (e.pointerType === "mouse" && !pinned) { cancelLeave(); setActive(c.gi); } }}
                        onFocus={() => { setStop(c.gi); if (!pinned || active !== c.gi) setActive(c.gi); }}
                        onClick={() => { if (pinned && active === c.gi) close(); else { setActive(c.gi); setPinned(true); setStop(c.gi); } }}
                        onKeyDown={e => onKey(e, c.gi)}>
                        <i className={`${sq} motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]`} style={{ ...squareStyle(c), transform: on ? "scale(1.18)" : "scale(1)" }} />
                      </button>
                    );
                  })}
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {g && cell && pos && (
            <div key="card" className="pointer-events-none absolute z-20" style={{ left: pos.left, top: pos.top, width: CARD_W, transform: pos.below ? undefined : "translateY(-100%)" }}>
              <motion.div
                className="pointer-events-auto rounded-[14px] border border-line2 bg-deck2 px-3 py-2.5"
                initial={reduce ? { opacity: 1 } : { opacity: 0, y: pos.below ? -4 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.18, ease: EASE }}
                onPointerEnter={cancelLeave}>
                <p className="text-[12px] text-mute">{dayText(cell.day)}{g.venue === "N" ? " · neutral site" : ""}</p>
                <p className="truncate text-[14px] font-semibold">{oppText(g)}</p>
                <p className="text-[14px] tnum">
                  {cell.kind === "win" || cell.kind === "loss" ? (
                    <><b className={`font-semibold ${cell.kind === "win" ? "text-win" : "text-loss"}`}>{g.result}</b> {g.pts}–{g.oppPts}</>
                  ) : cell.kind === "live" ? <span className="text-hot">In progress</span>
                    : cell.kind === "off" ? <span className="capitalize text-mute">{g.status}</span>
                    : <span className="text-mute">{timeLabel(g.date)}</span>}
                </p>
                <Link href={gameHref(g)} className="link mt-1 inline-block text-[13px] font-semibold underline decoration-current/30 underline-offset-4">
                  {cell.kind === "upcoming" ? "Preview" : "Game details"}
                </Link>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <p className="mt-2 text-[13px] text-mute tnum">{summary}</p>
      </div>
    </section>
  );
}
