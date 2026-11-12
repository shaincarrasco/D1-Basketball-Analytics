// Half-court shot chart. "zones" shades each zone by FG% against the D-I average for that
// zone (needs `league`); "dots" draws every attempt (orange = make, hollow = miss).
import { ZONES, zoneOf, zoneStats, type Shot, type ZoneId, type ZoneStats } from "@/lib/shots";

const W = 50, Y0 = -5.25, Y1 = 31; // feet
const H = Y1 - Y0;
const sx = (x: number) => x;
const sy = (y: number) => y - Y0; // baseline at the top

// Rough zone label anchors (court feet).
const ANCHOR: Record<ZoneId, [number, number]> = {
  rim: [25, 1.4], paint: [25, 10.5], midL: [10.5, 8], midC: [25, 17.5], midR: [39.5, 8],
  c3L: [1.9, 3], c3R: [48.1, 3], ab3L: [7, 21], ab3C: [25, 27], ab3R: [43, 21],
};

function Court() {
  const arcR = 22.15, cornerX = 25 - 21.65;
  const yBreak = Math.sqrt(arcR ** 2 - 21.65 ** 2);
  return (
    <g fill="none" stroke="var(--line-2)" strokeWidth="0.25">
      <rect x="0" y="0" width={W} height={H} />
      <rect x="19" y={sy(-5.25)} width="12" height={13.75 + 5.25} />
      <circle cx="25" cy={sy(13.75)} r="6" strokeDasharray="0.8 0.8" />
      <path d={`M ${sx(cornerX)} ${sy(Y0)} V ${sy(yBreak)} A ${arcR} ${arcR} 0 0 0 ${sx(50 - cornerX)} ${sy(yBreak)} V ${sy(Y0)}`} />
      <path d={`M 21 ${sy(0)} A 4 4 0 0 0 29 ${sy(0)}`} />
      <line x1="22" x2="28" y1={sy(-1.25)} y2={sy(-1.25)} strokeWidth="0.4" />
      <circle cx="25" cy={sy(0)} r="0.75" />
    </g>
  );
}

export default function ShotChart({ shots, mode = "dots", league, title, className = "" }: {
  shots: Shot[]; mode?: "dots" | "zones"; league?: ZoneStats | null; title?: string; className?: string;
}) {
  const stats = zoneStats(shots);
  const total = shots.length;
  const made = shots.filter(s => s[2]).length;
  const label = title ?? `Shot chart: ${made} of ${total} field goals`;
  return (
    <figure className={className}>
      <svg viewBox={`-0.5 -0.5 ${W + 1} ${H + 1}`} role="img" aria-label={label} className="h-auto w-full rounded-lg bg-deck2">
        {mode === "zones" && league && (
          <g>
            {/* Zone shading: a dot grid coloured by zone, cheap and readable */}
            {Array.from({ length: 50 }, (_, i) => i + 0.5).flatMap(x => Array.from({ length: Math.floor(H) }, (_, j) => j + Y0 + 0.5).map(y => {
              const inside3 = Math.hypot(x - 25, y) > 22.15 || (y < 8.75 && (x < 3.35 || x > 46.65));
              const z = zoneOf(x, y, inside3 ? 3 : 2);
              const s = stats[z], l = league[z];
              if (!s.fga || !l?.fga) return null;
              const diff = s.fgm / s.fga - l.fgm / l.fga; // vs D-I average
              const a = Math.min(0.55, Math.abs(diff) * 2.2) * Math.min(1, s.fga / 8);
              return <rect key={`${x}-${y}`} x={x - 0.5} y={sy(y) - 0.5} width="1" height="1" fill={diff >= 0 ? "var(--win)" : "var(--loss)"} opacity={a} />;
            }))}
          </g>
        )}
        <Court />
        {mode === "dots" && shots.map((s, i) => s[2]
          ? <circle key={i} cx={sx(s[0])} cy={sy(s[1])} r="0.62" fill="var(--off)" opacity="0.85" />
          : <circle key={i} cx={sx(s[0])} cy={sy(s[1])} r="0.55" fill="none" stroke="var(--mute)" strokeWidth="0.22" opacity="0.7" />)}
        {mode === "zones" && ZONES.map(z => {
          const s = stats[z.id];
          if (!s.fga) return null;
          const [x, y] = ANCHOR[z.id];
          return (
            <g key={z.id}>
              <text x={x} y={sy(y)} textAnchor="middle" fontSize="2.1" fontWeight="700" fill="var(--ink)">{Math.round((s.fgm / s.fga) * 100)}%</text>
              <text x={x} y={sy(y) + 2.2} textAnchor="middle" fontSize="1.5" fill="var(--mute)">{s.fgm}/{s.fga}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
        <span>{made}/{total} FG ({total ? Math.round((made / total) * 100) : 0}%)</span>
        {mode === "dots" ? (
          <><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-off align-middle" />Make</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full border border-mute align-middle" />Miss</span></>
        ) : <span>Shading: <span className="text-win">above</span> / <span className="text-loss">below</span> the D-I average in that zone</span>}
      </figcaption>
    </figure>
  );
}
