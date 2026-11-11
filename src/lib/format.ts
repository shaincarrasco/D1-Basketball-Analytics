// Formatting + colour helpers shared by every page.

export const fmt = (v: number | null | undefined, digits = 1) =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "—";
export const signed = (v: number | null | undefined, digits = 1) =>
  typeof v === "number" && Number.isFinite(v) ? (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(digits) : "—";
export const pctFmt = (p: number | null | undefined, digits = 0) => {
  if (typeof p !== "number" || !Number.isFinite(p)) return "—";
  // Never claim certainty: a 99.7% favourite still loses sometimes.
  if (p > 0.995 && digits === 0) return ">99%";
  if (p < 0.005 && digits === 0) return "<1%";
  return `${(p * 100).toFixed(digits)}%`;
};
export const record = (w: number, l: number) => `${w}–${l}`;

const ET = "America/New_York";
export const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
export const timeLabel = (iso: string) => {
  const d = new Date(iso);
  // Midnight Eastern is the provider's placeholder for an unannounced tip time.
  const et = new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit", hour12: false }).format(d);
  if (et === "00:00" || et === "24:00") return "TBA";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};
export const etToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: ET }).format(new Date());
export const relativeTime = (iso: string | null) => {
  if (!iso) return "unknown";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** Rank → heat background. Top ranks glow mint, bottom ranks tint rose, the middle stays clear. */
export function heat(rank: number | null | undefined, total = 356): string | undefined {
  if (!rank) return undefined;
  const p = 1 - (rank - 1) / Math.max(1, total - 1); // 1 = best
  const d = Math.abs(p - 0.5) * 2;
  if (d < 0.2) return undefined;
  const a = ((d - 0.2) / 0.8) * 0.32;
  return p > 0.5 ? `rgb(var(--good-rgb) / calc(${a.toFixed(3)} * var(--heat-k)))` : `rgb(var(--bad-rgb) / calc(${a.toFixed(3)} * var(--heat-k)))`;
}
/** Percentile (0–1, 1 = best) → heat background. */
export const heatPct = (p: number | null | undefined) => (p == null ? undefined : heat(Math.round((1 - p) * 99) + 1, 100));

export const venueWord = (v: "H" | "A" | "N") => (v === "H" ? "vs" : v === "A" ? "at" : "vs");
export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => (v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = [header, ...rows].map(r => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
