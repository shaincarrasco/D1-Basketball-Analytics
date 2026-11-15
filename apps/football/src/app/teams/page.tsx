import type { Metadata } from "next";
import PageHeader from "@sports/ui/page-header";
import List from "./list";

export const metadata: Metadata = { title: "Teams" };
export default function Page() {
  return <><PageHeader title="Teams">All 136 FBS programs by conference standings.</PageHeader><List /></>;
}
