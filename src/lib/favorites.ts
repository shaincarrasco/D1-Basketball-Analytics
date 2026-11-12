"use client";
// "My teams" and followed players, stored on this device.
import { useEffect, useState } from "react";

export type Favorites = { teams: string[]; players: string[] }; // team slugs, player ids
const KEY = "d1h-favorites";
const EVENT = "d1h-favorites-change";

export function readFavorites(): Favorites {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (v && Array.isArray(v.teams) && Array.isArray(v.players)) return v; } catch { /* storage unavailable */ }
  return { teams: [], players: [] };
}
export function toggleFavorite(kind: "teams" | "players", id: string) {
  const f = readFavorites();
  const list = f[kind];
  f[kind] = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
  try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}
export function useFavorites(): Favorites {
  const [f, setF] = useState<Favorites>({ teams: [], players: [] });
  useEffect(() => {
    const sync = () => setF(readFavorites());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  return f;
}
