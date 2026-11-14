"use client";
// The one switch for projected scores, plus a wrapper that shows its children only when it's on
// (for server-rendered pages like the team page).
import type { ReactNode } from "react";
import { setShowProjections, useShowProjections } from "@/lib/show-projections";

export default function ProjectionToggle({ className = "" }: { className?: string }) {
  const on = useShowProjections();
  return (
    <button type="button" className={`chip ${className}`} aria-pressed={on} onClick={() => setShowProjections(!on)}
      title={on ? "Hide projected scores on games that haven't finished" : "Show DHR's projected score for games that haven't finished"}>
      {on ? "Hide projected scores" : "Show projected scores"}
    </button>
  );
}

export function IfProjections({ children }: { children: ReactNode }) {
  return useShowProjections() ? <>{children}</> : null;
}
