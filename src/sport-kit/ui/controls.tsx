"use client";
// Small form pieces shared by the chart gallery, builder and rankings, for any sport pack.
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import TeamLogo from "@/components/team-logo";
import { filterOptions, type Lists, type Pool, type SportPack } from "@/sport-kit";

export function MetricSelect<R>({ pack, label, value, onChange, allowNone }: { pack: SportPack<R>; label: string; value: string; onChange: (v: string) => void; allowNone?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="label">{label}</span>
      <select className="field w-full" value={value} onChange={e => onChange(e.target.value)}>
        {allowNone && <option value="">{allowNone}</option>}
        {pack.metricGroups.map(g => (
          <optgroup key={g} label={g}>
            {pack.metrics.filter(m => m.group === g).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/** One select per pack filter. `compact` shows only the filters marked compact (gallery bar). */
export function PoolControls<R>({ pack, pool, set, lists, compact }: { pack: SportPack<R>; pool: Pool; set: (p: Pool) => void; lists: Lists; compact?: boolean }) {
  return (
    <>
      {pack.filters.filter(f => !compact || f.compact).map(f => (
        <label key={f.key} className="flex min-w-0 flex-col gap-1">
          <span className="label">{f.label}</span>
          <select className="field w-full" value={pool[f.key] ?? f.default} onChange={e => set({ ...pool, [f.key]: e.target.value })}>
            {filterOptions(f, lists).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      ))}
    </>
  );
}

/** Type-ahead picker; shows chips for the picked players. */
export function PlayerPicker<R>({ pack, rows, ids, setIds, max, label }: { pack: SportPack<R>; rows: R[]; ids: string[]; setIds: (ids: string[]) => void; max: number; label: string }) {
  const E = pack.entity;
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(rows.map(r => [E.id(r), r])), [E, rows]);
  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (n.length < 2) return [];
    return rows.filter(r => {
      if (ids.includes(E.id(r))) return false;
      const t = E.team(r);
      return E.name(r).toLowerCase().includes(n) || t?.short.toLowerCase() === n || !!t?.name.toLowerCase().includes(n);
    }).sort((a, b) => E.exposure(b) - E.exposure(a)).slice(0, 8);
  }, [E, q, rows, ids]);
  const add = (r: R) => { setIds([...ids, E.id(r)]); setQ(""); };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="label">{label} <span className="text-dim">({ids.length}/{max})</span></span>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
        <input className="field w-full !pl-9" placeholder={ids.length >= max ? "Remove one to add another" : `${pack.nouns.player[0].toUpperCase()}${pack.nouns.player.slice(1)} or team`} value={q} disabled={ids.length >= max}
          onChange={e => setQ(e.target.value)} aria-label={label} onKeyDown={e => { if (e.key === "Enter" && hits[0]) add(hits[0]); }} />
        {hits.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-line2 bg-deck2 p-1 shadow-xl" role="listbox">
            {hits.map(r => {
              const t = E.team(r), pos = E.pos(r);
              return (
                <li key={E.id(r)}>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-deck" onClick={() => add(r)}>
                    <TeamLogo src={t?.logo ?? null} name={t?.name ?? "?"} size={20} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{E.name(r)}</span>
                    <span className="text-xs text-mute">{t?.short}{pos ? ` · ${pos}` : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ids.map(id => {
            const r = byId.get(id), name = r ? E.name(r) : null;
            return (
              <button key={id} type="button" className="chip !py-1 !pl-2.5 !pr-2 text-[13px]" onClick={() => setIds(ids.filter(x => x !== id))} aria-label={`Remove ${name ?? id}`}>
                {name ?? `Unknown ${pack.nouns.player}`} <X size={13} aria-hidden />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
