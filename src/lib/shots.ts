// Shot-location helpers. ESPN coordinates: x = 0–50 ft across the court, y = feet out
// from the basket (basket at x 25, y 0; the baseline sits at y ≈ −5.25).

export type Shot = [x: number, y: number, made: number, value: number, ...rest: (string | number)[]];
export type ZoneId = "rim" | "paint" | "midL" | "midC" | "midR" | "c3L" | "c3R" | "ab3L" | "ab3C" | "ab3R";

export const ZONES: { id: ZoneId; label: string }[] = [
  { id: "rim", label: "At the rim" }, { id: "paint", label: "Paint" },
  { id: "midL", label: "Mid-range left" }, { id: "midC", label: "Mid-range middle" }, { id: "midR", label: "Mid-range right" },
  { id: "c3L", label: "Left corner 3" }, { id: "c3R", label: "Right corner 3" },
  { id: "ab3L", label: "Left wing 3" }, { id: "ab3C", label: "Top of the key 3" }, { id: "ab3R", label: "Right wing 3" },
];

export function zoneOf(x: number, y: number, value: number): ZoneId {
  const dist = Math.hypot(x - 25, y);
  if (value === 3) {
    if (y < 8.75) return x < 25 ? "c3L" : "c3R";
    const angle = Math.atan2(x - 25, y) * (180 / Math.PI); // 0 = straight on
    return angle < -22 ? "ab3L" : angle > 22 ? "ab3R" : "ab3C";
  }
  if (dist < 4) return "rim";
  if (x >= 19 && x <= 31 && y <= 13.75) return "paint";
  const angle = Math.atan2(x - 25, y) * (180 / Math.PI);
  return angle < -30 ? "midL" : angle > 30 ? "midR" : "midC";
}

export type ZoneStats = Record<ZoneId, { fga: number; fgm: number }>;
export function zoneStats(shots: Shot[]): ZoneStats {
  const out = Object.fromEntries(ZONES.map(z => [z.id, { fga: 0, fgm: 0 }])) as ZoneStats;
  for (const s of shots) { const z = out[zoneOf(s[0], s[1], s[3])]; z.fga++; z.fgm += s[2] ? 1 : 0; }
  return out;
}
