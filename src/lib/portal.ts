// Transfer portal: the app-data contract (public/data/app/portal.json, written by
// scripts/build-app-data.mjs via linkPortal() in scripts/fetch-portal.mjs) and pure helpers
// shared by /transfers/ and the team-page card. No fs imports: safe on server and client.

export type PortalStatus = "available" | "committed" | "withdrawn";
export type PortalPlace = { slug: string | null; name: string; conf: string | null; confSlug: string | null; d1: boolean };
export type PortalEntry = {
  key: string; name: string; pos: string | null; posN: "G" | "F" | "C" | null; status: PortalStatus;
  /** CBBD eligibility: Immediate, SittingOne, PendingAppeal, TBD, Withdrawn. */
  elig: string | null; yrs: number | null;
  /** Transfer stars / rating as CBBD publishes them (null when unrated). */
  stars: number | null; rating: number | null;
  /** First date our daily fetch saw the entry / its destination (CBBD has no official dates). */
  firstSeen: string | null; committedSeen: string | null;
  from: PortalPlace | null; to: PortalPlace | null;
  /** Our player id when the name matches a 2026–27 player on his origin team. */
  pid: string | null;
  stats: { g: number | null; min: number | null; pts: number | null; reb: number | null; ast: number | null; ts: number | null; dpr: number | null; onPoss: number | null } | null;
  /** Est. points per 100 possessions over a replacement player (see IMPACT_HELP). */
  impact: number | null;
};
export type PortalWindow = { opens: string; closes: string; basis: string; coachingChange: string; sources: { label: string; url: string }[] };
export type PortalFile = {
  provider: string; fetchedAt: string | null; status: "available" | "not-open" | "empty"; year: number | null; note: string | null;
  window: PortalWindow; linked: number; count: number; entries: PortalEntry[];
};

export const STATUS_LABEL: Record<PortalStatus, string> = { available: "Available", committed: "Committed", withdrawn: "Withdrew" };
export const ELIG_LABEL: Record<string, string> = { Immediate: "Eligible right away", SittingOne: "Sitting out a year", PendingAppeal: "Waiver pending", TBD: "Eligibility TBD", Withdrawn: "Withdrew from the portal" };

export const IMPACT_SHORT = "Est. points per 100 possessions he was worth to his 2026–27 team over a replacement-level player.";
export const IMPACT_HELP =
  "Impact = (minutes per game ÷ 40) × (DPR + 2). DPR is our lineup-based rating (points per 100 possessions vs an average D-I player); +2 because a typical end-of-bench replacement is about −2. " +
  "So a 30-minute starter at +4 DPR is worth about 4.5 points per 100 possessions. It is the same yardstick the injury tracker uses for a player who is out, floored at 0, and it reflects his role at his old school, not a forecast for the new one.";

/** "Apr 6" style date from yyyy-mm-dd (no timezone drift). */
export const dateShort = (d: string | null | undefined, year = false) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" }) : "";
export const dateLong = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
/** "April 6–20, 2027" */
export const windowText = (w: Pick<PortalWindow, "opens" | "closes">) => {
  const o = new Date(`${w.opens}T12:00:00Z`), c = new Date(`${w.closes}T12:00:00Z`);
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return m(o) === m(c) ? `${m(o)} ${o.getUTCDate()}–${c.getUTCDate()}, ${c.getUTCFullYear()}` : `${dateLong(w.opens)} – ${dateLong(w.closes)}`;
};
/** Where today (yyyy-mm-dd, Eastern) sits relative to the window. */
export function windowPhase(w: Pick<PortalWindow, "opens" | "closes">, today: string): { phase: "before" | "open" | "after"; days: number } {
  const day = (s: string) => Date.parse(`${s}T12:00:00Z`) / 864e5;
  if (today < w.opens) return { phase: "before", days: Math.round(day(w.opens) - day(today)) };
  if (today <= w.closes) return { phase: "open", days: Math.round(day(w.closes) - day(today)) + 1 };
  return { phase: "after", days: Math.round(day(today) - day(w.closes)) };
}

export const signedImpact = (v: number | null | undefined) =>
  typeof v === "number" && Number.isFinite(v) ? `${v > 0.04 ? "+" : v < -0.04 ? "−" : ""}${Math.abs(v).toFixed(1)}` : "—";

/** A team's portal movement. Withdrawn players are going back, so they aren't losses. */
export type TeamMoves = {
  slug: string; name: string; conf: string | null; confSlug: string | null;
  out: PortalEntry[]; inn: PortalEntry[];
  lost: number; added: number; net: number;
  /** Players with no stats line (unmatched or new to D-I): counted, but not in the impact sums. */
  outUnknown: number; inUnknown: number;
};
export function teamMoves(entries: PortalEntry[], slug: string): TeamMoves | null {
  const out = entries.filter(e => e.from?.slug === slug && e.status !== "withdrawn");
  const inn = entries.filter(e => e.to?.slug === slug && e.status === "committed");
  if (!out.length && !inn.length) return null;
  const place = out[0]?.from ?? inn[0]?.to!;
  const sum = (l: PortalEntry[]) => Math.round(l.reduce((a, e) => a + (e.impact ?? 0), 0) * 10) / 10;
  const byImpact = (a: PortalEntry, b: PortalEntry) => (b.impact ?? -1) - (a.impact ?? -1) || a.name.localeCompare(b.name);
  const lost = sum(out), added = sum(inn);
  return {
    slug, name: place.name, conf: place.conf, confSlug: place.confSlug,
    out: [...out].sort(byImpact), inn: [...inn].sort(byImpact),
    lost, added, net: Math.round((added - lost) * 10) / 10,
    outUnknown: out.filter(e => e.impact === null).length, inUnknown: inn.filter(e => e.impact === null).length,
  };
}
export function allTeamMoves(entries: PortalEntry[]): TeamMoves[] {
  const slugs = new Set<string>();
  for (const e of entries) {
    if (e.from?.slug && e.status !== "withdrawn") slugs.add(e.from.slug);
    if (e.to?.slug && e.status === "committed") slugs.add(e.to.slug);
  }
  return [...slugs].map(s => teamMoves(entries, s)!).filter(Boolean);
}
