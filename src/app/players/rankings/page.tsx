import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@/components/page-header";
import { Loading } from "@/components/states";
import PlayersTabs from "../players-tabs";
import RankingsBoard from "./rankings-board";

export const metadata: Metadata = { title: "Player rankings", description: "Rank every Division I player by overall value, scoring, shooting, playmaking, defense, rim protection, rebounding, two-way play or your own formula." };

export default function PlayerRankingsPage() {
  return (
    <>
      <PageHeader title="Player rankings">Pick a lens, or build your own formula. Every ranking shows what went into it.</PageHeader>
      <PlayersTabs active="rankings" />
      <Suspense fallback={<Loading label="Loading rankings" />}>
        <RankingsBoard />
      </Suspense>
    </>
  );
}
