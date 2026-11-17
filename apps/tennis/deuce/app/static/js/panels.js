// Profile, Attributes, Odds and Sets tabs of an expanded match.
import { h, ball } from "./dom.js";
import { pct, odds as fmtOdds, pts, signed, lastName, shortDate, when, factValue } from "./format.js";
import { radar, lineChart } from "./charts.js";
import { names, vsTable } from "./brief.js";
import { api } from "./api.js";

const P = (v) => (v === null || v === undefined ? "–" : `${pct(v)}%`);
const N = (v, d = 0) => (v === null || v === undefined ? "–" : Number(v).toFixed(d));
const noData = (text) => h("div", { class: "empty-brief" }, h("p", null, text));

// ------------------------------------------------------------------ Profile

export function renderProfile(m) {
  const f = m.features;
  if (!f || !f.p1 || !f.p2) return noData("No player profile yet. Profiles come with predictions from `python -m engine.update`.");
  const nm = names(m);
  const a = f.p1, b = f.p2;
  const h2h = f.h2h || {};
  const surfaceName = (m.tournament && m.tournament.surface) || "this surface";

  const big = vsTable([
    { label: "Elo", a: N(a.elo), b: N(b.elo) },
    { label: `${surfaceName} Elo`, a: N(a.surface_elo), b: N(b.surface_elo) },
  ], nm, { big: true });
  const rest = vsTable([
    { label: "Ranking", a: a.rank ?? "–", b: b.rank ?? "–" },
    { label: "Elo change, 90 days", a: signed(a.elo_trend_90d, 0), b: signed(b.elo_trend_90d, 0) },
    { label: "Win rate, 12 months", a: P(a.win_rate_1y), b: P(b.win_rate_1y) },
    { label: "Last 10 matches won", a: P(a.form_10), b: P(b.form_10) },
    { label: `Win rate on ${surfaceName.toLowerCase()}`, a: P(a.surface_win_rate_1y), b: P(b.surface_win_rate_1y) },
    { label: "Matches, last 14 days", a: factValue(a.matches_14d), b: factValue(b.matches_14d) },
    { label: "Days since last match", a: factValue(a.days_since_last), b: factValue(b.days_since_last) },
  ], nm, { header: false });

  const meetings = (h2h.last || []).map((g) => h("li", null,
    h("span", null, h("span", { class: g.winner === "p1" ? "c1" : "c2" }, lastName(nm[g.winner] || "")), ` won ${g.score || ""}`),
    h("span", { class: "meta" }, [g.tournament, g.surface, shortDate(g.date)].filter(Boolean).join(", "))));

  const last5 = (side) => {
    const list = (f[side] && f[side].last5) || [];
    if (!list.length) return h("p", { class: "muted" }, "No recent matches on record.");
    return h("ol", { class: "last5" }, list.slice(0, 5).map((g) => h("li", null,
      h("span", { class: `res ${g.result === "W" ? (side === "p1" ? "c1" : "c2") : "l"}`, "aria-label": g.result === "W" ? "Won" : "Lost" }, g.result),
      h("span", null, h("span", { class: "opp" }, g.opponent), h("span", { class: "meta" }, [g.tournament, shortDate(g.date)].filter(Boolean).join(", "))),
      h("span", { class: "sc" }, g.score || ""))));
  };

  const p1w = h2h.p1_wins ?? 0, p2w = h2h.p2_wins ?? 0;
  return h("div", { class: "profile" },
    h("div", { class: "h2h" },
      h("div", { class: "score" }, h("span", { class: "c1" }, p1w), h("span", { class: "dash", "aria-hidden": "true" }, "–"), h("span", { class: "c2" }, p2w)),
      h("p", null, p1w + p2w === 0 ? "First meeting on record" : "Head to head",
        f.common_opponents ? `, ${f.common_opponents} common opponents` : "")),
    big, rest,
    meetings.length ? h("div", null, h("h4", { class: "subhead" }, "Previous meetings"), h("ul", { class: "h2h-list" }, meetings)) : null,
    h("div", { class: "two-col" },
      h("div", null, h("h4", { class: "subhead c1" }, `${lastName(nm.p1)}, last 5`), last5("p1")),
      h("div", null, h("h4", { class: "subhead c2" }, `${lastName(nm.p2)}, last 5`), last5("p2"))));
}

