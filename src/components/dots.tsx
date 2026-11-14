// Scoreboard-bulb numerals (Doto). Reserved for ranks and scores so the accent keeps one meaning.
export function Dots({ children, glow = false, dim = false, ghost = false, className = "", title }: { children: React.ReactNode; glow?: boolean; dim?: boolean; ghost?: boolean; className?: string; title?: string }) {
  const lit = <span title={title} className={`dots leading-none ${glow ? "dots-glow" : ""} ${dim ? "dots-off" : ""} ${ghost ? "" : className}`}>{children}</span>;
  if (!ghost) return lit;
  // Unlit bulbs behind the number, like a real scoreboard ("88" under "12").
  const len = String(typeof children === "string" || typeof children === "number" ? children : "").length || 2;
  return (
    <span className={`relative inline-block leading-none ${className}`}>
      <span aria-hidden className="dots dots-unlit absolute inset-0 text-right leading-none">{"8".repeat(len)}</span>
      <span className="relative">{lit}</span>
    </span>
  );
}

/** Rank on a dark scoreboard plate, e.g. the team hero and player rating card. */
export function RankPlate({ rank, caption, size = 56 }: { rank: number | null; caption: string; size?: number }) {
  return (
    <div className="plate flex shrink-0 flex-col items-center px-3.5 pb-1.5 pt-2">
      <Dots glow className="font-black" ><span style={{ fontSize: size, lineHeight: 1 }}>{rank ?? "—"}</span></Dots>
      <span className="mt-0.5 text-[11px] font-semibold text-dim">{caption}</span>
    </div>
  );
}
