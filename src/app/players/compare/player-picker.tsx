"use client";
// Searchable player picker (ARIA combobox): type a name or team, arrow keys to move, Enter to pick, Escape to close. Max 8 suggestions.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import TeamLogo from "@sports/ui/team-logo";
import { fmt } from "@sports/ui/format";
import { POS_WORD, type PlayerRow } from "../player-stats";

const MAX = 8;
const COLOR = { a: "var(--def)", b: "var(--off)" } as const;
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "");

export default function PlayerPicker({ label, tone, players, value, exclude, onChange }: {
  label: string; tone: "a" | "b"; players: PlayerRow[]; value: PlayerRow | null; exclude?: string; onChange: (p: PlayerRow) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  // `players` arrives sorted by points, so an empty query shows the leading scorers.
  const hits = useMemo(() => {
    const n = norm(q.trim());
    const pool = players.filter(p => p.id !== exclude);
    if (!n) return pool.slice(0, MAX);
    const out: { p: PlayerRow; s: number }[] = [];
    for (const p of pool) {
      const name = norm(p.name);
      const team = norm(`${p.team?.name ?? ""} ${p.team?.short ?? ""}`);
      const s = name.startsWith(n) ? 0 : name.split(" ").some(w => w.startsWith(n)) ? 1 : name.includes(n) ? 2 : team.includes(n) ? 3 : -1;
      if (s >= 0) out.push({ p, s });
    }
    return out.sort((x, y) => x.s - y.s).slice(0, MAX).map(x => x.p);
  }, [q, players, exclude]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) { setOpen(false); setQ(""); } };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (p: PlayerRow) => { onChange(p); setOpen(false); setQ(""); input.current?.blur(); };
  const color = COLOR[tone];

  return (
    <div ref={wrap} className="relative min-w-0">
      <label htmlFor={`${id}-input`} className="label mb-1.5 flex items-center gap-2">
        <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />{label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
          {value && !open ? <TeamLogo src={value.team?.logo ?? null} name={value.team?.name ?? value.name} size={22} /> : <span className="block h-[22px] w-[22px]" />}
        </span>
        <input
          ref={input} id={`${id}-input`} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={open && hits[active] ? `${id}-opt-${active}` : undefined}
          className="field h-12 w-full !pl-10 !pr-8 text-[14px] font-semibold"
          style={{ borderColor: open ? color : undefined }}
          placeholder={value ? value.name : "Search a player"}
          value={open ? q : value?.name ?? ""}
          onFocus={() => { setOpen(true); setQ(""); }}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={e => {
            if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else setActive(a => Math.min(hits.length - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
            else if (e.key === "Enter") { if (open && hits[active]) { e.preventDefault(); pick(hits[active]); } }
            else if (e.key === "Escape" || e.key === "Tab") { setOpen(false); setQ(""); }
          }}
          autoComplete="off" spellCheck={false}
        />
        <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-mute" aria-hidden />
      </div>
      {open && (
        <ul ref={list} id={`${id}-list`} role="listbox" aria-label={`${label} options`}
          className="deck absolute left-0 right-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto !bg-deck p-1.5 shadow-2xl">
          {hits.length === 0 && <li className="px-3 py-4 text-sm text-mute">No player matches “{q}”. Try a last name or the school.</li>}
          {hits.map((p, i) => (
            <li key={p.id} id={`${id}-opt-${i}`} data-i={i} role="option" aria-selected={i === active}
              onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(p)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 ${i === active ? "bg-deck2" : ""}`}>
              <TeamLogo src={p.team?.logo ?? null} name={p.team?.name ?? p.name} size={22} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{p.name}</span>
                <span className="block truncate text-[11.5px] text-mute">
                  {[p.team?.short ?? p.team?.name ?? "No team", p.posN ? POS_WORD[p.posN] : null, p.min !== null ? `${fmt(p.min, 1)} mpg` : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              {p.id === value?.id && <span className="text-[11px] text-dim">Selected</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
