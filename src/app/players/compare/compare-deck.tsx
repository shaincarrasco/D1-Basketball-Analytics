// Adapted from Componentry's Orbit Card Stack (MIT, Harsh Jadhav, https://componentry.dev).
"use client";
// The two compared players as a small fanned deck. At rest the cards overlap, the back one
// showing its name above the front one. Hover, focus or a tap fans them apart and lifts the
// active card; choosing a card highlights that player in the stat comparison below (choose it
// again to clear). Arrow keys move between cards, Escape closes the fan.
import Link from "next/link";
import { useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent } from "react";
import { useReducedMotion } from "framer-motion";
import TeamLogo from "@sports/ui/team-logo";
import { fmt } from "@sports/ui/format";
import { POS_WORD, type PlayerRow } from "../player-stats";

export type Tone = "a" | "b";
type Card = { p: PlayerRow; tone: Tone; color: string };

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Card transforms. Percentages are of the card's own width, so the fan scales with the screen. */
function placement(index: number, count: number, open: boolean, active: boolean, top: boolean) {
  const orbit = index - (count - 1) / 2; // -0.5 and 0.5 for two cards
  if (open) {
    return { x: orbit * 84, y: Math.abs(orbit) * 10 - (active ? 14 : 0), rot: orbit * 7, scale: active ? 1 : 0.97 };
  }
  // Closed: front card sits low, the back card peeks out above it with a small tilt.
  return { x: orbit * 10, y: top ? 18 : -22, rot: orbit * 5, scale: top ? 1 : 0.96 };
}

export default function CompareDeck({ cards, selected, onSelect }: {
  cards: Card[]; selected: Tone | null; onSelect: (tone: Tone | null) => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const stage = useRef<HTMLUListElement>(null);
  // At rest the chosen player's card (or the last one looked at) is in front.
  const selIndex = cards.findIndex(c => c.tone === selected);
  const front = active ?? (selIndex >= 0 ? selIndex : cards.length - 1);

  const activate = (i: number) => { setOpen(true); setActive(i); };
  const close = () => { setOpen(false); setActive(null); };
  const leaveFocus = (e: FocusEvent<HTMLUListElement>) => { if (!e.currentTarget.contains(e.relatedTarget)) close(); };
  const move = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step) {
      e.preventDefault();
      const next = (i + step + cards.length) % cards.length;
      stage.current?.querySelectorAll<HTMLElement>("[data-deck-card]")[next]?.focus();
    } else if (e.key === "Escape") {
      close();
    }
  };

  return (
    <section aria-label="Players" className="[overflow-x:clip]">
      <ul ref={stage} onMouseLeave={close} onBlur={leaveFocus}
        className="relative mx-auto h-[214px] w-full max-w-[560px]">
        {cards.map((c, i) => {
          const isFront = i === front;
          const pos = placement(i, cards.length, open, open && i === active, isFront);
          const chosen = selected === c.tone;
          const style: CSSProperties = {
            zIndex: isFront ? 3 : 1,
            transform: `translate(calc(-50% + ${pos.x}%), ${pos.y}px) rotate(${pos.rot}deg) scale(${pos.scale})`,
            transition: reduce ? "none" : `transform 420ms ${EASE}`,
            borderTopColor: c.color,
          };
          return (
            <li key={c.p.id} style={style}
              onMouseEnter={() => activate(i)}
              className="absolute left-1/2 top-[22px] w-[54%] min-w-[168px] max-w-[300px] origin-bottom">
              <article className={`relative rounded-[18px] border border-t-[3px] bg-deck p-3.5 transition-colors ${chosen ? "border-line2 bg-deck2" : "border-line"}`}
                style={{ borderTopColor: c.color }}>
                {/* The whole card is the highlight toggle; the name link sits above it. */}
                <button type="button" data-deck-card aria-pressed={chosen}
                  aria-label={`Highlight ${c.p.name} in the comparison`}
                  onFocus={() => activate(i)} onClick={() => { activate(i); onSelect(chosen ? null : c.tone); }} onKeyDown={e => move(e, i)}
                  className="absolute inset-0 rounded-[18px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)]" />
                <div className="flex items-center gap-2.5">
                  <TeamLogo src={c.p.team?.logo ?? null} name={c.p.team?.name ?? c.p.name} size={32} />
                  <div className="min-w-0">
                    <Link href={`/player/?id=${c.p.id}`} className="relative z-[1] block truncate text-[16px] font-semibold leading-tight hover:underline">{c.p.name}</Link>
                    <p className="truncate text-[12.5px] text-mute">
                      {[c.p.team?.short ?? c.p.team?.name, c.p.posN ? POS_WORD[c.p.posN] : c.p.pos].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-4 gap-1 border-t border-line pt-2.5 text-center">
                  <Stat label="pts" v={fmt(c.p.pts, 1)} />
                  <Stat label="reb" v={fmt(c.p.reb, 1)} />
                  <Stat label="ast" v={fmt(c.p.ast, 1)} />
                  <Stat label="mpg" v={fmt(c.p.min, 1)} />
                </dl>
                <p className="mt-2 text-center text-[11.5px] text-dim" aria-hidden>{chosen ? "Highlighted" : "Tap to highlight"}</p>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-mute">{label}</dt>
      <dd className="text-[16px] font-semibold tnum">{v}</dd>
    </div>
  );
}
