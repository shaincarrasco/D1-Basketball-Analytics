"use client";
// "Where he ranks": a player's rank in every ranking framework of the pack, each a link
// into the full ranking, plus a one-click percentile chart.
import Link from "next/link";
import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { heatPct } from "@/lib/format";
import { encodeSpec, makeSpec, rankPool, tierOf, withDefaults, writePool, type SportPack } from "@/sport-kit";
import { withQuery, type KitRoutes } from "./gallery";

export default function FrameworkRanks<R>({ pack, p, all, routes }: { pack: SportPack<R>; p: R; all: R[]; routes: KitRoutes }) {
  const E = pack.entity, id = E.id(p);
  const pool = useMemo(() => withDefaults(pack, pack.ranking.profilePool), [pack]);
  const ranks = useMemo(() => pack.frameworks.map(f => {
    const list = rankPool(pack, all, pool, f.weights, "all", true);
    const i = list.findIndex(x => E.id(x.r) === id);
    return { f, rank: i >= 0 ? i + 1 : null, of: list.length, x: i >= 0 ? list[i] : null };
  }), [pack, E, all, id, pool]);
  if (!ranks.some(r => r.rank)) return null;
  const best = [...ranks].filter(r => r.x).sort((a, b) => b.x!.standing - a.x!.standing)[0];
  const chart = withQuery(routes.builder, encodeSpec(pack, makeSpec(pack, { type: "profile", ids: [id], pool: pack.ranking.profilePool })));
  const poolQs = (() => { const q = new URLSearchParams(); writePool(pack, pool, q); return q.toString(); })();
  return (
    <section className="deck p-5" aria-labelledby="fw-h">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="fw-h" className="h-section font-display uppercase">Where {pack.nouns.pronoun} ranks</h2>
        <Link href={chart} className="btn !px-3 !py-1.5 text-[13px]"><BarChart3 size={14} aria-hidden /> Chart the profile</Link>
      </div>
      <p className="mb-3 text-sm text-mute">
        Rank in each of our ranking lenses, among {pack.nouns.pool}{pack.ranking.profilePool ? " who clear the usual playing-time floor" : ""}.
        {best?.x ? <> Best fit: <b className="text-ink">{best.f.label}</b> ({tierOf(pack, best.x.standing).toLowerCase()}).</> : null}
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {ranks.map(({ f, rank, of, x }) => (
          <li key={f.key}>
            <Link href={withQuery(routes.rankings, `fw=${f.key}${poolQs ? `&${poolQs}` : ""}`)} className="deck-flat press flex flex-col gap-0.5 px-3 py-2.5 hover:border-line2" style={{ background: x ? heatPct(x.standing / 100) : undefined }}>
              <span className="text-[12.5px] font-semibold text-mute">{f.label}</span>
              {rank ? <span><span className="dots text-2xl">{rank}</span><span className="ml-1 text-[11.5px] text-dim">of {of.toLocaleString("en-US")}</span></span> : <span className="text-sm text-dim">Not enough data</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
