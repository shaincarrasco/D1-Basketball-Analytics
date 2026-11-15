import type { Metadata } from "next";
import PageHeader from "@sports/ui/page-header";
import Weeks from "./weeks";

export const metadata: Metadata = { title: "Schedule" };
export default function Page() {
  return <><PageHeader title="Schedule">Every FBS game, week by week. Finished games open to their drive charts.</PageHeader><Weeks /></>;
}
