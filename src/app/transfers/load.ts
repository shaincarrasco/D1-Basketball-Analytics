// Build-time read of the transfer portal app file (static export).
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PortalFile } from "@/lib/portal";

const FALLBACK_WINDOW: PortalFile["window"] = {
  opens: "2027-04-06", closes: "2027-04-20",
  basis: "15 days from the day after the 2027 national championship game (April 5, 2027).",
  coachingChange: "", sources: [],
};

export function getPortal(): PortalFile {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "app", "portal.json"), "utf8")) as PortalFile;
  } catch {
    return { provider: "College Basketball Data /recruiting/portal", fetchedAt: null, status: "not-open", year: null, note: null, window: FALLBACK_WINDOW, linked: 0, count: 0, entries: [] };
  }
}
