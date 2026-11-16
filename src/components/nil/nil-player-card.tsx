"use client";
// Player page: D1 Hoops' estimated NIL value with its range, kept apart from any publicly reported
// figure (cited). Mounted in src/app/player/player-profile.tsx.
import Link from "next/link";
import { fmtMoney, fmtRange, fmtReported, KIND_WORD, NIL_METHOD_HREF, useNil } from "@/lib/nil";
import { EstimateTag, ReportedTag, ReportList } from "./reported";

export default function NilPlayerCard({ playerId, name }: { playerId: string; name: string }) {
  const { nil, byPid, status } = useNil();
  if (status === "loading") return null;
  if (!nil || !byPid) {
    return (
      <section className="deck p-5" aria-labelledby="nil-h">
        <h2 id="nil-h" className="h-section">Estimated NIL value</h2>
        <p className="mt-1 text-sm text-mute">Our NIL estimates aren&apos;t available in this build.</p>
      </section>
    );
  }
  const row = byPid.get(playerId);
  const team = row ? nil.teams[row[1]] : null;
  const reported = nil.calibration.players.find(c => c.pid === playerId) ?? null;
  const first = name.split(" ")[0];
  return (
    <section className="deck p-5" aria-labelledby="nil-h">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="nil-h" className="h-section">Estimated NIL value</h2>
        <EstimateTag />
      </div>
      {row && team ? (
        <div className="mt-3 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-6">
          <div>
            <div className="font-display text-[34px] font-black leading-none tnum">{fmtMoney(row[2])}</div>
            <div className="mt-1 text-sm text-mute tnum">likely range {fmtRange(row[3], row[4])} a year</div>
          </div>
          <p className="text-[13.5px] leading-snug text-mute">
            Our estimate of his 2026–27 market value, not a reported deal: about <b className="text-ink">{row[5] < 0.1 ? "<0.1" : row[5]}%</b> of
            {team.kind === "reported-tier" ? <> a team budget CBS Sports puts at <b className="text-ink">{team.tierLabel}</b></> : team.kind === "reported" ? <> a team budget reported at <b className="text-ink">{team.tierLabel}</b></> : <> a team budget we estimate at <b className="text-ink">{fmtMoney(team.budget)}</b> (no public figure)</>},
            split by minutes, DPR, recruiting rank and position.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-mute">No estimate for {first}: he isn&apos;t on a D-I roster in our data.</p>
      )}
      {reported && (
        <div className="mt-4 rounded-xl border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <ReportedTag />
            <b className="text-[15px] tnum">{fmtReported(reported.low, reported.high)}</b>
            <span className="text-xs text-mute">{KIND_WORD[reported.kind] ?? "Reported"}</span>
          </div>
          <ReportList reports={reported.reports} sources={nil.calibration.sources} className="mt-2" />
          {reported.note && <p className="mt-1.5 text-xs text-dim">{reported.note}</p>}
        </div>
      )}
      <p className="mt-3 text-xs text-dim">
        Not in our data: social media following, brand deals, NBA draft stock or last season&apos;s stats, so stars are often worth more than this.{" "}
        <Link href={NIL_METHOD_HREF} className="font-semibold text-bulb-ink hover:underline">How we estimate this</Link>
        {" · "}<Link href="/players/nil/" className="font-semibold text-bulb-ink hover:underline">All players</Link>
      </p>
    </section>
  );
}
