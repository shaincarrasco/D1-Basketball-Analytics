import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@/components/page-header";
import { Loading } from "@/components/states";
import MatchupClient from "./matchup-client";

export const metadata: Metadata = { title: "Matchup simulator", description: "Project a score, spread and win probability for any two Division I teams on a neutral or home court." };

export default function MatchupPage() {
  return (
    <>
      <PageHeader title="Matchup">Project any two teams at any site.</PageHeader>
      <Suspense fallback={<Loading label="Loading matchup" />}>
        <MatchupClient />
      </Suspense>
    </>
  );
}
