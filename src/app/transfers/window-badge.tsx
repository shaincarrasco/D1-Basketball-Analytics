"use client";
// "Opens in 143 days" / "Open: 5 days left" / "Closed", worked out in the reader's browser
// (the page is static, so a build-time countdown would go stale).
import { useEffect, useState } from "react";
import { etToday } from "@sports/ui/format";
import { windowPhase } from "@/lib/portal";

export default function WindowBadge({ opens, closes }: { opens: string; closes: string }) {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(etToday()), []);
  if (!today) return <span className="chip invisible" aria-hidden>…</span>;
  const { phase, days } = windowPhase({ opens, closes }, today);
  const text = phase === "before" ? `Opens in ${days} day${days === 1 ? "" : "s"}` : phase === "open" ? `Open now · ${days} day${days === 1 ? "" : "s"} left` : "Window closed";
  return (
    <span className="chip" style={phase === "open" ? { borderColor: "var(--win)", color: "var(--win)" } : undefined}>
      {phase === "open" && <span className="live-dot" style={{ background: "var(--win)" }} aria-hidden />}
      {text}
    </span>
  );
}
