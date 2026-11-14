import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@/components/page-header";
import { Loading } from "@/components/states";
import Lab from "./lab";

export const metadata: Metadata = { title: "Sport lab", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <>
      <PageHeader title="Sport lab">The same charts and rankings engine running on every sport pack, with sample data.</PageHeader>
      <Suspense fallback={<Loading label="Loading the lab" />}><Lab /></Suspense>
    </>
  );
}
