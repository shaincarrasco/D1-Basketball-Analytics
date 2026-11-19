"use client";
// Pinned live game (phones). When a followed team is playing live today, a compact score bar
// sits just above the bottom tab bar on every page except that game's own sheet. Several live:
// the closest game shows, and a "+N" chip cycles through the rest. Swipe it down or tap × to
// hide it for that game (this session). Live scores come from the same feed as the home page.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import TeamLogo from "@sports/ui/team-logo";
import RollingNumber from "@sports/ui/rolling-number";
import { useJson } from "@sports/ui/client-data";
import { etToday } from "@sports/ui/format";
import { useFavorites } from "@/lib/favorites";
import { haptic } from "@/lib/haptics";
import { useLiveScores, withLive, type LiveGame } from "@/lib/live";
import { normPath, swipeDismiss } from "@/lib/scroll-memory";
import type { Game, GameDay, GameIndex, GameSide } from "@/lib/types";

const gameHref = (day: string, id: string) => `/games/?d=${day}&g=${id}`; // same as the games page and home
const HIDDEN_KEY = "d1h-pinned-hidden";
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function readHidden(): string[] {
  try { const v = JSON.parse(sessionStorage.getItem(HIDDEN_KEY) ?? "[]"); return Array.isArray(v) ? v.filter(x => typeof x === "string") : []; } catch { return []; }
}
function writeHidden(ids: string[]) {
  try { sessionStorage.setItem(HIDDEN_KEY, JSON.stringify(ids.slice(-40))); } catch { /* storage blocked */ }
}

