// Pack conformance checks. Run by the test suite for every registered pack (and by the
// new-sport scaffold), so a typo in a framework weight or a preset can't ship silently.
import { filterOptions } from "./pool";
import { RESERVED_PARAMS, type SportPack } from "./types";

export function validatePack<R>(pack: SportPack<R>, sample: R[] = []): string[] {
  const e: string[] = [];
  const dup = (list: string[], what: string) => { const seen = new Set<string>(); for (const k of list) { if (seen.has(k)) e.push(`duplicate ${what} "${k}"`); seen.add(k); } };
  const keys = new Set(pack.metrics.map(m => m.key));
  const has = (k: string, where: string) => { if (!keys.has(k)) e.push(`${where} uses unknown metric "${k}"`); };

  if (!/^[a-z][a-z0-9-]*$/.test(pack.id)) e.push(`pack id "${pack.id}" must be a lowercase slug`);
  if (!pack.metrics.length) e.push("pack has no metrics");
  dup(pack.metrics.map(m => m.key), "metric key");
  dup(pack.metricGroups, "metric group");
  for (const m of pack.metrics) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(m.key)) e.push(`metric key "${m.key}" must be alphanumeric (it goes in URLs)`);
    if (!pack.metricGroups.includes(m.group)) e.push(`metric "${m.key}" is in group "${m.group}", which isn't in metricGroups`);
    if (m.short.length > 9) e.push(`metric "${m.key}" short label "${m.short}" is longer than 9 characters`);
    if (!m.desc || m.desc.length < 8) e.push(`metric "${m.key}" needs a description`);
  }
  for (const g of pack.metricGroups) if (!pack.metrics.some(m => m.group === g)) e.push(`metric group "${g}" has no metrics`);

  dup(pack.positions.map(p => p.key), "position");
  dup(pack.filters.map(f => f.key), "filter key");
  for (const f of pack.filters) {
    if ((RESERVED_PARAMS as readonly string[]).includes(f.key)) e.push(`filter key "${f.key}" collides with an engine URL parameter`);
    if (Array.isArray(f.options) && !f.options.some(o => o.value === f.default)) e.push(`filter "${f.key}" default "${f.default}" isn't one of its options`);
    if (!Array.isArray(f.options)) { try { filterOptions(f, {}); } catch { e.push(`filter "${f.key}" options throw on empty lists`); } }
  }
  if (pack.positions.length && !pack.filters.some(f => f.key === "pos")) e.push(`pack has positions but no "pos" filter (use positionFilter)`);

  dup(pack.frameworks.map(f => f.key), "framework key");
  if (!pack.frameworks.length) e.push("pack has no ranking frameworks");
  for (const f of pack.frameworks) {
    if (f.key === "custom") e.push(`framework key "custom" is reserved`);
    if (!f.weights.length) e.push(`framework "${f.key}" has no weights`);
    dup(f.weights.map(([k]) => k), `metric in framework "${f.key}"`);
    for (const [k, w] of f.weights) { has(k, `framework "${f.key}"`); if (!(w > 0)) e.push(`framework "${f.key}" weight for "${k}" must be > 0`); }
  }
  if (!pack.tiers.length || pack.tiers[pack.tiers.length - 1].min !== 0) e.push("tiers must end with a min: 0 catch-all");
  for (let i = 1; i < pack.tiers.length; i++) if (pack.tiers[i].min >= pack.tiers[i - 1].min) e.push("tiers must be sorted from highest min to lowest");
  if (!(pack.ranking.minCoverage > 0 && pack.ranking.minCoverage <= 1)) e.push("ranking.minCoverage must be in (0, 1]");

  const c = pack.charts;
  has(c.defaultX, "charts.defaultX"); has(c.defaultY, "charts.defaultY");
  c.profileMetrics.forEach(k => has(k, "charts.profileMetrics"));
  if (c.profileMetrics.length > 14) e.push("charts.profileMetrics has more than 14 metrics");
  dup(c.sections, "chart section");
  dup(c.presets.map(p => p.id), "preset id");
  for (const p of c.presets) {
    const s = p.spec, w = `preset "${p.id}"`;
    if (!c.sections.includes(p.section)) e.push(`${w} is in section "${p.section}", which isn't in charts.sections`);
    for (const k of [s.x, s.y, s.size, p.topBy]) if (k) has(k, w);
    s.metrics?.forEach(k => has(k, w));
    if ((s.type ?? "scatter") === "scatter" && (!s.x || !s.y)) e.push(`${w} is a scatter without both x and y`);
    s.quads?.forEach(q => { if (q.length > 32) e.push(`${w} quadrant caption "${q}" is longer than 32 characters (links cut it off)`); });
    if (s.title && s.title.length > 90) e.push(`${w} title is longer than 90 characters`);
    if ((s.type === "bars" || s.type === "swarm") && !s.x) e.push(`${w} needs an x metric`);
    if (s.color === "pos" && !pack.positions.length) e.push(`${w} colors by position but the pack has no positions`);
    if (s.color === "group" && !pack.groups) e.push(`${w} colors by group but the pack has no groups`);
    if (s.pool) for (const [k, v] of Object.entries(s.pool)) {
      const f = pack.filters.find(x => x.key === k);
      if (!f) e.push(`${w} sets unknown filter "${k}"`);
      else if (Array.isArray(f.options) && !f.options.some(o => o.value === v)) e.push(`${w} sets filter "${k}" to "${v}", which isn't an option`);
    }
  }
  for (const s of c.sections) if (!c.presets.some(p => p.section === s)) e.push(`chart section "${s}" has no presets`);

  // Sample rows: every accessor and metric must run without throwing and return sane values.
  for (const r of sample.slice(0, 50)) {
    try {
      const id = pack.entity.id(r);
      if (!id) e.push("entity.id returned an empty id");
      if (!pack.entity.name(r)) e.push(`row ${id}: entity.name is empty`);
      const pos = pack.entity.pos(r);
      if (pos !== null && !pack.positions.some(p => p.key === pos)) e.push(`row ${id}: position "${pos}" isn't in positions`);
      if (!Number.isFinite(pack.entity.exposure(r))) e.push(`row ${id}: exposure isn't a finite number`);
      pack.entity.team(r); pack.entity.href(r);
      for (const f of pack.filters) f.test(r, f.default);
      for (const m of pack.metrics) { const v = m.get(r); if (v !== null && typeof v !== "number") e.push(`row ${id}: metric "${m.key}" returned ${typeof v}`); m.ok?.(r); }
    } catch (err) { e.push(`sample row threw: ${(err as Error).message}`); break; }
  }
  return [...new Set(e)];
}
