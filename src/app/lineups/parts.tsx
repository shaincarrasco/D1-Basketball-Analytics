"use client";
// Shared pieces of the lineup lab: player slots, the result hero, the fit check, the build-up list,
// the sheet and the toast.
import Link from "next/link";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, Plus, X } from "lucide-react";
import TeamLogo from "@sports/ui/team-logo";
import { fmt, signed } from "@sports/ui/format";
import { dpr, htText, isBig, isHandler, isShooter, lastName, observedSd, RULES, type LabData, type LabPlayer, type LabWarning, type LineupProjection, type Verdict } from "@/lib/lineup-lab";
import s from "./lab.module.css";

export const DPR_TITLE = "Player rating (DPR): points per 100 possessions a player adds vs an average D-I player, from play-by-play plus a box-score starting point.";

export function traitTags(p: LabPlayer) {
  const tags: { label: string; title: string }[] = [];
  if (isShooter(p)) tags.push({ label: "Shooter", title: `Projected ${fmt(p.tp)}% from three on ${fmt(p.tpa40)} attempts per 40 minutes` });
  if (isHandler(p)) tags.push({ label: "Handler", title: `Projected assist rate ${fmt(p.ast)}%` });
  if (isBig(p)) tags.push({ label: "Big", title: `${p.pos === "C" ? "Listed center" : "6′9″ or taller"}${p.ht ? `, ${htText(p.ht)}` : ""}` });
  if ((p.blk ?? 0) >= RULES.rim.good) tags.push({ label: "Rim protector", title: `Projected to block ${fmt(p.blk)}% of opponent twos` });
  return tags;
}

const toneText = (v: number) => (v > 0.05 ? "text-win" : v < -0.05 ? "text-loss" : "text-mute");
const posLine = (p: LabPlayer) => [p.pos, p.ht ? htText(p.ht) : null].filter(Boolean).join(" ");

/** Team identity: logo plus the team colour (contrast-adjusted per theme by .team-accent). */
const teamStyle = (color: string | null) => (color ? ({ "--team": color } as React.CSSProperties) : undefined);

// ---------- your five ----------

