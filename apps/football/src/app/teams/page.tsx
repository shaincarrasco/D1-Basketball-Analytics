import type { Metadata } from "next";
import PageHeader from "@sports/ui/page-header";
import List from "./list";

export const metadata: Metadata = { title: "Teams" };
export default function Page() {
  return <><PageHeader title="Teams">Every FBS program, by conference standings.</PageHeader><List /></>;
}
