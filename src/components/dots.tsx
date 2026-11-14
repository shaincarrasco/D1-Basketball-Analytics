// Scoreboard-bulb numerals (Doto). Reserved for ranks and scores so the accent keeps one meaning.
export function Dots({ children, glow = false, dim = false, className = "", title }: { children: React.ReactNode; glow?: boolean; dim?: boolean; className?: string; title?: string }) {
  return <span title={title} className={`dots leading-none ${glow ? "dots-glow" : ""} ${dim ? "dots-off" : ""} ${className}`}>{children}</span>;
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
