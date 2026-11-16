// Proof: the walk-forward backtest. Filters recompute everything client-side from bets[].
import { h, clear, debounce } from "./dom.js";
import { api } from "./api.js";
import { lineChart, calibration } from "./charts.js";
import { money, int, pct, odds as fmtOdds, signed, longDate, shortDate, splitName, levelLabel } from "./format.js";

const ROUND_ORDER = ["1st round", "round of 128", "2nd round", "round of 64", "3rd round", "round of 32", "4th round",
  "round of 16", "quarterfinal", "quarterfinals", "semifinal", "semifinals", "final", "the final", "round robin"];
const SMALL = 100;

const state = { data: null, error: null, filters: null, shownRows: 20 };
let root = null;
let out = null;

export async function mountProof(el) {
  root = el;
  if (!state.data) {
    clear(root).append(h("div", { "aria-busy": "true" }, h("div", { class: "skel-head" }), h("div", { class: "skel-row", style: { height: "300px" } })));
    try {
      state.data = await api.backtest();
      state.error = null;
    } catch (e) {
      state.error = e.message;
    }
  }
  if (root !== el) return;
  render();
}

// ------------------------------------------------------------------ data prep

function splitRanges(splits) {
  return (splits || []).map((sp, i) => {
    const start = sp.test_start || sp.start || sp.from || sp.test_from || null;
    const end = sp.test_end || sp.end || sp.to || sp.test_to || null;
    return { name: splitName(sp.name || sp.label, i), start, end, raw: sp };
  });
}

function prepBets(data) {
  const ranges = splitRanges(data.splits).filter((r) => r.start);
  return (data.bets || []).map((b) => {
    const prob = Number(b.prob), o = Number(b.odds);
    let split = b.split ?? null;
    if (split === null && ranges.length) {
      const d = String(b.date || "").slice(0, 10);
      const r = ranges.find((r) => d >= String(r.start).slice(0, 10) && (!r.end || d <= String(r.end).slice(0, 10)));
      split = r ? r.name : null;
    } else if (split !== null) split = splitName(split, 0);
    const edge = Number.isFinite(Number(b.edge)) && b.edge !== null ? Number(b.edge) : prob * o - 1;
    return { ...b, level: levelLabel(b.level, b.tour), prob, odds: o, edge, profit: Number(b.profit), won: !!b.won, split, t: new Date(b.date) };
  }).filter((b) => Number.isFinite(b.prob) && Number.isFinite(b.odds) && Number.isFinite(b.profit) && !Number.isNaN(+b.t))
    .sort((a, b) => a.t - b.t);
}

function defaults(data) {
  const thr = data.betting && data.betting.edge_threshold;
  return { edge: thr !== undefined && thr !== null ? +(thr * 100).toFixed(1) : 2.0, prob: 0, tours: { ATP: true, WTA: true }, split: "all" };
}

function applyFilters(bets, f) {
  return bets.filter((b) => {
    if (b.edge < f.edge / 100 - 1e-9) return false;
    if (b.prob < f.prob - 1e-9) return false;
    const tour = (b.tour || "").toUpperCase();
    if ((tour === "ATP" || tour === "WTA") && !f.tours[tour]) return false;
    if (f.split !== "all" && b.split !== f.split) return false;
    return true;
  });
}

function summarise(bets) {
  const n = bets.length;
  const profit = bets.reduce((t, b) => t + b.profit, 0);
  const won = bets.filter((b) => b.won).length;
  const avgProb = n ? bets.reduce((t, b) => t + b.prob, 0) / n : 0;
  return { n, profit, won, roi: n ? profit / n : 0, avgProb };
}

