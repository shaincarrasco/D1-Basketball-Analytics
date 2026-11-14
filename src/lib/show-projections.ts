"use client";
// Projected scores are opt-in: a gray "74–68" sitting where the real score goes reads as if
// the game already happened. Off by default; one switch, saved on this device, applies everywhere.
import { useSyncExternalStore } from "react";

const KEY = "d1h-show-projections";
const EVENT = "d1h-show-projections-change";

function read(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}

export function setShowProjections(on: boolean) {
  try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}

/** Whether to show projected scores. Always false on the server and first paint, so nothing flashes. */
export function useShowProjections(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
