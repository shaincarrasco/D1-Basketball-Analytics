import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/states";
import PlayerProfile from "./player-profile";

export const metadata: Metadata = { title: "Player profile", description: "Per-game stats, D-I percentiles, shot diet and team context for a Division I player." };

export default function PlayerPage() {
  return (
    <Suspense fallback={<Loading label="Loading player" />}>
      <PlayerProfile />
    </Suspense>
  );
}