// ------------------------------------------------------------------ Attributes

export function renderAttributes(m) {
  const r = m.features && m.features.radar;
  const chart = r ? radar(r) : null;
  if (!chart) return noData("No attribute profile yet for this match.");
  const nm = names(m);
  const axes = Array.from(new Set([...Object.keys(r.p1 || {}), ...Object.keys(r.p2 || {})]));
  const rows = axes.map((k) => ({ label: k, a: factValue(r.p1 && r.p1[k]), b: factValue(r.p2 && r.p2[k]) }));
  return h("div", { class: "attr" },
    h("div", null,
      h("div", { class: "legend" },
        h("span", { class: "c1" }, h("i"), lastName(nm.p1)),
        h("span", { class: "c2" }, h("i"), lastName(nm.p2))),
      chart),
    h("div", null,
      vsTable(rows, nm),
      h("p", { class: "muted", style: { marginTop: "14px", maxWidth: "52ch" } },
        "Percentiles within the tour, 0 to 100. Games won and tiebreaks stand in for serve and return, which the free data doesn't have.")));
}

// ------------------------------------------------------------------ Odds

export function renderOdds(m, { onSaved } = {}) {
  const nm = names(m);
  const wrap = h("div", { class: "odds-grid" });
  const hist = (m.odds_history || []).filter((o) => o.p1 && o.p2 && o.fetched_at);

  const left = h("div", { class: "odds-chart" });
  if (hist.length > 1) {
    left.append(h("h3", { class: "block-title" }, "Price history"),
      h("p", { class: "block-note" }, `${hist.length} prices, from ${when(hist[0].fetched_at)} to ${when(hist[hist.length - 1].fetched_at)}.`));
    const holder = h("div", { style: { position: "relative" } });
    left.append(holder);
    requestAnimationFrame(() => {
      const width = holder.clientWidth || 520;
      const svg = lineChart({
        width, height: 220, marginRight: 76, label: "Decimal odds over time for both players",
        series: [
          { cls: "l1", dotCls: "dot1", showDots: hist.length < 12, label: lastName(nm.p1), labelCls: "c1", points: hist.map((o) => ({ x: new Date(o.fetched_at), y: o.p1 })) },
          { cls: "l2", dotCls: "dot2", showDots: hist.length < 12, label: lastName(nm.p2), labelCls: "c2", points: hist.map((o) => ({ x: new Date(o.fetched_at), y: o.p2 })) },
        ],
        yFormat: (v) => v.toFixed(2),
      });
      if (svg) holder.append(svg);
    });
  } else if (hist.length === 1) {
    left.append(h("h3", { class: "block-title" }, "Price history"),
      h("p", { class: "block-note" }, `One price so far: ${fmtOdds(hist[0].p1)} and ${fmtOdds(hist[0].p2)} from ${hist[0].book || hist[0].source}, ${when(hist[0].fetched_at)}. A line appears once the price moves.`));
  } else {
    left.append(h("h3", { class: "block-title" }, "Price history"),
      h("p", { class: "block-note" }, "No prices yet. Add free odds API keys to config.toml, or type a price here."));
  }

  // Manual entry
  const status = h("p", { class: "form-status", role: "status" });
  const field = (side) => {
    const prob = side === "p1" ? m.p1_prob : m.p2_prob;
    const input = h("input", {
      id: `odds-${m.match_id}-${side}`, type: "number", inputmode: "decimal", step: "0.01", min: "1.01",
      value: m.odds && m.odds[side] ? Number(m.odds[side]).toFixed(2) : "",
      placeholder: prob ? (1 / prob).toFixed(2) : "",
    });
    const hint = h("p", { class: "hint", "aria-live": "polite" });
    const update = () => {
      const o = parseFloat(input.value);
      hint.replaceChildren();
      hint.classList.remove("val");
      if (!prob) { hint.append("No model probability for this match."); return; }
      const fair = `Fair price ${fmtOdds(1 / prob)}`;
      if (!(o > 1)) { hint.append(fair); return; }
      const edge = prob * o - 1;
      if (edge >= (m.edge_threshold ?? 0.02)) { hint.classList.add("val"); hint.append(ball(14), `${fair}, edge ${pts(edge)}: value`); }
      else hint.append(`${fair}, edge ${pts(edge)}`);
    };
    input.addEventListener("input", update);
    update();
    return { input, el: h("div", { class: "odds-input" },
      h("label", { for: input.id, class: side === "p1" ? "c1" : "c2" }, nm[side]), input, hint) };
  };
  const f1 = field("p1"), f2 = field("p2");
  const btn = h("button", { class: "btn", type: "submit" }, "Save odds");
  const form = h("form", { class: "odds-form", novalidate: true },
    h("h3", null, "Your price"),
    h("p", null, "Type decimal odds from any bookmaker. Value updates as you type and saves as a manual price."),
    f1.el, f2.el, btn, status,
    m.odds ? h("p", { class: "price-src" }, `Showing ${m.odds.source === "manual" ? "your manual price" : `${m.odds.book || m.odds.source}`}, ${when(m.odds.fetched_at)}.`) : null);

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const o1 = parseFloat(f1.input.value), o2 = parseFloat(f2.input.value);
    status.classList.remove("err");
    if (!(o1 > 1) || !(o2 > 1)) {
      status.classList.add("err");
      status.textContent = "Enter both prices as decimal odds above 1.00, for example 1.85.";
      return;
    }
    btn.disabled = true;
    status.textContent = "Saving…";
    try {
      const res = await api.saveOdds(m.match_id, o1, o2);
      const v = res.value;
      status.textContent = v ? `Saved. Value on ${lastName(nm[v.side])}, ${pts(v.edge)}.` : "Saved. No value at these prices.";
      onSaved && onSaved(res);
    } catch (e) {
      status.classList.add("err");
      status.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  });

  wrap.append(left, form);
  return wrap;
}

