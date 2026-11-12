// Reliability diagram: for each favourite-probability bin, how often the favourite actually won.
// Points on the diagonal are perfectly calibrated; above it the model was too cautious, below it overconfident.
import type { Calibration } from "@/lib/types";

export default function CalibrationChart({ bins }: { bins: Calibration[] }) {
  const pts = bins.filter((b): b is Calibration & { expected: number; actual: number } => b.expected !== null && b.actual !== null);
  const W = 560, H = 360, L = 52, R = 16, T = 16, B = 52;
  const yMin = Math.min(0.5, Math.floor(Math.min(...pts.map(p => p.actual), 0.5) * 10) / 10);
  const xs = (v: number) => L + ((v - 0.5) / 0.5) * (W - L - R);
  const ys = (v: number) => T + (1 - (v - yMin) / (1 - yMin)) * (H - T - B);
  const maxN = Math.max(...pts.map(p => p.games), 1);
  const r = (n: number) => 5 + 11 * Math.sqrt(n / maxN);
  const xTicks = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const yTicks: number[] = [];
  for (let v = yMin; v <= 1.0001; v += 0.1) yTicks.push(+v.toFixed(1));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${xs(p.expected).toFixed(1)},${ys(p.actual).toFixed(1)}`).join("");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[440px] max-w-[620px]" role="img"
      aria-label={`Calibration: ${pts.map(p => `${p.bin} bin, ${p.games} games, expected ${(p.expected * 100).toFixed(0)}%, actual ${(p.actual * 100).toFixed(0)}%`).join("; ")}`}>
      {yTicks.map(v => (
        <g key={`y${v}`}>
          <line x1={L} x2={W - R} y1={ys(v)} y2={ys(v)} stroke="var(--line)" />
          <text x={L - 8} y={ys(v) + 4} textAnchor="end" fontSize="13" fill="var(--dim)">{(v * 100).toFixed(0)}%</text>
        </g>
      ))}
      {xTicks.map(v => (
        <g key={`x${v}`}>
          <line x1={xs(v)} x2={xs(v)} y1={T} y2={H - B} stroke="var(--line)" />
          <text x={xs(v)} y={H - B + 18} textAnchor="middle" fontSize="13" fill="var(--dim)">{(v * 100).toFixed(0)}%</text>
        </g>
      ))}
      <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" fontSize="13" fill="var(--mute)">Predicted win probability of the favourite</text>
      <text transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize="13" fill="var(--mute)">Favourite actually won</text>
      <line x1={xs(0.5)} y1={ys(0.5)} x2={xs(1)} y2={ys(1)} stroke="var(--mute)" strokeDasharray="5 5" />
      <text x={xs(0.62)} y={ys(0.6) + 4} textAnchor="start" fontSize="11" fill="var(--dim)">perfect calibration</text>
      <path d={line} fill="none" stroke="var(--def)" strokeWidth="2" opacity="0.7" />
      {pts.map(p => (
        <g key={p.bin}>
          <circle cx={xs(p.expected)} cy={ys(p.actual)} r={r(p.games)} fill="var(--def)" fillOpacity="0.25" stroke="var(--def)" strokeWidth="2" />
          <text x={xs(p.expected)} y={ys(p.actual) - r(p.games) - 6} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="var(--ink)">{p.games} g</text>
        </g>
      ))}
    </svg>
  );
}
