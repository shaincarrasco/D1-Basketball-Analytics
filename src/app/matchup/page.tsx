import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@/components/page-header";
import { Loading } from "@/components/states";
import MatchupClient from "./matchup-client";

export const metadata: Metadata = { title: "Matchup simulator", description: "Project a score, spread and win probability for any two Division I teams on a neutral or home court." };

export default function MatchupPage() {
  return (
    <>
      <PageHeader title="Matchup simulator">
        Pick any two Division I teams and a site. The projection combines each team&apos;s adjusted offense, defense and tempo into a score,
        a spread, a win probability and a range of likely margins. The link updates as you go, so you can share it.
      </PageHeader>
      <Suspense fallback={<Loading label="Loading matchup" />}>
        <MatchupClient />
      </Suspense>
    </>
  );
}
