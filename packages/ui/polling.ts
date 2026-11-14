"use client";
// Poll a JSON URL on an interval (live scores). Pauses while the tab is hidden and
// refreshes as soon as it comes back. Pass null to stop.
import { useEffect, useRef, useState } from "react";

export function usePolledJson<T>(url: string | null, everyMs = 30_000): { data: T | null; error: string | null; at: number | null } {
  const [state, setState] = useState<{ data: T | null; error: string | null; at: number | null }>({ data: null, error: null, at: null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!url) return;
    let dead = false;
    const tick = async () => {
      if (timer.current) clearTimeout(timer.current);
      if (document.visibilityState === "visible") {
        try {
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = (await r.json()) as T;
          if (!dead) setState({ data, error: null, at: Date.now() });
        } catch (e) { if (!dead) setState(s => ({ ...s, error: (e as Error).message })); }
      }
      if (!dead) timer.current = setTimeout(tick, everyMs);
    };
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    tick();
    document.addEventListener("visibilitychange", onVis);
    return () => { dead = true; if (timer.current) clearTimeout(timer.current); document.removeEventListener("visibilitychange", onVis); };
  }, [url, everyMs]);
  return state;
}
