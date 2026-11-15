import type { Metadata } from "next";
import PageHeader from "@sports/ui/page-header";
import CalendarView from "./calendar-view";

export const metadata: Metadata = { title: "Calendar" };
export default function Page() {
  return <><PageHeader title="Calendar">Every tournament this season and the last three, with champions. Open one for its full results.</PageHeader><CalendarView /></>;
}