export function Slots({ data, players, fresh, onRemove, onAdd }: {
  data: LabData; players: LabPlayer[]; fresh: string | null;
  onRemove: (p: LabPlayer) => void; onAdd: () => void;
}) {
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label="Your five">
      {Array.from({ length: 5 }, (_, i) => {
        const p = players[i];
        if (!p) {
          return (
            <li key={`empty-${i}`}>
              <button type="button" onClick={onAdd} aria-label={`Add a player to spot ${i + 1}`}
                className="flex h-[104px] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line2 text-dim transition-colors hover:border-mute hover:text-mute">
                <Plus size={20} aria-hidden />
                <span className="text-[12px] font-semibold">Add</span>
              </button>
            </li>
          );
        }
        const t = data.teams.get(p.t);
        return (
          <li key={p.id} data-slot={p.id} className={`team-accent relative ${fresh === p.id ? s.pop : ""}`} style={teamStyle(t?.color ?? null)}>
            <div className="flex h-[104px] flex-col items-center overflow-hidden rounded-2xl bg-deck px-1 pb-2 shadow-[var(--shadow)]">
              <span aria-hidden className="h-[3px] w-full rounded-b-full" style={{ background: "var(--accent)" }} />
              <TeamLogo src={t?.logo ?? null} name={t?.name ?? p.t} size={30} className="mt-5" />
              <Link href={`/player/?id=${p.id}`} className="link mt-2 w-full truncate text-center text-[13px] font-semibold leading-tight" title={p.n}>{lastName(p.n)}</Link>
              <span className="mt-0.5 w-full truncate text-center text-[12px] leading-tight text-mute">{posLine(p) || t?.short}</span>
            </div>
            <button type="button" onClick={() => onRemove(p)} aria-label={`Remove ${p.n}`}
              className="group absolute right-0 top-0 flex h-10 w-10 items-start justify-end p-1.5">
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-deck2 text-mute group-hover:text-ink"><X size={13} strokeWidth={2.5} aria-hidden /></span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- result ----------

const VERDICT_TONE: Record<Verdict["tone"], string> = { good: "text-win", mid: "text-ink", bad: "text-loss" };

export function Hero({ data, proj, v, observed, onHow, actions }: {
  data: LabData; proj: LineupProjection; v: Verdict; observed?: React.ReactNode; onHow: () => void; actions?: React.ReactNode;
}) {
  const ref = data.meta.reference;
  const problems = proj.warnings.filter(w => w.level === "high").length;
  const best = ref.best[0], bestTeam = best ? data.teams.get(best.t) : null;
  const pctText = v.pct == null ? null
    : v.beyond ? "Better than every D-I starting five"
    : v.pct >= 0.5 ? `Better than ${Math.round(v.pct * 100)}% of D-I starting fives`
    : `Worse than ${Math.round((1 - v.pct) * 100)}% of D-I starting fives`;
  return (
    <section aria-label="Projection" className="rounded-[20px] bg-deck p-5 shadow-[var(--shadow)]" data-testid="lab-hero">
      <p className="text-[15px] font-semibold text-mute">Projected net per 100 possessions</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span data-testid="lab-net" className="font-display text-[64px] font-black leading-none tracking-tight tabular-nums">{signed(proj.net, 1)}</span>
          <span className={`font-display text-[26px] font-extrabold leading-none ${VERDICT_TONE[v.tone]}`} data-testid="lab-verdict">{v.label}{problems > 0 && v.tone !== "bad" ? " on paper" : ""}</span>
        </div>
        {actions}
      </div>
      {pctText && <p className="mt-2 text-[15px] text-ink">{pctText}</p>}
      {problems > 0 && v.tone !== "bad" && <p className="mt-1 text-[14px] leading-snug text-mute">{problems === 1 ? "One big fit problem" : `${problems} big fit problems`} below that the ratings can&apos;t fully price in.</p>}
      {ref.starters.length > 0 && <Strip values={ref.starters} net={proj.net} tone={v.tone} bestLabel={bestTeam ? `${bestTeam.name} ${signed(best.net, 1)}` : null} />}
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13px]">
        <div><dt className="text-mute">Scores per 100</dt><dd className="mt-0.5 text-[17px] font-semibold tabular-nums">{fmt(proj.ptsFor, 1)}</dd></div>
        <div><dt className="text-mute">Allows per 100</dt><dd className="mt-0.5 text-[17px] font-semibold tabular-nums">{fmt(proj.ptsAgainst, 1)}</dd></div>
      </dl>
      {observed}
      <p className="mt-4 text-[13px] leading-snug text-mute">
        Their ratings add up to {signed(proj.raw, 1)}; real teams keep about {Math.round(proj.scale * 100)}% of a summed rating, so we scale it down.{" "}
        <button type="button" onClick={onHow} className="font-semibold text-ink underline decoration-line2 underline-offset-2 hover:decoration-ink">How the lab works</button>
      </p>
    </section>
  );
}

/** Every D-I team's projected starting five as a tick, this lineup as the marker. */
function Strip({ values, net, tone, bestLabel }: { values: number[]; net: number; tone: Verdict["tone"]; bestLabel: string | null }) {
  const lo = Math.min(values[0], net), hi = Math.max(values[values.length - 1], net);
  const span = hi - lo || 1;
  const x = (v: number) => ((v - lo) / span) * 100;
  const median = values[Math.floor(values.length / 2)];
  const color = tone === "good" ? "var(--win)" : tone === "bad" ? "var(--loss)" : "var(--ink)";
  const markX = x(net);
  return (
    <figure className="mt-4" aria-label={`Among ${values.length} D-I starting fives, from ${signed(values[0], 1)} to ${signed(values[values.length - 1], 1)}`}>
      <div className="relative h-7">
        <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          {values.map((v, i) => <line key={i} x1={x(v)} x2={x(v)} y1={6} y2={18} stroke="var(--dim)" strokeOpacity={0.45} strokeWidth={0.25} vectorEffect="non-scaling-stroke" />)}
          <line x1={x(median)} x2={x(median)} y1={2} y2={20} stroke="var(--mute)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </svg>
        <span aria-hidden className="absolute top-0 h-7 w-[3px] -translate-x-1/2 rounded-full" style={{ left: `${markX}%`, background: color }} />
      </div>
      <figcaption className="mt-1 flex justify-between gap-2 text-[12px] text-mute">
        <span>Typical {signed(median, 1)}</span>
        {bestLabel && <span className="truncate text-right">Best real five: {bestLabel}</span>}
      </figcaption>
    </figure>
  );
}

/** "+12.4 over 46 possessions (± 22 from luck alone)". */
export function ObservedText({ net, poss }: { net: number; poss: number }) {
  const sd = observedSd(poss);
  return (
    <span>
      <b className={`font-semibold ${toneText(net)}`}>{signed(net, 1)}</b> over {fmt(poss, 0)} possessions
      {sd !== null && <span className="text-mute" title="How far a unit's net swings from the bounce of the ball alone at this many possessions"> (±{Math.round(sd)} from luck)</span>}
    </span>
  );
}

// ---------- fit check ----------

const LEVEL: Record<LabWarning["level"], { cls: string; label: string }> = {
  high: { cls: "text-loss", label: "Big problem" },
  mid: { cls: "text-off", label: "Watch out" },
  low: { cls: "text-mute", label: "Minor" },
  info: { cls: "text-mute", label: "Note" },
};

export function FitCheck({ list }: { list: LabWarning[] }) {
  const real = list.filter(w => w.level !== "info"), notes = list.filter(w => w.level === "info");
  return (
    <section aria-labelledby="fit-h">
      <h2 id="fit-h" className="mb-2 px-1 font-display text-[22px] font-extrabold">Fit check</h2>
      <ul className="overflow-hidden rounded-2xl bg-deck shadow-[var(--shadow)]" aria-label="Balance warnings">
        {real.length === 0 && (
          <li className="flex gap-3 px-4 py-3.5">
            <CheckCircle2 size={20} aria-hidden className="mt-px shrink-0 text-win" />
            <div><p className="text-[15px] font-semibold">Balanced</p><p className="text-[14px] leading-snug text-mute">Shooting, ball handling, size and rim protection all look normal.</p></div>
          </li>
        )}
        {real.map((w, i) => (
          <li key={w.key} data-warning={w.key} className={`flex gap-3 px-4 py-3.5 ${i ? "border-t border-line" : ""}`}>
            <AlertTriangle size={20} aria-hidden className={`mt-px shrink-0 ${LEVEL[w.level].cls}`} />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold"><span className="sr-only">{LEVEL[w.level].label}: </span>{w.title}</p>
              <p className="text-[14px] leading-snug text-mute">{w.text}</p>
            </div>
          </li>
        ))}
        {notes.map(w => (
          <li key={w.key} data-note={w.key} className="flex gap-3 border-t border-line px-4 py-3">
            <Info size={18} aria-hidden className="mt-px shrink-0 text-dim" />
            <p className="text-[13px] leading-snug text-mute"><b className="font-semibold text-ink">{w.title}.</b> {w.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- build-up ----------

function Row({ label, sub, value, strong = false, lead }: { label: React.ReactNode; sub?: React.ReactNode; value: number; strong?: boolean; lead?: React.ReactNode }) {
  return (
    <li className="flex min-h-[52px] items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
      {lead}
      <div className="min-w-0 flex-1">
        <div className={`text-[15px] leading-snug ${strong ? "font-bold" : "font-semibold"}`}>{label}</div>
        {sub && <div className="text-[13px] leading-snug text-mute">{sub}</div>}
      </div>
      <span className={`shrink-0 tabular-nums ${strong ? "text-[20px] font-bold" : "text-[15px] font-semibold"} ${strong ? "" : toneText(value)}`}>{signed(value, 1)}</span>
    </li>
  );
}

/** Player ratings, the reality check, each fit adjustment that moved the number, the total. */
export function BuildUp({ data, players, proj }: { data: LabData; players: LabPlayer[]; proj: LineupProjection }) {
  const baseSum = proj.base.off + proj.base.def;
  const moved = proj.adjustments.filter(a => a.value !== 0), normal = proj.adjustments.filter(a => a.value === 0);
  return (
    <section aria-labelledby="build-h">
      <h2 id="build-h" className="mb-2 px-1 font-display text-[22px] font-extrabold">How we got there</h2>
      <ul className="overflow-hidden rounded-2xl bg-deck shadow-[var(--shadow)]" aria-label="How the projection is built">
        {[...players].sort((a, b) => dpr(b) - dpr(a)).map(p => {
          const t = data.teams.get(p.t);
          const tags = traitTags(p).map(x => x.label).join(", ");
          return (
            <Row key={p.id} lead={<TeamLogo src={t?.logo ?? null} name={t?.name ?? p.t} size={26} />}
              label={<Link href={`/player/?id=${p.id}`} className="link">{p.n}</Link>}
              sub={<span title={DPR_TITLE}>{[t?.short, posLine(p), tags].filter(Boolean).join(", ")}</span>}
              value={dpr(p)} />
          );
        })}
        <Row label="Ratings added up" sub="Five player ratings (DPR), offense plus defense" value={baseSum} />
        <Row label={`Reality check, ×${proj.scale.toFixed(2)}`} sub={`Real teams keep about ${Math.round(proj.scale * 100)}% of a summed rating`} value={(proj.scale - 1) * baseSum} />
        {moved.map(a => <Row key={a.key} label={a.label} sub={a.short} value={a.value} />)}
        {normal.length > 0 && (
          <li className="border-t border-line px-4 py-2.5 text-[13px] text-mute">Normal, no change: {normal.map(a => a.label.toLowerCase()).join(", ")}</li>
        )}
        <Row label="Projected net per 100" value={proj.net} strong />
      </ul>
    </section>
  );
}

// ---------- sheet + toast ----------

export type SheetHandle = { open: () => void };

/** Native <dialog>: bottom sheet on phones, centred panel on wider screens. */
export const Sheet = forwardRef<SheetHandle, { title: string; children: React.ReactNode }>(function Sheet({ title, children }, ref) {
  const el = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => ({ open: () => { el.current?.showModal(); setOpen(true); } }), []);
  return (
    <dialog ref={el} className={s.sheet} aria-labelledby="sheet-title" onClose={() => setOpen(false)}
      onClick={e => { if (e.target === el.current) el.current?.close(); }}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 pb-3 pt-2">
        <div className="w-full">
          <span aria-hidden className="mx-auto mb-2 block h-1.5 w-10 rounded-full bg-line2 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <h2 id="sheet-title" className="font-display text-[24px] font-extrabold">{title}</h2>
            <button type="button" onClick={() => el.current?.close()} className="flex h-9 w-9 items-center justify-center rounded-full bg-deck2 text-mute hover:text-ink" aria-label="Close">
              <X size={18} aria-hidden />
            </button>
          </div>
        </div>
      </div>
      <div className="overflow-y-auto overscroll-contain px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-4">{open && children}</div>
    </dialog>
  );
});

export function Toast({ msg }: { msg: { text: string; id: number } | null }) {
  const [shown, setShown] = useState(msg);
  useEffect(() => {
    setShown(msg);
    if (!msg) return;
    const t = window.setTimeout(() => setShown(null), 2200);
    return () => window.clearTimeout(t);
  }, [msg]);
  return (
    <div aria-live="polite" role="status" className="pointer-events-none">
      {shown && (
        <div key={shown.id} className={`${s.toast} fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-50 max-w-[90vw] -translate-x-1/2 truncate rounded-full bg-ink px-4 py-2.5 text-[15px] font-semibold text-night shadow-lg lg:bottom-8`}>
          {shown.text}
        </div>
      )}
    </div>
  );
}

/** A tappable grouped-list row with a chevron (navigates or opens something). */
export function NavRow({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`${s.row} flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl bg-deck px-4 text-left text-[15px] font-semibold shadow-[var(--shadow)]`}>
      {children}<ChevronRight size={18} aria-hidden className="text-dim" />
    </button>
  );
}

export { s as labStyles };
