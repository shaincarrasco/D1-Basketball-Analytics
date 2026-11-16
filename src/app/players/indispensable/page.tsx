import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import PageHeader from "@sports/ui/page-header";
import { Loading } from "@sports/ui/states";
import IndispensableBoard from "@/components/form/indispensable-board";

export const metadata: Metadata = { title: "Most indispensable players", description: "How much each Division I team's DHR rating would drop without a player: minutes played times his DPR impact over a bench replacement." };

export default function IndispensablePage() {
  return (
    <>
      <PageHeader title="Most indispensable">
        How far each team&apos;s rating would fall without him.{" "}
        <Link href="/methodology/#indispensable" className="font-semibold text-bulb-ink hover:underline">How it&apos;s figured</Link>
      </PageHeader>
      <Suspense fallback={<Loading label="Loading players" />}>
        <IndispensableBoard />
      </Suspense>
    </>
  );
}
