// Router and shared bits.
import { clear } from "./dom.js";

const main = document.getElementById("main");
const views = {
  matches: () => import("./matches.js").then((m) => m.mountMatches(main)),
  proof: () => import("./proof.js").then((m) => m.mountProof(main)),
  players: () => import("./players.js").then((m) => m.mountPlayers(main)),
};
const titles = { matches: "Deuce", proof: "Proof | Deuce", players: "Players | Deuce" };

function current() {
  const hash = location.hash.replace(/^#\/?/, "");
  return views[hash] ? hash : "matches";
}

let first = true;
let shown = null;
async function route() {
  const v = current();
  if (v === shown) return;
  shown = v;
  for (const a of document.querySelectorAll("[data-view]")) {
    if (a.dataset.view === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  document.title = titles[v];
  clear(main);
  if (!first) { main.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  first = false;
  await views[v]();
}

let toastTimer;
export function toast(text) {
  const el = document.querySelector(".toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

window.addEventListener("hashchange", route);
route();
