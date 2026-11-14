"use client";
// Shared injury helpers: ordering, colours, plain-English labels and the "new since your last visit" marker.
import { useEffect, useState } from "react";
import type { Availability, InjuryConfidence, InjuryEvent, InjuryFile, InjuryState, InjurySource } from "./types";
import { useJson } from "./client-data";

export const STATE_ORDER: InjuryState[] = ["season", "out", "doubtful", "questionable", "dtd", "missed", "monitor"];
/** States that take a player off the floor (they count toward missing minutes). */
export const OUT_STATES = new Set<InjuryState>(["season", "out", "doubtful", "missed"]);
export const STATE_SHORT: Record<InjuryState, string> = { season: "Season", out: "Out", doubtful: "Doubtful", questionable: "Questionable", dtd: "Day-to-day", missed: "Missed", monitor: "Monitor" };
/** Tone per state: "loss" red for out, "hot" amber for uncertain, "off" for box-score inferences, "dim" for notes. */
export const STATE_TONE: Record<InjuryState, "loss" | "hot" | "off" | "dim"> = { season: "loss", out: "loss", doubtful: "loss", questionable: "hot", dtd: "hot", missed: "off", monitor: "dim" };
export const SOURCE_LABEL: Record<InjurySource, string> = { espn: "ESPN injury list", manual: "News report", news: "Headline", box: "Box scores" };
export const CONFIDENCE_LABEL: Record<InjuryConfidence, string> = { confirmed: "Confirmed", reported: "Reported", inferred: "Inferred" };
export const CONFIDENCE_HELP: Record<InjuryConfidence, string> = {
  confirmed: "On ESPN's official injury list.",
  reported: "From a credited news report; follow the link for the original.",
  inferred: "He stopped showing up in box scores. The team hasn't said why.",
};
export const EVENT_LABEL: Record<InjuryEvent["kind"], string> = { new: "New", worse: "Worse", better: "Improved", update: "Update", returned: "Back", cleared: "Off the list" };

export const shortDate = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
export const etaText = (a: Pick<Availability, "eta" | "expected">) =>
  a.eta ? `Est. back ${shortDate(a.eta[0])}${a.eta[1] !== a.eta[0] ? `–${shortDate(a.eta[1])}` : ""}` : a.expected ?? null;
/** "≈1.8 pts/100" — estimated team rating lost while he's out. */
export const lossText = (v: number | null | undefined) => (v && v >= 0.05 ? `−${v.toFixed(1)}` : "—");
export const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export function timeAgo(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "";
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

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
