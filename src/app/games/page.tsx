import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@sports/ui/page-header";
import { Loading } from "@sports/ui/states";
import GamesHub from "./games-hub";

export const metadata: Metadata = {
  title: "Games",
  description: "Every Division I game of the season: live scoreboard, final scores and team box scores.",
};

export default function GamesPage() {
  return (
    <>
      <PageHeader title="Games" />
      {/* GamesHub reads ?d= and ?g= with useSearchParams, so it renders on the client inside this boundary. */}
      <Suspense fallback={<Loading label="Loading the scoreboard" />}>
        <GamesHub />
      </Suspense>
    </>
  );
}
