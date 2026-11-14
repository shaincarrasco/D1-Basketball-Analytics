// A chart is a small, URL-encodable spec, so every gallery chart can be opened in the
// builder and every custom chart can be shared as a link. Metric keys and filter values
// are validated against the sport pack on the way in.
import { metricIndex, val } from "./metrics";
import { inPool, readPool, withDefaults, writePool } from "./pool";
import type { ChartSpec, ChartType, ColorBy, Preset, SportPack, SpecInput } from "./types";

type Nouns = { player: string; players: string };
export const CHART_TYPES: { key: ChartType; label: string; hint: (n: Nouns) => string }[] = [
  { key: "scatter", label: "Scatter", hint: () => "Two stats, four quadrants, standouts labeled" },
  { key: "bars", label: "Leaders", hint: n => `Top ${n.players} in one stat` },
  { key: "swarm", label: "Swarm", hint: n => `Every ${n.player} on one stat` },
  { key: "profile", label: "Compare", hint: n => `Percentile profiles for up to 4 ${n.players}` },
];

export function defaultSpec<R>(pack: SportPack<R>): ChartSpec {
  return {
    type: "scatter", x: pack.charts.defaultX, y: pack.charts.defaultY, size: "", color: "team", hiGroup: "",
    pool: withDefaults(pack), labels: 12, ids: [], metrics: [...pack.charts.profileMetrics],
    quads: ["", "", "", ""], title: "", n: 15, split: pack.positions.length > 0,
  };
}

/** Build a full spec from a partial one (presets, links from other pages). */
export function makeSpec<R>(pack: SportPack<R>, over: SpecInput = {}): ChartSpec {
  const d = defaultSpec(pack);
  return { ...d, ...over, pool: withDefaults(pack, over.pool) };
}

export function encodeSpec<R>(pack: SportPack<R>, s: ChartSpec): string {
  const p = new URLSearchParams();
  const d = defaultSpec(pack);
  p.set("t", s.type);
  if (s.type === "scatter" || s.type === "bars" || s.type === "swarm") p.set("x", s.x);
  if (s.type === "scatter") { p.set("y", s.y); if (s.size) p.set("sz", s.size); if (s.quads.some(Boolean)) p.set("q", s.quads.join("|")); }
  if (s.color !== d.color) p.set("c", s.color);
  if (s.color === "group" && s.hiGroup) p.set("hc", s.hiGroup);
  writePool(pack, s.pool, p);
  if (s.labels !== d.labels) p.set("lb", String(s.labels));
  if (s.ids.length) p.set("ids", s.ids.join(","));
  if (s.type === "profile" && s.metrics.join() !== d.metrics.join()) p.set("m", s.metrics.join(","));
  if (s.title) p.set("ti", s.title);
  if (s.type === "bars" && s.n !== d.n) p.set("n", String(s.n));
  if (s.type === "swarm" && !s.split) p.set("sp", "0");
  return p.toString();
}

const TYPES: ChartType[] = ["scatter", "bars", "swarm", "profile"];
/** "conf" is the original basketball name for "group" (old shared links still work). */
const COLOR_ALIASES: Record<string, ColorBy> = { team: "team", pos: "pos", group: "group", conf: "group" };

export function decodeSpec<R>(pack: SportPack<R>, qs: string, base: ChartSpec = defaultSpec(pack)): ChartSpec {
  const M = metricIndex(pack);
  const p = new URLSearchParams(qs);
  const s: ChartSpec = { ...base, pool: readPool(pack, p, base.pool), quads: [...base.quads] as ChartSpec["quads"], ids: [...base.ids], metrics: [...base.metrics] };
  const t = p.get("t");
  if (t && (TYPES as string[]).includes(t)) s.type = t as ChartType;
  const metric = (k: string) => { const v = p.get(k); return v && M[v] ? v : null; };
  s.x = metric("x") ?? s.x; s.y = metric("y") ?? s.y;
  if (p.has("sz")) s.size = metric("sz") ?? "";
  const c = COLOR_ALIASES[p.get("c") ?? ""]; if (c) s.color = c;
  if (s.color === "pos" && !pack.positions.length) s.color = "team";
  if (s.color === "group" && !pack.groups) s.color = "team";
  const hc = p.get("hc"); if (hc && hc.length <= 40) s.hiGroup = hc;
  const num = (k: string, lo: number, hi: number) => { const v = Number(p.get(k)); return p.has(k) && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : null; };
  s.labels = num("lb", 0, 40) ?? s.labels;
  const list = (k: string) => [...new Set(p.get(k)!.split(",").filter(Boolean))];
  if (p.get("ids")) s.ids = list("ids").slice(0, 12);
  if (p.get("m")) { const m = list("m").filter(k => M[k]); if (m.length) s.metrics = m.slice(0, 14); }
  if (p.get("q")) { const q = p.get("q")!.split("|"); s.quads = [q[0] ?? "", q[1] ?? "", q[2] ?? "", q[3] ?? ""].map(x => x.slice(0, 32)) as ChartSpec["quads"]; }
  if (p.get("ti")) s.title = p.get("ti")!.slice(0, 90);
  s.n = num("n", 5, 40) ?? s.n;
  if (p.get("sp") === "0" || !pack.positions.length) s.split = false;
  return s;
}

/** Resolve a gallery preset into a concrete spec, filling "top three by X" compare charts. */
export function resolvePreset<R>(pack: SportPack<R>, preset: Preset, rows: R[], poolOver?: Record<string, string>): ChartSpec {
  const base = makeSpec(pack, preset.spec);
  const s = { ...base, pool: { ...base.pool, ...poolOver } };
  if (preset.topBy) {
    const m = metricIndex(pack)[preset.topBy];
    if (m) {
      s.ids = rows.filter(r => inPool(pack, s.pool, r)).map(r => ({ r, v: val(m, r) })).filter((x): x is { r: R; v: number } => x.v !== null)
        .sort((a, b) => (m.invert ? a.v - b.v : b.v - a.v)).slice(0, 3).map(x => pack.entity.id(x.r));
    }
  }
  return s;
}
