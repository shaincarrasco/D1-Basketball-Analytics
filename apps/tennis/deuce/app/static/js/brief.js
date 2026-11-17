// The Brief tab: header, the court, upsides and downsides, bottom line, bucket disclosures.
import { h, s, ball } from "./dom.js";
import { pct, odds as fmtOdds, pts, factValue, lastName, engineLabel, when } from "./format.js";

const LANES = { slight: 1, moderate: 2, strong: 3 };
const LANE_PCT = 7.5; // 15% of half-width = 7.5% of the full court width

const playerCls = (side) => (side === "p1" ? "c1" : side === "p2" ? "c2" : "");

export function names(m) {
  const b = m.brief && m.brief.players;
  return {
    p1: (b && b.p1 && b.p1.name) || m.p1.name,
    p2: (b && b.p2 && b.p2.name) || m.p2.name,
  };
}

function valueLine(m, nm, onGoToOdds) {
  const v = m.value;
  if (m.low_data) {
    return h("p", { class: "value-line thin-note" },
      "Thin match history for at least one player, so this probability is rough and no value is flagged.");
  }
  if (v && m.odds) {
    const side = v.side;
    const prob = side === "p1" ? m.p1_prob : m.p2_prob;
    return h("p", { class: "value-line" }, ball(16),
      h("span", null, h("strong", null, `Value on ${lastName(nm[side])} at ${fmtOdds(m.odds[side])}.`),
        ` Fair price ${fmtOdds(1 / prob)}, an edge of ${pts(v.edge)}.`));
  }
  if (m.odds) {
    return h("p", { class: "value-line muted-line" },
      h("span", { class: "muted" }, `No value at the current price (${fmtOdds(m.odds.p1)} and ${fmtOdds(m.odds.p2)}).`));
  }
  return h("p", { class: "value-line" },
    h("span", { class: "muted" }, "No market price yet. "),
    h("button", { class: "link-btn", type: "button", onclick: onGoToOdds }, "Add odds"));
}

function court(brief, nm, animate) {
  const pick = brief.model_pick;
  const lines = s("svg", { class: "court-lines", viewBox: "0 0 1000 240", preserveAspectRatio: "none", "aria-hidden": "true" },
    s("rect", { class: "ln", x: 0.5, y: 0.5, width: 999, height: 239 }),
    s("line", { class: "ln", x1: 0, x2: 1000, y1: 14, y2: 14 }),
    s("line", { class: "ln", x1: 0, x2: 1000, y1: 226, y2: 226 }),
    s("line", { class: "ln", x1: 231, x2: 231, y1: 14, y2: 226 }),
    s("line", { class: "ln", x1: 769, x2: 769, y1: 14, y2: 226 }),
    s("line", { class: "ln", x1: 231, x2: 769, y1: 120, y2: 120 }),
    s("line", { class: "ln", x1: 0, x2: 14, y1: 120, y2: 120 }),
    s("line", { class: "ln", x1: 986, x2: 1000, y1: 120, y2: 120 }),
    s("line", { class: "netline", x1: 500, x2: 500, y1: 0, y2: 240 }),
  );

  const slots = [];
  const body = h("div", { class: "court-body" }, h("div", { class: "court" }, lines));
  (brief.buckets || []).slice(0, 4).forEach((b, i) => {
    const fav = b.favours === "p1" || b.favours === "p2" ? b.favours : "level";
    const lanes = fav === "level" ? 0 : LANES[b.strength] || 1;
    const target = 50 + (fav === "p1" ? -1 : 1) * lanes * LANE_PCT;
    const word = fav === "level" ? "level" : b.strength || "slight";
    const wordSide = fav === "p1" ? "left" : "right";
    const slot = h("span", { class: "puck-slot", style: { left: animate ? "50%" : `${target}%` } },
      h("span", { class: `puck ${playerCls(fav)}` }),
      h("span", { class: `puck-word ${wordSide} ${fav === "level" ? "level" : playerCls(fav)}`, "aria-hidden": "true" }, word),
    );
    slots.push([slot, target]);
    const verdict = fav === "level" ? "level" : `favours ${nm[fav]}, ${word}`;
    body.append(
      h("div", { class: "bucket-title", style: { gridRow: String(i + 1) } }, b.title),
      h("div", { class: "lane", style: { gridRow: String(i + 1) }, role: "img", "aria-label": `${b.title}: ${verdict}` },
        h("span", { class: "lane-title", "aria-hidden": "true" }, b.title),
        slot),
    );
  });

  if (animate) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const [slot, target] of slots) slot.style.left = `${target}%`;
    }));
  }

  const tag = (side) => (pick === side ? h("span", { class: "pick-tag" }, "model pick") : null);
  return h("div", { class: "court-wrap" },
    h("div", { class: "court-ends" },
      h("div", { class: "ends" },
        h("span", { class: "end-name c1" }, lastName(nm.p1), tag("p1")),
        h("span", { class: "end-name c2" }, tag("p2"), lastName(nm.p2)))),
    body);
}

function sides(brief, nm) {
  const col = (side) => {
    const p = (brief.players && brief.players[side]) || {};
    const ups = (p.upsides || []).map((t) => h("li", null, h("span", { class: `mark ${playerCls(side)}`, "aria-hidden": "true" }, "+"), h("span", null, h("span", { class: "sr-only" }, "Upside: "), t)));
    const downs = (p.downsides || []).map((t) => h("li", null, h("span", { class: "mark down", "aria-hidden": "true" }, "−"), h("span", null, h("span", { class: "sr-only" }, "Downside: "), t)));
    return h("div", { class: "side" },
      h("h3", { class: playerCls(side) }, nm[side]),
      h("ul", null, ups, downs));
  };
  return h("div", { class: "sides" }, col("p1"), col("p2"));
}

