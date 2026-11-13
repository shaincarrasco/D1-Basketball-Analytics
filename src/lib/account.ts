"use client";
// Accounts, billing and alerts. All calls are same-origin (/auth proxy + /api on the app server),
// so session cookies stay first-party. On a static host with no app server, /api/health fails
// and every account feature stays hidden.
import { useCallback, useEffect, useState } from "react";
import { readFavorites, type Favorites } from "./favorites";

export type Health = { ok: boolean; accounts: boolean; billing: boolean; alerts: boolean; prices: { monthly: boolean; yearly: boolean } };
export type Me = {
  user: { id: string; email: string | null };
  plan: "free" | "pro";
  status: string | null;
  periodEnd: string | null;
  billingPortal: boolean;
  follows: Favorites;
};

const OFF: Health = { ok: false, accounts: false, billing: false, alerts: false, prices: { monthly: false, yearly: false } };
let healthP: Promise<Health> | null = null;
export function getHealth(): Promise<Health> {
  healthP ??= fetch("/api/health", { cache: "no-store" })
    .then(r => (r.ok && r.headers.get("content-type")?.includes("json") ? r.json() : OFF))
    .catch(() => OFF);
  return healthP;
}

// ---------- auth (Better Auth endpoints behind /auth) ----------
const EVENT = "d1h-account-change";
let jwt: { token: string; exp: number } | null = null;
const notify = () => window.dispatchEvent(new Event(EVENT));

async function auth(path: string, init?: RequestInit) {
  const r = await fetch(`/auth/${path}`, { credentials: "include", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.message ?? body?.error ?? "Something went wrong. Try again.");
  return body;
}
const post = (path: string, data: unknown) => auth(path, { method: "POST", body: JSON.stringify(data) });

export async function signIn(email: string, password: string) { await post("sign-in/email", { email, password }); jwt = null; notify(); }
export async function signUp(name: string, email: string, password: string) { await post("sign-up/email", { name, email, password }); jwt = null; notify(); }
export async function signOut() { await post("sign-out", {}).catch(() => {}); jwt = null; notify(); }
export async function signInWithGoogle() {
  const callbackURL = `${window.location.origin}/account/`;
  const r = await post("sign-in/social", { provider: "google", callbackURL });
  if (r?.url) window.location.href = r.url;
}

/** After Google sign-in, Neon Auth returns with ?neon_auth_session_verifier=…; exchange it once. */
async function completeOAuth() {
  const url = new URL(window.location.href);
  const v = url.searchParams.get("neon_auth_session_verifier");
  if (!v) return;
  await auth(`get-session?neon_auth_session_verifier=${encodeURIComponent(v)}`).catch(() => {});
  url.searchParams.delete("neon_auth_session_verifier");
  history.replaceState(history.state, "", url.href);
}

/** Short-lived JWT for /api calls; null when signed out. */
export async function getToken(): Promise<string | null> {
  if (jwt && jwt.exp - 60 > Date.now() / 1000) return jwt.token;
  try {
    const r = await fetch("/auth/token", { credentials: "include" });
    if (!r.ok) return (jwt = null);
    const { token } = await r.json();
    const exp = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp ?? 0;
    jwt = { token, exp };
    return token;
  } catch { return (jwt = null); }
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const r = await fetch(`/api/${path}`, { ...init, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body?.error ?? "Something went wrong. Try again."), { status: r.status });
  return body as T;
}

// ---------- hook ----------
export type AccountState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "signed-out"; health: Health }
  | { status: "signed-in"; health: Health; me: Me };

export function useAccount(): AccountState & { refresh: () => void } {
  const [state, setState] = useState<AccountState>({ status: "loading" });
  const load = useCallback(async () => {
    const health = await getHealth();
    if (!health.accounts) return setState({ status: "unavailable" });
    await completeOAuth();
    if (!(await getToken())) return setState({ status: "signed-out", health });
    try { setState({ status: "signed-in", health, me: await api<Me>("me") }); }
    catch { setState({ status: "signed-out", health }); }
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(EVENT, load);
    return () => window.removeEventListener(EVENT, load);
  }, [load]);
  return { ...state, refresh: load };
}

// ---------- follows sync ----------
const FAV_KEY = "d1h-favorites";
/** Merge this device's follows with the account's, save both ways. */
export async function syncFollows(server: Favorites) {
  const local = readFavorites();
  const merged: Favorites = {
    teams: [...new Set([...server.teams, ...local.teams])],
    players: [...new Set([...server.players, ...local.players])],
  };
  try { localStorage.setItem(FAV_KEY, JSON.stringify(merged)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event("d1h-favorites-change"));
  if (merged.teams.length !== server.teams.length || merged.players.length !== server.players.length) await pushFollows(merged);
}
export async function pushFollows(f: Favorites = readFavorites()) {
  if (!(await getToken())) return;
  await api("follows", { method: "PUT", body: JSON.stringify(f) }).catch(() => {});
}

// ---------- billing ----------
export async function startCheckout(interval: "month" | "year") {
  const { url } = await api<{ url: string }>("checkout", { method: "POST", body: JSON.stringify({ interval }) });
  window.location.href = url;
}
export async function openBillingPortal() {
  const { url } = await api<{ url: string }>("portal", { method: "POST" });
  window.location.href = url;
}

// ---------- push alerts ----------
export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
function b64ToBytes(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}
export type AlertPrefs = { tipoff: boolean; close: boolean; final: boolean };
export async function enableAlerts(prefs: AlertPrefs) {
  if (!pushSupported()) throw new Error("This browser can't receive alerts. On iPhone, add D1 Hoops to your Home Screen first.");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked for this site. Allow them in your browser settings, then try again.");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const { key } = await api<{ key: string }>("push/key");
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
  await api("push/subscribe", { method: "POST", body: JSON.stringify({ ...sub.toJSON(), prefs }) });
}
export async function disableAlerts() {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await api("push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe();
}
