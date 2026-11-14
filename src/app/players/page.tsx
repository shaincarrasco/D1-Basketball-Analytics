import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@/components/page-header";
import { Loading } from "@/components/states";
import { getMeta } from "@/lib/server-data";
import PlayersBoard from "./players-board";

export const metadata: Metadata = { title: "Player leaderboards", description: "Sort and filter every Division I men's basketball player by DPR impact rating, scoring, efficiency, playmaking, rebounding, defense and shot profile." };

export default function PlayersPage() {
  const meta = getMeta();
  return (
    <>
      <PageHeader title="Players">{meta.counts.players.toLocaleString("en-US")} Division I players. Impact ranks them by DPR, our lineup-based rating. Shading compares each player with others who meet the filters.</PageHeader>
      <Suspense fallback={<Loading label="Loading players" />}>
        <PlayersBoard />
      </Suspense>
    </>
  );
}