function groupBy(bets, key, order) {
  const m = new Map();
  for (const b of bets) {
    const k = b[key] || "Unknown";
    const g = m.get(k) || { key: k, n: 0, profit: 0 };
    g.n++; g.profit += b.profit;
    m.set(k, g);
  }
  const arr = Array.from(m.values()).map((g) => ({ ...g, roi: g.profit / g.n }));
  if (order) {
    const idx = (k) => { const i = order.indexOf(String(k).toLowerCase()); return i === -1 ? 999 : i; };
    arr.sort((a, b) => idx(a.key) - idx(b.key) || b.n - a.n);
  } else arr.sort((a, b) => b.n - a.n);
  return arr;
}

function cumulative(bets) {
  let run = 0;
  const pts = bets.map((b) => ({ x: b.t, y: (run += b.profit), b }));
  if (pts.length <= 700) return pts;
  const step = Math.ceil(pts.length / 700);
  const thin = pts.filter((_, i) => i % step === 0);
  if (thin[thin.length - 1] !== pts[pts.length - 1]) thin.push(pts[pts.length - 1]);
  return thin;
}

// ------------------------------------------------------------------ render

function render() {
  clear(root);
  if (state.error) {
    root.append(h("div", { class: "state err" }, h("h2", null, "The backtest didn't load"), h("p", null, state.error),
      h("button", { class: "btn", type: "button", onclick: () => { state.data = null; mountProof(root); } }, "Try again")));
    return;
  }
  const data = state.data;
  if (!data || data.empty) {
    root.append(h("div", { class: "proof-head" }, h("h1", null, "Proof")),
      h("div", { class: "state", style: { paddingTop: "12px" } },
        h("h2", null, "No backtest yet"),
        h("p", null, "The backtest replays past seasons: the model only ever sees matches before the ones it predicts. Run ",
          h("code", null, "python -m engine.backtest"), " to write it, then reload."),
        h("button", { class: "btn btn-quiet", type: "button", onclick: () => { state.data = null; mountProof(root); } }, "Reload")),
      footnote());
    return;
  }
  if (!data.betting || !(data.bets && data.bets.length)) {
    renderNoBetting(data);
    return;
  }
  if (!state.filters) state.filters = defaults(data);
  const bets = prepBets(data);
  const hasTour = bets.some((b) => b.tour);
  const splitNames = Array.from(new Set(bets.map((b) => b.split).filter(Boolean)));

  root.append(h("div", { class: "proof-head" }, h("h1", null, "Proof"), filterBar(hasTour, splitNames)));
  out = h("div", { class: "proof-out" });
  root.append(out, footnote());
  const draw = () => renderOut(data, bets);
  draw();
  window.removeEventListener("resize", onResize);
  onResize = debounce(() => { if (root && root.isConnected && out && out.isConnected) draw(); }, 150);
  window.addEventListener("resize", onResize);
}
let onResize = () => {};

function filterBar(hasTour, splitNames) {
  const f = state.filters;
  const recompute = debounce(() => { state.shownRows = 20; renderOut(state.data, prepBets(state.data)); }, 120);
  const numField = (label, unit, key, step, min, max) => h("label", { class: "field" }, label,
    h("input", {
      type: "number", step, min, max, value: f[key], inputmode: "decimal",
      oninput: (e) => { const v = parseFloat(e.target.value); f[key] = Number.isFinite(v) ? v : 0; recompute(); },
    }), unit);
  const tours = hasTour ? h("div", { class: "chips", role: "group", "aria-label": "Tour" },
    [["ATP", "Men"], ["WTA", "Women"]].map(([t, label]) => h("button", {
      type: "button", class: "chip-toggle", "aria-pressed": String(!!f.tours[t]),
      onclick: (e) => {
        f.tours[t] = !f.tours[t];
        if (!f.tours.ATP && !f.tours.WTA) f.tours[t === "ATP" ? "WTA" : "ATP"] = true;
        for (const b of e.currentTarget.parentElement.children) b.setAttribute("aria-pressed", String(!!f.tours[b.dataset.t]));
        recompute();
      }, dataset: { t },
    }, label))) : null;
  const split = splitNames.length ? h("label", { class: "field" }, "Split",
    h("select", { onchange: (e) => { f.split = e.target.value; recompute(); } },
      h("option", { value: "all", selected: f.split === "all" }, "All"),
      splitNames.map((n) => h("option", { value: n, selected: f.split === n }, n)))) : null;
  return h("div", { class: "proof-filters" },
    numField("Edge ≥", "pts", "edge", "0.5", "0", "50"),
    numField("Prob ≥", null, "prob", "0.05", "0", "1"),
    tours, split);
}

