// Shot diet: half-court zone map (fill = share of attempts) + attempt/make bars.
// Orange = makes, the line colour behind it = misses.
import { fmt } from "@/lib/format";
import { MIN_ATT, type PlayerRow } from "../players/player-stats";

export type ZoneAvg = { rim: number | null; mid: number | null; thr: number | null };
type Zone = { key: "rim" | "mid" | "thr"; label: string; sub: string; a: number; m: number };

// Court geometry in feet × 10 (NCAA half court is 50 × 47 ft).
const W = 500, H = 470, BX = 250, BY = 52.5, ARC = 221.5, CORNER = 216.7, RIM_R = 72;
const ARC_Y = BY + Math.sqrt(ARC * ARC - CORNER * CORNER);
const insideArc = `M ${BX - CORNER} 0 L ${BX - CORNER} ${ARC_Y} A ${ARC} ${ARC} 0 0 0 ${BX + CORNER} ${ARC_Y} L ${BX + CORNER} 0 Z`;
const rimCircle = `M ${BX - RIM_R} ${BY} a ${RIM_R} ${RIM_R} 0 1 0 ${RIM_R * 2} 0 a ${RIM_R} ${RIM_R} 0 1 0 ${-RIM_R * 2} 0 Z`;
const courtRect = `M 0 0 H ${W} V ${H} H 0 Z`;

export default function ShotDiet({ p, avg }: { p: PlayerRow; avg: ZoneAvg }) {
  if (p.rimA === null || p.midA === null || p.thrA === null || !p.shots) {
    return <p className="text-sm text-mute">No shot-location data for this player yet. It appears once he has attempted a field goal in a tracked game.</p>;
  }
  const zones: Zone[] = [
    { key: "rim", label: "At the rim", sub: "Dunks, layups, tip-ins", a: p.rimA, m: p.rimM ?? 0 },
    { key: "mid", label: "Mid-range", sub: "Two-point jumpers", a: p.midA, m: p.midM ?? 0 },
    { key: "thr", label: "Three", sub: "Three-point jumpers", a: p.thrA, m: p.thrM ?? 0 },
  ];
  const total = p.shots;
  const maxA = Math.max(...zones.map(z => z.a), 1);
  const share = (z: Zone) => z.a / total;
  const fill = (z: Zone) => (z.a ? 0.08 + 0.62 * share(z) : 0.03);
  const fgp = (z: Zone) => (z.a ? (z.m / z.a) * 100 : null);
  const zr = zones[0], zm = zones[1], zt = zones[2];

  const zoneText = (z: Zone, x: number, y: number, subGap = 24) => (
    <g textAnchor="middle" fill="var(--ink)">
      <text x={x} y={y} fontSize="44" fontWeight="900" className="font-display" opacity={z.a >= MIN_ATT.zone ? 1 : 0.55}>{z.a ? `${fmt(fgp(z), 0)}%` : "—"}</text>
      <text x={x} y={y + subGap} fontSize="17" fill="var(--mute)">{z.m}/{z.a} · {Math.round(share(z) * 100)}% of shots</text>
    </g>
  );

  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[440px] justify-self-center" role="img"
        aria-label={`Shot map: ${zones.map(z => `${z.label} ${z.m} of ${z.a}`).join(", ")}`}>
        <defs><clipPath id="court"><path d={courtRect} /></clipPath></defs>
        <g clipPath="url(#court)">
          <path d={`${courtRect} ${insideArc}`} fillRule="evenodd" fill="var(--off)" fillOpacity={fill(zt)} />
          <path d={`${insideArc} ${rimCircle}`} fillRule="evenodd" fill="var(--off)" fillOpacity={fill(zm)} />
          <path d={rimCircle} fill="var(--off)" fillOpacity={fill(zr)} />
          {/* court lines */}
          <g fill="none" stroke="var(--line-2)" strokeWidth="2">
            <path d={courtRect} />
            <rect x={BX - 60} y={0} width={120} height={190} opacity={0.6} />
            <path d={`M ${BX - 60} 190 A 60 60 0 0 0 ${BX + 60} 190`} opacity={0.6} />
            <path d={insideArc} stroke="var(--mute)" />
            <path d={rimCircle} stroke="var(--mute)" strokeDasharray="5 5" />
            <circle cx={BX} cy={BY} r={7.5} stroke="var(--off)" strokeWidth="3" />
            <line x1={BX - 30} x2={BX + 30} y1={40} y2={40} stroke="var(--ink)" strokeWidth="3" />
            <path d={`M ${BX - 60} ${H} A 60 60 0 0 1 ${BX + 60} ${H}`} />
          </g>
        </g>
        {zoneText(zr, BX, BY + 56, 44)}
        {zoneText(zm, BX, 214)}
        {zoneText(zt, BX, 360)}
      </svg>

      <div className="flex flex-col justify-center gap-4">
        {zones.map(z => {
          const v = fgp(z), a = avg[z.key], small = z.a < MIN_ATT.zone;
          return (
            <div key={z.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span>
                  <span className="font-semibold">{z.label}</span>
                  <span className="ml-2 text-xs text-dim">{z.sub}</span>
                </span>
                <span className={`font-display text-2xl font-extrabold tnum ${small ? "text-mute" : ""}`}>{v === null ? "—" : `${fmt(v, 0)}%`}</span>
              </div>
              <div className="mt-1.5 h-2.5 rounded-full bg-line" aria-hidden>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-line2" style={{ width: `${Math.max(z.a ? 3 : 0, (z.a / maxA) * 100)}%` }}>
                  <div className="h-full bg-off" style={{ width: `${z.a ? (z.m / z.a) * 100 : 0}%` }} />
                </div>
              </div>
              <div className="mt-1 flex justify-between text-xs text-mute tnum">
                <span>{z.m} of {z.a} made · {Math.round(share(z) * 100)}% of his shots</span>
                <span>{small && z.a ? "Small sample · " : ""}D-I avg {a === null ? "—" : `${fmt(a, 0)}%`}</span>
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-sm text-mute">
          <span><b className="text-ink tnum">{p.astd === null ? "—" : `${fmt(p.astd, 0)}%`}</b> of makes assisted</span>
          <span><b className="text-ink tnum">{p.dunks ?? "—"}</b> dunks</span>
          <span><b className="text-ink tnum">{fmt(p.ftr, 0)}</b> FT rate</span>
        </div>
        <p className="flex items-center gap-4 text-xs text-dim">
          <span><i className="mr-1.5 inline-block h-2 w-3 rounded-sm bg-off align-middle" />Makes</span>
          <span><i className="mr-1.5 inline-block h-2 w-3 rounded-sm bg-line2 align-middle" />Misses</span>
          <span>Zone shade = share of attempts</span>
        </p>
      </div>
    </div>
  );
}