export function vsTable(rows, nm, { big = false, wide = false, header = true } = {}) {
  const grid = h("div", { class: ["vs", big && "big", wide && "wide"], role: "table", "aria-label": `${nm.p1} compared with ${nm.p2}` });
  if (header && nm) {
    grid.append(h("div", { class: "row2", role: "row" },
      h("span", { class: "lbl", role: "columnheader", style: { textAlign: "right", color: "var(--optic)" } }, lastName(nm.p1)),
      h("span", { class: "lbl", role: "columnheader" }, h("span", { class: "sr-only" }, "Measure")),
      h("span", { class: "lbl", role: "columnheader", style: { textAlign: "left", color: "var(--plasma)" } }, lastName(nm.p2))));
  }
  for (const r of rows) {
    grid.append(h("div", { class: "row2", role: "row" },
      h("span", { class: "a", role: "cell" }, r.a),
      h("span", { class: "lbl", role: "rowheader" }, r.label),
      h("span", { class: "b", role: "cell" }, r.b)));
  }
  return grid;
}

function disclosures(brief, nm) {
  const openByDefault = window.matchMedia("(min-width: 721px)").matches;
  return h("div", { class: "discl" }, (brief.buckets || []).map((b) => {
    const fav = b.favours === "p1" || b.favours === "p2" ? b.favours : "level";
    const verdict = fav === "level" ? "Level" : `Leans ${lastName(nm[fav])}, ${b.strength || "slight"}`;
    const facts = (b.facts || []).map((f) => ({ label: f.label, a: factValue(f.p1), b: factValue(f.p2) }));
    return h("details", { open: openByDefault },
      h("summary", null,
        h("span", { class: "t" }, b.title),
        h("span", { class: "v" }, h("span", { class: `dot ${playerCls(fav)}` }), verdict),
        h("span", { class: "chev", "aria-hidden": "true" })),
      h("div", { class: "body" },
        b.text ? h("p", null, b.text) : null,
        facts.length ? vsTable(facts, nm) : null));
  }));
}

function weatherLine(w) {
  if (!w) return null;
  const bits = [];
  if (w.temp_c !== null && w.temp_c !== undefined) bits.push(`${Math.round(w.temp_c)}°C`);
  if (w.humidity !== null && w.humidity !== undefined) bits.push(`${Math.round(w.humidity)}% humidity`);
  if (w.wind_kph !== null && w.wind_kph !== undefined) bits.push(`wind ${Math.round(w.wind_kph)} km/h`);
  if (w.precip_mm) bits.push(`${w.precip_mm} mm rain`);
  const lead = w.summary ? `${w.summary}: ` : "Forecast: ";
  return h("p", { class: "weather" }, `${lead}${bits.join(", ")} at match time.`);
}

export function renderBrief(m, { animate = false, onGoToOdds } = {}) {
  const brief = m.brief;
  if (!brief) {
    return h("div", { class: "empty-brief" },
      h("h3", null, "No brief for this match yet"),
      h("p", null, "Briefs explain the pick: fitness, motivation, conditions and the market, plus each player's upsides and downsides. Run ",
        h("code", null, "python -m brief.run"), " to write them for upcoming matches, then reopen this match."));
  }
  const nm = names(m);
  const briefPick = brief.model_pick === "p2" ? "p2" : "p1";
  const live = m.p1_prob !== null && m.p1_prob !== undefined;
  const pick = live ? (m.p1_prob >= (m.p2_prob ?? 1 - m.p1_prob) ? "p1" : "p2") : briefPick;
  const prob = (pick === "p1" ? m.p1_prob : m.p2_prob) ?? brief.model_prob;
  const writtenAt = m.brief_created_at || brief.generated_at;
  const stale = (live && pick !== briefPick)
    || (writtenAt && m.predicted_at && new Date(writtenAt) < new Date(m.predicted_at));
  const ag = brief.agreement || {};
  const score = ag.score ?? null;

  const head = h("div", { class: "brief-head" },
    h("div", null,
      h("div", { class: "pick-line" },
        h("span", { class: `pick-name ${playerCls(pick)}` }, lastName(nm[pick])),
        h("span", { class: `pick-prob ${playerCls(pick)}` }, `${pct(prob)}%`)),
      h("p", { class: "pick-note" }, "The model's pick to win")),
    h("div", { class: ["agree", score !== null && score < 40 && "conflict"] },
      h("div", { class: "agree-line" },
        h("span", { class: "muted" }, "Agreement"),
        h("span", { class: "agree-score" }, score ?? "–")),
      h("p", { class: "agree-label" }, ag.label || "")));

  return h("div", { class: "brief" },
    head,
    stale ? h("p", { class: "stale-note", role: "note" }, "This brief was written before the latest prediction. Run ",
      h("code", null, "python -m brief.run"), " to refresh.") : null,
    valueLine(m, nm, onGoToOdds),
    court({ ...brief, model_pick: pick }, nm, animate),
    sides(brief, nm),
    brief.bottom_line ? h("p", { class: "bottom-line" }, h("strong", null, "Bottom line. "), brief.bottom_line) : null,
    disclosures(brief, nm),
    weatherLine(brief.weather),
    h("p", { class: "engine" }, engineLabel(brief.engine), brief.generated_at ? `, ${when(brief.generated_at)}` : ""));
}
