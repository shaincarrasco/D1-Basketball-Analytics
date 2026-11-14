import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import { Loading } from "@/components/states";
import NilBoard from "./nil-board";

export const metadata: Metadata = {
  title: "Estimated NIL value",
  description: "D1 Hoops' estimated 2026–27 NIL / market value for every Division I men's basketball player: a transparent model calibrated to publicly reported deals, with a range for every estimate and the reported figures cited separately.",
};

export default function NilPage() {
  return (
    <>
      <PageHeader title="NIL value">
        Our estimate of what each player is worth a year in 2026–27: his team&apos;s roster budget times his share of it. These are model estimates, not reported deals. Reported figures are listed separately with their sources.{" "}
        <Link href="/methodology/#nil" className="font-semibold text-bulb-ink hover:underline">How we estimate this</Link>
      </PageHeader>
      <Suspense fallback={<Loading label="Loading estimates" />}>
        <NilBoard />
      </Suspense>
    </>
  );
}
