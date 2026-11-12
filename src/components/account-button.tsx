"use client";
// Header account link, shown only when this deployment has accounts. Also keeps follows in sync.
import Link from "next/link";
import { useEffect, useRef } from "react";
import { UserRound } from "lucide-react";
import { useAccount, pushFollows, syncFollows } from "@/lib/account";

export default function AccountButton() {
  const acct = useAccount();
  const signedIn = acct.status === "signed-in";
  const merged = useRef(false);
  useEffect(() => {
    if (acct.status !== "signed-in") { merged.current = false; return; }
    if (!merged.current) { merged.current = true; syncFollows(acct.me.follows); }
    let t: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => { clearTimeout(t); t = setTimeout(() => pushFollows(), 800); };
    window.addEventListener("d1h-favorites-change", onChange);
    return () => { clearTimeout(t); window.removeEventListener("d1h-favorites-change", onChange); };
  }, [acct]);
  if (acct.status === "loading" || acct.status === "unavailable") return null;
  return (
    <Link href="/account/" className="btn !p-2" aria-label={signedIn ? "Your account" : "Sign in"} title={signedIn ? (acct.me.plan === "pro" ? "Account · Pro" : "Account") : "Sign in"}>
      <UserRound size={17} aria-hidden className={signedIn && acct.me.plan === "pro" ? "text-off" : undefined} />
    </Link>
  );
}
