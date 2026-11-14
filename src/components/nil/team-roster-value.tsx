// Team page: estimated roster value (server component; reads public/data/app/nil.json at build time).
// Mounted next to the roster in src/app/teams/[slug]/page.tsx.
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { fmtMoney, fmtRange, fmtReported, NIL_METHOD_HREF, type NilData, type NilFile } from "@/lib/nil";
import { EstimateTag, ReportedTag, SourceLink } from "./reported";

let cache: NilData | null | undefined;
function load(): NilData | null {
  if (cache !== undefined) return cache;
  try {
    const f = JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "app", "nil.json"), "utf8")) as NilFile;
    cache = f.ok ? f : null;
  } catch {
    cache = null;
  }
  return cache;
}

export default function TeamRosterValue({ teamId, slug, short }: { teamId: string; slug: string; short: string }) {
  const nil = load();
  const t = nil?.teams[teamId];
  if (!nil || !t) return null;
  const reported = nil.calibration.programs.filter(p => p.slug === slug);
  return (
    <section className="deck mt-3 p-4" aria-labelledby="nil-team-h">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <h3 id="nil-team-h" className="text-[15px] font-bold">Estimated roster value</h3>
          <EstimateTag />
        </div>
        <Link href={NIL_METHOD_HREF} className="text-xs font-semibold text-bulb-ink hover:underline">How we estimate this</Link>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:gap-6">
        <div>
          <div className="font-display text-[28px] font-black leading-none tnum">{fmtMoney(t.budget)}</div>
          <div className="mt-1 text-xs text-mute tnum">range {fmtRange(t.budgetLow, t.budgetHigh)} a year</div>
          <div className="mt-1 text-xs text-mute">
            {t.kind === "reported-tier" ? <>Based on CBS Sports&apos; spending tier ({t.tierLabel}), Oct. 2026</> : t.kind === "reported" ? <>Based on the program&apos;s reported budget ({t.tierLabel})</> : <>No public 2026–27 figure: estimated from program strength, so the range is wide</>}
          </div>
        </div>
        {t.top.length > 0 && (
          <ol className="text-[13.5px]">
            {t.top.map(p => (
              <li key={p.pid} className="flex items-baseline justify-between gap-3 border-t border-line py-1.5 first:border-0 first:pt-0">
                <Link href={`/player/?id=${p.pid}`} className="link min-w-0 truncate font-semibold">{p.name}</Link>
                <span className="shrink-0 text-mute tnum">{fmtMoney(p.value)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {reported.map(r => (
        <p key={r.text} className="mt-2 text-xs leading-snug text-mute">
          <ReportedTag /> <b className="text-ink">{r.low != null ? fmtReported(r.low, r.high) : r.text}</b> ({r.season}): {r.text} <SourceLink id={r.source} sources={nil.calibration.sources} />
        </p>
      ))}
      <p className="mt-2 text-xs text-dim">
        {short}&apos;s total split by minutes, DPR, recruiting and position. Model estimates, not reported deals. <Link href="/players/nil/" className="font-semibold text-bulb-ink hover:underline">Every player</Link>
      </p>
    </section>
  );
}
