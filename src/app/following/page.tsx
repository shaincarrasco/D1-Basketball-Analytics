import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import FollowingClient from "./following-client";

export const metadata: Metadata = { title: "Following", description: "The teams and players you follow on D1 Hoops: next games, records, ranks and key stats." };

export default function FollowingPage() {
  return (
    <>
      <PageHeader title="Following">Your teams and players, saved on this device.</PageHeader>
      <FollowingClient />
    </>
  );
}
