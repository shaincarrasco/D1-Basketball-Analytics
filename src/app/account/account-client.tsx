"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, BellOff, CreditCard, LogOut } from "lucide-react";
import {
  useAccount, signIn, signUp, signOut, signInWithGoogle, openBillingPortal, startCheckout,
  enableAlerts, disableAlerts, currentPushSubscription, pushSupported, type AlertPrefs, type Me, type Health,
} from "@/lib/account";
import { PRICES } from "@/lib/pricing";

export default function AccountClient() {
  const acct = useAccount();
  if (acct.status === "loading") return <p className="text-sm text-mute">Loading your account…</p>;
  if (acct.status === "unavailable") return (
    <div className="deck max-w-xl p-5 text-[14px] leading-relaxed text-mute">
      Accounts aren't available on this copy of the site. Everything else works without one — your follows are saved on this device on the <Link className="underline hover:text-ink" href="/following/">Following</Link> page.
    </div>
  );
  if (acct.status === "signed-out") return <SignInForm />;
  return <SignedIn me={acct.me} health={acct.health} refresh={acct.refresh} />;
}

function SignInForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { mode === "in" ? await signIn(email, password) : await signUp(name || email.split("@")[0], email, password); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <form onSubmit={submit} className="deck grid gap-3 p-5" aria-labelledby="auth-title">
        <h2 id="auth-title" className="h-section">{mode === "in" ? "Sign in" : "Create your account"}</h2>
        <button type="button" className="btn w-full" onClick={() => signInWithGoogle().catch(e => setError(e.message))}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3ZM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Zm-5.6-8a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9l3.3-2.5ZM12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6Z"/></svg>
          Continue with Google
        </button>
        <div className="flex items-center gap-3 text-xs text-dim"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
        {mode === "up" && (
          <label className="grid gap-1 text-[13px] font-medium">Name
            <input className="field" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label className="grid gap-1 text-[13px] font-medium">Email
          <input className="field" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="grid gap-1 text-[13px] font-medium">Password
          <input className="field" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} />
        </label>
        {error && <p role="alert" className="text-[13px] text-loss">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}</button>
        <p className="text-[13px] text-mute">
          {mode === "in" ? "New here? " : "Already have an account? "}
          <button type="button" className="font-medium text-ink underline" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); }}>
            {mode === "in" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </form>
      <ul className="grid content-start gap-3 text-[14px] leading-relaxed text-mute">
        <li><span className="font-semibold text-ink">Your follows everywhere.</span> Teams and players you star on this device sync to every device you sign in on.</li>
        <li><span className="font-semibold text-ink">Pick&apos;em.</span> Pick winners from any game&apos;s details before tip-off, then see how you did next to the model.</li>
        <li><span className="font-semibold text-ink">Pro alerts.</span> Tip-off, close-game and final alerts for your teams. <Link href="/pro/" className="underline hover:text-ink">See Pro</Link></li>
      </ul>
    </div>
  );
}

function SignedIn({ me, health, refresh }: { me: Me; health: Health; refresh: () => void }) {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("upgraded")) {
      setNotice("Welcome to Pro. It can take a few seconds for your plan to update.");
      url.searchParams.delete("upgraded"); history.replaceState(history.state, "", url.href);
      const t = setTimeout(refresh, 4000); return () => clearTimeout(t);
    }
  }, [refresh]);
  const pro = me.plan === "pro";
  const follows = me.follows.teams.length + me.follows.players.length;
  return (
    <div className="grid max-w-3xl gap-4">
      {notice && <p role="status" className="deck-flat px-4 py-3 text-[14px]">{notice}</p>}
      <section className="deck flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-[15px] font-semibold">{me.user.email}</p>
          <p className="text-[13px] text-mute">{follows} follow{follows === 1 ? "" : "s"} synced · <Link href="/following/" className="underline hover:text-ink">Following</Link></p>
        </div>
        <button className="btn" onClick={() => signOut()}><LogOut size={15} aria-hidden /> Sign out</button>
      </section>

      <section className="deck grid gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="h-section">Plan</h2>
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${pro ? "bg-off text-[#1a0a00]" : "bg-deck2 text-mute"}`}>{pro ? "Pro" : "Free"}</span>
        </div>
        {pro ? (
          <p className="text-[14px] text-mute">
            {me.status === "past_due" ? "Your last payment didn't go through — update your card to keep Pro." : me.periodEnd ? `Renews ${new Date(me.periodEnd).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.` : "Thanks for supporting D1 Hoops."}
          </p>
        ) : (
          <p className="text-[14px] text-mute">Pro adds live alerts for your teams. <Link href="/pro/" className="underline hover:text-ink">What&apos;s in Pro</Link></p>
        )}
        <div className="flex flex-wrap gap-2">
          {!pro && health.billing && health.prices.monthly && <button className="btn btn-primary" onClick={() => startCheckout("month").catch(e => setNotice(e.message))}>Get Pro · {PRICES.month}</button>}
          {!pro && health.billing && health.prices.yearly && <button className="btn" onClick={() => startCheckout("year").catch(e => setNotice(e.message))}>Yearly · {PRICES.year}</button>}
          {me.billingPortal && <button className="btn" onClick={() => openBillingPortal().catch(e => setNotice(e.message))}><CreditCard size={15} aria-hidden /> Manage billing</button>}
        </div>
      </section>

      {health.alerts && <AlertsPanel pro={pro} />}
    </div>
  );
}

function AlertsPanel({ pro }: { pro: boolean }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<AlertPrefs>({ tipoff: true, close: true, final: true });
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => { currentPushSubscription().then(s => setOn(!!s)); }, []);
  const toggle = async () => {
    setBusy(true); setError(null);
    try { if (on) { await disableAlerts(); setOn(false); } else { await enableAlerts(prefs); setOn(true); } }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const save = async (next: AlertPrefs) => { setPrefs(next); if (on) await enableAlerts(next).catch(e => setError(e.message)); };
  return (
    <section className="deck grid gap-3 p-5">
      <h2 className="h-section">Alerts on this device</h2>
      {!pro ? (
        <p className="text-[14px] text-mute">Alerts for the teams you follow come with <Link href="/pro/" className="underline hover:text-ink">Pro</Link>.</p>
      ) : !pushSupported() ? (
        <p className="text-[14px] text-mute">This browser can&apos;t receive alerts. On iPhone, tap Share → Add to Home Screen, then open D1 Hoops from there.</p>
      ) : (
        <>
          <fieldset className="grid gap-2 text-[14px]">
            <legend className="sr-only">Alert types</legend>
            {([["tipoff", "Tip-off"], ["close", "Close game in the final 4 minutes"], ["final", "Final score"]] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={prefs[k]} onChange={e => save({ ...prefs, [k]: e.target.checked })} className="h-4 w-4 accent-[var(--off)]" /> {label}
              </label>
            ))}
          </fieldset>
          {error && <p role="alert" className="text-[13px] text-loss">{error}</p>}
          <div><button className={`btn ${on ? "" : "btn-primary"}`} disabled={busy || on === null} onClick={toggle}>
            {on ? <><BellOff size={15} aria-hidden /> Turn off alerts</> : <><Bell size={15} aria-hidden /> Turn on alerts</>}
          </button></div>
        </>
      )}
    </section>
  );
}
