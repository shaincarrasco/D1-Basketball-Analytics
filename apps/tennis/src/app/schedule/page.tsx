import type { Metadata } from "next";
import PageHeader from "@sports/ui/page-header";
import Schedule from "./schedule";

export const metadata: Metadata = { title: "Schedule" };
export default function Page() {
  return <><PageHeader title="Schedule">The order of play across both tours, day by day.</PageHeader><Schedule /></>;
}
