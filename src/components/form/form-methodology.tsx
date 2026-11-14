// Methodology page section for form, consistency, movers and indispensability.
// Every number comes from the constants in src/lib/form.ts, so the page can't drift from the badges.
import Link from "next/link";
import {
  CONSISTENCY_MIN_GAMES, DPR_PRIOR_POSS, DPR_SHRINK_POSS, FORM_MIN_GAMES, FORM_MIN_GAMES_BEFORE, FORM_MIN_GAP, FORM_WINDOW_DAYS, FORM_WORDS, FORM_Z,
  INDISPENSABLE_MIN_GAMES, INDISPENSABLE_MIN_MPG, MOVER_DAYS, MOVER_MIN_GAMES, REPLACEMENT_DPR, STEADY_RATIO, VOLATILE_RATIO,
} from "@/lib/form";
import { getAllForms, getForm } from "@/lib/form-server";
import { getTeams } from "@/lib/server-data";
import { signed } from "@/lib/format";

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
  const need = (a: number, b: number) => Math.max(FORM_MIN_GAP, FORM_Z * spread * Math.sqrt(1 / a + 1 / b)).toFixed(1);
  // How far season game performance sits from DHR for the best and worst teams (prior shrinkage).
  const ranked = getTeams().filter(t => t.rank != null && t.adjEM != null && (file.perf[t.id]?.length ?? 0) >= 3).sort((a, b) => a.rank! - b.rank!);
  const gapOf = (list: typeof ranked) => list.reduce((s, t) => s + file.perf[t.id].reduce((a, x) => a + x[1], 0) / file.perf[t.id].length - t.adjEM!, 0) / list.length;
  const bias = ranked.length >= 100 ? { top: gapOf(ranked.slice(0, 25)), bottom: gapOf(ranked.slice(-25)) } : null;
  return (
    <section id="form" aria-labelledby="form-h" className="scroll-mt-20 border-t border-line pt-8">
      <h2 id="form-h" className="h-section mb-4">Form, movers and indispensable players</h2>
      <div className="space-y-4 text-[15px] leading-relaxed text-mute [&_b]:font-semibold [&_b]:text-ink">
        <p><b>Rating history.</b> Every time new results come in, DHR is refit using only the games played by then (the same walk-forward fits behind the pregame predictions). Each refit is saved, starting from the preseason rating, so team pages can show how a rating got where it is. This season so far: {snaps} snapshots.</p>
        <p><b>Game performance.</b> For each completed D-I game with a box score: the team&apos;s efficiency margin in that game, adjusted for the opponent&apos;s current AdjO and AdjD and for venue. It is on the same scale as DHR, so a team rated +15 &ldquo;should&rdquo; average +15 per game.</p>
        <p><b>Form (Hot / Cold).</b> The team&apos;s average game performance over the last {FORM_WINDOW_DAYS} days, compared with its average in the games before that. A tag needs all three:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>{FORM_MIN_GAMES}+ D-I games in the window;</li>
          <li>{FORM_MIN_GAMES_BEFORE}+ games before the window to compare with. In the first month every game is a recent game, so nobody can be tagged yet;</li>
          <li>a gap of at least {FORM_MIN_GAP} points per 100 possessions and at least {FORM_Z} standard errors of the difference between the two averages. Single games swing about ±{spread.toFixed(1)} around a team&apos;s own average (pooled across {games.toLocaleString("en-US")} D-I team-games this season), so with {FORM_MIN_GAMES} recent and 4 earlier games the gap must reach {need(FORM_MIN_GAMES, 4)}; with 8 and 8, {need(8, 8)}.</li>
        </ul>
        <p><b>Why not compare with DHR?</b> Early in the season DHR is deliberately pulled toward last season (see <a className="link underline" href="#priors">priors</a>), so strong teams play above their rating and weak teams below it for weeks.{bias ? <> Right now the top 25 average {signed(bias.top, 1)} per 100 above their DHR in game performance and the bottom 25 {signed(bias.bottom, 1)}. Against DHR, &ldquo;hot&rdquo; would mostly mean &ldquo;good&rdquo;.</> : null} Comparing a team with its own earlier games measures change, which is what form means.</p>
        <p><b>Consistency (Steady / Volatile).</b> The standard deviation of a team&apos;s game performances around its own average. Steady means at most {Math.round(STEADY_RATIO * 100)}% of the typical spread (±{(STEADY_RATIO * spread).toFixed(1)} today); Volatile means at least {Math.round(VOLATILE_RATIO * 100)}% (±{(VOLATILE_RATIO * spread).toFixed(1)}). It needs {CONSISTENCY_MIN_GAMES}+ games, because a spread from a handful of games is itself noisy. Being volatile isn&apos;t bad on its own: it means wider outcomes, which helps an underdog and hurts a favourite.</p>
        <p><b>Biggest movers.</b> DHR now minus DHR {MOVER_DAYS} days earlier, among teams that played at least {MOVER_MIN_GAMES} game in that span. The Form view on <Link className="link underline" href="/rankings/?view=form">Rankings</Link> also shows the change since the preseason rating.</p>
        <p id="indispensable" className="scroll-mt-20"><b>Indispensable players.</b> The same estimate the injury tracker uses for a player who is out: minutes per game ÷ 40 × (DPR used − replacement), with replacement at {signed(REPLACEMENT_DPR, 0)} points per 100 (a typical end-of-bench player). &ldquo;DPR used&rdquo; pulls a player&apos;s DPR toward average until his sample is big: it is multiplied by (possessions + {DPR_PRIOR_POSS}) ÷ (possessions + {DPR_PRIOR_POSS} + {DPR_SHRINK_POSS.toLocaleString("en-US")}), so it counts half at {(DPR_SHRINK_POSS - DPR_PRIOR_POSS).toLocaleString("en-US")} on-court possessions. Early in the season that makes minutes the main driver, on purpose. The leaderboard lists players with {INDISPENSABLE_MIN_GAMES}+ games and {INDISPENSABLE_MIN_MPG}+ minutes a game; the &ldquo;rank without him&rdquo; holds every other team&apos;s rating fixed. It ignores who would really replace him and how the rotation would change, so read it as a size estimate.</p>
        <p><b>Not yet:</b> a player &ldquo;30-day riser&rdquo;. Comparing a player&apos;s last month with the rest of his season needs games before that month, and box scores this early don&apos;t have them. It will be added once they do.</p>
      </div>
    </section>
  );
}
