"use client";
// Predictions: every match from 3 days ago to 10 days ahead with the model's win probability,
// by day and tournament. The open match lives in the URL (?m=<id>) so a Match Brief can be shared;
// Next.js keeps useSearchParams in sync with history.pushState / replaceState.
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, X } from "lucide-react";
import { useJson } from "@sports/ui/client-data";
import { Empty, ErrorState, Loading } from "@sports/ui/states";
import { relativeTime } from "@sports/ui/format";
import WinSplit, { P1, P2 } from "@/components/win-split";
import { dayKey, defaultDay, levelLabel, pctPair, pickOf, pickRight, probOf, shiftDay, stateOf, surfaceVar, winnerOf, type DMatch, type Predictions as Data, type Side } from "@/lib/deuce";
import PlayerName from "@/components/player-name";
import MatchSheet from "./match-sheet";

type Tour = "all" | "ATP" | "WTA";

// Set when this page pushed the ?m= entry, so closing can step back instead of stacking history.
let pushed = false;
function setUrl(m: string | null, mode: "push" | "replace") {
  if (!m && pushed) { pushed = false; window.history.back(); return; }
  pushed = mode === "push";
  const p = new URLSearchParams(window.location.search);
  if (m) p.set("m", m); else p.delete("m");
  const s = p.toString();
  const url = s ? `?${s}` : window.location.pathname;
  if (mode === "push") window.history.pushState(null, "", url); else window.history.replaceState(null, "", url);
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayLabel = (day: string, today: string) =>
  day === today ? "Today" : day === shiftDay(today, -1) ? "Yesterday" : day === shiftDay(today, 1) ? "Tomorrow" : new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
const dateLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Verdict({ right }: { right: boolean | null }) {
  if (right === null) return null;
  return right
    ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-good"><Check size={13} strokeWidth={3} aria-hidden />Pick right</span>
    : <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-bad"><X size={13} strokeWidth={3} aria-hidden />Pick wrong</span>;
}

function Row({ m, onOpen }: { m: DMatch; onOpen: () => void }) {
  const st = stateOf(m), pick = pickOf(m), w = winnerOf(m), right = pickRight(m);
  const quiet = m.low_data, labels = pctPair(m);
  const side = (s: Side) => {
    const mine = pick === s;
    return (
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: s === "p1" ? P1 : P2, opacity: quiet ? 0.45 : 1 }} />
        <PlayerName p={m[s]} won={w === s} className={`flex-1 text-[15px] ${w ? (w === s ? "font-semibold text-ink" : "text-mute") : "font-semibold"}`} />
        <span className={`w-11 text-right font-display text-[19px] tnum ${quiet ? "font-semibold text-dim" : mine ? "font-extrabold text-ink" : "font-semibold text-mute"}`}>{labels[s === "p1" ? 0 : 1]}</span>
      </div>
    );
  };
  return (
    <li className="relative grid grid-cols-[3.6rem_1fr] gap-x-3 py-3 sm:grid-cols-[4.5rem_1fr]">
      {/* The whole row opens the brief; player links sit above this button. */}
      <button type="button" onClick={onOpen} className="absolute inset-0 z-0 rounded-lg hover:bg-[rgb(var(--ink-rgb)/0.03)]"
        aria-label={`Open Match Brief: ${m.p1.name} vs ${m.p2.name}`} />
      <div className="pointer-events-none relative pt-0.5 leading-tight">
        <span className={`block font-display text-[17px] font-extrabold tnum ${st === "live" ? "text-bad" : ""}`}>{st === "live" ? "LIVE" : st === "done" ? "Final" : time(m.date)}</span>
        <span className="block truncate text-[11.5px] text-dim">{m.round ?? ""}</span>
      </div>
      <div className="pointer-events-none relative flex min-w-0 flex-col gap-1 [&_a]:pointer-events-auto">
        {side("p1")}
        {side("p2")}
        <div className="mt-1 pr-[3.25rem] pl-4"><WinSplit p1={probOf(m, "p1")} p2={probOf(m, "p2")} labels={labels} p1Name={m.p1.name} p2Name={m.p2.name} quiet={quiet} /></div>
        {(st !== "pre" && m.score) || right !== null || quiet || m.brief ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-4 text-[12.5px] text-mute">
            {st !== "pre" && m.score && <span className="font-semibold text-ink tnum">{m.score}</span>}
            <Verdict right={right} />
            {quiet && <span>Few matches on record, so this is a rough estimate.</span>}
            {m.brief && !quiet && st === "pre" && <span className="text-dim">Match Brief</span>}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export default function Predictions() {
  const params = useSearchParams();
  const q = useJson<Data>("predictions.json");
  const [tour, setTour] = useState<Tour>("all");
  const [day, setDay] = useState<string | null>(null);
  const today = useMemo(() => dayKey(new Date().toISOString()), []);
  const openId = params.get("m");

  const all = useMemo(() => [...(q.data?.matches ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [q.data]);
  const list = useMemo(() => all.filter(m => tour === "all" || m.tour === tour), [all, tour]);
  const days = useMemo(() => [...new Set(list.map(m => dayKey(m.date)))].sort(), [list]);
  const open = openId ? all.find(m => m.id === openId) ?? null : null;
  const strip = useRef<HTMLDivElement>(null);
  const active = q.data ? (day && days.includes(day) ? day : defaultDay(days, today)) : null;
  // Keep the chosen day in view in the scrolling strip (instant: no motion needed).
  useLayoutEffect(() => {
    const box = strip.current, el = box?.querySelector<HTMLElement>(`[data-day="${active}"]`);
    if (box && el) box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2;
  }, [active]);

  // A shared link opens on its match's day.
  useEffect(() => { if (open && day === null) setDay(dayKey(open.date)); }, [open, day]);

  if (q.error) return <ErrorState message={q.error} retry={q.retry} />;
  if (!q.data) return <Loading label="Loading predictions" />;
  const shown = list.filter(m => dayKey(m.date) === active);
  const groups = [...shown.reduce((acc, m) => {
    const k = `${m.tour}|${m.tournament}`;
    (acc.get(k) ?? acc.set(k, []).get(k)!).push(m);
    return acc;
  }, new Map<string, DMatch[]>()).values()].sort((a, b) => Number(b.some(m => stateOf(m) === "live")) - Number(a.some(m => stateOf(m) === "live")) || a[0].date.localeCompare(b[0].date));
  const done = shown.filter(m => pickRight(m) !== null), hits = done.filter(m => pickRight(m)).length;
  const toPlay = shown.filter(m => stateOf(m) !== "done").length;
  const dayRecord = (d: string) => {
    const ms = list.filter(m => dayKey(m.date) === d), fin = ms.filter(m => pickRight(m) !== null);
    return fin.length && fin.length === ms.length ? `${fin.filter(m => pickRight(m)).length}/${fin.length} right` : `${ms.length} ${ms.length === 1 ? "match" : "matches"}`;
  };

  return (
    <section aria-label="Predictions">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Tour">
          {(["all", "ATP", "WTA"] as const).map(t => <button key={t} aria-pressed={tour === t} onClick={() => setTour(t)}>{t === "all" ? "Both tours" : t === "ATP" ? "Men" : "Women"}</button>)}
        </div>
        <span className="text-xs text-dim">Updated {relativeTime(q.data.generated_at)}. Times in your time zone.</span>
      </div>
      {days.length === 0 ? <Empty title="No predictions right now">The model covers singles matches from three days ago to ten days ahead. Challenger and ITF events appear once their data sources are connected. Check back when the next event starts.</Empty> : <>
        <div ref={strip} className="no-scrollbar relative -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Day">
          {days.map(d => {
            const sel = d === active;
            return (
              <button key={d} data-day={d} onClick={() => setDay(d)} aria-pressed={sel}
                className={`flex w-[78px] shrink-0 flex-col items-center rounded-xl border px-1 py-2 leading-none ${sel ? "border-line2 bg-deck2 text-ink" : "border-transparent text-mute hover:bg-deck hover:text-ink"}`}>
                <span className={`text-[11.5px] font-semibold ${d === today && !sel ? "text-bulb-ink" : ""}`}>{dayLabel(d, today)}</span>
                <span className="mt-1.5 whitespace-nowrap text-[15px] font-semibold text-ink">{dateLabel(d)}</span>
                <span className="mt-1.5 whitespace-nowrap text-[11px] tnum">{dayRecord(d)}</span>
              </button>
            );
          })}
        </div>
        {done.length > 0 && (
          <p className="mb-4 text-[15px] text-mute">
            Picked <b className="font-display text-xl font-extrabold text-ink tnum">{hits} of {done.length}</b> finished matches right{toPlay ? `, ${toPlay} still to play` : ""}.
          </p>
        )}
        {openId && !open && <p className="note mb-4 text-[14px] text-mute">That match is no longer in the prediction window (three days back to ten ahead).</p>}
        <div className="flex flex-col gap-5">
          {groups.map(ms => {
            const f = ms[0];
            return (
              <article key={`${f.tour}-${f.tournament}`} className="deck relative overflow-hidden px-4 pb-1 pt-4 sm:px-5" aria-label={f.tournament}>
                <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: surfaceVar(f.surface) }} />
                <header className="mb-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <h2 className="font-display text-xl font-extrabold uppercase leading-tight">{f.tournament}</h2>
                  <span className="text-[12.5px] text-mute">{[levelLabel(f.level, f.tour), f.surface ?? "Surface unknown", f.tour === "ATP" ? "Men" : f.tour === "WTA" ? "Women" : null].filter(Boolean).join(", ")}</span>
                </header>
                <ul className="grid lg:grid-cols-2 lg:gap-x-10 [&>li]:border-t [&>li]:border-line">
                  {ms.map(m => <Row key={m.id} m={m} onOpen={() => setUrl(m.id, "push")} />)}
                </ul>
              </article>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-dim">Probabilities come from Elo ratings, surface form, workload and head-to-head, calibrated on past matches. Finished matches show the pre-match number. <Link className="link underline" href="/model/">How accurate it has been</Link>.</p>
      </>}
      {open && <MatchSheet m={open} onClose={() => setUrl(null, "replace")} />}
    </section>
  );
}
