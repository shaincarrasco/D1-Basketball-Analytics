"use client";
// Play-by-play from ESPN's game summary, newest first, grouped by period.
// "Scoring plays" narrows to baskets and free throws; scoring plays show the score after them.
import { useMemo, useState } from "react";
import TeamLogo from "@sports/ui/team-logo";
import { teamHex } from "@sports/ui/color";
import type { Play } from "@/lib/live-game";
import type { GameSide } from "@/lib/types";

const PAGE = 40;
const periodName = (p: number) => (p <= 1 ? "1st half" : p === 2 ? "2nd half" : p === 3 ? "Overtime" : `${p - 2}${ordSuffix(p - 2)} overtime`);
const ordSuffix = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th");

export default function PlayByPlay({ plays, away, home, final }: { plays: Play[]; away: GameSide; home: GameSide; final: boolean }) {
  const [scoringOnly, setScoringOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const list = useMemo(() => {
    const rows = scoringOnly ? plays.filter(p => p.scoring) : plays;
    return [...rows].reverse();
  }, [plays, scoringOnly]);
  const shown = list.slice(0, limit);
  const nScoring = useMemo(() => plays.filter(p => p.scoring).length, [plays]);

  // Group consecutive plays by period (list is newest first, so periods come in descending order).
  const groups: { period: number; rows: Play[] }[] = [];
  for (const p of shown) {
    const last = groups[groups.length - 1];
    if (last && last.period === p.period) last.rows.push(p);
    else groups.push({ period: p.period, rows: [p] });
  }
  const sideOf = (s: Play["side"]) => (s === "home" ? home : s === "away" ? away : null);
  // Team colours mark each play, unless they're missing or too alike to tell apart; then the
  // sheet's own away (cyan) / home (orange) colours.
  const colors = useMemo(() => {
    const a = teamHex(away.color), h = teamHex(home.color);
    const rgb = (x: string) => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
    const far = a && h && Math.hypot(...rgb(a).map((v, i) => v - rgb(h)[i])) >= 100;
    return far ? { away: a!, home: h! } : { away: "var(--def)", home: "var(--off)" };
  }, [away.color, home.color]);
  const marker = (s: Play["side"]) => (s ? colors[s] : "transparent");
  const awayS = away.short ?? away.name, homeS = home.short ?? home.name;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filter plays">
        <button type="button" className="chip" aria-pressed={!scoringOnly} onClick={() => { setScoringOnly(false); setLimit(PAGE); }}>All plays <span className="text-[12px] opacity-70 tnum">{plays.length}</span></button>
        <button type="button" className="chip" aria-pressed={scoringOnly} onClick={() => { setScoringOnly(true); setLimit(PAGE); }}>Scoring plays <span className="text-[12px] opacity-70 tnum">{nScoring}</span></button>
        <span className="ml-auto text-[12px] text-mute">Newest first · score shown {awayS}–{homeS}</span>
      </div>
      {!list.length ? <p className="text-sm text-mute">{scoringOnly ? "No points yet." : "No plays yet."}</p> : (
        <ol className="flex flex-col gap-4" data-testid="pbp-list">
          {groups.map((grp, gi) => (
            <li key={`${grp.period}-${gi}`}>
              <h4 className="mb-1 border-b border-line pb-1 text-[12px] font-semibold uppercase tracking-wide text-dim">{periodName(grp.period)}</h4>
              <ol>
                {grp.rows.map(p => {
                  const s = sideOf(p.side);
                  return (
                    <li key={p.id} data-testid="pbp-row" data-scoring={p.scoring ? "1" : "0"}
                      className="grid grid-cols-[3.1rem_auto_1fr_auto] items-start gap-x-2.5 border-b border-line/60 py-2 text-[13.5px] last:border-0">
                      <span className="pt-px text-[12px] text-mute tnum">{p.clock}</span>
                      <span className="flex items-center gap-1.5 pt-0.5">
                        <i className="block h-4 w-1 rounded-full" style={{ background: marker(p.side), boxShadow: p.side ? "0 0 0 1px rgb(var(--ink-rgb) / 0.12)" : undefined }} aria-hidden />
                        {s ? <TeamLogo src={s.logo} name={s.name} size={16} /> : <span className="inline-block w-4" aria-hidden />}
                      </span>
                      <span className={p.scoring ? "font-semibold text-ink" : "text-mute"}>
                        {s && <span className="sr-only">{s.name}: </span>}{p.text}
                      </span>
                      {p.scoring ? (
                        <span className="text-right text-[13px] tnum" aria-label={`Score ${awayS} ${p.away}, ${homeS} ${p.home}`}>
                          <b className={p.side === "away" ? "text-ink" : "font-normal text-mute"}>{p.away}</b>
                          <span className="text-dim">–</span>
                          <b className={p.side === "home" ? "text-ink" : "font-normal text-mute"}>{p.home}</b>
                        </span>
                      ) : <span />}
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
      {list.length > limit && (
        <button type="button" className="btn mt-3 w-full" onClick={() => setLimit(l => l + 80)}>
          Show {Math.min(80, list.length - limit)} earlier plays
        </button>
      )}
      {final && list.length > 0 && <p className="mt-2 text-[11.5px] text-dim">Full play-by-play from ESPN.</p>}
    </div>
  );
}
