// Status pill for an absence: colour carries severity, the text always says it in words.
import type { InjuryConfidence, InjuryState } from "@/lib/types";
import { CONFIDENCE_HELP, CONFIDENCE_LABEL, STATE_TONE } from "@/lib/injuries";

const TONE = {
  loss: "border-loss/40 bg-loss/15 text-loss",
  hot: "border-hot/40 bg-hot/15 text-hot",
  off: "border-off/40 bg-off/10 text-off",
  dim: "border-line2 bg-deck2 text-mute",
} as const;

export default function InjuryPill({ state, label, size = "md" }: { state: InjuryState; label: string; size?: "sm" | "md" }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold ${TONE[STATE_TONE[state]]} ${size === "sm" ? "px-2 py-px text-[11px]" : "px-2.5 py-0.5 text-[12.5px]"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

/** Small "Confirmed / Reported / Inferred" tag with a tooltip explaining what it means. */
export function ConfidenceTag({ value }: { value: InjuryConfidence }) {
  return (
    <span title={CONFIDENCE_HELP[value]} className={`whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide ${value === "confirmed" ? "text-win" : value === "reported" ? "text-ink" : "text-dim"}`}>
      {CONFIDENCE_LABEL[value]}
    </span>
  );
}
