import type { Metadata } from "next";
import PageHeader from "@sports/ui/page-header";
import List from "./list";

export const metadata: Metadata = { title: "Tournaments" };
export default function Page() {
  return <><PageHeader title="Tournaments">Every main-tour event this season, with its champion.</PageHeader><List /></>;
}
