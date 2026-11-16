"use client";
// First-visit explainer on the home page: what DHR means and where projections live.
// The card is in the static HTML; DHR_INTRO_SCRIPT (in <head>) hides it before first paint once
// dismissed, so it never flashes for returning readers and never shifts the page for new ones.
import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { DHR_INTRO_KEY as KEY } from "./dhr-intro-script";

export default function DhrIntro() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const dismiss = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* storage unavailable: hide for this visit only */ }
    document.documentElement.dataset.dhrIntro = "off";
    setHidden(true);
  };
  return (
    <aside aria-labelledby="dhr-intro-h" className="dhr-intro deck-flat relative px-4 py-3.5 pr-12 text-[14px] leading-snug sm:px-5">
      <h2 id="dhr-intro-h" className="font-display text-[19px] font-extrabold leading-tight">New here? DHR in 10 seconds</h2>
      <p className="mt-1.5 text-mute">
        <b className="text-ink">DHR</b> is our team rating: how many points per 100 possessions a team is better than an average D-I team, adjusted for opponent and venue. Rankings and the small number beside a team come from it, not the AP poll.
      </p>
      <p className="mt-1 text-mute">
        Scores here are always real. Projections stay hidden until you turn them on.{" "}
        <Link href="/methodology/#overview" className="font-semibold text-bulb-ink hover:underline">How it works</Link>
      </p>
      <button type="button" onClick={dismiss} className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full text-mute hover:bg-deck2 hover:text-ink" aria-label="Dismiss the DHR explainer">
        <X size={17} aria-hidden />
      </button>
    </aside>
  );
}
