// Matches view: filters, grouped rows, expandable match panel with tabs.
import { h, clear, ball } from "./dom.js";
import { api } from "./api.js";
import { time, localDayKey, dayLabel, pct, odds as fmtOdds, pts, surfaceLabel, lastName, countryCode, levelLabel } from "./format.js";
import { renderBrief } from "./brief.js";
import { renderProfile, renderAttributes, renderOdds, renderSets } from "./panels.js";
import { toast } from "./main.js";

const TABS = [
  ["brief", "Brief"], ["profile", "Profile"], ["attributes", "Attributes"], ["odds", "Odds"], ["sets", "Sets"],
];
const STORE = "deuce.matches.filters";

const state = {
  items: [], loaded: false, error: null, status: null,
  filters: loadFilters(),
  open: null, tab: {}, details: {}, animated: new Set(),
};

function loadFilters() {
  const base = { day: null, tours: { ATP: true, WTA: true }, status: "all", valueOnly: false };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
    return { ...base, ...saved, day: null };
  } catch { return base; }
}
function saveFilters() {
  const { tours, status, valueOnly } = state.filters;
  try { localStorage.setItem(STORE, JSON.stringify({ tours, status, valueOnly })); } catch { /* private mode */ }
}

let root = null;

export async function mountMatches(el) {
  root = el;
  if (!state.loaded) renderSkeleton();
  else render();
  try {
    const [items, status] = await Promise.all([api.matches(), api.status().catch(() => null)]);
    state.items = items || [];
    state.status = status;
    state.error = null;
  } catch (e) {
    state.error = e.message;
  }
  state.loaded = true;
  if (root === el) render();
}

function renderSkeleton() {
  clear(root).append(h("div", { "aria-busy": "true", "aria-label": "Loading matches" },
    h("div", { class: "skel-head" }), ...Array.from({ length: 6 }, () => h("div", { class: "skel-row" }))));
}

// ------------------------------------------------------------------ filtering

function shortRound(r) {
  if (!r) return "";
  const t = String(r).toLowerCase();
  if (t.includes("qualif")) return "Qual";
  if (t.includes("semi")) return "SF";
  if (t.includes("quarter")) return "QF";
  if (t.includes("robin")) return "RR";
  if (t === "final" || t === "the final") return "F";
  if (t.includes("group")) return "Group";
  let mm = t.match(/round of (\d+)/);
  if (mm) return `R${mm[1]}`;
  mm = t.match(/(\d)(st|nd|rd|th) round/) || t.match(/^round (\d+)$/);
  if (mm) return `R${mm[1]}`;
  return r.length > 6 ? r.slice(0, 6) : r;
}

function dayKeys() {
  const keys = new Set(state.items.filter((i) => i.date).map((i) => localDayKey(new Date(i.date))));
  return Array.from(keys).sort();
}

function defaultDay(keys) {
  const today = localDayKey(new Date());
  if (keys.includes(today)) return today;
  return keys.find((k) => k > today) || keys[keys.length - 1] || null;
}

function filtered() {
  const f = state.filters;
  return state.items.filter((i) => {
    if (f.day && (!i.date || localDayKey(new Date(i.date)) !== f.day)) return false;
    const tour = (i.tour || "").toUpperCase();
    if ((tour === "ATP" || tour === "WTA") && !f.tours[tour]) return false;
    if (f.status !== "all" && i.status_group !== f.status) return false;
    if (f.valueOnly && !i.value) return false;
    return true;
  });
}

// ------------------------------------------------------------------ render

