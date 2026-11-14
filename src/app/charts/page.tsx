import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SlidersHorizontal } from "lucide-react";
import PlayersTabs from "../players/players-tabs";
import PageHeader from "@/components/page-header";
import { Loading } from "@/components/states";
import Gallery from "./gallery";

export const metadata: Metadata = { title: "Player charts", description: "Scatter plots, leaderboards and swarm charts that show which Division I players stand out: scoring efficiency, shooting, playmaking, defense, rebounding and impact." };

export default function ChartsPage() {
  return (
    <>
      <PageHeader title="Charts" actions={<Link href="/charts/build/" className="btn btn-primary"><SlidersHorizontal size={15} aria-hidden /> Make your own</Link>}>
        Who stands out, drawn every way we could think of. Filter every chart at once, tap a dot to open the player, and remix any chart in the builder.
      </PageHeader>
      <PlayersTabs active="charts" />
      <Suspense fallback={<Loading label="Loading charts" />}>
        <Gallery />
      </Suspense>
    </>
  );
}
