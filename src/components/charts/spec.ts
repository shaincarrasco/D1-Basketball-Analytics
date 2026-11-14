// A chart is a small, URL-encodable spec, so every gallery chart can be opened in the
// builder and every custom chart can be shared as a link.
import { DEFAULT_POOL, METRIC, type PoolFilter } from "@/lib/player-metrics";
import type { Pos } from "@/app/players/player-stats";

export type ChartType = "scatter" | "bars" | "swarm" | "profile";
export const CHART_TYPES: { key: ChartType; label: string; hint: string }[] = [
  { key: "scatter", label: "Scatter", hint: "Two stats, four quadrants, standouts labeled" },
  { key: "bars", label: "Leaders", hint: "Top players in one stat" },
  { key: "swarm", label: "Swarm", hint: "Every player on one stat, split by position" },
  { key: "profile", label: "Compare", hint: "Percentile profiles for up to 4 players" },
];
export type ColorBy = "team" | "pos" | "conf";

export type ChartSpec = {
  type: ChartType;
  x: string; y: string;
  /** Dot size for scatters: "" = fixed. */
  size: string;
  color: ColorBy;
  /** Conference slug to light up when color = "conf". */
  hiConf: string;
  pool: PoolFilter;
  /** How many standouts to label. */
  labels: number;
  /** Player ids to always highlight (or to compare, for profiles). */
  ids: string[];
  /** Metrics shown in a profile. */
  metrics: string[];
  /** Quadrant captions: top-left, top-right, bottom-left, bottom-right. */
  quads: [string, string, string, string];
  title: string;
  /** Leaders: how many bars. Swarm: split rows by position. */
  n: number; split: boolean;
};

export const DEFAULT_SPEC: ChartSpec = {
  type: "scatter", x: "usg", y: "ts", size: "", color: "team", hiConf: "", pool: DEFAULT_POOL, labels: 12, ids: [],
  metrics: ["dpr", "pts40", "ts", "tpPct", "ast40", "astTov", "reb40", "stocks40", "ftr", "usg"],
  quads: ["", "", "", ""], title: "", n: 15, split: true,
};

const POS = ["G", "F", "C"];
export function encodeSpec(s: ChartSpec): string {
  const p = new URLSearchParams();
  const d = DEFAULT_SPEC;
  p.set("t", s.type);
  if (s.type === "scatter" || s.type === "bars" || s.type === "swarm") p.set("x", s.x);
  if (s.type === "scatter") { p.set("y", s.y); if (s.size) p.set("sz", s.size); if (s.quads.some(Boolean)) p.set("q", s.quads.join("|")); }
  if (s.color !== d.color) p.set("c", s.color);
  if (s.color === "conf" && s.hiConf) p.set("hc", s.hiConf);
  if (s.pool.conf !== d.pool.conf) p.set("conf", s.pool.conf);
  if (s.pool.pos !== d.pool.pos) p.set("pos", s.pool.pos);
  if (s.pool.minMin !== d.pool.minMin) p.set("min", String(s.pool.minMin));
  if (s.pool.minG !== d.pool.minG) p.set("g", String(s.pool.minG));
  if (s.pool.stars !== d.pool.stars) p.set("st", s.pool.stars);
  if (s.labels !== d.labels) p.set("lb", String(s.labels));
  if (s.ids.length) p.set("ids", s.ids.join(","));
  if (s.type === "profile" && s.metrics.join() !== d.metrics.join()) p.set("m", s.metrics.join(","));
  if (s.title) p.set("ti", s.title);
  if (s.type === "bars" && s.n !== d.n) p.set("n", String(s.n));
  if (s.type === "swarm" && !s.split) p.set("sp", "0");
  return p.toString();
}

export function decodeSpec(qs: string, base: ChartSpec = DEFAULT_SPEC): ChartSpec {
  const p = new URLSearchParams(qs);
  const s: ChartSpec = { ...base, pool: { ...base.pool }, quads: [...base.quads] as ChartSpec["quads"], ids: [...base.ids], metrics: [...base.metrics] };
  const t = p.get("t");
  if (t && ["scatter", "bars", "swarm", "profile"].includes(t)) s.type = t as ChartType;
  const metric = (k: string) => { const v = p.get(k); return v && METRIC[v] ? v : null; };
  s.x = metric("x") ?? s.x; s.y = metric("y") ?? s.y;
  if (p.has("sz")) s.size = metric("sz") ?? "";
  const c = p.get("c"); if (c === "team" || c === "pos" || c === "conf") s.color = c;
  if (p.get("hc")) s.hiConf = p.get("hc")!;
  if (p.get("conf")) s.pool.conf = p.get("conf")!;
  const pos = p.get("pos"); if (pos && POS.includes(pos)) s.pool.pos = pos as Pos;
  const num = (k: string, lo: number, hi: number) => { const v = Number(p.get(k)); return p.has(k) && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : null; };
  s.pool.minMin = num("min", 0, 40) ?? s.pool.minMin;
  s.pool.minG = num("g", 1, 40) ?? s.pool.minG;
  const st = p.get("st"); if (st === "any" || st === "4" || st === "3" || st === "none") s.pool.stars = st;
  s.labels = num("lb", 0, 40) ?? s.labels;
  if (p.get("ids")) s.ids = p.get("ids")!.split(",").filter(Boolean).slice(0, 12);
  if (p.get("m")) { const m = p.get("m")!.split(",").filter(k => METRIC[k]); if (m.length) s.metrics = m.slice(0, 14); }
  if (p.get("q")) { const q = p.get("q")!.split("|"); s.quads = [q[0] ?? "", q[1] ?? "", q[2] ?? "", q[3] ?? ""]; }
  if (p.get("ti")) s.title = p.get("ti")!.slice(0, 90);
  s.n = num("n", 5, 40) ?? s.n;
  if (p.get("sp") === "0") s.split = false;
  return s;
}

/** Spec helper for presets. */
export const spec = (over: Omit<Partial<ChartSpec>, "pool"> & { pool?: Partial<PoolFilter> }): ChartSpec => ({ ...DEFAULT_SPEC, ...over, pool: { ...DEFAULT_SPEC.pool, ...over.pool } });
