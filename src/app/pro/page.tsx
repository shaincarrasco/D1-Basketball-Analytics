import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import ProClient from "./pro-client";

export const metadata: Metadata = { title: "Pro", description: "D1 Hoops Pro: live tip-off, close-game and final alerts for the teams you follow." };

const FREE = [
  "DHR ratings, rankings and season simulations",
  "Every game: projections, live scores, win probability, box scores",
  "Player ratings, game logs and shot charts",
  "News, injuries and where to watch",
  "Synced follows and pick'em with a free account",
];
const PRO = [
  "Tip-off alerts for every team you follow",
  "Close-game alerts in the final four minutes",
  "Final scores the moment games end",
  "Choose which alerts you get, per device",
];

export default function ProPage() {
  return (
    <>
      <PageHeader title="D1 Hoops Pro">The site stays free. Pro tells you when your teams need you.</PageHeader>
      <div className="grid max-w-4xl gap-4 md:grid-cols-2">
        <section className="deck p-5">
          <h2 className="h-section">Free</h2>
          <p className="mt-1 text-[13px] text-mute">No account needed for most of it.</p>
          <ul className="mt-4 grid gap-2 text-[14px]">{FREE.map(f => <li key={f} className="flex gap-2"><span aria-hidden className="text-dim">–</span>{f}</li>)}</ul>
        </section>
        <section className="deck p-5 ring-1 ring-off/60">
          <h2 className="h-section">Pro</h2>
          <p className="mt-1 text-[13px] text-mute">Everything in Free, plus:</p>
          <ul className="mt-4 grid gap-2 text-[14px]">{PRO.map(f => <li key={f} className="flex gap-2"><span aria-hidden className="text-off">+</span>{f}</li>)}</ul>
          <ProClient />
        </section>
      </div>
      <p className="mt-5 max-w-2xl text-[13px] leading-relaxed text-mute">Cancel any time from your account; Pro stays on until the end of the period you paid for. Payments are handled by Stripe — we never see your card.</p>
    </>
  );
}
