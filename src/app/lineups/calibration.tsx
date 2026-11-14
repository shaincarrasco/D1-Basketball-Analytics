"use client";
// "How the lab works": the method, the reality check and the check against real lineups, in a sheet.
import Link from "next/link";
import { fmt, signed } from "@/lib/format";
import { RULES, type LabData } from "@/lib/lineup-lab";

const LABEL: Record<string, string> = { spacing: "Spacing", handling: "Ball handling", usage: "Shot creation", rim: "Rim protection", boards: "Rebounding" };

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 mt-6 text-[17px] font-bold text-ink first:mt-0">{children}</h3>;
}

export default function HowItWorks({ data }: { data: LabData }) {
  const { scale, reference, calibration } = data.meta;
  const all = calibration.all, big = calibration.big;
  const n = reference.starters.length;
  const best = reference.best.map(b => `${data.teams.get(b.t)?.name ?? b.t} ${signed(b.net, 1)}`).join(", ");
  return (
    <div className="text-[15px] leading-relaxed text-mute" data-testid="lab-calibration">
      <H>The number</H>
      <p>
        <b className="text-ink">Projected net per 100 possessions</b>: how many points this five would outscore an average D-I lineup by over 100 possessions, on a neutral floor.
        It starts from each player&apos;s <Link href="/methodology/#dpr" className="font-semibold text-ink underline">rating (DPR)</Link>, the points he adds on top of the other nine players on the floor, so adding five ratings is its natural use.
      </p>

      <H>The reality check</H>
      {scale ? (
        <>
          <p>
            Added up raw, five top players come to +60 or more, far beyond any real team. Early-season ratings run hot (box-score starting points aren&apos;t adjusted for opponent, and blowouts count) and the top of any list is partly luck.
            So we checked how much of a summed rating shows up in real results: across all {scale.teams} D-I teams, each team&apos;s minutes-weighted rating sum against its opponent-adjusted margin (AdjEM).
          </p>
          <p className="mt-2">
            Real teams keep <b className="text-ink">{Math.round(scale.k * 100)}%</b> of their summed rating (slope {fmt(scale.k, 2)} ± {fmt(scale.se, 2)}, correlation {fmt(scale.r, 2)}, typical miss ±{fmt(scale.rmse, 1)} points per 100).
            Every projection here multiplies the rating sum by {fmt(scale.k, 2)}, then adds the fit adjustments. We redo the fit with every data update.
          </p>
        </>
      ) : <p>Not enough teams have played yet to fit the reality check, so ratings are added up as they are.</p>}

      <H>The grade</H>
      <p>
        We run the same projection on every D-I team&apos;s top five by minutes ({n} lineups) and grade yours against them: Elite is the top 5%, Very good the top 20%, Good the top 40%, Average the middle, then Below average and Weak.
        {best && <> The best real starting fives right now: {best}.</>}
      </p>

      <H>Fit adjustments</H>
      <p>Small rules of thumb for what a plain sum misses, from each player&apos;s <Link href="/players/projections/" className="font-semibold text-ink underline">skill projections</Link>. Each is zero for a normal lineup.</p>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li><b className="text-ink">Spacing.</b> Shooters: projected {RULES.shooter.tp}%+ from three on {RULES.shooter.tpa40}+ attempts per 40. By count 0–5: {RULES.spacing.map(v => (v > 0 ? `+${v}` : `${v}`)).join(", ")}.</li>
        <li><b className="text-ink">Ball handling.</b> Handlers: projected assist rate {RULES.handler.ast}%+. None: {RULES.handling[0]}; two or more: +{RULES.handling[2]}.</li>
        <li><b className="text-ink">Shot creation.</b> Projected usage should add up to {RULES.usage.low}–{RULES.usage.high}%; outside that, −{RULES.usage.lowPer} per point short or −{RULES.usage.highPer} per point over.</li>
        <li><b className="text-ink">Rim protection.</b> Best projected block rate {RULES.rim.good}%+ is normal, {RULES.rim.elite}%+ adds +{RULES.rim.eliteBonus}; {RULES.rim.ok}–{RULES.rim.good}%: {RULES.rim.thin}; under {RULES.rim.ok}%: {RULES.rim.none}.</li>
        <li><b className="text-ink">Rebounding.</b> Projected defensive rebound rates should add up to {RULES.boards.low}–{RULES.boards.high}%; −{RULES.boards.lowPer} per point short, +{RULES.boards.highPer} per point over (between {RULES.boards.min} and +{RULES.boards.max}).</li>
      </ul>
      <p className="mt-2">The sizes are priors we chose, not fitted: this early, real lineups don&apos;t have enough possessions to fit them. Opponent, venue and fatigue aren&apos;t in the projection.</p>

      <H>Checked against real lineups</H>
      {all ? (
        <>
          <p>
            {all.units.toLocaleString("en-US")} real five-man units ({all.poss.toLocaleString("en-US")} possessions) from this season&apos;s play-by-play. The average unit has played about {Math.round(all.poss / all.units)} possessions; at that size luck alone swings its net by about ±{Math.round(all.noiseSd)}.
          </p>
          {big && <p className="mt-2">For the {big.units} units with 40+ possessions, the raw rating sum tracks their real net at a correlation of <b className="text-ink">{fmt(big.corrBase, 2)}</b> (all units {fmt(all.corrBase, 2)}). That flatters the ratings, which are fit on these same possessions, and unit nets aren&apos;t adjusted for opponent, which is why the reality check uses whole teams{big.slopeBase != null ? <> (fit on these units instead, the slope comes out {fmt(big.slopeBase, 2)}: in-sample, it can&apos;t say how ratings hold up)</> : null}.</p>}
          {all.fitScale && <p className="mt-2">Fit adjustments: real results line up with them at a scale of {fmt(all.fitScale.s, 2)} ± {fmt(all.fitScale.se, 2)} (1 would mean our sizes are right), so they&apos;re plausible but not proven yet. By adjustment: {Object.entries(all.byAdjustment).filter(([, v]) => v).map(([k, v]) => `${LABEL[k] ?? k} ${fmt(v!.s, 1)} ± ${fmt(v!.se, 1)}`).join("; ")}.</p>}
        </>
      ) : <p>No real units to check against yet.</p>}
    </div>
  );
}
