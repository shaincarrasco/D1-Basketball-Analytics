// "Path to the Final Four": per-round odds and the likely opponent for one projected team. Server component.
import { pctLabel } from "@/lib/bracket";
import type { BracketPath } from "@/lib/bracket-path";

export default function FinalFourPath({ path }: { path: BracketPath | null }) {
  if (!path) return null;
  return (
    <section className="deck p-4" aria-labelledby="ff-path-h">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ff-path-h" className="h-section">Path to the Final Four</h2>
        <span className="text-[13px] text-mute">{path.seed} seed, {path.region}</span>
      </div>
      <ol className="divide-y divide-line">
        {path.rounds.map(r => (
          <li key={r.name} className="grid grid-cols-[7.5rem_3.5rem_1fr] items-center gap-x-3 py-2 text-[13px] sm:grid-cols-[8.5rem_3.5rem_1fr_9rem]">
            <span className="font-semibold">{r.name}</span>
            <span className="tnum text-right font-semibold">{pctLabel(r.p)}</span>
            <span className="hidden h-1.5 overflow-hidden rounded-full bg-line sm:block" aria-hidden>
              <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.max(0, Math.min(1, r.p)) * 100}%` }} />
            </span>
            <span className="col-span-3 truncate text-mute sm:col-span-1">
              {r.likelyOpp ? <>vs {r.likelyOpp.short}{r.likelyOpp.p < 0.995 ? <span className="text-dim"> ({pctLabel(r.likelyOpp.p)})</span> : null}</> : null}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-dim">From our projected field and DHR win probabilities. Not the committee&apos;s bracket.</p>
    </section>
  );
}
