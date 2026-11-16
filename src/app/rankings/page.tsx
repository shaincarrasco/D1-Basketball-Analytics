import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@sports/ui/page-header";
import { getMeta, getTeams } from "@/lib/server-data";
import RankingsTable from "./rankings-table";
import { formRows } from "@/lib/form";
import { getAllForms, getMovers, getPreseasonMovers } from "@/lib/form-server";

export const metadata: Metadata = { title: "Power rankings", description: "Every Division I team ranked by the D1 Hoops opponent-adjusted efficiency margin." };

export default function RankingsPage() {
  const meta = getMeta(), teams = getTeams();
  return (
    <>
      <PageHeader title="Rankings">
        All {meta.counts.ratedTeams} teams, ranked by DHR.{" "}
        <Link href="/methodology/#overview" className="font-semibold text-bulb-ink hover:underline">What&apos;s DHR?</Link>
      </PageHeader>
      <RankingsTable teams={teams} total={meta.counts.ratedTeams} form={formRows(getAllForms().byId, getMovers().rows, getPreseasonMovers().rows)} formSince={getMovers().since} />
    </>
  );
}
