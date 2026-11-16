import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@sports/ui/page-header";
import { Loading } from "@sports/ui/states";
import RisersBoard from "./risers-board";

export const metadata: Metadata = { title: "Risers", description: "Division I players whose DPR impact rating has climbed or fallen the most over the last 30 days." };

export default function RisersPage() {
  return (
    <>
      <PageHeader title="Risers">Players whose DPR impact rating has moved the most over the last 30 days. Only players with at least 150 on-court possessions count.</PageHeader>
      <Suspense fallback={<Loading label="Loading risers" />}>
        <RisersBoard />
      </Suspense>
    </>
  );
}
