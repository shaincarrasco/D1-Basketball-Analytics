// Deuce site data (docs/tennis-deuce.md): predictions.json, briefs/<id>.json, model.json,
// plus the small helpers the Predictions and Model pages share. Null is missing, never zero.

export type Side = "p1" | "p2";
export type DPlayer = { id: string; name: string; country: string | null; baseline_id: string | null; elo: number | null; rank: number | null };
export type DMatch = {
  id: string; date: string; tour: "ATP" | "WTA" | string; level: string | null; tournament: string; surface: string | null; round: string | null;
  status: string; score: string | null; winner: string | null;
  p1: DPlayer; p2: DPlayer; p1_prob: number | null; p2_prob: number | null;
  set_probs: Record<string, number> | null; low_data: boolean; brief: boolean;
};
export type Predictions = { generated_at: string; model_version: string | null; matches: DMatch[] };

export type Fact = { label: string; p1: number | string | boolean | null; p2: number | string | boolean | null };
export type Bucket = { key: string; title: string; favours: Side | "level"; strength: "slight" | "moderate" | "strong" | null; text: string | null; facts: Fact[] };
export type Brief = {
  match_id: string; tournament?: string; surface?: string; model_pick: Side; model_prob: number | null;
  agreement: { score: number | null; label: string | null } | null;
  buckets: Bucket[];
  players: Record<Side, { name: string; upsides: string[]; downsides: string[] }>;
  weather: { temp_c: number | null; humidity: number | null; wind_kph: number | null; precip_mm: number | null; summary: string | null } | null;
  bottom_line: string | null; engine: string | null; generated_at: string | null;
};

export type Metrics = { accuracy: number | null; brier: number | null; log_loss: number | null; n: number };
export type Split = Metrics & { name: string; start: string; end: string; baseline_elo_accuracy: number | null; baseline_elo_brier: number | null };
export type Model = {
  generated_at: string | null;
  overall: (Metrics & { baseline_elo_accuracy: number | null; baseline_elo_brier: number | null; baseline_elo_log_loss?: number | null; baseline_coin_brier?: number | null }) | null;
  // The exporter writes null for anything it doesn't have; the page renders whatever is present.
  splits: Split[] | null;
  calibration: { bin: string; pred: number; actual: number; n: number }[] | null;
  rolling: { date: string; accuracy_100: number | null; brier_100: number | null }[] | null;
  by_tour: Record<string, Metrics & { baseline_elo_brier?: number | null }> | null;
  by_level: Record<string, Metrics & { baseline_elo_brier?: number | null }> | null;
  set_score_check: { n: number | null; favourite_straight_sets_pred: number | null; favourite_straight_sets_actual: number | null } | null;
  notes: string[] | null;
};

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Match state from the exporter's status word (Deuce uses final/retired/walkover for finished). */
export function stateOf(m: Pick<DMatch, "status">): "pre" | "live" | "done" {
  const s = (m.status || "").toLowerCase();
  if (s === "live" || s === "in_progress" || s === "in") return "live";
  if (["finished", "final", "retired", "walkover", "post", "completed"].includes(s)) return "done";
  return "pre";
}

/** The side the model favoured, or null for a dead 50-50 or a missing probability. */
export function pickOf(m: Pick<DMatch, "p1_prob" | "p2_prob">): Side | null {
  const a = probOf(m, "p1"), b = probOf(m, "p2");
  if (a === null || b === null || a === b) return null;
  return a > b ? "p1" : "p2";
}

/** Winner as a side; accepts "p1"/"p2" or a player id. */
export function winnerOf(m: Pick<DMatch, "winner" | "p1" | "p2">): Side | null {
  const w = m.winner;
  if (!w) return null;
  if (w === "p1" || w === "p2") return w;
  if (w === m.p1.id || w === m.p1.baseline_id) return "p1";
  if (w === m.p2.id || w === m.p2.baseline_id) return "p2";
  return null;
}

/** true / false once a finished match has a winner and the model had a pick; otherwise null. */
export function pickRight(m: DMatch): boolean | null {
  if (stateOf(m) !== "done") return null;
  const w = winnerOf(m), p = pickOf(m);
  return w && p ? w === p : null;
}

export const probOf = (m: Pick<DMatch, "p1_prob" | "p2_prob">, s: Side) =>
  s === "p1" ? (num(m.p1_prob) ? m.p1_prob : num(m.p2_prob) ? 1 - m.p2_prob : null) : (num(m.p2_prob) ? m.p2_prob : num(m.p1_prob) ? 1 - m.p1_prob : null);

/** Calendar day in the viewer's time zone, YYYY-MM-DD. */
export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const shiftDay = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dayKey(d.toISOString());
};

/** The day to open on: today if it has matches, else the next day that does, else the latest. */
export function defaultDay(days: string[], today: string): string | null {
  if (!days.length) return null;
  return days.includes(today) ? today : days.find(d => d > today) ?? days[days.length - 1];
}

/** "Indoor Hard" → hard, for the surface colour variables (--hard, --clay, --grass, --other). */
export function surfaceKey(s: string | null | undefined) {
  const t = (s ?? "").toLowerCase();
  return t.includes("clay") ? "clay" : t.includes("grass") ? "grass" : t.includes("hard") ? "hard" : "other";
}
export const surfaceVar = (s: string | null | undefined) => `var(--${surfaceKey(s)})`;

/** Surname, keeping particles: "Alex de Minaur" → "de Minaur". */
export function lastName(name: string | null | undefined) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const particles = new Set(["de", "da", "del", "van", "von", "der", "di", "le", "la", "dos"]);
  let i = parts.length - 1;
  while (i > 1 && particles.has(parts[i - 1].toLowerCase())) i--;
  return parts.slice(i).join(" ");
}

/** A fact cell: null/"" → "—", booleans → Yes/No, numbers trimmed. */
export function factValue(v: Fact["p1"]): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—";
    if (Number.isInteger(v)) return v.toLocaleString("en-US");
    return Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : String(Number(v.toFixed(1)));
  }
  return String(v);
}

export function engineLabel(engine: string | null | undefined) {
  if (engine && engine.startsWith("llm")) return "Written from the numbers by a language model";
  return "Written from the numbers by rules";
}

/** "Finals", "Grand Slam", "1000" → a label a reader recognises. */
export function levelLabel(level: string | null | undefined, tour?: string) {
  if (!level) return null;
  if (/^\d+$/.test(level)) return `${tour === "WTA" ? "WTA" : tour === "ATP" ? "ATP" : ""} ${level}`.trim();
  return level;
}

export const tourWord = (t: string) => (t === "ATP" ? "Men" : t === "WTA" ? "Women" : t);
export const pct1 = (v: number | null | undefined) => (num(v) ? `${(v * 100).toFixed(1)}%` : "—");
export const dec3 = (v: number | null | undefined) => (num(v) ? v.toFixed(3) : "—");

/** Notes that talk about betting stay out of the site (docs/tennis-paper-bets.md has them). */
export const siteNotes = (notes: string[] | null | undefined) => (notes ?? []).filter(n => !/\b(odds|bet|bets|betting|value|roi|profit|stake|edge)\b/i.test(n));

/** Both sides as whole percentages that add up to 100 (51.5/48.5 shows 52/48, not 52/49). */
export function pctPair(m: Pick<DMatch, "p1_prob" | "p2_prob">): [string, string] {
  const a = probOf(m, "p1");
  if (a === null) return ["—", "—"];
  const r = Math.round(a * 100);
  if (r >= 100) return [">99%", "<1%"];
  if (r <= 0) return ["<1%", ">99%"];
  return [`${r}%`, `${100 - r}%`];
}
