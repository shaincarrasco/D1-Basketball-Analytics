// Tiny DOM builders. Text always goes in as text nodes, never as HTML, because brief text
// can come from a local LLM.

const SVG_NS = "http://www.w3.org/2000/svg";

function apply(el, attrs) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.setAttribute("class", Array.isArray(v) ? v.filter(Boolean).join(" ") : v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === "") continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const sr = (text) => h("span", { class: "sr-only" }, text);

// The value flag: a felt ball with its seam.
export function ball(size = 14, title) {
  return s("svg", { class: "ball", width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": title ? null : "true", role: title ? "img" : null },
    title ? s("title", null, title) : null,
    s("circle", { cx: 8, cy: 8, r: 7.25, class: "ball-felt" }),
    s("path", { d: "M2.2 3.6c2.6 1.6 3.6 6.8 0 8.9", class: "ball-seam" }),
    s("path", { d: "M13.8 3.6c-2.6 1.6-3.6 6.8 0 8.9", class: "ball-seam" }),
  );
}

export function debounce(fn, ms = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