function renderOut(data, allBets) {
  if (!out) return;
  clear(out);
  const bets = applyFilters(allBets, state.filters);
  const sum = summarise(bets);
  const b = data.betting;

  // Headline: always the pre-set threshold. Tuned filters only get a secondary, labelled line.
  const base = defaults(data);
  const tuned = Math.abs(state.filters.edge - base.edge) > 1e-9 || Math.abs(state.filters.prob - base.prob) > 1e-9;
  const headBets = tuned ? applyFilters(allBets, { ...state.filters, edge: base.edge, prob: base.prob }) : bets;
  const head = summarise(headBets);
  if (!head.n) {
    out.append(h("p", { class: "headline" }, "No bets at the pre-set threshold for this selection."));
  } else {
    const cls = head.profit >= 0 ? "pos" : "neg";
    out.append(
      h("p", { class: "headline" },
        h("span", { class: `big ${cls}` }, money(head.profit)), head.profit >= 0 ? " profit on " : " lost on ",
        h("span", { class: "big" }, int(head.n)), " flat $1 bets, a ",
        h("span", { class: `big ${cls}` }, `${signed(head.roi * 100, 2)}%`), " return per bet. ",
        h("span", { class: "big" }, int(head.won)), " won, at an average model probability of ",
        h("span", { class: "big" }, `${pct(head.avgProb)}%`), "."),
      h("p", { class: "headline-sub" },
        `Out-of-sample bets from ${longDate(headBets[0].date)} to ${longDate(headBets[headBets.length - 1].date)}, priced at ${b.odds_source || "historical closing odds"}. A bet is placed when the model's edge over the price is at least ${base.edge} points, a threshold fixed before testing.`));
  }
  if (tuned) {
    out.append(h("p", { class: "tuned-line" },
      h("strong", null, "With your filters (tuned on past results, so expect worse going forward): "),
      sum.n ? `${money(sum.profit)} on ${int(sum.n)} bets, ${signed(sum.roi * 100, 2)}% per bet, ${int(sum.won)} won. The charts below use your filters.`
        : "no bets clear them."));
  }

  // Cumulative P&L
  const box = h("div", { class: "pnl-box" });
  out.append(h("section", { class: "block", "aria-label": "Cumulative profit" },
    h("h2", { class: "block-title" }, "Profit over time"),
    h("p", { class: "block-note" }, baselineNote(b)),
    box));
  if (sum.n) {
    const pts = cumulative(bets);
    const baseObj = baselineOf(b);
    const base = baseObj
      ? baseObj.cumulative.map((p) => ({ x: new Date(p.date), y: Number(p.pnl) })).filter((p) => !Number.isNaN(+p.x)) : [];
    const splits = splitRanges(data.splits).filter((r) => r.start).map((r) => ({ x: new Date(r.start), label: r.name }));
    requestAnimationFrame(() => {
      const width = box.clientWidth - (window.innerWidth <= 720 ? 20 : 40);
      const svg = lineChart({
        width, height: window.innerWidth <= 720 ? 230 : 300, zero: true, label: "Cumulative profit in dollars",
        series: [{ cls: "l1", dotCls: "dot1", points: pts }],
        dashed: base.length ? [{ points: base, label: (baseObj && baseObj.name) || "Elo favourite" }] : [],
        splits, yFormat: (v) => money(v), tipHost: box,
        tip: (p) => [money(p.y), `after ${shortDate(p.b.date)}`],
        marginLeft: 58,
      });
      if (svg) box.append(svg);
    });
  } else {
    box.append(h("p", { class: "muted", style: { padding: "40px 0", textAlign: "center" } }, "No bets to plot."));
  }

  // Three return-by charts
  out.append(h("section", { class: "block trio", "aria-label": "Return by group" },
    barBlock("Return by level", groupBy(bets, "level")),
    barBlock("Return by surface", groupBy(bets, "surface")),
    barBlock("Return by round", groupBy(bets, "round", ROUND_ORDER))));

  // Calibration + bets table
  const cal = calibration(data.calibration);
  out.append(h("section", { class: "block duo" },
    h("div", null,
      h("h2", { class: "block-title" }, "Calibration"),
      h("p", { class: "block-note" }, "When the model says 70%, does the player win about 70% of the time? Dots on the dashed line mean yes. Dot size is the number of matches."),
      cal || h("p", { class: "muted" }, "No calibration data in this backtest.")),
    betsTable(bets)));

  if (data.splits && data.splits.length) out.append(splitsBlock(data.splits));
}

