"use client";
// "How well does this match real lineups?": the build's check of the model against observed units.
import Link from "next/link";
import { fmt } from "@/lib/format";
import { RULES, type LabData } from "@/lib/lineup-lab";

const LABEL: Record<string, string> = { spacing: "Spacing", handling: "Ball handling", usage: "Shot creation", rim: "Rim protection", boards: "Size and rebounding" };

export default function Calibration({ meta }: { meta: LabData["meta"] }) {
  const all = meta.calibration.all, big = meta.calibration.big;
  return (
    <section className="space-y-3">
      <details className="deck p-4 sm:p-5">
        <summary className="cursor-pointer font-bold">How the lab works</summary>
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-mute">
          <p><b className="text-ink">Start:</b> add up the five players&apos; <Link href="/methodology/#dpr" className="link underline">DPR</Link> offense and defense. DPR is built as &ldquo;points a player adds on top of the other nine on the floor&rdquo;, so adding five is its natural use. Early in the season most of each DPR is still the box-score starting point.</p>
          <p><b className="text-ink">Fit adjustments</b> use each player&apos;s <Link href="/players/projections/" className="link underline">skill projections</Link> for what a plain sum misses. Each is zero for a normal lineup:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Spacing: shooters are players projected {RULES.shooter.tp}%+ from three on {RULES.shooter.tpa40}+ attempts per 40. By count 0–5: {RULES.spacing.map(v => (v > 0 ? `+${v}` : v)).join(", ")}.</li>
            <li>Ball handling: handlers have a projected assist rate of {RULES.handler.ast}%+. None: {RULES.handling[0]}; two or more: +{RULES.handling[2]}.</li>
            <li>Shot creation: projected usage should add up to {RULES.usage.low}–{RULES.usage.high}%; outside that, −{RULES.usage.lowPer} per point short or −{RULES.usage.highPer} per point over.</li>
            <li>Rim protection: best projected block rate {RULES.rim.good}%+ is normal, {RULES.rim.elite}%+ adds +{RULES.rim.eliteBonus}; {RULES.rim.ok}–{RULES.rim.good}%: {RULES.rim.thin}; under {RULES.rim.ok}%: {RULES.rim.none}.</li>
            <li>Rebounding: projected defensive rebound rates should add up to {RULES.boards.low}–{RULES.boards.high}%; −{RULES.boards.lowPer} per point short, +{RULES.boards.highPer} per point over (capped {RULES.boards.min} to +{RULES.boards.max}).</li>
          </ul>
          <p>The sizes are rules of thumb we chose, not fitted: this early, real lineups don&apos;t have enough possessions to fit them. Projections are vs an average D-I lineup on a neutral floor; the opponent, venue and fatigue aren&apos;t in it.</p>
        </div>
      </details>
      <details className="deck p-4 sm:p-5" data-testid="lab-calibration">
        <summary className="cursor-pointer font-bold">How well does this match real lineups?</summary>
        {all ? (
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-mute">
            <p>We checked the lab against <b className="text-ink">{all.units.toLocaleString("en-US")}</b> real five-man units ({all.poss.toLocaleString("en-US")} possessions) from this season&apos;s play-by-play. Samples are tiny: the average unit has played about {Math.round(all.poss / all.units)} possessions, and at that size luck alone moves a unit&apos;s net by about ±{Math.round(all.noiseSd)} points per 100.</p>
            {big && <p>For the {big.units} units with 40+ possessions, the DPR sum lines up with their real net at a correlation of <b className="text-ink">{fmt(big.corrBase, 2)}</b> (all units: {fmt(all.corrBase, 2)}). That flatters DPR, which is fit on these same possessions; it isn&apos;t a test on new games.</p>}
            {all.fitScale && <p>Fit adjustments: if their sizes are right, real results should line up with them at a scale of about 1. The data says <b className="text-ink">{fmt(all.fitScale.s, 2)} ± {fmt(all.fitScale.se, 2)}</b>: consistent with our sizes, but not yet clearly different from zero, and they barely change the typical miss ({fmt(all.rmseLevel.base, 1)} → {fmt(all.rmseLevel.full, 1)} points per 100, almost all of it luck). By adjustment: {Object.entries(all.byAdjustment).filter(([, v]) => v).map(([k, v]) => `${LABEL[k] ?? k} ${fmt(v!.s, 1)} ± ${fmt(v!.se, 1)}`).join(" · ")}.</p>}
            <p>Real units ran {fmt(all.meanResidual, 1)} points per 100 above their DPR sum on average: real nets aren&apos;t adjusted for opponent (games against non-D-I teams count) and the units that get minutes are the ones coaches trust. We&apos;ll redo this check as samples grow.</p>
          </div>
        ) : <p className="mt-3 text-sm text-mute">No observed units to check against yet.</p>}
      </details>
    </section>
  );
}
