import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@sports/ui/page-header";
import { Loading } from "@sports/ui/states";
import CompareClient from "./compare-client";

export const metadata: Metadata = { title: "Compare players", description: "Head-to-head D-I player comparison: percentiles on 14 stats, side by side." };

export default function ComparePage() {
  return (
    <>
      <PageHeader title="Compare players">Two players, fourteen stats, head to head.</PageHeader>
      <Suspense fallback={<Loading label="Loading players" />}>
        <CompareClient />
      </Suspense>
    </>
  );
}
