"use client";
// Adapted from Componentry's Wheel Carousel (MIT, Harsh Jadhav, https://componentry.dev).
// The phone date picker: game days sit on a gentle horizontal wheel. Drag or flick it and it
// glides, then snaps to a day; days curve away and fade toward the edges; the day at the centre is
// the selected one, and settling on a new day selects it. Tapping a day selects it too.
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform, type AnimationPlaybackControls, type MotionValue } from "framer-motion";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { DayFace, dayAria, type StripDay } from "./day-pill";
import { WHEEL, anchorIndex, flickTarget, rubberBand, wheelPose } from "./wheel";

type Props = {
  days: StripDay[]; day: string; today: string;
  onSelect: (day: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
};

/** Days rendered either side of the centre; the rest are off the wheel's visible arc. */
const WINDOW = 3;
/** Finger travel before a press becomes a drag (below it, the press is a tap on the day). */
const SLOP = 6;
const FADE = "linear-gradient(to right, transparent 0, #000 22%, #000 78%, transparent 100%)";

function WheelSlot({ i, pos, children }: { i: number; pos: MotionValue<number>; children: ReactNode }) {
  const transform = useTransform(pos, v => {
    const p = wheelPose(i - v);
    return `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.rotate}deg) scale(${p.scale})`;
  });
  const opacity = useTransform(pos, v => wheelPose(i - v).opacity);
  return (
    <motion.div className="absolute left-1/2 top-[4px] -ml-[34px] w-[68px]" style={{ transform, opacity }}>
      {children}
    </motion.div>
  );
}

export default function DateWheel({ days, day, today, onSelect, onKeyDown }: Props) {
  const n = days.length;
  const anchor = anchorIndex(days.map(d => d.day), day);
  const reduce = useReducedMotion() ?? false;
  const pos = useMotionValue(anchor);
  const [center, setCenter] = useState(anchor);
  const [moving, setMoving] = useState(false);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const drag = useRef<{ id: number; x0: number; p0: number; active: boolean; caught: boolean; samples: { t: number; p: number }[] } | null>(null);
  // After a drag or a catch, the click that follows the release is not a tap on a day.
  const swallowUntil = useRef(0);
  // Latest props for callbacks that finish after a render.
  const latest = useRef({ day, days, onSelect });
  useEffect(() => { latest.current = { day, days, onSelect }; });

  const clampIndex = (v: number) => Math.min(n - 1, Math.max(0, Math.round(v)));
  useMotionValueEvent(pos, "change", v => {
    const c = clampIndex(v);
    setCenter(prev => (prev === c ? prev : c));
  });

  /** Glide to a day. From the reader's flick, landing on a new day selects it. */
  const settle = (target: number, velocity: number, fromUser: boolean) => {
    anim.current?.stop();
    const done = () => {
      setMoving(false);
      const { day: current, days: list, onSelect: select } = latest.current;
      const d = list[target];
      if (fromUser && d && d.day !== current) select(d.day);
    };
    if (reduce) { pos.set(target); done(); return; }
    setMoving(true);
    anim.current = animate(pos, target, { type: "spring", velocity, stiffness: 320, damping: 34, restDelta: 0.002, restSpeed: 0.02, onComplete: done });
  };

  // The selected day changed elsewhere (a tap, the arrows, Today, the date input): turn the wheel to it.
  useEffect(() => {
    if (drag.current?.active) return;
    if (Math.abs(pos.get() - anchor) < 0.001) return;
    settle(anchor, pos.getVelocity(), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);
  useEffect(() => () => anim.current?.stop(), []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    // A press while the wheel glides catches it, like a hand on a spinning wheel.
    const caught = anim.current != null && pos.isAnimating();
    if (caught) anim.current?.stop();
    drag.current = { id: e.pointerId, x0: e.clientX, p0: pos.get(), active: false, caught, samples: [{ t: e.timeStamp, p: pos.get() }] };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0;
    if (!d.active) {
      if (Math.abs(dx) < SLOP) return;
      // Now it's a drag: stop any glide, take the pointer, and start from where the wheel is.
      d.active = true;
      anim.current?.stop();
      d.p0 = pos.get() + dx / WHEEL.step;
      e.currentTarget.setPointerCapture(e.pointerId);
      setMoving(true);
    }
    const p = rubberBand(d.p0 - dx / WHEEL.step, 0, n - 1);
    pos.set(p);
    d.samples.push({ t: e.timeStamp, p });
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > 90) d.samples.shift();
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (!d.active && !d.caught) return; // a tap: the day's own click selects it
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    swallowUntil.current = performance.now() + 400;
    if (!d.active) { settle(clampIndex(pos.get()), 0, true); return; } // caught mid-glide: settle on the nearest day
    const first = d.samples[0], last = d.samples[d.samples.length - 1];
    const dt = (last.t - first.t) / 1000;
    const velocity = e.type === "pointercancel" || dt <= 0 ? 0 : (last.p - first.p) / dt;
    settle(flickTarget(pos.get(), velocity, n), velocity, true);
  };

  const centred = days[center];
  const plateOn = moving || centred?.day === day;
  const lo = Math.max(0, center - WINDOW), hi = Math.min(n - 1, center + WINDOW);
  const slots: number[] = [];
  for (let i = lo; i <= hi; i++) slots.push(i);
  if (anchor >= 0 && anchor < n && (anchor < lo || anchor > hi)) slots.push(anchor);

  return (
    <div
      role="group" aria-label="Pick a day" data-testid="date-wheel"
      className="relative h-[76px] min-w-0 flex-1 touch-pan-y select-none overflow-hidden"
      style={{ maskImage: FADE, WebkitMaskImage: FADE }}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
      onClickCapture={e => { if (performance.now() < swallowUntil.current) { e.stopPropagation(); e.preventDefault(); } }}
    >
      {/* The selection window stays put; days turn through it. */}
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-[4px] -ml-[34px] h-[62px] w-[68px] rounded-xl bg-deck2"
        style={{ opacity: plateOn ? 1 : 0, transition: reduce ? "none" : "opacity 200ms cubic-bezier(0.22, 1, 0.36, 1)" }} />
      {slots.map(i => {
        const d = days[i];
        const sel = d.day === day, atCentre = i === center;
        return (
          <WheelSlot key={d.day} i={i} pos={pos}>
            <button type="button" data-day={d.day} tabIndex={i === anchor ? 0 : -1} draggable={false}
              onClick={() => onSelect(d.day)} aria-pressed={sel} aria-label={dayAria(d, today)}
              className={`flex h-[62px] w-full flex-col items-center justify-center rounded-xl px-1 leading-none ${atCentre ? "text-ink" : "text-mute"}`}>
              <DayFace d={d} today={today} sel={atCentre} />
            </button>
          </WheelSlot>
        );
      })}
    </div>
  );
}
