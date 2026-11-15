import type { Metadata } from "next";
import PageHeader from "@sports/ui/page-header";
import Board from "./board";

export const metadata: Metadata = { title: "Rankings" };
export default function Page() {
  return <><PageHeader title="Rankings">The playoff committee, the AP poll and the coaches, with each team&apos;s move since last week.</PageHeader><Board /></>;
}
