import type { Metadata } from "next";
import PageHeader from "@sports/ui/page-header";
import { SiteRankings } from "@/site";

export const metadata: Metadata = { title: "Player rankings" };
export default function Page() {
  return <><PageHeader title="Player rankings">Pick a lens, or build your own formula. Every ranking shows what went into it.</PageHeader><SiteRankings /></>;
}
