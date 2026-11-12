import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { getMeta, getTeams } from "@/lib/server-data";
import RankingsTable from "./rankings-table";

export const metadata: Metadata = { title: "Power rankings", description: "Every Division I team ranked by the D1 Hoops opponent-adjusted efficiency margin." };

export default function RankingsPage() {
  const meta = getMeta(), teams = getTeams();
  return (
    <>
      <PageHeader title="Rankings">{meta.counts.ratedTeams} teams by adjusted efficiency margin: points per 100 possessions better than an average D-I team on a neutral floor.</PageHeader>
      <RankingsTable teams={teams} total={meta.counts.ratedTeams} />
    </>
  );
}
