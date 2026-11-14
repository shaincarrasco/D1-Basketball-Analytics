"use client";
import { useMemo, useState } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { WireEvent } from "@/lib/types";
import { EVENT_LABEL, playerHref, shortDate } from "@/lib/injuries";
import { useLastSeen } from "@/lib/injury-hooks";
import { TeamTag, type TeamMetaMap } from "./parts";

const KIND_CLASS: Record<WireEvent["kind"], string> = {
  returned: "border-win/40 bg-win/15 text-win", better: "border-win/40 bg-win/10 text-win",
  new: "border-hot/40 bg-hot/15 text-hot", worse: "border-loss/40 bg-loss/15 text-loss",
  update: "border-line2 bg-deck2 text-mute", cleared: "border-line2 bg-deck2 text-mute",
};
type Filter = "all" | "worse" | "returns";
const day = (t: string) => t.slice(0, 10);

export default function Wire({ wire, checked, teams }: { wire: WireEvent[]; checked: string; teams: TeamMetaMap }) {
  const seen = useLastSeen();
  const [f, setF] = useState<Filter>("all");
  const [limit, setLimit] = useState(25);
  const sorted = useMemo(() => [...wire].sort((a, b) => b.t.localeCompare(a.t)), [wire]);
  const list = useMemo(() => sorted.filter(e => f === "all" || (f === "worse" ? e.kind === "new" || e.kind === "worse" : e.kind === "returned" || e.kind === "better")), [sorted, f]);
  const newCount = seen ? wire.filter(e => e.t > seen).length : 0;
  // "Today" is the day of the last check (not the viewer's clock) so server and client render the same labels.
  const today = day(checked), yest = day(new Date(Date.parse(checked) - 864e5).toISOString());
  const label = (d: string) => (d === today ? "Today" : d === yest ? "Yesterday" : shortDate(d));
  const shown = list.slice(0, limit);
  const groups: { d: string; items: WireEvent[] }[] = [];
  for (const e of shown) { const d = day(e.t); (groups.at(-1)?.d === d ? groups.at(-1)! : groups[groups.push({ d, items: [] }) - 1]).items.push(e); }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter the wire">
          {([["all", "All"], ["worse", "New & worse"], ["returns", "Returns"]] as const).map(([k, l]) => <button key={k} className="chip" aria-pressed={f === k} onClick={() => { setF(k); setLimit(25); }}>{l}</button>)}
        </div>
        {newCount > 0 && <p className="text-[13px] font-semibold text-bulb-ink" role="status">{newCount} new since your last visit</p>}
      </div>
      {!list.length ? (
        <div className="deck p-5 text-sm text-mute">{wire.length ? "No changes match this filter." : "No changes yet. We check ESPN's injury list, box scores and injury headlines every hour."}</div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <section key={g.d} aria-label={label(g.d)}>
              <h3 className="mb-1.5 font-display text-[15px] font-bold uppercase tracking-wide text-mute">{label(g.d)}</h3>
              <ul className="deck divide-y divide-line overflow-hidden">
                {g.items.map(e => {
                  const isNew = !!seen && e.t > seen;
                  return (
                    <li key={e.key + e.t + e.kind} className={`flex items-start gap-3 px-3.5 py-3 ${isNew ? "bg-bulb/[0.06]" : ""}`}>
                      <span className={`mt-0.5 w-[74px] shrink-0 rounded-full border px-2 py-0.5 text-center text-[11.5px] font-bold uppercase tracking-wide ${KIND_CLASS[e.kind]}`}>{EVENT_LABEL[e.kind]}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <Link href={playerHref(e)} className="link font-display text-[19px] font-bold leading-tight">{e.name}</Link>
                          {isNew && <span className="rounded bg-bulb px-1.5 py-px text-[10.5px] font-black uppercase tracking-wider text-scoreboard">New</span>}
                          <span className="text-[13.5px]"><TeamTag slug={e.slug} name={e.team} rank={e.rank} meta={teams[e.slug]} size={16} /></span>
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13.5px] text-mute">
                          {e.from ? <><span>{e.from}</span><ArrowRight size={13} aria-label="to" /><span className="font-semibold text-ink">{e.status}</span></> : <span className="font-semibold text-ink">{e.status}</span>}
                          {e.body && <span>· {e.body}</span>}
                          {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 text-[12.5px]" aria-label={`Source for ${e.name}`}>Source <ExternalLink size={11} aria-hidden /></a>}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {list.length > limit && <button className="btn" onClick={() => setLimit(l => l + 25)}>Show {Math.min(25, list.length - limit)} more</button>}
        </div>
      )}
    </div>
  );
}
