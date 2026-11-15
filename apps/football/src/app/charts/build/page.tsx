import type { Metadata } from "next";
import PageHeader from "@sports/ui/page-header";
import { SiteBuilder } from "@/site";

export const metadata: Metadata = { title: "Chart builder" };
export default function Page() {
  return <><PageHeader title="Chart builder">Pick any two stats and who to call out. Every setting is saved in the link.</PageHeader><SiteBuilder /></>;
}
