"use client";
// ⌘K / "/" search across every team, player, conference and page.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useJson } from "@/lib/client-data";
import { useFavorites } from "@/lib/favorites";
import type { Conference, PlayerTable, TeamSummary } from "@/lib/types";
import TeamLogo from "./team-logo";

type Hit = { kind: "Team" | "Player" | "Conference" | "Page" | "Following"; label: string; sub: string; href: string; logo?: string | null };
const PAGES: Hit[] = [
  { kind: "Page", label: "Power rankings", sub: "Every D-I team by DHR", href: "/rankings/" },
  { kind: "Page", label: "Games & predictions", sub: "Scoreboard with win probabilities", href: "/games/" },
  { kind: "Page", label: "Player leaderboards", sub: "Sort and filter every player", href: "/players/" },
  { kind: "Page", label: "Matchup simulator", sub: "Project any two teams", href: "/matchup/" },
  { kind: "Page", label: "Conferences", sub: "Strength and standings", href: "/conferences/" },
  { kind: "Page", label: "Following", sub: "Your teams and players", href: "/following/" },
  { kind: "Page", label: "News, polls & injuries", sub: "Headlines, AP poll vs DHR, availability tracker", href: "/news/" },
  { kind: "Page", label: "Methodology", sub: "How the model works and how it's doing", href: "/methodology/" },
];
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "");

export default function CommandSearch({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const teams = useJson<TeamSummary[]>("teams.json");
  const players = useJson<PlayerTable>("players.json");
  const confs = useJson<Conference[]>("conferences.json");
  const fav = useFavorites();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    input.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; opener?.focus?.({ preventScroll: true }); };
  }, []);
  // Escape from anywhere in the dialog; Tab cycles inside it.
  const onDialogKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key !== "Tab" || !dialog.current) return;
    const items = [...dialog.current.querySelectorAll<HTMLElement>("input, button")];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const hits = useMemo<Hit[]>(() => {
    const n = norm(q.trim());
    if (!n) {
      // Empty query: followed teams first, then every page.
      const bySlug = new Map((teams.data ?? []).map(t => [t.slug, t]));
      const mine: Hit[] = fav.teams.map(s => bySlug.get(s)).filter((t): t is TeamSummary => !!t).slice(0, 6)
        .map(t => ({ kind: "Following", label: t.name, sub: `${t.rank ? `#${t.rank} · ` : ""}${t.w}–${t.l}${t.next ? ` · next ${t.next.venue === "A" ? "at" : "vs"} ${t.next.opp}` : ""}`, href: `/teams/${t.slug}/`, logo: t.logo }));
      return [...mine, ...PAGES];
    }
    const out: (Hit & { score: number })[] = [];
    const score = (hay: string) => { const h = norm(hay); if (h === n) return 0; if (h.startsWith(n)) return 1; if (h.split(" ").some(w => w.startsWith(n))) return 2; if (h.includes(n)) return 3; return -1; };
    const teamById = new Map((teams.data ?? []).map(t => [t.id, t]));
    for (const t of teams.data ?? []) {
      const s = Math.min(...[t.name, t.short, `${t.name} ${t.mascot ?? ""}`].map(score).map(x => (x < 0 ? 99 : x)));
      if (s < 99) out.push({ kind: "Team", label: t.name, sub: `${t.rank ? `#${t.rank} · ` : ""}${t.confName} · ${t.w}–${t.l}`, href: `/teams/${t.slug}/`, logo: t.logo, score: s });
    }
    for (const c of confs.data ?? []) { const s = Math.min(score(c.name), score(c.code) < 0 ? 99 : score(c.code)); if (s >= 0 && s < 99) out.push({ kind: "Conference", label: c.name, sub: `#${c.rank} conference`, href: `/conferences/${c.slug}/`, score: s + 0.5 }); }
    if (players.data && n.length >= 2) {
      const f = players.data.fields, iName = f.indexOf("name"), iId = f.indexOf("id"), iTeam = f.indexOf("teamId"), iPts = f.indexOf("pts");
      for (const row of players.data.rows) {
        const s = score(String(row[iName]));
        if (s >= 0) { const t = teamById.get(String(row[iTeam])); out.push({ kind: "Player", label: String(row[iName]), sub: `${t?.name ?? ""} · ${row[iPts] ?? "—"} ppg`, href: `/player/?id=${row[iId]}`, logo: t?.logo, score: s + 0.25 }); }
      }
    }
    for (const p of PAGES) { const a = score(p.label), b = score(p.sub); const s = a >= 0 ? a : b >= 0 ? b + 1 : -1; if (s >= 0) out.push({ ...p, score: s + 1 }); }
    return out.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label)).slice(0, 12);
  }, [q, teams.data, players.data, confs.data, fav.teams]);

  useEffect(() => setActive(0), [q]);
  const go = (h: Hit) => { onClose(); router.push(h.href); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-3 pt-[10vh] backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onDialogKey}>
      <div ref={dialog} className="deck sheet-in w-full max-w-xl overflow-hidden !bg-deck shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-mute" aria-hidden />
          <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Team, player or conference"
            className="h-14 w-full bg-transparent text-base outline-none placeholder:text-dim" aria-label="Search" aria-controls="search-results" aria-activedescendant={hits[active] ? `hit-${active}` : undefined}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(hits.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
              else if (e.key === "Enter" && hits[active]) go(hits[active]);
            }} />
          <button onClick={onClose} className="text-mute hover:text-ink" aria-label="Close search"><X size={18} /></button>
        </div>
        <ul id="search-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-mute">Nothing matches “{q}”. Try a school name like “Duke” or a player’s last name.</li>}
          {hits.map((h, i) => (
            <li key={h.kind + h.href} id={`hit-${i}`} role="option" aria-selected={i === active}>
              <button onMouseEnter={() => setActive(i)} onClick={() => go(h)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${i === active ? "bg-deck2" : ""}`}>
                {h.kind === "Team" || h.kind === "Player" || h.kind === "Following" ? <TeamLogo src={h.logo ?? null} name={h.label} size={26} /> : <span className="grid h-[26px] w-[26px] place-items-center rounded-full border border-line2 text-[10px] text-mute">{h.kind === "Page" ? "↗" : "C"}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{h.label}</span>
                  <span className="block truncate text-xs text-mute">{h.sub}</span>
                </span>
                <span className="text-[11px] text-dim">{h.kind === "Following" ? "Following" : h.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
