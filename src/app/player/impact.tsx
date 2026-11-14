// DPR headline (hero), raw on/off split and similar players for the player profile.
import Link from "next/link";
import { Dots } from "@/components/dots";
import { fmt, signed } from "@/lib/format";
import type { TeamDetail } from "@/lib/types";
import { DPR_MIN_POSS, POS_WORD, SIM_MIN_MPG, type PlayerRow } from "../players/player-stats";
import { followRowLink, ROW_LINK_CLASS } from "../players/row-link";

const DPR_HINT = "DPR: points per 100 possessions better than an average D-I player, from play-by-play lineups (regularised adjusted plus-minus, shrunk toward a box-score prior). ± is one standard error.";

/** Interval strip: zero tick, ±1 SE band and the point estimate. */
function Band({ v, se }: { v: number; se: number | null }) {
  const lo = v - (se ?? 0), hi = v + (se ?? 0);
  const R = Math.max(10, Math.ceil(Math.max(Math.abs(lo), Math.abs(hi)) / 5) * 5);
  const x = (n: number) => `${((Math.max(-R, Math.min(R, n)) + R) / (2 * R)) * 100}%`;
  return (
    <div aria-hidden className="mt-3">
      <div className="relative h-3">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line2" />
        <div className="absolute top-0 h-3 w-px bg-mute" style={{ left: "50%" }} />
        {se !== null && <div className="absolute top-0.5 h-2 rounded-sm bg-ink/20" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />}
        <div className="absolute top-0 h-3 w-[3px] -translate-x-1/2 rounded-sm bg-ink" style={{ left: x(v) }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-dim tnum">
        <span>{signed(-R, 0)}</span><span>Average</span><span>{signed(R, 0)}</span>
      </div>
    </div>
  );
}

export function DprCard({ p, ranked }: { p: PlayerRow; ranked: number }) {
  const poss = p.onPoss ?? 0;
  const thin = poss < DPR_MIN_POSS;
  return (
    <div className="self-start rounded-[22px] border border-line bg-deck p-[18px]" title={DPR_HINT}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-mute">Player rating (DPR)</span>
        <Link href="/players/?view=impact" className="text-[13px] font-semibold text-bulb-ink">Leaderboard</Link>
      </div>
      {p.dpr === null ? (
        <p className="mt-2 text-sm text-mute">No rating yet: he hasn&apos;t been on the floor for a tracked possession.</p>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-3.5">
            {p.dprRank ? (
              <div className="plate flex shrink-0 flex-col items-center px-3 pb-1.5 pt-2">
                <Dots glow ghost className="text-[40px]">{String(p.dprRank)}</Dots>
                <span className="mt-0.5 text-[10px] font-semibold text-dim">in D-I</span>
              </div>
            ) : null}
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[2.6rem] font-black leading-none tnum">{signed(p.dpr)}</span>
                {p.dprSE !== null && <span className="text-base text-mute tnum">± {fmt(p.dprSE)}</span>}
              </div>
              <p className="mt-1 text-[13px] leading-snug text-mute">points per 100 possessions over an average D-I player</p>
            </div>
          </div>
          <Band v={p.dpr} se={p.dprSE} />
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-night px-3 py-2.5">
              <div className="text-xs font-semibold text-off">Offense</div>
              <div className="font-display text-[22px] font-extrabold tnum">{signed(p.dprO)}</div>
            </div>
            <div className="rounded-xl bg-night px-3 py-2.5">
              <div className="text-xs font-semibold text-def">Defense</div>
              <div className="font-display text-[22px] font-extrabold tnum">{signed(p.dprD)}</div>
            </div>
          </div>
          <p className="mt-3 text-sm tnum">
            {p.dprRank ? (
              <><b>No. {p.dprRank}</b><span className="text-mute"> of {ranked.toLocaleString("en-US")} among players with {DPR_MIN_POSS}+ possessions</span></>
            ) : <span className="text-mute">Unranked: needs {DPR_MIN_POSS}+ possessions</span>}
          </p>
          {thin && (
            <p className="mt-1 text-xs text-mute">
              Only {fmt(poss, 0)} on-court {poss === 1 ? "possession" : "possessions"} so far, so the rating leans on the box-score prior more than on lineup results.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function OnOff({ p, detail }: { p: PlayerRow; detail: TeamDetail | null }) {
  const o = detail?.onOff?.[p.id];
  const diff = o && o.offNet !== null ? o.onNet - o.offNet : null;
  const tone = (v: number | null) => (v === null || Math.abs(v) < 0.05 ? "" : v > 0 ? "text-win" : "text-loss");
  return (
    <section className="deck p-5" aria-labelledby="onoff-h">
      <h2 id="onoff-h" className="h-section">On/off</h2>
      <p className="mt-1 text-sm text-mute">{detail?.id ? "Team net points per 100 possessions with him on and off the floor. Raw: not adjusted for teammates or opponents (DPR is)." : "Loading lineups…"}</p>
      {detail && !o && <p className="mt-3 text-sm text-mute">No lineup data for him yet.</p>}
      {o && (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div><dt className="label">On court</dt><dd className={`font-display text-2xl font-extrabold tnum ${tone(o.onNet)}`}>{signed(o.onNet)}</dd></div>
            <div><dt className="label">Off court</dt><dd className={`font-display text-2xl font-extrabold tnum ${tone(o.offNet)}`}>{signed(o.offNet)}</dd></div>
            <div><dt className="label">Difference</dt><dd className={`font-display text-2xl font-extrabold tnum ${tone(diff)}`}>{signed(diff)}</dd></div>
            <div><dt className="label">Minutes on</dt><dd className="font-display text-2xl font-extrabold tnum">{fmt(o.min, 0)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-dim tnum">
            {fmt(o.poss, 0)} possessions on the floor.{o.offNet === null ? " He has barely sat, so there is no off-court sample." : ""}{o.poss < DPR_MIN_POSS ? " Small sample: on/off swings wildly early on." : ""}
          </p>
        </>
      )}
    </section>
  );
}

export function Similar({ p, list }: { p: PlayerRow; list: { r: PlayerRow; d: number }[] }) {
  return (
    <section className="deck min-w-0 p-5" aria-labelledby="sim-h">
      <h2 id="sim-h" className="h-section">Similar players</h2>
      <p className="mt-1 text-sm text-mute" title="Standardised points, rebounds and assists per 40, usage, TS%, three-point attempt rate and DPR; nearest by distance.">
        Closest statistical profiles among players averaging {SIM_MIN_MPG}+ minutes.
      </p>
      {list.length === 0 ? <p className="mt-3 text-sm text-mute">Not enough of his numbers are in yet to compare.</p> : (
        <div className={`scroll-x mt-3 rounded-lg border border-line ${ROW_LINK_CLASS}`} onClick={followRowLink}>
          <table className="dt">
            <caption className="sr-only">Players with the most similar profiles to {p.name}</caption>
            <thead>
              <tr>
                <th scope="col" className="l sticky-col" style={{ minWidth: 150 }}>Player</th>
                <th scope="col" title="Points per 40 minutes">PTS/40</th><th scope="col" title="Rebounds per 40 minutes">REB/40</th><th scope="col" title="Assists per 40 minutes">AST/40</th>
                <th scope="col" title="Usage %">USG%</th><th scope="col" title="True shooting %">TS%</th><th scope="col" title="Share of shots from three">3PA%</th><th scope="col" title="DPR (points per 100 vs average)">DPR</th>
              </tr>
            </thead>
            <tbody>
              {[{ r: p, d: 0 }, ...list].map(({ r }) => {
                const me = r.id === p.id;
                return (
                  <tr key={r.id} className={me ? "text-mute" : undefined}>
                    <td className="l sticky-col" style={{ minWidth: 150 }}>
                      {me ? <span className="font-semibold">{r.name} <span className="text-xs font-normal text-dim">(him)</span></span>
                        : <Link data-row-link href={`/player/?id=${r.id}`} className="link font-semibold">{r.name}</Link>}
                      <span className="block text-[11.5px] text-mute">
                        {r.team ? <Link href={`/teams/${r.team.slug}/`} className="hover:text-ink">{r.team.short}</Link> : "—"}
                        {r.posN ? ` · ${POS_WORD[r.posN]}` : ""}
                      </span>
                    </td>
                    <td>{fmt(r.pts40)}</td><td>{fmt(r.reb40)}</td><td>{fmt(r.ast40)}</td>
                    <td>{fmt(r.usg)}</td><td>{fmt(r.ts)}</td><td>{fmt(r.tpaRate, 0)}</td><td>{signed(r.dpr)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
