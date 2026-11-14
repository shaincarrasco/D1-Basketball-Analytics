import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@/components/page-header";
import { Loading } from "@/components/states";
import ProjectionsBoard from "./projections-board";

export const metadata: Metadata = { title: "Player skill projections", description: "Projected shooting, scoring, playmaking, rebounding and defense for every Division I player: this season blended with what players like him usually do, with the sample behind each number." };

export default function PlayerProjectionsPage() {
  return (
    <>
      <PageHeader title="Skill projections">What each player&apos;s skills most likely are, with this season&apos;s real number beside every projection and how much of it is his own data.</PageHeader>
      <Suspense fallback={<Loading label="Loading projections" />}>
        <ProjectionsBoard />
      </Suspense>
    </>
  );
}
