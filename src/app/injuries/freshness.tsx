"use client";
import { useEffect, useState } from "react";
import { shortDate, timeAgo } from "@/lib/injuries";

// Relative time is rendered after mount so the static HTML and the client agree.
export default function Freshness({ checked }: { checked: string }) {
  const [ago, setAgo] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setAgo(timeAgo(checked));
    tick();
    const id = window.setInterval(tick, 60000);
    return () => window.clearInterval(id);
  }, [checked]);
  return <p className="text-[13px] text-dim">Checked {ago ?? shortDate(checked)} · updates hourly</p>;
}
