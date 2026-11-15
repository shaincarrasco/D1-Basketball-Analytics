import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@sports/ui/states";
import Tournament from "./tournament";

export const metadata: Metadata = { title: "Tournament" };
export default function Page() {
  return <Suspense fallback={<Loading label="Loading tournament" />}><Tournament /></Suspense>;
}
