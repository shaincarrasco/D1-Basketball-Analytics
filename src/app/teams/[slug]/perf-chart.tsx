// Server-rendered SVG: adjusted efficiency margin per completed D-I game.
import type { TeamGame } from "@/lib/types";

export default function PerfChart({ games }: { games: TeamGame[] }) {
  const pts = games.filter(g => g.perf !== null);
  if (!pts.length) return <p className="text-sm text-mute">No completed games against D-I opponents with box scores yet.</p>;
  const W = 760, H = 200, pad = 28, max = Math.max(30, ...pts.map(g => Math.abs(g.perf!)));
  const bw = Math.min(46, (W - pad * 2) / pts.length);
  const y = (v: number) => H / 2 - (v / max) * (H / 2 - 22);
  const avg = pts.reduce((s, g) => s + g.perf!, 0) / pts.length;
  return (
    <div className="scroll-x">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[520px]" role="img" aria-label={`Adjusted game performances, average ${avg.toFixed(1)}`}>
        {[-max / 2, 0, max / 2].map(v => (
          <g key={v}>
            <line x1={pad} x2={W - 6} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--line-2)" : "var(--line)"} strokeDasharray={v === 0 ? undefined : "3 4"} />
            <text x={pad - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--dim)">{v > 0 ? "+" : ""}{v.toFixed(0)}</text>
          </g>
        ))}
        <line x1={pad} x2={W - 6} y1={y(avg)} y2={y(avg)} stroke="var(--off)" strokeOpacity=".6" strokeDasharray="6 4" />
        <text x={W - 8} y={y(avg) - 5} textAnchor="end" fontSize="10.5" fill="var(--off)">avg {avg > 0 ? "+" : ""}{avg.toFixed(1)}</text>
        {pts.map((g, i) => {
          const x = pad + 8 + i * bw, top = Math.min(y(0), y(g.perf!)), h = Math.max(2, Math.abs(y(g.perf!) - y(0)));
          return (
            <g key={g.id}>
              <title>{`${g.result} ${g.pts}–${g.oppPts} ${g.venue === "A" ? "at" : "vs"} ${g.opp}: ${g.perf! > 0 ? "+" : ""}${g.perf!.toFixed(1)}`}</title>
              <rect x={x} y={top} width={bw - 8} height={h} rx="2" fill={g.perf! >= 0 ? "var(--win)" : "var(--loss)"} opacity=".85" />
              <text x={x + (bw - 8) / 2} y={H - 4} textAnchor="middle" fontSize="9.5" fill="var(--mute)">{g.opp.slice(0, 6)}</text>
              <text x={x + (bw - 8) / 2} y={g.perf! >= 0 ? top - 4 : top + h + 11} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--ink)">{g.perf!.toFixed(0)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
