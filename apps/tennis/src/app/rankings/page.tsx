import type { Metadata } from "next";
import PageHeader from "@sports/ui/page-header";
import Board from "./board";

export const metadata: Metadata = { title: "World rankings" };
export default function Page() {
  return <><PageHeader title="World rankings">The men&apos;s and women&apos;s top 500, with each player&apos;s main-tour record this season.</PageHeader><Board /></>;
}
