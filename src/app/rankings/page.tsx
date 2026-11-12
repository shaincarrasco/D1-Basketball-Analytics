import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { getMeta, getTeams } from "@/lib/server-data";
import RankingsTable from "./rankings-table";

export const metadata: Metadata = { title: "Power rankings", description: "Every Division I team ranked by the D1 Hoops opponent-adjusted efficiency margin." };

export default function RankingsPage() {
  const meta = getMeta(), teams = getTeams();
  return (
    <>
      <PageHeader title="Power rankings">
        All {meta.counts.ratedTeams} rated Division I teams, ordered by adjusted efficiency margin — how many points per 100 possessions a team would beat an average D-I opponent by on a neutral floor.
        Ratings are rebuilt from every box score after each data refresh.
      </PageHeader>
      <RankingsTable teams={teams} total={meta.counts.ratedTeams} />
    </>
  );
}