function baselineOf(b) {
  if (b.baseline && Array.isArray(b.baseline.cumulative)) return b.baseline;
  const all = b.baselines && typeof b.baselines === "object" ? b.baselines : {};
  const keys = Object.keys(all);
  const k = keys.find((x) => /elo/i.test(x) && Array.isArray(all[x] && all[x].cumulative))
    || keys.find((x) => Array.isArray(all[x] && all[x].cumulative));
  return k ? all[k] : null;
}

function baselineNote(b) {
  const base = baselineOf(b);
  if (base && Array.isArray(base.cumulative) && base.cumulative.length) {
    const roi = base.roi ?? base.return_per_match;
    return `Running total in dollars. The dashed line backs the Elo favourite in every match${roi !== undefined && roi !== null ? ` (${signed(roi * 100, 2)}% per bet)` : ""}, the simplest strategy to beat; it doesn't change with the filters.`;
  }
  return "Running total in dollars, flat $1 stakes.";
}

function barBlock(title, groups) {
  const big = groups.filter((g) => g.n >= SMALL);
  const scale = Math.max(...(big.length ? big : groups).map((g) => Math.abs(g.roi)), 0.02);
  const list = h("ul", { class: "bars" }, groups.slice(0, 9).map((g) => {
    const w = Math.min(50, (Math.abs(g.roi) / scale) * 50);
    const small = g.n < SMALL;
    return h("li", { class: small ? "small" : null },
      h("span", { class: "k" }, g.key, h("span", { class: "n" }, `${int(g.n)} bets${small ? ", small sample" : ""}`)),
      h("span", { class: "zbar", "aria-hidden": "true" }, h("i", { class: g.roi >= 0 ? "pos" : "neg", style: { width: `${w}%` } })),
      h("span", { class: "r" }, `${signed(g.roi * 100, 1)}%`));
  }));
  return h("div", null, h("h2", { class: "block-title" }, title),
    h("p", { class: "block-note" }, "Return per $1 bet. Under 100 bets is greyed out."),
    groups.length ? list : h("p", { class: "muted" }, "No bets."));
}

