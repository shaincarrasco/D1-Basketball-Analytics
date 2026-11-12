"use client";
// Pick'em: one pick per game (ESPN event id), locked at tip-off by the server.
import { useEffect, useState } from "react";
import { api, getHealth, getToken } from "./account";

type Picks = Record<string, "home" | "away">;
let cache: Promise<Picks | null> | null = null;
const EVENT = "d1h-picks-change";

function load(): Promise<Picks | null> {
  cache ??= (async () => {
    if (!(await getHealth()).accounts || !(await getToken())) return null;
    return (await api<{ picks: Picks }>("picks")).picks;
  })().catch(() => null);
  return cache;
}

/** null = not signed in (or accounts unavailable). */
export function usePicks(): Picks | null | undefined {
  const [p, setP] = useState<Picks | null | undefined>(undefined);
  useEffect(() => {
    const sync = () => load().then(setP);
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return p;
}

export async function makePick(gameId: string, pick: "home" | "away") {
  await api("picks", { method: "PUT", body: JSON.stringify({ gameId, pick }) });
  const current = (await load()) ?? {};
  cache = Promise.resolve({ ...current, [gameId]: pick });
  window.dispatchEvent(new Event(EVENT));
}
