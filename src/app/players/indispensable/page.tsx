import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import { Loading } from "@/components/states";
import IndispensableBoard from "@/components/form/indispensable-board";

export const metadata: Metadata = { title: "Most indispensable players", description: "How much each Division I team's DHR rating would drop without a player: minutes played times his DPR impact over a bench replacement." };

export default function IndispensablePage() {
  return (
    <>
      <PageHeader title="Most indispensable">
        How much a team&apos;s DHR rating would drop if a player sat and a typical end-of-bench player took his minutes. Big minutes and a strong DPR both count.{" "}
        <Link href="/methodology/#indispensable" className="font-semibold text-bulb-ink hover:underline">How it&apos;s figured</Link>
      </PageHeader>
      <Suspense fallback={<Loading label="Loading players" />}>
        <IndispensableBoard />
      </Suspense>
    </>
  );
}
