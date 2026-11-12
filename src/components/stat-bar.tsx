// A labelled stat with a national-rank meter. Rank 1 fills the bar.
import { fmt, heat, ordinal } from "@/lib/format";

export default function StatBar({ label, value, rank, total = 356, unit = "", digits = 1, tone = "off", hint }: {
  label: string; value: number | null; rank?: number | null; total?: number; unit?: string; digits?: number; tone?: "off" | "def" | "neutral"; hint?: string;
}) {
  const fill = rank ? 1 - (rank - 1) / Math.max(1, total - 1) : 0;
  const color = tone === "off" ? "var(--off)" : tone === "def" ? "var(--def)" : "var(--mute)";
  return (
    <div className="py-2" title={hint}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-mute">{label}</span>
        <span className="tnum">
          <b className="text-[15px]">{fmt(value, digits)}{value !== null ? unit : ""}</b>
          {rank ? <span className="ml-2 inline-block min-w-[3.2rem] rounded px-1.5 text-right text-xs text-mute" style={{ background: heat(rank, total) }}>{ordinal(rank)}</span> : null}
        </span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-line">
        <div className="h-1 rounded-full" style={{ width: `${Math.max(2, fill * 100)}%`, background: color, boxShadow: fill > 0.85 ? `0 0 10px ${color}` : undefined }} />
      </div>
    </div>
  );
}
