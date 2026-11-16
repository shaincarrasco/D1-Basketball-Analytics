// Players view: top 20 by Elo per tour.
import { h, clear } from "./dom.js";
import { api } from "./api.js";
import { pct } from "./format.js";

const state = { tour: "ATP", cache: {} };
let root = null;

export async function mountPlayers(el) {
  root = el;
  render();
  if (!state.cache[state.tour]) await load(state.tour);
}

async function load(tour) {
  try {
    state.cache[tour] = { list: await api.topPlayers(tour) };
  } catch (e) {
    state.cache[tour] = { error: e.message };
  }
  if (root && state.tour === tour) render();
}

function render() {
  clear(root);
  const seg = h("div", { class: "seg", role: "group", "aria-label": "Tour" },
    [["ATP", "Men"], ["WTA", "Women"]].map(([t, label]) => h("button", {
      type: "button", "aria-pressed": String(state.tour === t),
      onclick: () => { state.tour = t; render(); if (!state.cache[t]) load(t); },
    }, label)));
  root.append(h("div", { class: "players-head" }, h("h1", null, "Top 20 by Elo"), seg));

  const c = state.cache[state.tour];
  if (!c) {
    root.append(h("div", { "aria-busy": "true" }, ...Array.from({ length: 8 }, () => h("div", { class: "skel-row" }))));
    return;
  }
  if (c.error) {
    root.append(h("div", { class: "state err" }, h("h2", null, "Players didn't load"), h("p", null, c.error),
      h("button", { class: "btn", type: "button", onclick: () => { delete state.cache[state.tour]; mountPlayers(root); } }, "Try again")));
    return;
  }
  if (!c.list.length) {
    root.append(h("div", { class: "state" }, h("h2", null, "No ratings yet"),
      h("p", null, "Ratings build up from match history. Run ", h("code", null, "python -m engine.update"), " and they'll appear here.")));
    return;
  }
  const hasSurf = c.list.some((p) => p.surface_elo && Object.values(p.surface_elo).some((v) => v));
  const hasRank = c.list.some((p) => p.rank);
  const hasForm = c.list.some((p) => p.form_10 !== null && p.form_10 !== undefined);
  const S = (p, k) => (p.surface_elo && p.surface_elo[k] ? Math.round(p.surface_elo[k]) : "–");
  root.append(h("div", { class: "table-wrap", style: { borderTop: "0" } }, h("table", { class: "players" },
    h("thead", null, h("tr", null,
      h("th", { scope: "col" }, h("span", { class: "sr-only" }, "Position")),
      h("th", { scope: "col" }, "Player"),
      h("th", { scope: "col" }, "Elo"),
      hasSurf ? [h("th", { scope: "col", class: "hide-sm" }, "Hard"), h("th", { scope: "col", class: "hide-sm" }, "Clay"), h("th", { scope: "col", class: "hide-sm" }, "Grass")] : null,
      hasRank ? h("th", { scope: "col", class: "hide-sm" }, "Ranking") : null,
      h("th", { scope: "col", class: "hide-sm" }, "Won, 12 months"),
      hasForm ? h("th", { scope: "col" }, "Last 10") : null)),
    h("tbody", null, c.list.map((p) => h("tr", null,
      h("td", { class: "pos" }, p.position),
      h("td", { class: "who" }, p.name, p.country ? h("span", { class: "cc" }, p.country) : null),
      h("td", { class: "elo" }, p.elo ? Math.round(p.elo) : "–"),
      hasSurf ? [h("td", { class: "hide-sm" }, S(p, "hard")), h("td", { class: "hide-sm" }, S(p, "clay")), h("td", { class: "hide-sm" }, S(p, "grass"))] : null,
      hasRank ? h("td", { class: "hide-sm" }, p.rank ?? "–") : null,
      h("td", { class: "hide-sm" }, p.win_rate_1y !== null && p.win_rate_1y !== undefined ? `${pct(p.win_rate_1y)}%` : "–"),
      hasForm ? h("td", null, p.form_10 !== null && p.form_10 !== undefined ? `${Math.round(p.form_10 * 10)}-${10 - Math.round(p.form_10 * 10)}` : "–") : null)))))
  );
  const src = c.list[0].source;
  root.append(h("p", { class: "players-note" },
    src === "matches" ? "Elo worked out here from the match history in your database, because the engine hasn't written ratings yet."
      : src === "predictions" ? "Elo as of each player's most recent predicted match."
        : "Elo from the engine's ratings, players active in the last 12 months."));
}
