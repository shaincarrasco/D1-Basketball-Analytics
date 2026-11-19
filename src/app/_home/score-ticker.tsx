// Adapted from Componentry's Scroll Based Velocity (MIT, Harsh Jadhav, https://componentry.dev).
"use client";
// Home: a thin row that slowly drifts today's live scores and finals sideways. Scrolling the
// page speeds it up and leans it a little; the lean settles back on a spring. Hover or keyboard
// focus pauses it. The item list is repeated for a seamless loop; only the first copy is real
// (the repeats are aria-hidden and inert). With reduced motion it is a plain scrollable row.
// Hidden entirely when nothing has tipped off today.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FocusEvent } from "react";
import {
  motion, useAnimationFrame, useInView, useMotionValue, useReducedMotion,
  useScroll, useSpring, useTransform, useVelocity, wrap,
} from "framer-motion";
import TeamLogo from "@sports/ui/team-logo";
import RollingNumber from "@sports/ui/rolling-number";
import { useJson } from "@sports/ui/client-data";
import { etToday } from "@sports/ui/format";
import { useLiveScores } from "@/lib/live";
import type { GameDay, GameIndex } from "@/lib/types";
import { loopCopies, tickerItems, type TickerItem, type TickerSide } from "./score-ticker-items";

/** Resting drift, px per second. */
const SPEED = 26;
/** Edge fade (alpha only), so items slide in and out instead of being cut. */
const FADE = "[mask-image:linear-gradient(to_right,transparent,#000_20px,#000_calc(100%-20px),transparent)]";

export default function ScoreTicker() {
  // The day is read after mount so the server HTML (no ticker) and the first client render agree.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(etToday()), []);
  const index = useJson<GameIndex>(today ? "games/index.json" : null);
  const hasSlate = !!today && !!index.data?.days.some(d => d.day === today && d.games > 0);
  const slate = useJson<GameDay>(hasSlate ? `games/${today}.json` : null);
  const games = slate.status === "ready" && slate.data.day === today ? slate.data.games : null;
  const live = useLiveScores(games ? today : null, games);
  const items = useMemo(() => tickerItems(games ?? [], live.byGame), [games, live.byGame]);
  if (!today || !items.length) return null;
  return (
    <section aria-label="Today's scores" className="-mx-4 -mb-6 -mt-6 border-b border-line sm:-mx-6 lg:mx-0">
      <Track items={items} day={today} />
    </section>
  );
}

function Track({ items, day }: { items: TickerItem[]; day: string }) {
  const reduce = useReducedMotion() ?? false;
  const view = useRef<HTMLDivElement>(null);
  const firstSet = useRef<HTMLUListElement>(null);
  const [setWidth, setSetWidth] = useState(0);
  const [extra, setExtra] = useState(0);

  // Measure one copy of the items against the viewport to know how many repeats the loop needs.
  useEffect(() => {
    const v = view.current, s = firstSet.current;
    if (!v || !s || reduce) { setExtra(0); setSetWidth(0); return; }
    const measure = () => { const w = s.offsetWidth; setSetWidth(w); setExtra(loopCopies(w, v.clientWidth)); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(v); ro.observe(s);
    return () => ro.disconnect();
  }, [items, reduce]);

  const baseX = useMotionValue(0);
  const paused = useRef(false);
  const inView = useInView(view);
  const { scrollY } = useScroll();
  const smooth = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const boost = useTransform(smooth, v => Math.min(5, Math.abs(v) / 500));
  const skewX = useTransform(smooth, [-2500, 0, 2500], [5, 0, -5]);
  // `extra` copies of the set follow the real one; wrapping across them shows no seam.
  const x = useTransform(baseX, v => (setWidth && extra ? wrap(-extra * setWidth, 0, v) : 0));

  useAnimationFrame((_, delta) => {
    if (reduce || !setWidth || !extra || paused.current || !inView) return;
    baseX.set(baseX.get() - SPEED * (Math.min(delta, 64) / 1000) * (1 + boost.get()));
  });

  // Keyboard focus pauses the drift and brings the focused score into view.
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    paused.current = true;
    const v = view.current, li = (e.target as HTMLElement).closest("li");
    if (!v || !li || reduce) return;
    v.scrollLeft = 0;
    const left = li.offsetLeft + x.get();
    if (left < 0 || left + li.offsetWidth > v.clientWidth) baseX.set(-(li.offsetLeft - 20));
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) paused.current = false;
  };

  const copies = setWidth ? 2 * extra - 1 : 0;
  return (
    <div ref={view} onFocus={onFocus} onBlur={onBlur}
      onPointerEnter={e => { if (e.pointerType === "mouse") paused.current = true; }}
      onPointerLeave={e => { if (e.pointerType === "mouse" && !view.current?.contains(document.activeElement)) paused.current = false; }}
      onPointerDown={e => { if (e.pointerType !== "mouse") paused.current = !paused.current; }}
      className={reduce ? "no-scrollbar overflow-x-auto px-4 sm:px-6" : `overflow-hidden ${FADE}`}>
      <motion.div className="relative flex w-max" style={reduce ? undefined : { x, skewX }}>
        <ItemSet ref={firstSet} items={items} day={day} />
        {Array.from({ length: Math.max(0, copies) }, (_, i) => <ItemSet key={i} items={items} day={day} copy />)}
      </motion.div>
    </div>
  );
}

function ItemSet({ items, day, copy, ref }: { items: TickerItem[]; day: string; copy?: boolean; ref?: React.Ref<HTMLUListElement> }) {
  return (
    <ul ref={ref} aria-hidden={copy || undefined} inert={copy || undefined} className="flex shrink-0 items-center">
      {items.map(it => <Item key={it.id} it={it} day={day} copy={copy} />)}
    </ul>
  );
}

function Item({ it, day, copy }: { it: TickerItem; day: string; copy?: boolean }) {
  const label = `${it.away.name} ${it.away.score}, ${it.home.name} ${it.home.score}, ${it.status}. Open game`;
  return (
    <li className="shrink-0 pr-2">
      <Link href={`/games/?d=${day}&g=${it.id}`} aria-label={label} tabIndex={copy ? -1 : undefined}
        className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-ink transition-colors hover:bg-deck2 focus-visible:bg-deck2">
        <Team s={it.away} live={it.live} lost={!it.live && !it.awayWon} />
        <Team s={it.home} live={it.live} lost={!it.live && it.awayWon} />
        <span className={`whitespace-nowrap font-medium tnum ${it.live ? "text-hot" : "text-mute"}`}>{it.status}</span>
      </Link>
    </li>
  );
}

function Team({ s, live, lost }: { s: TickerSide; live: boolean; lost: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 whitespace-nowrap ${lost ? "text-mute" : ""}`}>
      <TeamLogo src={s.logo} name={s.name} size={16} />
      <span className="font-medium">{s.short}</span>
      {live ? <RollingNumber value={s.score} className="font-semibold" /> : <span className="font-semibold tnum">{s.score}</span>}
    </span>
  );
}
