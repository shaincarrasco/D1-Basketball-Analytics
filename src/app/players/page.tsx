import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@/components/page-header";
import { Loading } from "@/components/states";
import { getMeta } from "@/lib/server-data";
import PlayersBoard from "./players-board";

export const metadata: Metadata = { title: "Player leaderboards", description: "Sort and filter every Division I men's basketball player by scoring, efficiency, playmaking, rebounding, defense and shot profile." };

export default function PlayersPage() {
  const meta = getMeta();
  return (
    <>
      <PageHeader title="Player leaderboards">
        All {meta.counts.players.toLocaleString("en-US")} Division I players with box-score minutes this season. Pick a view, set a minutes floor and sort any column.
        Cell tint shows where a number ranks among players who clear the minutes and games filters, so a hot start in garbage time doesn&apos;t top the board.
      </PageHeader>
      <Suspense fallback={<Loading label="Loading players" />}>
        <PlayersBoard />
      </Suspense>
    </>
  );
}
