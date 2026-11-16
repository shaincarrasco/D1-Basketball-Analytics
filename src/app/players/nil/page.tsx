import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import PageHeader from "@sports/ui/page-header";
import { Loading } from "@sports/ui/states";
import NilBoard from "./nil-board";

export const metadata: Metadata = {
  title: "Estimated NIL value",
  description: "D1 Hoops' estimated 2026–27 NIL / market value for every Division I men's basketball player: a transparent estimate calibrated to publicly reported deals, with a range for every estimate and the reported figures cited separately.",
};

export default function NilPage() {
  return (
    <>
      <PageHeader title="NIL value">
        What each player is worth a year in 2026–27. Estimates, not reported deals.{" "}
        <Link href="/methodology/#nil" className="font-semibold text-bulb-ink hover:underline">How we estimate this</Link>
      </PageHeader>
      <Suspense fallback={<Loading label="Loading estimates" />}>
        <NilBoard />
      </Suspense>
    </>
  );
}
