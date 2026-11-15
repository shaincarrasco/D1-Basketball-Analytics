// Calendar data (calendar.json): seasons of events per tour, newest season first.
export type Person = { id: string; name: string };
export type CalEvent = { id: string; sid: number; name: string; level: string; surface: string; indoor: boolean; start: string | null; end: string | null; status: string; location: string | null; country: string | null; purse: string | null; draw: number | null; winner: Person | null; previous: Person | null; runnerUp?: Person; final?: string };
export type Calendar = { updated: string; tours: Record<"men" | "women", { year: number; events: CalEvent[] }[]> };
export const fmtDay = (d: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBA");
export const isLive = (e: CalEvent) => e.status === "in_progress";
export const isUpcoming = (e: CalEvent) => e.status === "pre_game";