/** Closest score first, then the later game (more elapsed time). */
function byCloseness(a: { g: Game; l: LiveGame }, b: { g: Game; l: LiveGame }) {
  const m = (x: Game) => Math.abs((x.home.score ?? 0) - (x.away.score ?? 0));
  return m(a.g) - m(b.g) || (b.l.elapsed ?? 0) - (a.l.elapsed ?? 0);
}

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function PinnedLive({ suppressed = false, onVisibleChange }: { suppressed?: boolean; onVisibleChange?: (v: boolean) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const path = usePathname() ?? "/";
  const params = useSearchParams();
  const fav = useFavorites();

  // Load today's slate only for readers who follow a team, the way the home Today section does.
  const today = mounted ? etToday() : null;
  const index = useJson<GameIndex>(mounted && fav.teams.length ? "games/index.json" : null);
  const hasToday = !!today && !!index.data?.days.some(d => d.day === today && d.games > 0);
  const slate = useJson<GameDay>(hasToday ? `games/${today}.json` : null);
  const favKey = fav.teams.join(",");
  const mine = useMemo(() => {
    if (slate.status !== "ready" || slate.data.day !== today) return null;
    const set = new Set(favKey ? favKey.split(",") : []);
    const list = slate.data.games.filter(g => (g.home.slug && set.has(g.home.slug)) || (g.away.slug && set.has(g.away.slug)));
    return list.length ? list : null;
  }, [slate.status, slate.data, today, favKey]);
  const live = useLiveScores(mine ? today : null, mine);

  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => { if (mounted) setHidden(readHidden()); }, [mounted]);

  // Only games the live feed says are in progress right now (the static file can be hours old).
  const games = useMemo(() => {
    const out: { g: Game; l: LiveGame }[] = [];
    for (const g of mine ?? []) {
      const l = live.byGame.get(g.id);
      if (l?.state === "in" && !hidden.includes(g.id)) out.push({ g: withLive(g, l), l });
    }
    return out.sort(byCloseness);
  }, [mine, live.byGame, hidden]);

  // Which one is showing: the closest by default; the "+N" chip moves on to the next.
  const [pick, setPick] = useState<string | null>(null);
  const cur = games.find(x => x.g.id === pick) ?? games[0] ?? null;
  const cycle = () => {
    if (games.length < 2 || !cur) return;
    const i = games.findIndex(x => x.g.id === cur.g.id);
    setPick(games[(i + 1) % games.length].g.id);
    haptic("select");
  };

  // A tick when a followed team scores.
  const scores = useRef(new Map<string, string>());
  useEffect(() => {
    let changed = false;
    for (const { g } of games) {
      const s = `${g.away.score}-${g.home.score}`, was = scores.current.get(g.id);
      if (was !== undefined && was !== s) changed = true;
      scores.current.set(g.id, s);
    }
    if (changed) haptic("tick");
  }, [games]);

  const onOwnSheet = !!cur && normPath(path) === "/games" && params.get("g") === cur.g.id;
  const show = mounted && !suppressed && !!cur && !!today && !onOwnSheet;
  useEffect(() => { onVisibleChange?.(show); }, [show, onVisibleChange]);
  useEffect(() => () => onVisibleChange?.(false), [onVisibleChange]);

  // Sit just above the tab bar, whatever its height (safe area included).
  const [tabH, setTabH] = useState<number | null>(null);
  useEffect(() => {
    if (!show) return;
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Tabs"]');
    if (!nav) return;
    const measure = () => setTabH(nav.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [show]);

  // Enter, drag and leave: transform and opacity only; nothing moves with reduced motion.
  const [entered, setEntered] = useState(false);
  const [dy, setDy] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const dragging = useRef(false);
  const moved = useRef(false);
  useEffect(() => {
    if (!show) { setEntered(false); return; }
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, [show]);

  const dismiss = useCallback((id: string) => {
    const finish = () => {
      setHidden(h => { const next = [...h.filter(x => x !== id), id]; writeHidden(next); return next; });
      setLeaving(false); setDy(0); setPick(null);
    };
    haptic("tick");
    if (reduced()) finish();
    else { setLeaving(true); window.setTimeout(finish, 220); }
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!cur || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("button")) return; // the chip and × are plain taps
    const y0 = e.clientY, t0 = performance.now(), id = cur.g.id, still = reduced();
    dragging.current = true; moved.current = false;
    const move = (ev: PointerEvent) => {
      const d = Math.max(0, ev.clientY - y0);
      if (d > 6) moved.current = true;
      if (!still) setDy(d);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      dragging.current = false;
      const d = ev.clientY - y0;
      if (ev.type === "pointerup" && swipeDismiss(d, performance.now() - t0)) dismiss(id);
      else setDy(0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  if (!show || !cur) return null;
  const { g, l } = cur;
  const extra = games.length - 1;
  const still = reduced();
  const offset = leaving ? 96 : dy;
  const style: React.CSSProperties = {
    bottom: tabH != null ? `${tabH + 8}px` : "calc(72px + env(safe-area-inset-bottom))",
    transform: still ? undefined : `translateY(${entered ? offset : 16}px)`,
    opacity: leaving ? 0 : entered || still ? Math.max(0.35, 1 - dy / 160) : 0,
    transition: still || dragging.current ? "none" : `transform 320ms ${EASE}, opacity 220ms ${EASE}`,
  };
  const status = l.label || "Live";
  const label = `${g.away.name} ${g.away.score ?? 0}, ${g.home.name} ${g.home.score ?? 0}, ${status}. Open game`;

  return (
    <div className="pointer-events-none fixed inset-x-0 z-30 px-3 lg:hidden" style={style}>
      <div onPointerDown={onPointerDown} style={{ touchAction: "none" }}
        className="pointer-events-auto mx-auto flex h-[52px] max-w-[560px] items-center rounded-2xl border border-line2 bg-deck/95 backdrop-blur-xl">
        <Link href={gameHref(today!, g.id)} aria-label={label} draggable={false}
          onClick={e => { if (moved.current) { e.preventDefault(); moved.current = false; } }}
          className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-l-2xl pl-3 pr-1 focus-visible:outline-offset-[-2px]">
          <Side s={g.away} />
          <RollingNumber value={g.away.score ?? 0} className="text-[19px] font-semibold tnum" />
          <span className="mx-auto shrink-0 px-1 text-center text-[12.5px] font-semibold text-hot tnum">{status}</span>
          <RollingNumber value={g.home.score ?? 0} className="text-[19px] font-semibold tnum" />
          <Side s={g.home} home />
        </Link>
        {extra > 0 && (
          <button type="button" onClick={cycle} aria-label={`Show another live game (${extra} more)`}
            className="grid h-11 min-w-[44px] shrink-0 place-items-center">
            <span className="rounded-full border border-line2 px-2 py-0.5 text-[12px] font-semibold text-mute tnum">+{extra}</span>
          </button>
        )}
        <button type="button" onClick={() => dismiss(g.id)} aria-label="Hide this game"
          className="mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-dim hover:text-ink">
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function Side({ s, home = false }: { s: GameSide; home?: boolean }) {
  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${home ? "flex-row-reverse" : ""}`}>
      <TeamLogo src={s.logo} name={s.name} size={22} />
      <span className="truncate text-[13.5px] font-semibold">{s.short ?? s.name}</span>
    </span>
  );
}
