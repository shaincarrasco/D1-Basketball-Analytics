"use client";
// Tale of the tape for one game: each team's national ranks, and each offense against the other's
// defense with an edge mark where the gap is real. Season stats, not opponent-adjusted (except AdjO/AdjD/tempo).
import { Fragment } from "react";
import { TAPE_FACTORS } from "@/lib/breakdown";
import { fmt, heat, ordinal, signed } from "@/lib/format";
import type { TeamSummary } from "@/lib/types";

type Cell = { v: string; r: number | null };
type Row = { label: string; hint: string; a: Cell; b: Cell; edge: "a" | "b" | null };

/** Lower rank = better for that side of the ball. Close ranks (under 8% of D-I apart) get no mark. */
const edgeOf = (ra: number | null, rb: number | null, total: number, style = false): "a" | "b" | null =>
  style || !ra || !rb || Math.abs(ra - rb) < total * 0.08 ? null : ra < rb ? "a" : "b";

function Rank({ r, total }: { r: number | null; total: number }) {
  if (!r) return null;
  return <span className="ml-1.5 inline-block min-w-[2.6rem] rounded px-1 text-center text-[11px] text-mute tnum" style={{ background: heat(r, total) }} title={`National rank, of ${total}`}>{ordinal(r)}</span>;
}

export default function Tape({ a, b, aColor, bColor, total }: { a: TeamSummary; b: TeamSummary; aColor: string; bColor: string; total: number }) {
  const pct = (v: number | null | undefined) => (v == null ? "—" : `${fmt(v)}%`);
  const top: Row[] = [
    { label: "DHR (AdjEM)", hint: "Points per 100 possessions better than an average D-I team", a: { v: signed(a.adjEM), r: a.rank }, b: { v: signed(b.adjEM), r: b.rank }, edge: edgeOf(a.rank, b.rank, total) },
    { label: "Adj. offense", hint: "Points scored per 100 possessions vs an average defense", a: { v: fmt(a.adjO), r: a.adjORank }, b: { v: fmt(b.adjO), r: b.adjORank }, edge: edgeOf(a.adjORank, b.adjORank, total) },
    { label: "Adj. defense", hint: "Points allowed per 100 possessions vs an average offense (lower is better)", a: { v: fmt(a.adjD), r: a.adjDRank }, b: { v: fmt(b.adjD), r: b.adjDRank }, edge: edgeOf(a.adjDRank, b.adjDRank, total) },
    { label: "Tempo", hint: "Adjusted possessions per 40 minutes (1st = fastest). Style, not quality", a: { v: fmt(a.adjT), r: a.adjTRank }, b: { v: fmt(b.adjT), r: b.adjTRank }, edge: null },
  ];
  // When X has the ball: X's offense (its column) vs the other's defense (its column).
  const clash = (off: TeamSummary, def: TeamSummary, offIsA: boolean): Row[] => TAPE_FACTORS.map(f => {
    const o: Cell = { v: pct(off.off?.[f.k]), r: off.offRanks?.[f.k] ?? null };
    const d: Cell = { v: pct(def.def?.[f.k]), r: def.defRanks?.[f.k] ?? null };
    const e = edgeOf(o.r, d.r, total, f.style); // "a" = the offense ranks better, "b" = the defense does
    const edge = e === null ? null : offIsA ? e : e === "a" ? "b" : "a"; // → column
    return { label: f.label, hint: f.hint, a: offIsA ? o : d, b: offIsA ? d : o, edge };
  });
  const groups: { title: string; rows: Row[] }[] = [
    { title: "Ratings", rows: top },
    { title: `When ${a.short} has the ball`, rows: clash(a, b, true) },
    { title: `When ${b.short} has the ball`, rows: clash(b, a, false) },
  ];
  const mark = (c: string, label: string) => <i className="inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: c }} aria-label={label} role="img" />;
  return (
    <div data-testid="tape">
      <div className="scroll-x">
        <table className="w-full min-w-[330px] border-collapse text-sm">
          <caption className="sr-only">Tale of the tape: {a.name} vs {b.name}</caption>
          <thead>
            <tr className="border-b border-line2 text-xs">
              <th scope="col" className="w-[38%] px-2 py-2 text-right font-semibold" style={{ color: aColor }}>{a.short}</th>
              <th scope="col" className="px-1 py-2 text-center font-semibold text-mute">Stat</th>
              <th scope="col" className="w-[38%] px-2 py-2 text-left font-semibold" style={{ color: bColor }}>{b.short}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <Fragment key={g.title}>
                <tr><th colSpan={3} scope="colgroup" className="px-2 pb-1 pt-3 text-left text-[11.5px] font-semibold uppercase tracking-wide text-dim">{g.title}</th></tr>
                {g.rows.map(r => (
                  <tr key={g.title + r.label} className="border-b border-line last:border-0">
                    <td className={`px-2 py-1.5 text-right tnum ${r.edge === "b" ? "text-mute" : ""}`}>
                      {r.edge === "a" && <span className="mr-1.5">{mark(aColor, `Edge ${a.short}`)}</span>}
                      <span className={r.edge === "a" ? "font-bold text-ink" : ""}>{r.a.v}</span><Rank r={r.a.r} total={total} />
                    </td>
                    <th scope="row" className="px-1 py-1.5 text-center text-[12px] font-normal text-mute" title={r.hint}>{r.label}</th>
                    <td className={`px-2 py-1.5 text-left tnum ${r.edge === "a" ? "text-mute" : ""}`}>
                      <span className={r.edge === "b" ? "font-bold text-ink" : ""}>{r.b.v}</span><Rank r={r.b.r} total={total} />
                      {r.edge === "b" && <span className="ml-1.5">{mark(bColor, `Edge ${b.short}`)}</span>}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-dim">
        Small number = national rank (1st is best for that side of the ball; tempo 1st = fastest). In the &ldquo;has the ball&rdquo; rows the offense&apos;s number sits in its column and the other team&apos;s defense in its own; a dot marks the unit that ranks clearly better. Shooting, turnover, rebounding and free-throw numbers are season stats, not adjusted for opponents ({a.short}: {fmt(a.ratedGames, 1)} rated games, {b.short}: {fmt(b.ratedGames, 1)}).
      </p>
    </div>
  );
}
