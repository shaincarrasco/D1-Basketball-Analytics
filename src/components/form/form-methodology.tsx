// Methodology page section for form, consistency, movers and indispensability.
// Every number comes from the constants in src/lib/form.ts, so the page can't drift from the badges.
import Link from "next/link";
import {
  CONSISTENCY_MIN_GAMES, DPR_PRIOR_POSS, DPR_SHRINK_POSS, FORM_MIN_GAMES, FORM_MIN_GAMES_BEFORE, FORM_MIN_GAP, FORM_WINDOW_DAYS, FORM_WORDS, FORM_Z,
  INDISPENSABLE_MIN_GAMES, INDISPENSABLE_MIN_MPG, MOVER_DAYS, MOVER_MIN_GAMES, REPLACEMENT_DPR, STEADY_RATIO, VOLATILE_RATIO,
} from "@/lib/form";
import { getAllForms, getForm } from "@/lib/form-server";

export const FORM_TOC = [{ id: "form", label: "Form, movers, indispensable" }];

export const FORM_GLOSSARY = {
  group: "Form and trend",
  terms: [
    { term: "Hot / Cold", def: `${FORM_WORDS.hot} ${FORM_WORDS.cold.replace("Cold: ", "Cold is the opposite: ")}` },
    { term: "Steady / Volatile", def: `${FORM_WORDS.steady} ${FORM_WORDS.volatile}` },
    { term: "Biggest movers", def: `Change in a team's DHR rating over the last ${MOVER_DAYS} days of results, with its rank before and now. Ratings move when a team plays and when its past opponents do.` },
    { term: "Indispensable", def: `${FORM_WORDS.indispensable} Points per 100 possessions; an estimate built from minutes and DPR, not a measured result.` },
  ],
};

export default function FormMethodology() {
  const file = getForm();
  const { spread } = getAllForms();
  const games = Object.values(file.perf).reduce((s, l) => s + l.length, 0);
  const snaps = file.history?.through.length ?? 0;
  const need = (n: number) => Math.max(FORM_MIN_GAP, (FORM_Z * spread) / Math.sqrt(n)).toFixed(1);
  return (
    <section id="form" aria-labelledby="form-h" className="scroll-mt-20 border-t border-line pt-8">
      <h2 id="form-h" className="h-section mb-4">Form, movers and indispensable players</h2>
      <div className="space-y-4 text-[15px] leading-relaxed text-mute [&_b]:font-semibold [&_b]:text-ink">
        <p><b>Rating history.</b> Every time new results come in, DHR is refit using only the games played by then (the same walk-forward fits behind the pregame predictions). Each refit is saved, starting from the preseason rating, so team pages can show how a rating got where it is. This season so far: {snaps} snapshots.</p>
        <p><b>Game performance.</b> For each completed D-I game with a box score: the team&apos;s efficiency margin in that game, adjusted for the opponent&apos;s current AdjO and AdjD and for venue. It is on the same scale as DHR, so a team rated +15 &ldquo;should&rdquo; average +15 per game.</p>
        <p><b>Form (Hot / Cold).</b> The average game performance over the last {FORM_WINDOW_DAYS} days, minus the team&apos;s DHR rating. A tag needs all three:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>{FORM_MIN_GAMES}+ D-I games in the window;</li>
          <li>{FORM_MIN_GAMES_BEFORE}+ games before the window. Until then every game is a recent game, the &ldquo;recent&rdquo; and &ldquo;season&rdquo; numbers are the same games, and the gap would only show how much the rating still leans on last season;</li>
          <li>a gap of at least {FORM_MIN_GAP} points per 100 possessions and at least {FORM_Z} standard errors of a recent average. Single games swing about ±{spread.toFixed(1)} around a team&apos;s rating (measured across {games.toLocaleString("en-US")} D-I team-games this season), so with {FORM_MIN_GAMES} games the gap must reach {need(FORM_MIN_GAMES)}, with 8 games {need(8)}.</li>
        </ul>
        <p><b>Consistency (Steady / Volatile).</b> How far a team&apos;s games land from its rating: the root-mean-square of (game performance − DHR) over the season. Steady means at most {Math.round(STEADY_RATIO * 100)}% of the typical spread (±{(STEADY_RATIO * spread).toFixed(1)} today); Volatile means at least {Math.round(VOLATILE_RATIO * 100)}% (±{(VOLATILE_RATIO * spread).toFixed(1)}). It needs {CONSISTENCY_MIN_GAMES}+ games, because a spread from a handful of games is itself noisy. Being volatile isn&apos;t bad on its own: it means wider outcomes, which helps an underdog and hurts a favourite.</p>
        <p><b>Biggest movers.</b> DHR now minus DHR {MOVER_DAYS} days earlier, among teams that played at least {MOVER_MIN_GAMES} game in that span. The Form view on <Link className="link underline" href="/rankings/?view=form">Rankings</Link> also shows the change since the preseason rating.</p>
        <p id="indispensable" className="scroll-mt-20"><b>Indispensable players.</b> The same estimate the injury tracker uses for a player who is out: minutes per game ÷ 40 × (DPR used − replacement), with replacement at {REPLACEMENT_DPR} points per 100 (a typical end-of-bench player). &ldquo;DPR used&rdquo; pulls a player&apos;s DPR toward average until his sample is big: it is multiplied by (possessions + {DPR_PRIOR_POSS}) ÷ (possessions + {DPR_PRIOR_POSS} + {DPR_SHRINK_POSS.toLocaleString("en-US")}), so it counts half at {(DPR_SHRINK_POSS - DPR_PRIOR_POSS).toLocaleString("en-US")} on-court possessions. Early in the season that makes minutes the main driver, on purpose. The leaderboard lists players with {INDISPENSABLE_MIN_GAMES}+ games and {INDISPENSABLE_MIN_MPG}+ minutes a game; the &ldquo;rank without him&rdquo; holds every other team&apos;s rating fixed. It ignores who would really replace him and how the rotation would change, so read it as a size estimate.</p>
        <p><b>Not yet:</b> a player &ldquo;30-day riser&rdquo;. Comparing a player&apos;s last month with the rest of his season needs games before that month, and box scores this early don&apos;t have them. It will be added once they do.</p>
      </div>
    </section>
  );
}
