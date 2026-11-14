"use client";
// Small form pieces shared by the chart gallery and builder.
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import TeamLogo from "@/components/team-logo";
import type { PlayerRow, Pos } from "@/app/players/player-stats";
import { G_OPTS, HIGH_MAJOR_LABEL, METRIC_GROUPS, METRICS, MIN_OPTS, type PoolFilter } from "@/lib/player-metrics";

export function MetricSelect({ label, value, onChange, allowNone }: { label: string; value: string; onChange: (v: string) => void; allowNone?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="label">{label}</span>
      <select className="field w-full" value={value} onChange={e => onChange(e.target.value)}>
        {allowNone && <option value="">{allowNone}</option>}
        {METRIC_GROUPS.map(g => (
          <optgroup key={g} label={g}>
            {METRICS.filter(m => m.group === g).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export function PoolControls({ pool, set, confs, compact }: { pool: PoolFilter; set: (p: PoolFilter) => void; confs: [string, string][]; compact?: boolean }) {
  return (
    <>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="label">Conference</span>
        <select className="field w-full" value={pool.conf} onChange={e => set({ ...pool, conf: e.target.value })}>
          <option value="all">All of D-I</option>
          <option value="high-major">{HIGH_MAJOR_LABEL}</option>
          {confs.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="label">Position</span>
        <select className="field w-full" value={pool.pos} onChange={e => set({ ...pool, pos: e.target.value as "all" | Pos })}>
          <option value="all">All positions</option>
          <option value="G">Guards</option><option value="F">Forwards</option><option value="C">Centers</option>
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="label">Minutes</span>
        <select className="field w-full" value={pool.minMin} onChange={e => set({ ...pool, minMin: Number(e.target.value) })}>
          {MIN_OPTS.map(m => <option key={m} value={m}>{m ? `${m}+ mpg` : "Any minutes"}</option>)}
        </select>
      </label>
      {!compact && (
        <>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="label">Games</span>
            <select className="field w-full" value={pool.minG} onChange={e => set({ ...pool, minG: Number(e.target.value) })}>
              {G_OPTS.map(g => <option key={g} value={g}>{g === 1 ? "Any games" : `${g}+ games`}</option>)}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="label">Recruits</span>
            <select className="field w-full" value={pool.stars} onChange={e => set({ ...pool, stars: e.target.value as PoolFilter["stars"] })}>
              <option value="any">Anyone</option><option value="4">4★ and 5★</option><option value="3">3★+</option><option value="none">Unranked</option>
            </select>
          </label>
        </>
      )}
    </>
  );
}

/** Type-ahead player picker; shows chips for the picked players. */
export function PlayerPicker({ rows, ids, setIds, max, label }: { rows: PlayerRow[]; ids: string[]; setIds: (ids: string[]) => void; max: number; label: string }) {
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows]);
  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (n.length < 2) return [];
    return rows.filter(r => !ids.includes(r.id) && (r.name.toLowerCase().includes(n) || r.team?.short.toLowerCase() === n || r.team?.name.toLowerCase().includes(n)))
      .sort((a, b) => (b.min ?? 0) - (a.min ?? 0)).slice(0, 8);
  }, [q, rows, ids]);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="label">{label} <span className="text-dim">({ids.length}/{max})</span></span>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
        <input className="field w-full !pl-9" placeholder={ids.length >= max ? "Remove one to add another" : "Player or team"} value={q} disabled={ids.length >= max}
          onChange={e => setQ(e.target.value)} aria-label={label} onKeyDown={e => { if (e.key === "Enter" && hits[0]) { setIds([...ids, hits[0].id]); setQ(""); } }} />
        {hits.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-line2 bg-deck2 p-1 shadow-xl" role="listbox">
            {hits.map(r => (
              <li key={r.id}>
                <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-deck" onClick={() => { setIds([...ids, r.id]); setQ(""); }}>
                  <TeamLogo src={r.team?.logo ?? null} name={r.team?.name ?? "?"} size={20} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                  <span className="text-xs text-mute">{r.team?.short}{r.posN ? ` · ${r.posN}` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ids.map(id => {
            const r = byId.get(id);
            return (
              <button key={id} type="button" className="chip !py-1 !pl-2.5 !pr-2 text-[13px]" onClick={() => setIds(ids.filter(x => x !== id))} aria-label={`Remove ${r?.name ?? id}`}>
                {r?.name ?? "Unknown player"} <X size={13} aria-hidden />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