function betsTable(bets) {
  const wrap = h("div", null);
  const rows = bets.slice().reverse();
  const shown = rows.slice(0, state.shownRows);
  const pickName = (b) => (b.pick === "p1" ? b.p1 : b.pick === "p2" ? b.p2 : b.pick);
  wrap.append(
    h("h2", { class: "block-title" }, "Every bet"),
    h("p", { class: "block-note" }, "Newest first. Profit is per $1 staked."),
    h("div", { class: "table-wrap" }, h("table", { class: "bets" },
      h("thead", null, h("tr", null,
        h("th", { scope: "col" }, "Date"), h("th", { scope: "col" }, "Match"), h("th", { scope: "col" }, "Pick"),
        h("th", { scope: "col", class: "n" }, "Prob"), h("th", { scope: "col", class: "n" }, "Odds"),
        h("th", { scope: "col", class: "n hide-sm" }, "Edge"), h("th", { scope: "col", class: "n" }, "Profit"))),
      h("tbody", null, shown.map((b) => h("tr", null,
        h("td", null, shortDate(b.date)),
        h("td", { class: "match" }, `${b.p1} v ${b.p2}`, h("span", { class: "muted", style: { display: "block" } }, [b.tournament, b.round].filter(Boolean).join(", "))),
        h("td", null, h("span", { class: "pk" }, pickName(b))),
        h("td", { class: "n" }, `${pct(b.prob)}%`),
        h("td", { class: "n" }, fmtOdds(b.odds)),
        h("td", { class: "n hide-sm" }, signed(b.edge * 100, 1)),
        h("td", { class: `n ${b.won ? "win" : "loss"}` }, money(b.profit, 2))))))),
    h("div", { class: "table-foot" },
      h("span", null, `Showing ${int(shown.length)} of ${int(rows.length)}`),
      h("span", { style: { display: "flex", gap: "10px" } },
        rows.length > shown.length ? h("button", { class: "btn btn-quiet", type: "button", onclick: () => {
          state.shownRows += 50;
          wrap.replaceWith(betsTable(bets));
        } }, "Show 50 more") : null,
        h("button", { class: "btn btn-quiet", type: "button", onclick: () => downloadCsv(bets), disabled: !rows.length }, "Download CSV"))));
  return wrap;
}

function downloadCsv(bets) {
  const cols = ["date", "tour", "tournament", "level", "surface", "round", "p1", "p2", "pick", "prob", "odds", "edge", "won", "profit"];
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")].concat(bets.map((b) => cols.map((c) => esc(c === "edge" ? b.edge.toFixed(4) : c === "won" ? (b.won ? 1 : 0) : b[c])).join(",")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `deuce-bets-edge-${state.filters.edge}.csv` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function splitsBlock(splits) {
  const has = (k) => splits.some((sp) => sp[k] !== undefined && sp[k] !== null);
  const eloAcc = (sp) => sp.baseline_elo_accuracy ?? sp.elo_accuracy;
  const eloBrier = (sp) => sp.baseline_elo_brier ?? sp.elo_brier;
  const hasEloAcc = splits.some((sp) => eloAcc(sp) !== undefined && eloAcc(sp) !== null);
  const hasEloBrier = splits.some((sp) => eloBrier(sp) !== undefined && eloBrier(sp) !== null);
  const fmtP = (v) => (v === undefined || v === null ? "–" : `${(v * 100).toFixed(1)}%`);
  const fmtB = (v) => (v === undefined || v === null ? "–" : Number(v).toFixed(3));
  const ranges = splitRanges(splits);
  return h("section", { class: "block" },
    h("h2", { class: "block-title" }, "Accuracy by split"),
    h("p", { class: "block-note" }, "Each split is predicted by a model trained only on matches before it. Brier score measures how close the probabilities were; lower is better."),
    h("div", { class: "table-wrap", style: { borderTop: "0" } }, h("table", { class: "split-table" },
      h("thead", null, h("tr", null,
        h("th", { scope: "col" }, "Split"), h("th", { scope: "col" }, "Matches"), h("th", { scope: "col" }, "Picked right"),
        hasEloAcc ? h("th", { scope: "col" }, "Elo alone") : null,
        h("th", { scope: "col" }, "Brier"),
        hasEloBrier ? h("th", { scope: "col" }, "Elo Brier") : null)),
      h("tbody", null, splits.map((sp, i) => h("tr", null,
        h("td", null, ranges[i].name, ranges[i].start ? h("span", { class: "sub" }, `${longDate(String(ranges[i].start).slice(0, 10))} to ${ranges[i].end ? longDate(String(ranges[i].end).slice(0, 10)) : "now"}`) : null),
        h("td", null, int(sp.n ?? sp.matches)),
        h("td", null, fmtP(sp.accuracy)),
        hasEloAcc ? h("td", { class: "dim" }, fmtP(eloAcc(sp))) : null,
        h("td", null, fmtB(sp.brier)),
        hasEloBrier ? h("td", { class: "dim" }, fmtB(eloBrier(sp))) : null))))));
}

