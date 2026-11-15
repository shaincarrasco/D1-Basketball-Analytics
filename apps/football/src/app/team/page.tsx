import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@sports/ui/states";
import Profile from "./profile";

export const metadata: Metadata = { title: "Team" };
export default function Page() {
  return <Suspense fallback={<Loading label="Loading team" />}><Profile /></Suspense>;
}
