import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PlayersTabs from "../../players/players-tabs";
import PageHeader from "@/components/page-header";
import { Loading } from "@/components/states";
import Builder from "./builder";

export const metadata: Metadata = { title: "Chart builder", description: "Make your own Division I player charts: scatter plots with quadrants, leaderboards, swarm charts and percentile comparisons. Share with a link or download as PNG." };

export default function BuildPage() {
  return (
    <>
      <PageHeader title="Chart builder" actions={<Link href="/charts/" className="btn">Back to the gallery</Link>}>
        Pick any two stats, any pool of players, and who to call out. Every setting is saved in the link.
      </PageHeader>
      <PlayersTabs active="build" />
      <Suspense fallback={<Loading label="Loading builder" />}>
        <Builder />
      </Suspense>
    </>
  );
}
