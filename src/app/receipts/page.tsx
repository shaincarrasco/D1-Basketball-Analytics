import type { Metadata } from "next";
import PageHeader from "@sports/ui/page-header";
import ReceiptsView from "./receipts-view";

export const metadata: Metadata = {
  title: "Receipts",
  description: "The model's track record in public: every headline number, a weekly record, how well the win probabilities are calibrated, how it compares with the betting line, and the most recent picks graded.",
};

export default function ReceiptsPage() {
  return (
    <>
      <PageHeader title="Receipts">
        Every game predicted using only the games before it, then graded after the buzzer.
      </PageHeader>
      <ReceiptsView />
    </>
  );
}
