// Game-by-game adjusted performance (efficiency margin vs that opponent at that venue).
// Bars above the line beat an average D-I team's expected result.
export default function PerfBars({ values, height = 26, width = 96, max = 40 }: { values: number[]; height?: number; width?: number; max?: number }) {
  if (!values.length) return <span className="text-xs text-dim">No games</span>;
  const shown = values.slice(-12);
  const bw = width / Math.max(shown.length, 6);
  const mid = height / 2;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Last ${shown.length} adjusted game performances: ${shown.map(v => v.toFixed(0)).join(", ")}`}>
      <line x1="0" x2={width} y1={mid} y2={mid} stroke="var(--line-2)" strokeWidth="1" />
      {shown.map((v, i) => {
        const h = Math.max(1.5, (Math.min(Math.abs(v), max) / max) * (mid - 1));
        return <rect key={i} x={i * bw + 1} y={v >= 0 ? mid - h : mid} width={Math.max(2, bw - 2)} height={h} rx="1" fill={v >= 0 ? "var(--win)" : "var(--loss)"} opacity={0.55 + 0.45 * (i / shown.length)} />;
      })}
    </svg>
  );
}
