"use client";
import Link from "next/link";
import { useState } from "react";
import { useAccount, startCheckout } from "@/lib/account";
import { PRICES } from "@/lib/pricing";

export default function ProClient() {
  const acct = useAccount();
  const [error, setError] = useState<string | null>(null);
  const go = (i: "month" | "year") => startCheckout(i).catch(e => setError(e.message));
  if (acct.status === "loading") return <div className="mt-5 h-9" />;
  if (acct.status === "unavailable" || !acct.health.billing) return <p className="mt-5 text-[13px] text-mute">Pro isn&apos;t on sale yet.</p>;
  if (acct.status === "signed-out") return <Link href="/account/" className="btn btn-primary mt-5">Sign in to get Pro</Link>;
  if (acct.me.plan === "pro") return <p className="mt-5 text-[14px] font-medium">You&apos;re on Pro. <Link href="/account/" className="underline">Manage alerts</Link></p>;
  return (
    <div className="mt-5 grid gap-2">
      <div className="flex flex-wrap gap-2">
        {acct.health.prices.monthly && <button className="btn btn-primary" onClick={() => go("month")}>Monthly · {PRICES.month}</button>}
        {acct.health.prices.yearly && <button className="btn" onClick={() => go("year")}>Yearly · {PRICES.year}</button>}
      </div>
      {error && <p role="alert" className="text-[13px] text-loss">{error}</p>}
    </div>
  );
}
