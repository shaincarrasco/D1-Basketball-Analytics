import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PageHeader from "@sports/ui/page-header";
import { Loading } from "@sports/ui/states";
import Predictions from "./predictions";

export const metadata: Metadata = { title: "Predictions" };
export default function Page() {
  return (
    <>
      <PageHeader title="Predictions" actions={<Link href="/model/" className="btn">How accurate is it?</Link>}>
        Who the Deuce model expects to win, and why. Finished matches keep the number from before the match, so you can check it. Tap a match for its Match Brief.
      </PageHeader>
      <Suspense fallback={<Loading label="Loading predictions" />}><Predictions /></Suspense>
    </>
  );
}
