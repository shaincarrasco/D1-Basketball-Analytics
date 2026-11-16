import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@sports/ui/page-header";
import ModelView from "./model-view";

export const metadata: Metadata = { title: "Model" };
export default function Page() {
  return (
    <>
      <PageHeader title="Model" actions={<Link href="/predictions/" className="btn">See today&apos;s predictions</Link>}>
        How often Deuce, the model behind Predictions, picks the winner of matches it has never seen. It is tested walk-forward: trained on the past, scored on what came next.
      </PageHeader>
      <ModelView />
    </>
  );
}
