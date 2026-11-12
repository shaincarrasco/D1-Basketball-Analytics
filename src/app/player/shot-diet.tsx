// Shot diet: attempt/make bars by zone (rim, mid-range, three) with the D-I average.
// Orange = makes, the line colour behind it = misses.
import { fmt } from "@/lib/format";
import { MIN_ATT, type PlayerRow } from "../players/player-stats";

export type ZoneAvg = { rim: number | null; mid: number | null; thr: number | null };
type Zone = { key: "rim" | "mid" | "thr"; label: string; sub: string; a: number; m: number };

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
  const fgp = (z: Zone) => (z.a ? (z.m / z.a) * 100 : null);

  return (
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
        </p>
      </div>
  );
}
