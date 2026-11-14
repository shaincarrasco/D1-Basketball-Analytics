import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Empty } from "@/components/states";
import { getTeams } from "@/lib/server-data";
import { HISTORY_FIRST, HISTORY_LAST, seasonLabel } from "@/lib/history";
import { getSeasonIndex } from "./load";
import HistoryView, { type TeamLinks } from "./history-view";

export const metadata: Metadata = {
  title: "Past seasons",
  description: "Final adjusted ratings, records, conference champions and postseason runs for every Division I team over the last ten completed seasons.",
};

export default function HistoryPage() {
  const seasons = getSeasonIndex();
  // Current programs, by College Basketball Data team id, so past rows can link to team pages.
  const links: TeamLinks = Object.fromEntries(getTeams().map(t => [t.id, [t.slug, t.logo]]));
  return (
    <>
      <PageHeader title="Past seasons">
        Final ratings, records and postseason runs for the last ten completed seasons. Ratings here are College Basketball Data&apos;s final adjusted efficiency, not D1 Hoops&apos; own DHR.
      </PageHeader>
      {seasons.length === 0 ? (
        <Empty title="Past seasons aren't here yet">
          The {seasonLabel(HISTORY_FIRST)} to {seasonLabel(HISTORY_LAST)} seasons appear after the next data refresh, when they&apos;re downloaded from College Basketball Data. Nothing is shown until then.
        </Empty>
      ) : (
        <HistoryView seasons={seasons} links={links} />
      )}
    </>
  );
}
