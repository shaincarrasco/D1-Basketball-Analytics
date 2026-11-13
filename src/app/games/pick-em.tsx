"use client";
// Pick a winner before tip-off; after the final, show how the pick (and the model) did.
import Link from "next/link";
import { useState } from "react";
import { Check, X } from "lucide-react";
import type { Game } from "@/lib/types";
import { usePicks, makePick } from "@/lib/picks";
import { isFinal, winner } from "./game-utils";

export default function PickEm({ g, started }: { g: Game; started: boolean }) {
  const picks = usePicks();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!g.espnId || picks === undefined) return null;
  if (picks === null) {
    if (started) return null;
    return <p className="mt-5 text-center text-[13px] text-mute"><Link href="/account/" className="font-medium text-ink underline">Sign in</Link> to pick this game.</p>;
  }
  const mine = picks[g.espnId];
  const nameOf = (s: "home" | "away") => g[s].name;
  const w = winner(g);
  const modelPick = g.pred ? (g.pred.wp >= 0.5 ? "home" : "away") : null;

  if (isFinal(g) && w) {
    return (
      <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[13px]">
        {mine && <span className="flex items-center gap-1">{mine === w ? <Check size={15} className="text-win" aria-label="Correct" /> : <X size={15} className="text-loss" aria-label="Wrong" />} You picked {nameOf(mine)}</span>}
        {modelPick && <span className="flex items-center gap-1 text-mute">{modelPick === w ? <Check size={15} className="text-win" aria-label="Correct" /> : <X size={15} className="text-loss" aria-label="Wrong" />} Model picked {nameOf(modelPick)}</span>}
      </div>
    );
  }
  if (started) return mine ? <p className="mt-5 text-center text-[13px] text-mute">Your pick: <span className="font-semibold text-ink">{nameOf(mine)}</span></p> : null;

  const choose = async (side: "home" | "away") => {
    setBusy(true); setError(null);
    try { await makePick(g.espnId!, side); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mt-5 grid justify-items-center gap-2">
      <span className="text-[12.5px] font-medium text-mute">Your pick · locks at tip-off</span>
      <div className="inline-flex" role="group" aria-label="Pick a winner">
        {(["away", "home"] as const).map((s, i) => (
          <button key={s} type="button" disabled={busy} aria-pressed={mine === s} onClick={() => choose(s)}
            className={`btn ${i === 0 ? "rounded-r-none" : "rounded-l-none border-l-0"} ${mine === s ? "btn-primary" : ""}`}>
            {nameOf(s)}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-[12.5px] text-loss">{error}</p>}
    </div>
  );
}
