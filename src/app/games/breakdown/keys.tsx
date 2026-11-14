"use client";
// Keys to the game: 2–4 plain-words keys from the biggest rank mismatches. Never padded.
import { KEY_MAX_STRONG, KEY_MIN_GAP, keysToGame } from "@/lib/breakdown";
import type { TeamSummary } from "@/lib/types";

export default function Keys({ a, b, aColor, bColor, compact = false }: { a: TeamSummary; b: TeamSummary; aColor: string; bColor: string; compact?: boolean }) {
  const keys = keysToGame(a, b);
  return (
    <div data-testid="keys">
      {keys.length === 0 ? (
        <p className="text-sm text-mute">No big statistical mismatches: neither team&apos;s shooting, turnover, rebounding, free-throw or tempo profile is far ahead of what the other allows. This one should come down to execution.</p>
      ) : (
        <ul className={`flex flex-col ${compact ? "gap-2" : "gap-2.5"}`}>
          {keys.map((k, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-snug">
              <i className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: k.team === "a" ? aColor : bColor }} aria-hidden />
              <span><span className="sr-only">{k.team === "a" ? a.name : b.name}: </span>{k.text}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[12px] text-dim">
        From national ranks {keys.length ? `at least ${KEY_MIN_GAP} places apart, with the stronger side in the top ${KEY_MAX_STRONG}` : `(a key needs ranks at least ${KEY_MIN_GAP} places apart)`}. Season stats after {Math.min(a.ratedGames, b.ratedGames) < 5 ? "only a few games" : "the games so far"}, so early-season ranks can swing.
      </p>
    </div>
  );
}
