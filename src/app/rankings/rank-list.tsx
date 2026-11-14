"use client";
// Phone rankings: Apple Sports-style grouped rows. Swipe a row left to reveal Compare and
// Follow; the actions are real buttons, so keyboard users reach them with Tab (focusing one
// slides the row open). Tapping a row opens the team.
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Star } from "lucide-react";
import TeamLogo from "@/components/team-logo";
import { Dots } from "@/components/dots";
import { RankMove } from "@/components/live-ratings-note";
import { signed } from "@/lib/format";
import { toggleFavorite, useFavorites } from "@/lib/favorites";
import type { TeamSummary } from "@/lib/types";

const ACTIONS = 148; // px revealed by a full swipe
export type Source = "dhr" | "ap" | "coaches";

function Form({ t }: { t: TeamSummary }) {
  const last = t.last.slice(-4);
  return (
    <span className="flex h-6 w-[38px] shrink-0 items-end justify-end gap-[3px]" aria-label={`Last ${last.length}: ${last.map(g => `${g.r} by ${Math.abs(g.m)}`).join(", ")}`}>
      {last.map((g, i) => (
        <i key={i} className={`w-[5px] rounded-[1px] ${g.r === "W" ? "bg-win" : "bg-loss"}`} style={{ height: Math.max(4, Math.min(22, Math.round(Math.abs(g.m) / 3))) }} />
      ))}
    </span>
  );
}

/** One "box-score footnote" for the list: a top-10 team that wins with only one end of the floor. */
function outlier(top: TeamSummary[]) {
  const ten = top.slice(0, 10).filter(t => t.adjORank && t.adjDRank);
  for (const side of ["off", "def"] as const) {
    const r = (t: TeamSummary) => (side === "off" ? t.adjORank! : t.adjDRank!);
    const out = ten.filter(t => r(t) > 25);
    if (out.length === 1) {
      const t = out[0], other = side === "off" ? t.adjDRank! : t.adjORank!;
      const leans = side === "off" ? "defense" : "offense", weak = side === "off" ? "offense" : "defense";
      return { id: t.id, text: `${t.name} leans on ${leans}: No. ${other} in the country there, No. ${r(t)} on ${weak}. Every other top-10 team is top 25 on ${weak}.` };
    }
  }
  return null;
}

export default function RankList({ teams, prevRank, source }: { teams: TeamSummary[]; prevRank: Map<string, number | null | undefined>; source: Source }) {
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(50);
  const fav = useFavorites();
  const rows = useMemo(() => {
    if (source === "dhr") return teams.filter(t => t.rank).sort((a, b) => a.rank! - b.rank!);
    const k = source === "ap" ? "ap" : "coaches";
    return teams.filter(t => t[k]?.rank).sort((a, b) => a[k]!.rank - b[k]!.rank);
  }, [teams, source]);
  const note = useMemo(() => (source === "dhr" ? outlier(rows) : null), [rows, source]);
  if (!rows.length) return <p className="deck p-5 text-sm text-mute">No teams match. Clear the search or pick another conference.</p>;
  return (
    <div>
      <div className="flex items-center gap-3 px-4 pb-2 text-xs font-semibold text-dim" aria-hidden>
        <span className="w-[74px]">Rank</span><span className="flex-1">Team</span><span className="w-[38px] text-right">Form</span><span className="w-[56px] text-right">Rating</span>
      </div>
      <ul className="overflow-hidden rounded-[18px] bg-deck">
        {rows.slice(0, shown).map(t => (
          <li key={t.id}>
            <Row t={t} rank={source === "dhr" ? t.rank! : source === "ap" ? t.ap!.rank : t.coaches!.rank} prev={source === "dhr" ? prevRank.get(t.id) : undefined}
              followed={fav.teams.includes(t.slug)} open={open === t.id} setOpen={o => setOpen(o ? t.id : null)} source={source} />
            {note?.id === t.id && (
              <p className="note border-b border-line bg-deck2/60 px-4 py-3 text-[14px] leading-snug">{note.text}</p>
            )}
          </li>
        ))}
      </ul>
      {shown < rows.length && <button className="btn mt-3 w-full" onClick={() => setShown(s => s + 50)}>Show {Math.min(50, rows.length - shown)} more</button>}
      <p className="mt-3 text-center text-[13px] text-mute">Swipe a team to follow or compare</p>
    </div>
  );
}

function Row({ t, rank, prev, followed, open, setOpen, source }: { t: TeamSummary; rank: number; prev: number | null | undefined; followed: boolean; open: boolean; setOpen: (o: boolean) => void; source: Source }) {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number; axis: "x" | "y" | null } | null>(null);
  const moved = useRef(false);
  const x = drag ?? (open ? -ACTIONS : 0);

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return; // desktop uses the table; mouse users can Tab or click actions
    start.current = { x: e.clientX, y: e.clientY, base: open ? -ACTIONS : 0, axis: null };
    moved.current = false;
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.axis) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y"; }
    if (s.axis !== "x") return;
    moved.current = true;
    setDrag(Math.max(-ACTIONS - 24, Math.min(0, s.base + dx)));
  };
  const onUp = () => {
    const s = start.current;
    start.current = null;
    if (drag !== null) { setOpen(drag < -ACTIONS / 2.5); setDrag(null); }
    else if (s?.axis === null && open) { setOpen(false); moved.current = true; }
  };

  const sub = source === "dhr" ? (t.ap ? `AP ${t.ap.rank}` : "") : `DHR ${t.rank ?? "—"}`;
  return (
    <div className="relative overflow-hidden border-b border-line" style={{ touchAction: "pan-y" }}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTIONS }}>
        <Link href={`/matchup/?a=${t.slug}`} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} tabIndex={0}
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-line2 text-[11px] font-bold text-ink">
          <ArrowLeftRight size={18} aria-hidden />Compare<span className="sr-only"> {t.name}</span>
        </Link>
        <button type="button" onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => { toggleFavorite("teams", t.slug); setOpen(false); }} aria-pressed={followed}
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-bulb text-[11px] font-bold text-scoreboard">
          <Star size={18} aria-hidden fill={followed ? "currentColor" : "none"} />{followed ? "Following" : "Follow"}<span className="sr-only"> {t.name}</span>
        </button>
      </div>
      <Link href={`/teams/${t.slug}/`} draggable={false}
        onClick={e => { if (moved.current) { e.preventDefault(); moved.current = false; } }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        className={`relative flex items-center gap-3 bg-deck py-3 pl-3.5 pr-4 ${drag === null ? "transition-transform duration-200 ease-out" : ""}`}
        style={{ transform: `translateX(${x}px)` }}>
        <span className="flex w-[34px] shrink-0 flex-col items-end"><Dots className="text-[24px]">{rank}</Dots><RankMove now={t.rank} before={prev ?? undefined} /></span>
        <TeamLogo src={t.logo} name={t.name} size={32} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-display text-[19px] font-extrabold leading-tight">{t.name}</span>
            {followed && <Star size={12} aria-label="Following" className="shrink-0 text-bulb-ink" fill="currentColor" />}
          </span>
          <span className="block truncate text-xs text-mute">{t.confName}, {t.w}-{t.l}</span>
        </span>
        <Form t={t} />
        <span className="flex w-[56px] shrink-0 flex-col items-end">
          <span className="font-display text-[20px] font-extrabold tnum">{signed(t.adjEM, 1)}</span>
          <span className="text-[11px] text-mute">{sub}</span>
        </span>
      </Link>
    </div>
  );
}
