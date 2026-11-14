// Shared injury helpers: ordering, colours and plain-English labels. Pure, so server and client
// components can both import it; the hooks live in injury-hooks.ts.
import type { Availability, InjuryConfidence, InjuryEvent, InjuryState, InjurySource } from "./types";

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

/** Where to send someone for a player: his profile if he has a stats line, else his team page. */
export const playerHref = (r: { pid: string | null; slug: string }) => (r.pid ? `/player/?id=${r.pid}` : `/teams/${r.slug}/`);
