"use client";
// A quiet line under the header while the device is offline: "You're offline · showing scores
// from 9:40 PM". The time is the last live-score response this tab received (from the browser's
// resource timing, so nothing else has to report it), else the published data's own timestamp.
import { useEffect, useState } from "react";
import { offlineMessage } from "@/lib/time-ago";

/** The end time (ms) of the most recent live-score response (ESPN scoreboard or the relay stream), if any. */
function lastDataLoad(): number | null {
  try {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    let best: number | null = null;
    for (const e of entries) {
      if (!/\/scoreboard(\?|$)|\/events(\?|$)/.test(e.name)) continue;
      const status = (e as PerformanceResourceTiming & { responseStatus?: number }).responseStatus;
      if (status !== undefined && status !== 0 && (status < 200 || status >= 300)) continue;
      if (!e.responseEnd) continue;
      const t = performance.timeOrigin + e.responseEnd;
      if (best === null || t > best) best = t;
    }
    return best;
  } catch {
    return null;
  }
}

export default function OfflineNote({ updated }: { updated: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setText(navigator.onLine === false ? offlineMessage(lastDataLoad(), updated) : null);
    sync();
    window.addEventListener("offline", sync);
    window.addEventListener("online", sync);
    return () => { window.removeEventListener("offline", sync); window.removeEventListener("online", sync); };
  }, [updated]);
  return (
    <div role="status" aria-live="polite">
      {text && (
        <p className="border-t border-line px-4 py-1.5 text-center text-[13px] font-medium text-mute sm:px-6">{text}</p>
      )}
    </div>
  );
}
