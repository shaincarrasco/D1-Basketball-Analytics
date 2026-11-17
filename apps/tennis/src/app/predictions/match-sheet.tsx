"use client";
// One match: the prediction up top, then its Match Brief (briefs/<id>.json, loaded on demand).
// Modal on desktop, bottom sheet on phones; Escape, the backdrop or the close button dismiss it,
// focus is trapped inside and handed back on close (same behaviour as D1 Hoops' game sheet).
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useJson } from "@sports/ui/client-data";
import { Loading } from "@sports/ui/states";
import { pctFmt } from "@sports/ui/format";
import WinSplit, { P1, P2 } from "@/components/win-split";
import MatchBrief from "@/components/match-brief";
import { lastName, levelLabel, pctPair, pickOf, pickRight, probOf, stateOf, winnerOf, type Brief, type DMatch, type Side } from "@/lib/deuce";
import PlayerName from "@/components/player-name";

const FOCUSABLE = 'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function SetScores({ m }: { m: DMatch }) {
  const sp = m.set_probs;
  if (!sp || !Object.keys(sp).length) return null;
  // Keys are p1-p2 set counts ("2-0" = p1 in straight sets). Show each as "<name> 2-0".
  const cells = Object.entries(sp).map(([k, v]) => {
    const [a, b] = k.split("-").map(Number);
    const who: Side = a > b ? "p1" : "p2";
    return { k, who, label: `${lastName(m[who].name)} ${Math.max(a, b)}-${Math.min(a, b)}`, v };
  }).sort((x, y) => (x.who === y.who ? 0 : x.who === "p1" ? -1 : 1));
  return (
    <div>
      <h3 className="mb-1.5 text-[12.5px] font-semibold text-mute">Chance of each score in sets</h3>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {cells.map(c => (
          <li key={c.k} className="deck-flat flex items-center justify-between gap-2 px-3 py-2">
            <span className="flex min-w-0 items-center gap-1.5 truncate text-[13px] text-mute"><span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.who === "p1" ? P1 : P2 }} />{c.label}</span>
            <b className="font-display text-lg tnum">{pctFmt(c.v)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Head({ m }: { m: DMatch }) {
  const st = stateOf(m), pick = pickOf(m), w = winnerOf(m), right = pickRight(m);
  const labels = pctPair(m);
  const side = (s: Side) => {
    const p = m[s];
    return (
      <div className={`flex min-w-0 flex-col ${s === "p2" ? "items-end text-right" : ""}`}>
        <span className={`font-display text-[44px] leading-none tnum sm:text-[56px] ${m.low_data ? "font-bold text-mute" : pick === s ? "font-black text-ink" : "font-bold text-mute"}`}>{labels[s === "p1" ? 0 : 1]}</span>
        <PlayerName p={p} won={w === s} className="mt-1 max-w-full text-[16px] font-semibold sm:text-lg" />
        <span className="text-[12.5px] text-dim">{[p.country, p.elo != null ? `Elo ${Math.round(p.elo).toLocaleString("en-US")}` : "Elo —"].filter(Boolean).join(", ")}</span>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 items-end gap-3">{side("p1")}{side("p2")}</div>
      <WinSplit p1={probOf(m, "p1")} p2={probOf(m, "p2")} labels={labels} p1Name={m.p1.name} p2Name={m.p2.name} quiet={m.low_data} thick />
      {st !== "pre" && (
        <p className="text-[14px] text-mute">
          {st === "live" ? <><b className="text-bad">Live</b>{m.score ? <>, <span className="tnum text-ink">{m.score}</span></> : null}. The numbers are from before the match.</>
            : <>{w ? <><b className="text-ink">{m[w].name}</b> won</> : "Finished"}{m.score ? <> <span className="tnum text-ink">{m.score}</span></> : null}.{" "}
              {right === true && <b className="text-good">The pick was right.</b>}{right === false && <b className="text-bad">The pick was wrong.</b>}{" "}
              The numbers are from before the match.</>}
        </p>
      )}
      {m.low_data && <p className="note text-[14px] text-mute">At least one player has fewer than 15 matches on record, so this probability is rough.</p>}
    </div>
  );
}

export default function MatchSheet({ m, onClose }: { m: DMatch; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const brief = useJson<Brief>(m.brief ? `briefs/${m.id}.json` : null);
  const ready = brief.status === "ready" ? brief.data : null;

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
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
      back?.focus?.({ preventScroll: true });
    };
  }, []);

  const st = stateOf(m);
  const when = new Date(m.date).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const titleId = `match-${m.id}-title`;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-[rgb(var(--scoreboard-rgb)/0.72)] backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="sheet-in relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[18px] border border-line2 bg-deck sm:max-h-[90vh] sm:max-w-[880px] sm:rounded-[18px]">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line2 sm:hidden" aria-hidden />
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
          {st === "live" && <span className="live-dot" aria-hidden />}
          <div className="min-w-0 flex-1 leading-tight">
            <h2 id={titleId} className="truncate font-display text-lg font-extrabold uppercase">{m.tournament}</h2>
            <p className="truncate text-[12.5px] text-mute">{[m.round, levelLabel(m.level, m.tour), m.surface, st === "pre" ? when : null].filter(Boolean).join(", ")}</p>
          </div>
          <button ref={closeBtn} onClick={onClose} className="btn !p-2" aria-label="Close match brief"><X size={18} aria-hidden /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pb-10 pt-5 sm:px-6">
          <span className="sr-only">{m.p1.name} vs {m.p2.name}</span>
          <div className="flex flex-col gap-6">
            <Head m={m} />
            <SetScores m={m} />
            <hr className="border-line" />
            <h3 className="h-section font-display -mb-2">Match Brief</h3>
            {!m.brief ? <p className="text-[14.5px] text-mute">No Match Brief for this match yet. Briefs are written for upcoming matches once both players are known.</p>
              : brief.status === "error" ? <p className="text-[14.5px] text-mute">The Match Brief didn&apos;t load. {brief.error} <button className="link font-semibold underline" onClick={brief.retry}>Try again</button></p>
              : !ready ? <Loading label="Loading the Match Brief" />
              : <MatchBrief brief={ready} names={{ p1: m.p1.name, p2: m.p2.name }} pick={pickOf(m)} surface={m.surface} />}
          </div>
        </div>
      </div>
    </div>
  );
}
