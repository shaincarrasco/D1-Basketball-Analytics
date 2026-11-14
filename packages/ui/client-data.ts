"use client";
// Client-side JSON loading with a shared in-memory cache.
import { useEffect, useState } from "react";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const cache = new Map<string, Promise<unknown>>();

export function dataUrl(file: string) {
  return `${base}/data/app/${file}`;
}

export function loadJson<T>(file: string): Promise<T> {
  if (!cache.has(file)) {
    const p = fetch(dataUrl(file)).then(res => {
      if (!res.ok) throw new Error(res.status === 404 ? "No data has been published for this yet." : `Data request failed (HTTP ${res.status}).`);
      return res.json();
    });
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return cache.get(file) as Promise<T>;
}

export type Loadable<T> = { status: "loading"; data: null; error: null } | { status: "ready"; data: T; error: null } | { status: "error"; data: null; error: string };

export function useJson<T>(file: string | null): Loadable<T> & { retry: () => void } {
  const [state, setState] = useState<Loadable<T>>({ status: "loading", data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!file) return;
    let alive = true;
    setState({ status: "loading", data: null, error: null });
    loadJson<T>(file)
      .then(data => alive && setState({ status: "ready", data, error: null }))
      .catch(err => alive && setState({ status: "error", data: null, error: err instanceof Error ? err.message : "Could not load data." }));
    return () => { alive = false; };
  }, [file, attempt]);
  return { ...state, retry: () => setAttempt(a => a + 1) };
}
