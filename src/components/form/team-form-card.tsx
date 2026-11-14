// Team page: rating timeline, recent form, consistency and the 7-day move, in plain words.
import Link from "next/link";
import { signed } from "@/lib/format";
import { FORM_WINDOW_DAYS, MOVER_DAYS, type HistoryPoint, type Mover, type TeamForm } from "@/lib/form";
import { Tag } from "./form-badges";
import RatingTimeline from "./rating-timeline";

function Row({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line py-2.5 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
      <dt className="text-[13px] font-semibold text-mute" title={title}>{label}</dt>
      <dd className="text-[14px] leading-snug">{children}</dd>
    </div>
  );
}

export default function TeamFormCard({ name, form, points, mover, color, total }: {
  name: string; form: TeamForm; points: HistoryPoint[]; mover: Mover | null; color: string | null; total: number;
}) {
  const c = form.consistency;
  return (
    <section id="trend" className="deck scroll-mt-32 p-5" aria-labelledby="trend-h">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="trend-h" className="h-section">Rating trend &amp; form</h2>
        <Link href="/methodology/#form" className="text-xs font-semibold text-mute hover:text-ink">How form is measured</Link>
      </div>
      <RatingTimeline points={points} color={color} total={total} />
      <dl className="mt-4">
        <Row label={`Last ${MOVER_DAYS} days`} title={`Change in DHR rating over the last ${MOVER_DAYS} days of results`}>
          {mover ? (
            <><b className={`tnum ${mover.change >= 0 ? "text-win" : "text-loss"}`}>{signed(mover.change, 1)}</b> DHR points, No. {mover.rankThen} → No. {mover.rankNow} ({mover.games} game{mover.games === 1 ? "" : "s"} played).</>
          ) : <span className="text-mute">No games in the last {MOVER_DAYS} days.</span>}
        </Row>
        <Row label={`Form (${FORM_WINDOW_DAYS} days)`} title="Average opponent- and venue-adjusted game performance over the last 30 days, compared with the DHR rating">
          {form.badge ? <span className="mr-1.5 align-middle"><Tag kind={form.badge} /></span> : null}
          {form.recent != null && form.gap != null ? (
            <>Averaging <b className="tnum">{signed(form.recent, 1)}</b> per 100 possessions over {form.games} D-I game{form.games === 1 ? "" : "s"}, <b className="tnum">{signed(form.gap, 1)}</b> vs its rating. </>
          ) : null}
          <span className="text-mute">{form.badge ? "" : `No tag yet. ${form.why}`}</span>
        </Row>
        <Row label="Consistency" title="How far single games land from what the rating expects">
          {c.badge ? <span className="mr-1.5 align-middle"><Tag kind={c.badge} /></span> : null}
          <span className={c.badge ? "" : "text-mute"}>{c.badge ? c.why : `No tag yet. ${c.why}`}</span>
        </Row>
      </dl>
      <p className="mt-2 text-xs text-dim">{name}&apos;s DHR after each day of results, using only games played by then. Hover a point for its date and rank.</p>
    </section>
  );
}
