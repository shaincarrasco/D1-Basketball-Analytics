// Pure geometry for the phone date wheel: where a day sits on the arc for a given offset from the
// centre, the rubber band past the ends, and where a flick comes to rest. Units: offsets and
// positions are in days (index units), distances in px, velocity in days per second.

export const WHEEL = {
  /** Arc length between neighbouring days at the centre, px. */
  step: 76,
  /** Degrees of arc per day: small, so the curve reads as a gentle wheel, not a dial. */
  degPerDay: 4,
  /** Days either side of the centre that stay visible before fading out completely. */
  reach: 2.6,
};

export type Pose = { x: number; y: number; rotate: number; scale: number; opacity: number };

/** Position of a day `offset` days from the centre (negative = left). The wheel's hub sits below the strip. */
export function wheelPose(offset: number, opts = WHEEL): Pose {
  const rad = (offset * opts.degPerDay * Math.PI) / 180;
  const radius = opts.step / ((opts.degPerDay * Math.PI) / 180);
  const dist = Math.min(Math.abs(offset) / opts.reach, 1);
  return {
    x: radius * Math.sin(rad),
    y: radius * (1 - Math.cos(rad)),
    rotate: offset * opts.degPerDay,
    scale: 1 - Math.min(Math.abs(offset) * 0.06, 0.3),
    opacity: Math.cos((dist * Math.PI) / 2),
  };
}

/** Drag past either end gives way at a third of the finger's travel, so the ends feel soft. */
export function rubberBand(pos: number, min: number, max: number, give = 0.33): number {
  if (pos < min) return min - (min - pos) * give;
  if (pos > max) return max + (pos - max) * give;
  return pos;
}

/** Index a flick settles on: project the release velocity forward (`power` seconds of glide), round to a day, keep in range. */
export function flickTarget(pos: number, velocity: number, count: number, power = 0.22): number {
  if (count <= 0) return 0;
  const projected = pos + velocity * power;
  return Math.min(count - 1, Math.max(0, Math.round(projected)));
}

/** Index of the first listed day on or after `day` (ISO dates sort as strings), else the last one. */
export function anchorIndex(days: readonly string[], day: string): number {
  if (!days.length) return 0;
  const i = days.findIndex(d => d >= day);
  return i === -1 ? days.length - 1 : i;
}
