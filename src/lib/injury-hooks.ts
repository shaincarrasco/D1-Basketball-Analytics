"use client";
// Client hooks for injury views: the league file and the "new since your last visit" marker.
import { useEffect, useState } from "react";
import type { InjuryFile } from "./types";
import { useJson } from "@sports/ui/client-data";

/** The league-wide injury file (rows, team health, change wire, official report links). */
export const useInjuries = () => useJson<InjuryFile>("injuries.json");

// "New since your last visit": the time this device last opened an injury view.
const SEEN_KEY = "d1h-injuries-seen";
export function useLastSeen(mark = true): string | null {
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => {
    let prev: string | null = null;
    try { prev = localStorage.getItem(SEEN_KEY); } catch { /* storage unavailable */ }
    setSeen(prev);
    if (!mark) return;
    const t = window.setTimeout(() => { try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch { /* storage unavailable */ } }, 4000);
    return () => window.clearTimeout(t);
  }, [mark]);
  return seen;
}

