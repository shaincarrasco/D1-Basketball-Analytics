"use client";
// Shared pieces of the lineup lab: player tags, the projection build-up and the balance check.
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { fmt, signed } from "@/lib/format";
import { htText, isBig, isHandler, isShooter, observedSd, RULES, type LabPlayer, type LabWarning, type LineupProjection } from "@/lib/lineup-lab";

export const DPR_TITLE = "DPR: points per 100 possessions a player adds vs an average D-I player, from play-by-play plus a box-score starting point. Positive is good on offense and defense.";

export function traitTags(p: LabPlayer) {
  const tags: { label: string; title: string }[] = [];
  if (isShooter(p)) tags.push({ label: "Shooter", title: `Projected ${fmt(p.tp)}% from three on ${fmt(p.tpa40)} attempts per 40 minutes` });
  if (isHandler(p)) tags.push({ label: "Handler", title: `Projected assist rate ${fmt(p.ast)}%` });
  if (isBig(p)) tags.push({ label: "Big", title: `${p.pos === "C" ? "Listed center" : "6′9″ or taller"}${p.ht ? `, ${htText(p.ht)}` : ""}` });
  if ((p.blk ?? 0) >= RULES.rim.good) tags.push({ label: "Rim protector", title: `Projected to block ${fmt(p.blk)}% of opponent twos` });
  return tags;
}

export function Tags({ p }: { p: LabPlayer }) {
  const tags = traitTags(p);
  if (!tags.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map(t => <span key={t.label} title={t.title} className="rounded-full border border-line px-1.5 py-px text-[11px] font-semibold text-mute">{t.label}</span>)}
    </span>
  );
}

const tone = (v: number) => (v > 0.05 ? "text-win" : v < -0.05 ? "text-loss" : "text-mute");

/** Line-by-line: DPR sums, then each fit adjustment, then the projected total. */
export function BuildUp({ proj }: { proj: LineupProjection }) {
  const row = (label: React.ReactNode, value: number, detail: React.ReactNode, side?: "off" | "def", strong = false, key?: string) => (
    <tr key={key} className="border-t border-line align-top">
      <td className="py-2 pr-3">
        <div className={`flex flex-wrap items-center gap-2 ${strong ? "font-bold" : "font-semibold"}`}>
          {label}
          {side && <span className={`rounded px-1.5 text-[10.5px] font-bold uppercase tracking-wide ${side === "off" ? "bg-off/15 text-off" : "bg-def/15 text-def"}`}>{side === "off" ? "Offense" : "Defense"}</span>}
        </div>
        {detail && <p className="mt-0.5 text-xs leading-snug text-mute">{detail}</p>}
      </td>
      <td className={`whitespace-nowrap py-2 text-right tabular-nums ${strong ? "text-base font-bold" : "font-semibold"} ${tone(value)}`}>{signed(value, 1)}</td>
    </tr>
  );
  return (
    <table className="w-full text-sm" aria-label="How the projection is built">
      <thead><tr className="text-left text-[11.5px] text-mute"><th className="pb-1 font-medium">Step</th><th className="pb-1 text-right font-medium">Net / 100</th></tr></thead>
      <tbody>
        {row("Players' offense (DPR)", proj.base.off, "Sum of the five players' DPR offense.", "off")}
        {row("Players' defense (DPR)", proj.base.def, "Sum of the five players' DPR defense (positive = fewer points allowed).", "def")}
        {proj.adjustments.map(a => row(`Fit: ${a.label}`, a.value, a.detail, a.side, false, a.key))}
        {row("Projected net per 100 possessions", proj.net, null, undefined, true)}
      </tbody>
    </table>
  );
}

export function Warnings({ list }: { list: LabWarning[] }) {
  const real = list.filter(w => w.level !== "info"), notes = list.filter(w => w.level === "info");
  return (
    <div>
      {real.length ? (
        <ul className="space-y-2" aria-label="Balance warnings">
          {real.map(w => (
            <li key={w.key} data-warning={w.key} className={`flex gap-2 rounded-lg border px-3 py-2 text-sm ${w.level === "high" ? "border-loss/50 bg-loss/10" : "border-line"}`}>
              <AlertTriangle aria-hidden size={16} className={`mt-0.5 shrink-0 ${w.level === "high" ? "text-loss" : "text-hot"}`} />
              <span>{w.text}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-mute">No balance problems: shooting, ball handling, size and rim protection all look normal for a college lineup.</p>}
      {notes.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {notes.map(w => <li key={w.key} className="flex gap-2 text-xs text-mute"><Info aria-hidden size={14} className="mt-px shrink-0" /><span>{w.text}</span></li>)}
        </ul>
      )}
    </div>
  );
}

/** "+12.4 over 46 possessions (± 22 from luck alone)". */
export function ObservedText({ net, poss }: { net: number; poss: number }) {
  const sd = observedSd(poss);
  return (
    <span>
      <b className={`font-semibold ${net >= 0 ? "text-win" : "text-loss"}`}>{signed(net, 1)}</b> over {fmt(poss, 0)} possessions
      {sd !== null && <span className="text-dim" title="One standard deviation of a unit's net rating from the bounce of the ball alone, at this many possessions"> (± {Math.round(sd)} from luck alone)</span>}
    </span>
  );
}

export function PlayerLink({ p, short = false }: { p: LabPlayer; short?: boolean }) {
  const parts = p.n.split(/\s+/);
  const label = short && parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : p.n;
  return <Link href={`/player/?id=${p.id}`} className="link font-semibold" title={p.n}>{label}</Link>;
}