function renderNoBetting(data) {
  root.append(h("div", { class: "proof-head" }, h("h1", null, "Proof")));
  const o = data.overall || {};
  const splits = data.splits || [];
  const tot = (k) => splits.reduce((t, sp) => t + (Number(sp[k]) || 0) * (Number(sp.n) || 0), 0) / (splits.reduce((t, sp) => t + (Number(sp.n) || 0), 0) || 1);
  const acc = o.accuracy ?? (splits.length ? tot("accuracy") : null);
  const n = o.n ?? splits.reduce((t, sp) => t + (Number(sp.n) || 0), 0);
  const eloAcc = o.baseline_elo_accuracy ?? o.elo_accuracy ?? (splits.length && splits[0].baseline_elo_accuracy !== undefined ? tot("baseline_elo_accuracy") : null);
  const brier = o.brier ?? (splits.length ? tot("brier") : null);
  const eloBrier = o.baseline_elo_brier ?? o.elo_brier ?? null;
  const ranges = splitRanges(splits);

  if (acc !== null && n) {
    const better = eloAcc === null || acc >= eloAcc;
    root.append(
      h("p", { class: "headline" }, "Picked the winner in ",
        h("span", { class: "big pos" }, `${(acc * 100).toFixed(1)}%`), " of ",
        h("span", { class: "big" }, int(n)), " matches it had never seen.",
        eloAcc !== null ? [" Elo ratings alone managed ", h("span", { class: `big ${better ? "" : "neg"}` }, `${(eloAcc * 100).toFixed(1)}%`), "."] : null),
      h("p", { class: "headline-sub" },
        brier !== null ? `Brier score ${Number(brier).toFixed(3)}${eloBrier !== null ? ` against ${Number(eloBrier).toFixed(3)} for Elo` : ""} (lower is better). ` : "",
        ranges.length && ranges[0].start ? `Tested walk-forward from ${longDate(String(ranges[0].start).slice(0, 10))}${ranges[ranges.length - 1].end ? ` to ${longDate(String(ranges[ranges.length - 1].end).slice(0, 10))}` : ""}.` : ""));
  }

  // Rolling accuracy
  const roll = (data.rolling || []).map((r) => ({ x: new Date(r.date), y: Number(r.accuracy_100 ?? r.accuracy ?? r.acc) }))
    .filter((p) => !Number.isNaN(+p.x) && Number.isFinite(p.y))
    .filter((p, i, arr) => i === arr.length - 1 || i === 0 || Math.floor(+p.x / 6048e5) !== Math.floor(+arr[i + 1].x / 6048e5));
  if (roll.length > 1) {
    const box = h("div", { class: "pnl-box" });
    root.append(h("section", { class: "block", "aria-label": "Accuracy over time" },
      h("h2", { class: "block-title" }, "Accuracy over time"),
      h("p", { class: "block-note" }, `Share of the last 100 matches picked correctly.${eloAcc !== null ? " The dashed line is Elo alone over the whole test period." : ""}`),
      box));
    const splitsX = ranges.filter((r) => r.start).map((r) => ({ x: new Date(r.start), label: r.name }));
    const draw = () => {
      clear(box);
      const width = box.clientWidth - (window.innerWidth <= 720 ? 20 : 40);
      const x0 = roll[0].x, x1 = roll[roll.length - 1].x;
      const svg = lineChart({
        width, height: window.innerWidth <= 720 ? 220 : 280, label: "Rolling accuracy over the last 100 matches",
        series: [{ cls: "l1", dotCls: "dot1", points: roll }],
        dashed: eloAcc !== null ? [{ points: [{ x: x0, y: eloAcc }, { x: x1, y: eloAcc }], label: "Elo alone" }] : [],
        splits: splitsX, yFormat: (v) => `${Math.round(v * 100)}%`, tipHost: box,
        tip: (p) => [`${Math.round(p.y * 100)}%`, `of 100 matches to ${shortDate(p.x.toISOString().slice(0, 10))}`],
      });
      if (svg) box.append(svg);
    };
    requestAnimationFrame(draw);
    window.removeEventListener("resize", onResize);
    onResize = debounce(() => { if (box.isConnected) draw(); }, 150);
    window.addEventListener("resize", onResize);
  }

  // Calibration beside accuracy by tour and level
  const cal = calibration(data.calibration);
  const groups = [];
  for (const [k, v] of Object.entries(data.by_tour || {})) groups.push({ key: k === "ATP" ? "Men" : k === "WTA" ? "Women" : k, ...v });
  for (const [k, v] of Object.entries(data.by_level || {})) groups.push({ key: /^\d+$/.test(k) ? `${k}s` : k, ...v });
  root.append(h("section", { class: "block duo" },
    h("div", null,
      h("h2", { class: "block-title" }, "Calibration"),
      h("p", { class: "block-note" }, "When the model says 70%, does the player win about 70% of the time? Dots on the dashed line mean yes. Dot size is the number of matches."),
      cal || h("p", { class: "muted" }, "No calibration data in this backtest.")),
    h("div", null,
      splits.length ? splitsBlock(splits) : null,
      groups.length ? groupTable(groups) : null)));

  root.append(h("section", { class: "block odds-cta" },
    h("h2", null, "Profit needs historical prices"),
    h("p", null, "Accuracy says the model knows tennis. Whether it beats the bookmakers is a separate question, answered against real closing odds. Import them free from tennis-data.co.uk, then rerun the backtest:"),
    h("p", { class: "cmds" }, h("code", null, "python -m engine.odds_history"), h("code", null, "python -m engine.backtest")),
    h("p", { class: "muted" }, "This page then shows profit over time, return by level, surface and round, and every bet the model would have made.")));

  if ((data.notes || []).length) {
    root.append(h("section", { class: "block" }, h("h2", { class: "block-title" }, "How this was tested"),
      h("ul", { class: "notes" }, data.notes.map((t) => h("li", null, t)))));
  }
  root.append(footnote());
}

function groupTable(groups) {
  const fmtP = (v) => (v === undefined || v === null ? "–" : `${(v * 100).toFixed(1)}%`);
  return h("div", { class: "block", style: { marginBottom: "0" } },
    h("h2", { class: "block-title" }, "By tour and level"),
    h("p", { class: "block-note" }, "Out-of-sample accuracy for each slice. The 250s means every 250-level event, and so on."),
    h("div", { class: "table-wrap", style: { borderTop: "0" } }, h("table", { class: "split-table" },
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Group"), h("th", { scope: "col" }, "Matches"),
        h("th", { scope: "col" }, "Picked right"), h("th", { scope: "col" }, "Brier"))),
      h("tbody", null, groups.map((g) => h("tr", null,
        h("td", null, g.key), h("td", null, int(g.n)), h("td", null, fmtP(g.accuracy)),
        h("td", { class: "dim" }, g.brier !== undefined && g.brier !== null ? Number(g.brier).toFixed(3) : "–")))))));
}

function footnote() {
  return h("p", { class: "footnote" },
    "Past results don't guarantee future returns. Deuce is paper mode only: it never places bets, and backtests assume you got the closing price. Matches where either player had under 15 recorded matches are excluded.");
}
