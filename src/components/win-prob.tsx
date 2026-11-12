// Split bar: left share = away win probability (cyan), right = home (orange).
import { pctFmt } from "@/lib/format";

export default function WinProb({ awayName, homeName, homeWP, compact = false }: { awayName: string; homeName: string; homeWP: number; compact?: boolean }) {
  const away = 1 - homeWP;
  return (
    <div aria-label={`Win probability: ${awayName} ${pctFmt(away)}, ${homeName} ${pctFmt(homeWP)}`}>
      {!compact && (
        <div className="mb-1 flex justify-between text-xs font-semibold tnum">
          <span className={away >= 0.5 ? "text-ink" : "text-mute"}>{pctFmt(away)}</span>
          <span className={homeWP > 0.5 ? "text-ink" : "text-mute"}>{pctFmt(homeWP)}</span>
        </div>
      )}
      <div className="flex h-1.5 overflow-hidden rounded-full bg-line">
        <div style={{ width: `${away * 100}%`, background: "var(--def)" }} />
        <div style={{ width: `${homeWP * 100}%`, background: "var(--off)" }} />
      </div>
    </div>
  );
}
