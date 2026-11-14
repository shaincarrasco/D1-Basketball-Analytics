// Publicly reported figures (from public/data/nil-calibration-2027.json), always shown apart from our
// estimates and always with the outlet and date. No hooks, so server and client pages can both use it.
import { fmtMoney, fmtSourceDate, type NilReport, type NilSource } from "@/lib/nil";

export function SourceLink({ id, sources }: { id: string; sources: Record<string, NilSource> }) {
  const s = sources[id];
  if (!s) return null;
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className="link underline decoration-dotted underline-offset-2" title={s.title}>
      {s.publisher.replace(/\s*\(.*\)$/, "")}, {fmtSourceDate(s)}
    </a>
  );
}

/** One line per report: "$5 million to stay at Florida — Bleacher Report, May 6, 2026". */
export function ReportList({ reports, sources, className = "" }: { reports: NilReport[]; sources: Record<string, NilSource>; className?: string }) {
  return (
    <ul className={`space-y-1 text-[13px] leading-snug ${className}`}>
      {reports.map((r, i) => (
        <li key={i}>
          <span className="text-ink">{r.text}</span> <span className="text-dim">·</span> <SourceLink id={r.source} sources={sources} />
        </li>
      ))}
    </ul>
  );
}

/** Small tag that says what a number is. */
export function EstimateTag({ children = "Estimate" }: { children?: React.ReactNode }) {
  return <span className="rounded-full border border-line2 px-2 py-0.5 text-[12px] font-semibold text-mute">{children}</span>;
}

export function ReportedTag() {
  return <span className="rounded-full bg-deck2 px-2 py-0.5 text-[12px] font-semibold text-ink">Reported</span>;
}

export { fmtMoney };
