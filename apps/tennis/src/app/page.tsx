import PageHeader from "@sports/ui/page-header";
import Today from "./today";

export default function Home() {
  return (
    <>
      <PageHeader title="Today">Live and recent singles matches from the men&apos;s and women&apos;s tours.</PageHeader>
      <Today />
    </>
  );
}