function render() {
  clear(root);
  if (state.error) {
    root.append(h("div", { class: "state err" }, h("h2", null, "Matches didn't load"), h("p", null, state.error),
      h("button", { class: "btn", type: "button", onclick: () => mountMatches(root) }, "Try again")));
    return;
  }
  if (!state.items.length) {
    const noDb = state.status && !state.status.db_exists;
    root.append(h("div", { class: "state" },
      h("h2", null, noDb ? "No data yet" : "No matches in the next two weeks"),
      h("p", null, noDb
        ? ["Fetch the schedule, ratings and predictions with ", h("code", null, "python -m engine.update"), ", then reload this page."]
        : ["Run ", h("code", null, "python -m engine.update"), " to pull the latest schedule and predictions."]),
      h("button", { class: "btn btn-quiet", type: "button", onclick: () => mountMatches(root) }, "Reload")));
    return;
  }
  const keys = dayKeys();
  if (!state.filters.day || !keys.includes(state.filters.day)) state.filters.day = defaultDay(keys);
  root.append(toolbar(keys));
  const list = h("div", { class: "list" });
  root.append(list);
  renderList(list);
}

function toolbar(keys) {
  const f = state.filters;
  const rerender = () => { saveFilters(); render(); };
  const days = h("div", { class: "seg days", role: "group", "aria-label": "Day" },
    keys.map((k) => h("button", { type: "button", "aria-pressed": String(f.day === k), onclick: () => { f.day = k; state.open = null; rerender(); } }, dayLabel(k))));
  const tours = h("div", { class: "chips", role: "group", "aria-label": "Tour" },
    [["ATP", "Men"], ["WTA", "Women"]].map(([t, label]) => h("button", {
      type: "button", class: "chip-toggle", "aria-pressed": String(!!f.tours[t]),
      onclick: () => {
        f.tours[t] = !f.tours[t];
        if (!f.tours.ATP && !f.tours.WTA) f.tours[t === "ATP" ? "WTA" : "ATP"] = true;
        rerender();
      },
    }, label)));
  const status = h("div", { class: "seg status", role: "group", "aria-label": "Status" },
    [["all", "All"], ["upcoming", "Upcoming"], ["live", "Live"], ["finished", "Finished"]].map(([v, label]) =>
      h("button", { type: "button", "aria-pressed": String(f.status === v), onclick: () => { f.status = v; rerender(); } }, label)));
  const value = h("label", { class: "check" },
    h("input", { type: "checkbox", checked: f.valueOnly, onchange: (e) => { f.valueOnly = e.target.checked; rerender(); } }),
    h("span", { class: "box" }, ball(20)), "Value only");
  return h("div", { class: "toolbar" }, days, tours, status, h("span", { class: "spacer" }), value);
}

