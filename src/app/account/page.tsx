import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import AccountClient from "./account-client";

export const metadata: Metadata = { title: "Account", description: "Sign in to sync the teams and players you follow, make picks, and manage D1 Hoops Pro." };

export default function AccountPage() {
  return (
    <>
      <PageHeader title="Account">Sync your follows across devices, make picks, and manage Pro.</PageHeader>
      <AccountClient />
    </>
  );
}
