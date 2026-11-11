"use client";
// Searchable team picker (ARIA combobox): type to filter, arrow keys to move, Enter to pick, Escape to close.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import TeamLogo from "@/components/team-logo";
import type { TeamSummary } from "@/lib/types";

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "");

export default function TeamCombobox({ label, teams, value, onChange, tone, exclude }: {
  label: string; teams: TeamSummary[]; value: TeamSummary | null; onChange: (t: TeamSummary) => void; tone: "a" | "b"; exclude?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => {
    const n = norm(q.trim());
    const pool = teams.filter(t => t.slug !== exclude);
    if (!n) return pool.slice(0, 60);
    const score = (t: TeamSummary) => {
      const names = [t.name, t.short, `${t.name} ${t.mascot ?? ""}`, t.confName].map(norm);
      if (names[0] === n || names[1] === n) return 0;
      if (names[0].startsWith(n)) return 1;
      if (names[0].split(" ").some(w => w.startsWith(n)) || names[2].split(" ").some(w => w.startsWith(n))) return 2;
      if (names[0].includes(n) || names[1].startsWith(n)) return 3;
      if (names[3].includes(n)) return 4;
      return -1;
    };
    return pool.map(t => ({ t, s: score(t) })).filter(x => x.s >= 0).sort((a, b) => a.s - b.s || (a.t.rank ?? 999) - (b.t.rank ?? 999)).slice(0, 60).map(x => x.t);
  }, [q, teams, exclude]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (!open) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) { setOpen(false); setQ(""); } };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (t: TeamSummary) => { onChange(t); setOpen(false); setQ(""); input.current?.blur(); };
  const color = tone === "a" ? "var(--def)" : "var(--off)";

  return (
    <div ref={wrap} className="relative">
      <label htmlFor={`${id}-input`} className="label mb-1.5 flex items-center gap-2">
        <i className="inline-block h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />{label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
          {value && !open ? <TeamLogo src={value.logo} name={value.name} size={24} /> : <span className="block h-6 w-6" />}
        </span>
        <input
          ref={input} id={`${id}-input`} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={open && hits[active] ? `${id}-opt-${active}` : undefined}
          className="field h-12 w-full !pl-11 !pr-9 text-[15px] font-semibold"
          style={{ borderColor: open ? color : undefined }}
          placeholder={value ? value.name : "Search a team"}
          value={open ? q : value?.name ?? ""}
          onFocus={() => { setOpen(true); setQ(""); }}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={e => {
            if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else setActive(a => Math.min(hits.length - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
            else if (e.key === "Home" && open) { e.preventDefault(); setActive(0); }
            else if (e.key === "End" && open) { e.preventDefault(); setActive(hits.length - 1); }
            else if (e.key === "Enter") { if (open && hits[active]) { e.preventDefault(); pick(hits[active]); } }
            else if (e.key === "Escape") { setOpen(false); setQ(""); }
            else if (e.key === "Tab") { setOpen(false); setQ(""); }
          }}
          autoComplete="off" spellCheck={false}
        />
        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mute" aria-hidden />
      </div>
      {open && (
        <ul ref={list} id={`${id}-list`} role="listbox" aria-label={`${label} options`}
          className="deck absolute left-0 right-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto !bg-deck p-1.5 shadow-2xl">
          {hits.length === 0 && <li className="px-3 py-4 text-sm text-mute">No team matches “{q}”. Try the school name, e.g. “Gonzaga”.</li>}
          {hits.map((t, i) => (
            <li key={t.id} id={`${id}-opt-${i}`} data-i={i} role="option" aria-selected={i === active}
              onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(t)}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 ${i === active ? "bg-deck2" : ""}`}>
              <span className="w-7 text-right font-display text-base font-extrabold text-mute tnum">{t.rank ?? "—"}</span>
              <TeamLogo src={t.logo} name={t.name} size={22} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{t.name}</span>
                <span className="block truncate text-[11.5px] text-mute">{t.confName} · {t.w}–{t.l}</span>
              </span>
              {t.slug === value?.slug && <span className="text-[11px] text-dim">Selected</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
