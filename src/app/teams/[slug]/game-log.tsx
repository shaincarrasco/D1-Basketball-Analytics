"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import TeamLogo from "@/components/team-logo";
import { fmt, pctFmt, signed, timeLabel } from "@/lib/format";
import type { TeamGame } from "@/lib/types";

// The quadrant filter lives in the URL hash (#schedule-q1 … #schedule-q4) so the résumé
// card and the Quad column can link to it.
const subscribe = (cb: () => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };
const readHash = () => window.location.hash;
const gameHref = (g: TeamGame) => `/games/?d=${g.day}&g=${g.id}`;
const lineText = (v: number) => (v === 0 ? "PK" : signed(v, 1));

export default function GameLog({ games, logos }: { games: TeamGame[]; logos: Record<string, string | null> }) {
  const router = useRouter();
  const [show, setShow] = useState<"all" | "results" | "upcoming">("all");
  const hash = useSyncExternalStore(subscribe, readHash, () => "");
  const quad = Number(hash.match(/^#schedule-q([1-4])$/)?.[1] ?? 0) || null;
  useEffect(() => { if (quad) document.getElementById("schedule")?.scrollIntoView({ block: "start" }); }, [quad]);
  const clearQuad = () => { history.replaceState(null, "", window.location.pathname + window.location.search); window.dispatchEvent(new HashChangeEvent("hashchange")); };

  const list = games.filter(g => (show === "all" || (show === "results" ? g.result : !g.result)) && (!quad || g.quad === quad));
  const hasLines = games.some(g => g.line !== undefined);
  const qGames = quad ? games.filter(g => g.quad === quad && g.result) : [];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter games">
        {(["all", "results", "upcoming"] as const).map(s => (
          <button key={s} type="button" className="chip" aria-pressed={show === s} onClick={() => setShow(s)}>
            {s === "all" ? `All ${games.length}` : s === "results" ? `Results ${games.filter(g => g.result).length}` : `Upcoming ${games.filter(g => !g.result).length}`}
          </button>
        ))}
        {quad && (
          <button type="button" className="chip" aria-pressed="true" onClick={clearQuad} aria-label={`Clear quadrant ${quad} filter`}>
            Quadrant {quad} · {qGames.filter(g => g.result === "W").length}–{qGames.filter(g => g.result === "L").length}
            <X size={13} aria-hidden />
          </button>
        )}
      </div>
      <div className="scroll-x rounded-xl border border-line">
        <table className="dt">
          <caption className="sr-only">Schedule and results</caption>
          <thead>
            <tr>
              <th className="l">Date</th><th className="l">Opponent</th><th className="l">Result</th>
              <th title="Pregame win probability (uses only games before that date)">Win prob</th>
              <th title="Pregame projected score">Projected</th>
              {hasLines && <th title="Pregame spread ESPN showed (DraftKings), this team's side: negative = favored">Line</th>}
              {hasLines && <th title="Result against the spread">ATS</th>}
              <th title="Opponent- and venue-adjusted efficiency margin for the game">Perf</th>
              <th className="grp-off" title="Points per 100 possessions">Off eff</th>
              <th className="grp-def" title="Points allowed per 100 possessions">Def eff</th>
              <th>Poss</th><th title="DHR quadrant (unofficial). Click to filter.">Quad</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={12} className="l py-6 text-center text-mute">No games match this filter.</td></tr>
            )}
            {list.map(g => {
              const upset = g.result && g.wp !== null && ((g.result === "W" && g.wp < 0.35) || (g.result === "L" && g.wp > 0.65));
              return (
                <tr key={g.id} className="cursor-pointer"
                  onClick={e => { if (!(e.target as HTMLElement).closest("a,button")) router.push(gameHref(g)); }}>
                  <td className="l text-mute">
                    <Link className="link" href={gameHref(g)}>{new Date(`${g.day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</Link>
                  </td>
                  <td className="l">
                    <span className="flex items-center gap-2">
                      <span className="w-5 text-xs text-mute">{g.venue === "A" ? "at" : g.venue === "N" ? "vs·n" : "vs"}</span>
                      {g.oppSlug ? (
                        <Link className="link flex items-center gap-2 font-semibold" href={`/teams/${g.oppSlug}/`}>
                          <TeamLogo src={logos[g.oppSlug] ?? null} name={g.opp} size={20} />
                          {g.oppRank ? <span className="text-xs font-normal text-mute" title="DHR rank">{g.oppRank}</span> : null}
                          {g.opp}
                        </Link>
                      ) : (
                        <span className="flex items-center gap-2 text-mute"><TeamLogo src={null} name={g.opp} size={20} />{g.opp} <span className="text-[10px]">non-D-I</span></span>
                      )}
                      {g.conf && <span className="rounded bg-deck2 px-1.5 text-[10px] text-mute">conf</span>}
                    </span>
                  </td>
                  <td className="l">
                    {g.result ? (
                      <Link href={gameHref(g)} className="link font-semibold">
                        <span className={g.result === "W" ? "text-win" : "text-loss"}>{g.result}</span> {g.pts}–{g.oppPts}
                        {upset && <span className="ml-2 rounded bg-hot/15 px-1.5 text-[10px] font-bold text-hot">upset</span>}
                      </Link>
                    ) : g.status === "postponed" || g.status === "cancelled" ? <span className="text-mute capitalize">{g.status}</span> : g.status === "in_progress" ? <Link href={gameHref(g)} className="flex items-center gap-2 text-hot"><span className="live-dot" />In progress</Link> : <span className="text-dim">{timeLabel(g.date)}</span>}
                  </td>
                  <td style={{ color: g.wp === null ? undefined : g.wp >= 0.5 ? "var(--ink)" : "var(--mute)" }}>{pctFmt(g.wp)}</td>
                  <td className="text-mute">{g.projPts !== null ? `${fmt(g.projPts, 0)}–${fmt(g.projOppPts, 0)}` : "—"}</td>
                  {hasLines && <td className="text-mute">{g.line !== undefined ? lineText(g.line) : "—"}</td>}
                  {hasLines && (
                    <td>{g.ats ? <b className={`font-semibold ${g.ats === "W" ? "text-win" : g.ats === "L" ? "text-loss" : "text-mute"}`} title={g.ats === "W" ? "Covered" : g.ats === "L" ? "Did not cover" : "Push"}>{g.ats}</b> : <span className="text-dim">—</span>}</td>
                  )}
                  <td style={{ color: g.perf === null ? undefined : g.perf >= 0 ? "var(--win)" : "var(--loss)" }}>{signed(g.perf, 1)}</td>
                  <td>{fmt(g.offEff)}</td>
                  <td>{fmt(g.defEff)}</td>
                  <td className="text-mute">{fmt(g.pace, 0)}</td>
                  <td className="text-mute">{g.quad ? <a className="link" href={`#schedule-q${g.quad}`} title={`Show quadrant ${g.quad} games`}>Q{g.quad}</a> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
