import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@sports/ui/page-header";
import { Loading } from "@sports/ui/states";
import ProspectsBoard from "./prospects-board";

export const metadata: Metadata = { title: "Prospects", description: "High-school basketball prospects who have not reached college yet: national rank, commitments and the programs building the best classes." };

export default function ProspectsPage() {
  return (
    <>
      <PageHeader title="Prospects">High-school classes not yet in college: national rank, commitments and the programs building the best classes.</PageHeader>
      <Suspense fallback={<Loading label="Loading prospects" />}>
        <ProspectsBoard />
      </Suspense>
    </>
  );
}
