import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@sports/ui/page-header";
import { Loading } from "@sports/ui/states";
import LabClient from "./lab-client";

export const metadata: Metadata = {
  title: "Lineup lab",
  description: "Grade any five Division I players together: projected offense, defense and net per 100 possessions, how each fit adjustment moved it, balance warnings, and each team's best projected lineups next to what its real units have done.",
};

export default function LineupsPage() {
  return (
    <>
      <PageHeader title="Lineup lab">
        Put any five D-I players on the floor, from one team or five. Every number here is <b className="text-ink">projected</b>, and we show how we got it.
      </PageHeader>
      <Suspense fallback={<Loading label="Loading the lineup lab" />}>
        <LabClient />
      </Suspense>
    </>
  );
}