function renderList(list) {
  const items = filtered();
  if (!items.length) {
    list.append(h("div", { class: "state" },
      h("h2", null, "Nothing here with these filters"),
      h("p", null, `No ${state.filters.valueOnly ? "value " : ""}matches on ${dayLabel(state.filters.day).toLowerCase().replace(/^(mon|tue|wed|thu|fri|sat|sun)/, (d) => d[0].toUpperCase() + d.slice(1))} for this selection.`),
      h("button", { class: "btn btn-quiet", type: "button", onclick: () => {
        Object.assign(state.filters, { tours: { ATP: true, WTA: true }, status: "all", valueOnly: false });
        saveFilters(); render();
      } }, "Show all matches")));
    return;
  }
  const groups = new Map();
  for (const it of items) {
    const key = it.tournament.id || it.tournament.name || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  for (const [, ms] of groups) {
    const t = ms[0].tournament;
    const meta = [levelLabel(t.level, ms[0].tour), t.location].filter(Boolean).join(", ");
    list.append(h("section", { class: "group", "aria-label": t.name || "Tournament" },
      h("div", { class: "group-head" },
        h("h2", null, t.name || "Unknown tournament"),
        t.surface ? h("span", { class: "surface", title: t.surface_inferred ? "Surface inferred from the venue" : null }, surfaceLabel(t.surface)) : null,
        meta ? h("span", { class: "group-meta" }, meta) : null),
      ms.map(matchEl)));
  }
}

function rowLabel(m) {
  const parts = [`${m.p1.name} against ${m.p2.name}`];
  if (m.status_group === "upcoming") parts.push(`starts ${time(m.date)}`);
  if (m.status_group === "live") parts.push("live now");
  if (m.status_group === "finished") parts.push(`finished ${m.score || ""}`);
  if (m.p1_prob !== null && m.p1_prob !== undefined) {
    const fav = m.p1_prob >= 0.5 ? m.p1 : m.p2;
    parts.push(`model gives ${fav.name} ${pct(Math.max(m.p1_prob, m.p2_prob))}%`);
  }
  if (m.value) parts.push(`value on ${m[m.value.side].name}, ${pts(m.value.edge)}`);
  return parts.join(", ");
}

function rowChildren(m) {
  const g = m.status_group;
  const timeCell = g === "live"
    ? h("span", { class: "r-time live" }, "Live")
    : h("span", { class: "r-time" },
      g === "finished" ? (m.status === "retired" ? "Ret." : m.status === "walkover" ? "W/O" : "Final") : time(m.date),
      m.round ? h("span", { class: "r-sub" }, shortRound(m.round)) : null);

  const lost = (side) => g === "finished" && m.winner && m.winner !== side;
  const player = (side) => {
    const p = m[side];
    const code = countryCode(p.country);
    const cc = code ? h("span", { class: "cc", title: p.country }, code) : null;
    return h("span", { class: [`r-${side}`, lost(side) && "lost"] },
      h("span", { class: "pname" }, side === "p1" ? [p.name, cc] : [cc, p.name]));
  };

  let bar;
  if (m.p1_prob === null || m.p1_prob === undefined) {
    bar = h("span", { class: "r-bar" }, h("span", { class: "noprob" }, "No prediction yet"));
  } else {
    const w = Math.max(0, Math.min(100, m.p1_prob * 100));
    bar = h("span", { class: ["r-bar", m.low_data && "thin"], "aria-hidden": "true",
      title: m.low_data ? "Thin match history for at least one player: rough probability, no value flag" : null },
      h("span", { class: "prob p1" }, pct(m.p1_prob)),
      h("span", { class: "track" },
        h("span", { class: "f1", style: { width: `${w}%` } }),
        h("span", { class: "split" }),
        h("span", { class: "f2" }),
        h("span", { class: "net" })),
      h("span", { class: "prob p2" }, pct(m.p2_prob)));
  }

  let right;
  if ((g === "finished" || g === "live") && m.score) {
    right = h("span", { class: "r-odds" }, h("span", { class: "r-score" }, m.score));
  } else if (m.odds) {
    const o = (side) => {
      const isVal = m.value && m.value.side === side;
      const flag = isVal ? ball(14, `Value on ${m[side].name}: ${pts(m.value.edge)} edge`) : null;
      return h("span", { class: ["o", isVal && "val"], title: isVal ? `Value on ${m[side].name}: ${pts(m.value.edge)} edge` : null },
        side === "p1" ? [flag, fmtOdds(m.odds.p1)] : [fmtOdds(m.odds.p2), flag]);
    };
    right = h("span", { class: "r-odds" }, o("p1"), o("p2"));
  } else {
    right = h("span", { class: "r-odds" }, h("span", { class: "muted" }, "No price"));
  }
  return [timeCell, player("p1"), bar, player("p2"), right];
}

function matchEl(m) {
  const open = state.open === m.match_id;
  const panelId = `panel-${m.match_id}`;
  const row = h("button", {
    class: "row", type: "button", "aria-expanded": String(open), "aria-controls": open ? panelId : null,
    "aria-label": rowLabel(m), onclick: () => toggle(m.match_id),
  }, rowChildren(m));
  const wrap = h("div", { class: ["match", open && "open"], dataset: { id: m.match_id } }, row);
  if (open) wrap.append(panelEl(m, panelId, row));
  return wrap;
}

function toggle(id) {
  state.open = state.open === id ? null : id;
  const list = root.querySelector(".list");
  if (!list) return;
  // Re-render only the affected match blocks to keep scroll and focus.
  for (const el of list.querySelectorAll(".match")) {
    const isTarget = el.dataset.id === id;
    const wasOpen = el.classList.contains("open");
    if (isTarget || wasOpen) {
      const item = state.items.find((x) => x.match_id === el.dataset.id);
      if (!item) continue;
      const fresh = matchEl(item);
      el.replaceWith(fresh);
      if (isTarget) fresh.querySelector(".row").focus({ preventScroll: true });
    }
  }
}

// ------------------------------------------------------------------ panel

function panelEl(m, panelId, rowBtn) {
  const current = state.tab[m.match_id] || "brief";
  const body = h("div", { class: "tabpanel", role: "tabpanel", id: `${panelId}-body`, tabindex: "0" });
  const tabButtons = TABS.map(([key, label]) => h("button", {
    class: "tab", type: "button", role: "tab", id: `${panelId}-tab-${key}`,
    "aria-selected": String(key === current), "aria-controls": `${panelId}-body`, tabindex: key === current ? "0" : "-1",
    onclick: () => select(key),
  }, label));
  const tablist = h("div", { class: "tabs", role: "tablist", "aria-label": `${m.p1.name} against ${m.p2.name}` }, tabButtons);
  tablist.addEventListener("keydown", (e) => {
    const idx = TABS.findIndex(([k]) => k === (state.tab[m.match_id] || "brief"));
    let next = null;
    if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
    if (e.key === "ArrowLeft") next = (idx - 1 + TABS.length) % TABS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = TABS.length - 1;
    if (next !== null) { e.preventDefault(); select(TABS[next][0]); tabButtons[next].focus(); }
  });

  const panel = h("section", { class: "panel", id: panelId, "aria-label": `Details for ${m.p1.name} against ${m.p2.name}` }, tablist, body);
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); toggle(m.match_id); }
  });

  function select(key) {
    state.tab[m.match_id] = key;
    tabButtons.forEach((b, i) => {
      const on = TABS[i][0] === key;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    body.setAttribute("aria-labelledby", `${panelId}-tab-${key}`);
    fill();
  }

  function fill() {
    const key = state.tab[m.match_id] || "brief";
    const d = state.details[m.match_id];
    clear(body);
    if (!d) {
      body.append(h("p", { class: "muted", style: { padding: "24px 0" } }, "Loading match…"));
      return;
    }
    if (d.error) {
      body.append(h("div", { class: "empty-brief" }, h("p", null, d.error),
        h("button", { class: "btn btn-quiet", type: "button", onclick: () => { delete state.details[m.match_id]; load(); } }, "Try again")));
      return;
    }
    if (key === "brief") {
      const animate = !!d.brief && !state.animated.has(m.match_id);
      if (animate) state.animated.add(m.match_id);
      body.append(renderBrief(d, { animate, onGoToOdds: () => { select("odds"); tabButtons[3].focus(); } }));
    } else if (key === "profile") body.append(renderProfile(d));
    else if (key === "attributes") body.append(renderAttributes(d));
    else if (key === "odds") body.append(renderOdds(d, { onSaved: (res) => applyOdds(m.match_id, res, rowBtn) }));
    else if (key === "sets") body.append(renderSets(d));
  }

  async function load() {
    if (!state.details[m.match_id]) {
      fill();
      try {
        state.details[m.match_id] = await api.match(m.match_id);
      } catch (e) {
        state.details[m.match_id] = { error: e.message };
      }
    }
    if (state.open === m.match_id) fill();
  }

  body.setAttribute("aria-labelledby", `${panelId}-tab-${current}`);
  if (state.details[m.match_id]) queueMicrotask(fill); else load();
  return panel;
}

function applyOdds(id, res, rowBtn) {
  const item = state.items.find((x) => x.match_id === id);
  const d = state.details[id];
  for (const target of [item, d]) {
    if (!target) continue;
    target.odds = res.odds;
    target.edges = res.edges;
    target.value = res.value;
  }
  if (d && res.odds) d.odds_history = [...(d.odds_history || []), res.odds];
  if (item && rowBtn && rowBtn.isConnected) {
    rowBtn.replaceChildren(...rowChildren(item));
    rowBtn.setAttribute("aria-label", rowLabel(item));
  }
  toast(res.value ? `Odds saved. Value on ${lastName(item ? item[res.value.side].name : "")}.` : "Odds saved.");
}
