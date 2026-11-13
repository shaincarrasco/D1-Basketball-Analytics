"use client";
// Subscribe to the team's schedule (webcal) or download the .ics once.
import { CalendarPlus } from "lucide-react";
import { dataUrl } from "@/lib/client-data";

export default function CalendarButton({ slug, name }: { slug: string; name: string }) {
  const subscribe = () => {
    const url = new URL(dataUrl(`cal/${slug}.ics`), window.location.href);
    window.location.href = url.href.replace(/^https?:/, "webcal:");
  };
  return (
    <span className="inline-flex">
      <button type="button" onClick={subscribe} className="btn rounded-r-none" title={`Subscribe to ${name}'s schedule in your calendar app (updates automatically)`}>
        <CalendarPlus size={16} aria-hidden /> Add to calendar
      </button>
      <a href={dataUrl(`cal/${slug}.ics`)} download={`${slug}-schedule.ics`} className="btn rounded-l-none border-l-0 !px-2.5 text-xs" title="Download the .ics file instead">.ics</a>
    </span>
  );
}
