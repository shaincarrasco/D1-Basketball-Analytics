"use client";
// The one switch for projections (win chances, margins, projected scores and records), plus
// wrappers that show their children only when it's on or off, for server-rendered pages.
// Nothing forecast appears on a game until the reader presses this.
import type { ReactNode } from "react";
import { setShowProjections, useShowProjections } from "@/lib/show-projections";

export default function ProjectionToggle({ className = "" }: { className?: string }) {
  const on = useShowProjections();
  // A switch, not a filter: when on it is outlined in the accent, so it never reads as one more
  // selected filter chip beside it.
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => setShowProjections(!on)} data-testid="projection-toggle"
      className={`chip ${on ? "!border-bulb !text-bulb-ink" : ""} ${className}`}
      title={on ? "Hide win chances, margins and projected scores" : "Show win chances, margins and projected scores"}>
      <span aria-hidden className={`relative h-[14px] w-[24px] shrink-0 rounded-full transition-colors ${on ? "bg-bulb" : "bg-line2"}`}>
        <span className={`absolute top-[2px] h-[10px] w-[10px] rounded-full bg-[var(--bg)] transition-[left] ${on ? "left-[12px]" : "left-[2px]"}`} />
      </span>
      Projections
    </button>
  );
}

export function IfProjections({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return useShowProjections() ? <>{children}</> : <>{fallback}</>;
}
