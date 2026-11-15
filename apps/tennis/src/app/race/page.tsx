import type { Metadata } from "next";
import PageHeader from "@sports/ui/page-header";
import Board from "./board";

export const metadata: Metadata = { title: "Race to Turin" };
export default function Page() {
  return <><PageHeader title="The race">Who&apos;s in for the year-end finals: the Race to Turin and the Race to the WTA Finals, built from every result this season.</PageHeader><Board /></>;
}
