import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@/components/page-header";
import LabClient, { LabSkeleton } from "./lab-client";

export const metadata: Metadata = {
  title: "Lineup lab",
  description: "Put any five Division I players on the floor and see how they'd do: a projected net per 100 possessions graded against every real starting five, a fit check, and each team's best projected lineups next to what its real units have done.",
};

export default function LineupsPage() {
  return (
    <>
      <PageHeader title="Lineup lab">Put any five players on the floor and see how they&apos;d do. Every number here is projected.</PageHeader>
      <Suspense fallback={<LabSkeleton />}>
        <LabClient />
      </Suspense>
    </>
  );
}
