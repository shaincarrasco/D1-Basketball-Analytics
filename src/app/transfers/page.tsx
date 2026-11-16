import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import PageHeader from "@sports/ui/page-header";
import { IMPACT_HELP, dateLong, windowText } from "@/lib/portal";
import { getPortal } from "./load";
import Board from "./board";
import WindowBadge from "./window-badge";

export const metadata: Metadata = {
  title: "Transfer portal",
  description: "D-I men's basketball transfer portal tracker for the spring 2027 window: who's in, where they came from and committed to, and what each move is worth in real 2026–27 production.",
};

export default function TransfersPage() {
  const portal = getPortal();
  const w = portal.window;
  const fetched = portal.fetchedAt ? new Date(portal.fetchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : null;

  return (
    <>
      <PageHeader title="Transfer portal">
        Every D-I player in the 2027 portal: where he came from, where he committed, and what he was worth.
      </PageHeader>

      <section className="deck mb-6 p-5" aria-labelledby="window-h">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="window-h" className="text-[13px] font-semibold text-mute">2027 transfer window</h2>
            <p className="mt-0.5 font-display text-[30px] font-black leading-none sm:text-[36px]">{windowText(w)}</p>
          </div>
          <WindowBadge opens={w.opens} closes={w.closes} />
        </div>
        <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-mute">
          One 15-day window that opens the day after the national championship game (April 5, 2027 in Detroit). Players have to enter during it; there is no deadline to commit afterward.
          {w.coachingChange ? <> <b className="font-semibold text-ink">Coaching changes:</b> {w.coachingChange}</> : null}
        </p>
        {w.sources.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            {w.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 text-mute">{s.label}<ExternalLink size={11} aria-hidden /></a>)}
          </p>
        )}
        <p className="mt-1.5 text-[12px] text-dim">Dates follow the NCAA rule; the NCAA had not published a 2027 calendar when we set this up.</p>
      </section>

      {portal.entries.length === 0 ? (
        <section className="deck mb-8 p-6" aria-labelledby="empty-h">
          <h2 id="empty-h" className="font-display text-[24px] font-black leading-tight">The portal opens {dateLong(w.opens)}; entries appear here when it does.</h2>
          <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-mute">
            {portal.status === "not-open"
              ? "Nobody can enter the 2027 portal yet outside a coaching-change window, and we don't list rumors. "
              : "Our data provider hasn't published any 2027 entries yet. "}
            Once players enter, this page lists each one with his 2026–27 stats, our scouting grade, where he committed, and every team&apos;s net gain or loss.
          </p>
          <p className="mt-3 text-[13px] text-dim">
            Source: {portal.provider}{fetched ? `, checked ${fetched}` : ", not fetched yet (the window hasn't opened)"}. Updated with each daily data refresh.
          </p>
        </section>
      ) : (
        <Board entries={portal.entries} />
      )}

      <section className="mb-4 grid gap-4 lg:grid-cols-2" aria-label="How this works">
        <div className="deck p-5 text-sm leading-relaxed text-mute">
          <h2 className="mb-1 font-display text-[18px] font-bold text-ink">How impact works</h2>
          <p>{IMPACT_HELP}</p>
          <p className="mt-2">A team&apos;s <b className="text-ink">net impact</b> is the impact of the players it added minus the players it lost (withdrawn players aren&apos;t losses). Players without a 2026–27 D-I stats line, like junior-college or D-II transfers, are listed but don&apos;t count toward totals.</p>
        </div>
        <div className="deck p-5 text-sm leading-relaxed text-mute">
          <h2 className="mb-1 font-display text-[18px] font-bold text-ink">Where the data comes from</h2>
          <p>
            Portal entries, destinations, eligibility and transfer star ratings come from <a href="https://collegebasketballdata.com" target="_blank" rel="noopener noreferrer" className="link underline">College Basketball Data</a>.
            It doesn&apos;t publish dates, so &ldquo;first seen&rdquo; is when our daily check first saw an entry. Stats and DPR are ours (<Link href="/methodology/" className="link underline">methodology</Link>); a player links to his profile only when his name matches a 2026–27 player on the team he left.
          </p>
          {portal.entries.length > 0 && <p className="mt-2 text-[12.5px] text-dim">{portal.linked} of {portal.count} entries matched to our player stats{fetched ? ` · checked ${fetched}` : ""}.</p>}
        </div>
      </section>
    </>
  );
}
