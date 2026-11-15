import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@sports/ui/states";
import View from "./view";

export const metadata: Metadata = { title: "Game" };
export default function Page() {
  return <Suspense fallback={<Loading label="Loading game" />}><View /></Suspense>;
}