// ------------------------------------------------------------------ Sets

export function renderSets(m) {
  const sp = m.set_probs;
  if (!sp || !Object.keys(sp).length) return noData("No set-score probabilities for this match yet.");
  const nm = names(m);
  const entries = Object.entries(sp).map(([k, v]) => {
    const [a, b] = k.split("-").map(Number);
    return { k, a, b, v: Number(v), side: a > b ? "p1" : "p2" };
  }).filter((e) => Number.isFinite(e.v));
  entries.sort((x, y) => (x.side === y.side ? (x.side === "p1" ? x.b - y.b : x.a - y.a) : x.side === "p1" ? -1 : 1));
  const max = Math.max(...entries.map((e) => e.v), 0.0001);
  const most = Math.max(...entries.map((e) => Math.max(e.a, e.b)));
  const distance = entries.filter((e) => e.a + e.b === most * 2 - 1).reduce((t, e) => t + e.v, 0);
  return h("div", { class: "sets" },
    h("h3", { class: "block-title" }, "How the match finishes"),
    h("p", { class: "block-note" }, "Final score in sets, from the winner's side."),
    entries.map((e) => {
      const score = e.side === "p1" ? `${e.a}-${e.b}` : `${e.b}-${e.a}`;
      return h("div", { class: "set-row" },
        h("span", { class: `who ${e.side === "p1" ? "c1" : "c2"}` }, `${lastName(nm[e.side])} ${score}`),
        h("span", { class: "sbar", "aria-hidden": "true" }, h("i", { style: { width: `${(e.v / max) * 100}%`, background: e.side === "p1" ? "var(--optic)" : "var(--plasma)" } })),
        h("span", { class: "pc" }, `${pct(e.v)}%`));
    }),
    most > 1 ? h("p", { class: "sets-note" }, `${pct(distance)}% chance it goes to a deciding set.`) : null);
}

