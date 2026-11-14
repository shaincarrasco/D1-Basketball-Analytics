"use client";
// "Where he ranks": the player's national rank in every ranking framework, each a link
// into the full ranking, plus a one-click percentile chart.
import Link from "next/link";
import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { DEFAULT_POOL } from "@/lib/player-metrics";
import { encodeSpec, spec } from "@/components/charts/spec";
import { heatPct } from "@/lib/format";
import { FRAMEWORKS, rankPool, tierOf } from "../players/rankings/frameworks";
import type { PlayerRow } from "../players/player-stats";

export default function FrameworkRanks({ p, all }: { p: PlayerRow; all: PlayerRow[] }) {
  // Rank among D-I players at 10+ mpg so most rotation players appear.
  const pool = useMemo(() => ({ ...DEFAULT_POOL, minMin: 10 }), []);
  const ranks = useMemo(() => FRAMEWORKS.map(f => {
    const list = rankPool(all, pool, f.weights, "all", true);
    const i = list.findIndex(x => x.r.id === p.id);
    return { f, rank: i >= 0 ? i + 1 : null, of: list.length, x: i >= 0 ? list[i] : null };
  }), [all, p.id, pool]);
  if (!ranks.some(r => r.rank)) return null;
  const best = [...ranks].filter(r => r.x).sort((a, b) => (b.x!.standing - a.x!.standing))[0];
  const chart = `/charts/build/?${encodeSpec(spec({ type: "profile", ids: [p.id], pool: { minMin: 10 } }))}`;
  return (
    <section className="deck p-5" aria-labelledby="fw-h">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="fw-h" className="h-section font-display uppercase">Where he ranks</h2>
        <Link href={chart} className="btn !px-3 !py-1.5 text-[13px]"><BarChart3 size={14} aria-hidden /> Chart his profile</Link>
      </div>
      <p className="mb-3 text-sm text-mute">
        National rank in each of our ranking lenses, among D-I players at 10+ minutes a game.
        {best?.x ? <> Best fit: <b className="text-ink">{best.f.label}</b> ({tierOf(best.x.standing).toLowerCase()}).</> : null}
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {ranks.map(({ f, rank, of, x }) => (
          <li key={f.key}>
            <Link href={`/players/rankings/?fw=${f.key}&min=10`} className="deck-flat press flex flex-col gap-0.5 px-3 py-2.5 hover:border-line2" style={{ background: x ? heatPct(x.standing / 100) : undefined }}>
              <span className="text-[12.5px] font-semibold text-mute">{f.label}</span>
              {rank ? <span><span className="dots text-2xl">{rank}</span><span className="ml-1 text-[11.5px] text-dim">of {of.toLocaleString("en-US")}</span></span> : <span className="text-sm text-dim">Not enough data</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
