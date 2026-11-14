// Team-page card: the program's last ten completed seasons (record, national rank, conference
// finish, postseason) with a rank-over-time sparkline. Server component: reads the cached season
// files at build time, so it adds no client JavaScript or requests.
// Mount (team page aside): <ProgramHistory teamId={team.id} color={color} />
import Link from "next/link";
import { getHistorySeasons, getProgramHistory } from "@/app/history/load";
import { finishLabel, HISTORY_FIRST, HISTORY_LAST, postLabel, seasonLabel, type ProgramSeason } from "@/lib/history";

const shortLabel = (s: number) => `${String(s - 1).slice(2)}–${String(s).slice(2)}`;

function Sparkline({ seasons, rows, color }: { seasons: { season: number; teamCount: number }[]; rows: ProgramSeason[]; color: string }) {
  const W = 320, H = 88, L = 24, R = 12, T = 8, B = 16;
  const maxN = Math.max(...seasons.map(s => s.teamCount), 2);
  // Every season from the oldest to the newest saved one, so a season not saved (or not rated) shows as a gap.
  const span: number[] = [];
  for (let s = seasons[0].season; s <= seasons[seasons.length - 1].season; s++) span.push(s);
  const x = (i: number) => L + (span.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (span.length - 1));
  // Log scale: the difference between No. 5 and No. 25 matters more than No. 205 vs No. 225.
  const y = (rank: number) => T + (Math.log(rank) / Math.log(maxN)) * (H - T - B);
  const bySeason = new Map(rows.map(r => [r.season, r]));
  const pts = span.map((s, i) => { const r = bySeason.get(s); return r ? { i, s, rk: r.team.rk } : null; });
  const segs: { i: number; rk: number }[][] = [];
  let curSeg: { i: number; rk: number }[] = [];
  for (const p of pts) { if (p) curSeg.push(p); else if (curSeg.length) { segs.push(curSeg); curSeg = []; } }
  if (curSeg.length) segs.push(curSeg);
  const rated = pts.filter((p): p is NonNullable<typeof p> => !!p);
  const best = rated.reduce((a, b) => (b.rk <= a.rk ? b : a), rated[0]); // ties: the most recent
  const ticks = [1, 10, 100].filter(t => t <= maxN);
  const desc = rated.map(p => `${seasonLabel(p.s)} No. ${p.rk}`).join(", ");
  const nearRight = best && x(best.i) > W - R - 40;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`National rank by season: ${desc}`}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 1 ? undefined : "2 3"} />
          <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize="8.5" fill="var(--dim)">{t}</text>
        </g>
      ))}
      {segs.map((seg, k) => seg.length > 1 && (
        <polyline key={k} points={seg.map(p => `${x(p.i)},${y(p.rk)}`).join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {rated.map(p => (
        <circle key={p.s} cx={x(p.i)} cy={y(p.rk)} r={p === best ? 3.6 : 2.4} fill={p === best ? color : "var(--deck)"} stroke={color} strokeWidth="1.6">
          <title>{`${seasonLabel(p.s)}: No. ${p.rk}`}</title>
        </circle>
      ))}
      {best && (
        <text x={x(best.i) + (nearRight ? -7 : 7)} y={y(best.rk) + (y(best.rk) < T + 6 ? 10 : -5)} textAnchor={nearRight ? "end" : "start"} fontSize="9" fontWeight="700" fill="var(--ink)">{`Best: No. ${best.rk}`}</text>
      )}
      <text x={x(0)} y={H - 3} textAnchor="start" fontSize="8.5" fill="var(--dim)">{shortLabel(span[0])}</text>
      {span.length > 1 && <text x={x(span.length - 1)} y={H - 3} textAnchor="end" fontSize="8.5" fill="var(--dim)">{shortLabel(span[span.length - 1])}</text>}
    </svg>
  );
}

export default function ProgramHistory({ teamId, color }: { teamId: string; color?: string | null }) {
  const cached = getHistorySeasons();
  const rows = getProgramHistory(teamId); // newest first
  const line = color ? `color-mix(in oklab, ${color} 72%, white)` : "var(--bulb)";
  return (
    <section className="deck p-5" aria-labelledby="program-history-h">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="program-history-h" className="h-section">Program history</h2>
        <Link href="/history/" className="text-[13px] font-semibold text-bulb-ink">Past seasons</Link>
      </div>
      {!cached.length ? (
        <p className="text-sm text-mute">The last ten seasons ({seasonLabel(HISTORY_FIRST)} to {seasonLabel(HISTORY_LAST)}) appear here after the next data refresh.</p>
      ) : !rows.length ? (
        <p className="text-sm text-mute">No final ratings for this program in the saved seasons ({cached[cached.length - 1].label} to {cached[0].label}).</p>
      ) : (
        <>
          <Sparkline seasons={[...cached].reverse()} rows={rows} color={line} />
          <p className="mb-2 mt-0.5 text-[11px] text-dim">Final national rank by adjusted net (College Basketball Data), log scale. Higher is better; gaps are seasons not saved or not rated.</p>
          <table className="w-full text-[13px] tnum">
            <thead>
              <tr className="text-[11px] text-mute">
                <th scope="col" className="pb-1 text-left font-medium">Season</th>
                <th scope="col" className="pb-1 text-right font-medium">W–L</th>
                <th scope="col" className="pb-1 text-right font-medium" title="Final national rank by adjusted net rating">Rk</th>
                <th scope="col" className="pb-1 text-right font-medium" title="Regular-season conference finish">Conf</th>
                <th scope="col" className="pb-1 pl-3 text-left font-medium">Postseason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const t = r.team;
                return (
                  <tr key={r.season} className="border-t border-line">
                    <th scope="row" className="py-1.5 text-left font-semibold"><Link className="link" href={`/history/?season=${r.season}`}>{shortLabel(r.season)}</Link></th>
                    <td className="py-1.5 text-right">{t.w}–{t.l}</td>
                    <td className="py-1.5 text-right"><span className="rank-cell !text-[14px]" title={`of ${r.teamCount}`}>{t.rk}</span></td>
                    <td className="py-1.5 text-right" title={`${t.cw}–${t.cl} in ${t.conf ?? "conference"} play${t.cn ? `, ${t.cn} teams` : ""}`}>{finishLabel(t.cf) ?? "—"}{t.ct ? <span className="ml-1 text-[10px] font-bold text-bulb-ink" title="Won the conference tournament">T</span> : null}</td>
                    <td className={`py-1.5 pl-3 text-left ${t.post?.ev === "NCAA" ? "" : "text-mute"}`}>{t.post ? (t.post.ev === "NCAA" ? postLabel(t.post, true) : postLabel(t.post)) : r.season === 2020 ? <span className="text-dim" title="The 2020 NCAA tournament and NIT were canceled">Canceled</span> : <span className="text-dim">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-dim">Conf = regular-season conference finish. T = conference tournament champion. NCAA runs show seed and exit round.</p>
        </>
      )}
    </section>
  );
}
