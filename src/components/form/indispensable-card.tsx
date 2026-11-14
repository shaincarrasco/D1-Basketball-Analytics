// Team page: the players this team can least afford to lose (same formula as the injury tracker).
import Link from "next/link";
import { fmt } from "@/lib/format";
import { FORM_WORDS, INDISPENSABLE_MIN_GAMES, INDISPENSABLE_MIN_MPG, type Indispensable } from "@/lib/form";

export default function IndispensableCard({ rows, max = 3 }: { rows: Indispensable[]; max?: number }) {
  const top = rows.slice(0, max);
  return (
    <section className="deck p-5" aria-labelledby="indisp-h">
      <h2 id="indisp-h" className="h-section mb-0.5" title={FORM_WORDS.indispensable}>Most indispensable</h2>
      <p className="mb-2 text-xs text-mute">Estimated DHR drop if he sat and a typical bench player took his minutes</p>
      {top.length ? (
        <ol>
          {top.map(p => (
            <li key={p.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-0">
              <span className="min-w-0 flex-1">
                <Link href={`/player/?id=${p.id}`} className="link block truncate font-semibold">{p.name}</Link>
                <span className="block text-xs text-mute tnum">{fmt(p.mpg, 1)} min/game · DPR {fmt(p.dpr, 1)} ({p.onPoss} poss.)</span>
              </span>
              <span className="text-right" title={`Without him: about ${fmt(p.drop, 1)} points per 100 possessions${p.perGame != null ? ` (${fmt(p.perGame, 1)} points a game)` : ""}; DHR rank ${p.teamRank} → ${p.rankWithout} with everyone else unchanged.`}>
                <span className="block font-display text-[22px] font-extrabold leading-none text-loss tnum">−{fmt(p.drop, 1)}</span>
                <span className="block text-[11px] text-mute tnum">No. {p.teamRank} → {p.rankWithout}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-mute">Nobody qualifies yet: it needs {INDISPENSABLE_MIN_GAMES}+ games and {INDISPENSABLE_MIN_MPG}+ minutes a game.</p>
      )}
      <Link href="/players/indispensable/" className="mt-2 inline-block text-sm font-semibold text-bulb-ink hover:underline">National leaderboard</Link>
    </section>
  );
}
