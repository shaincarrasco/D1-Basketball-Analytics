import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@sports/ui/page-header";
import { SiteGallery } from "@/site";

export const metadata: Metadata = { title: "Charts" };
export default function Page() {
  return <><PageHeader title="Charts" actions={<Link href="/charts/build/" className="btn btn-primary">Make your own</Link>}>Who stands out, drawn every way we could think of.</PageHeader><SiteGallery /></>;
}
