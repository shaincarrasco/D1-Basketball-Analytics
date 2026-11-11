"use client";
import Link from "next/link";
import { useState } from "react";
import TeamLogo from "@/components/team-logo";
import { fmt, pctFmt, signed, timeLabel } from "@/lib/format";
import type { TeamGame } from "@/lib/types";

export default function GameLog({ games, logos }: { games: TeamGame[]; logos: Record<string, string | null> }) {
  const [show, setShow] = useState<"all" | "results" | "upcoming">("all");
  const list = games.filter(g => show === "all" || (show === "results" ? g.result : !g.result));
  return (
    <div>
      <div className="mb-3 flex gap-1.5" role="group" aria-label="Filter games">
        {(["all", "results", "upcoming"] as const).map(s => (
          <button key={s} className="chip" aria-pressed={show === s} onClick={() => setShow(s)}>
            {s === "all" ? `All ${games.length}` : s === "results" ? `Results ${games.filter(g => g.result).length}` : `Upcoming ${games.filter(g => !g.result).length}`}
          </button>
        ))}
      </div>
      <div className="scroll-x rounded-xl border border-line">
        <table className="dt">
          <caption className="sr-only">Schedule and results</caption>
          <thead>
            <tr>
              <th className="l">Date</th><th className="l">Opponent</th><th className="l">Result</th>
              <th title="Pregame win probability (uses only games before that date)">Win prob</th>
              <th title="Pregame projected score">Projected</th>
              <th title="Opponent- and venue-adjusted efficiency margin for the game">Perf</th>
              <th className="grp-off" title="Points per 100 possessions">Off eff</th>
              <th className="grp-def" title="Points allowed per 100 possessions">Def eff</th>
              <th>Poss</th><th title="DHR quadrant (unofficial)">Quad</th>
            </tr>
          </thead>
          <tbody>
            {list.map(g => {
              const upset = g.result && g.wp !== null && ((g.result === "W" && g.wp < 0.35) || (g.result === "L" && g.wp > 0.65));
              return (
                <tr key={g.id}>
                  <td className="l text-mute">
                    <Link className="link" href={`/games/?d=${g.day}&g=${g.id}`}>{new Date(`${g.day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</Link>
                  </td>
                  <td className="l">
                    <span className="flex items-center gap-2">
                      <span className="w-5 text-xs text-mute">{g.venue === "A" ? "at" : g.venue === "N" ? "vs·n" : "vs"}</span>
                      {g.oppSlug ? <TeamLogo src={logos[g.oppSlug] ?? null} name={g.opp} size={20} /> : <TeamLogo src={null} name={g.opp} size={20} />}
                      {g.oppRank ? <span className="text-xs text-mute">{g.oppRank}</span> : null}
                      {g.oppSlug ? <Link className="link font-semibold" href={`/teams/${g.oppSlug}/`}>{g.opp}</Link> : <span className="text-mute">{g.opp} <span className="text-[10px]">non-D-I</span></span>}
                      {g.conf && <span className="rounded bg-deck2 px-1.5 text-[10px] text-mute">conf</span>}
                    </span>
                  </td>
                  <td className="l">
                    {g.result ? (
                      <span className="font-semibold">
                        <span className={g.result === "W" ? "text-win" : "text-loss"}>{g.result}</span> {g.pts}–{g.oppPts}
                        {upset && <span className="ml-2 rounded bg-hot/15 px-1.5 text-[10px] font-bold text-hot">upset</span>}
                      </span>
                    ) : g.status === "postponed" || g.status === "cancelled" ? <span className="text-mute capitalize">{g.status}</span> : g.status === "in_progress" ? <span className="flex items-center gap-2 text-hot"><span className="live-dot" />In progress</span> : <span className="text-dim">{timeLabel(g.date)}</span>}
                  </td>
                  <td style={{ color: g.wp === null ? undefined : g.wp >= 0.5 ? "var(--ink)" : "var(--mute)" }}>{pctFmt(g.wp)}</td>
                  <td className="text-mute">{g.projPts !== null ? `${fmt(g.projPts, 0)}–${fmt(g.projOppPts, 0)}` : "—"}</td>
                  <td style={{ color: g.perf === null ? undefined : g.perf >= 0 ? "var(--win)" : "var(--loss)" }}>{signed(g.perf, 1)}</td>
                  <td>{fmt(g.offEff)}</td>
                  <td>{fmt(g.defEff)}</td>
                  <td className="text-mute">{fmt(g.pace, 0)}</td>
                  <td className="text-mute">{g.quad ? `Q${g.quad}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
