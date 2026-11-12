import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import { fmt, pctFmt } from "@/lib/format";
import { getMeta } from "@/lib/server-data";
import type { BacktestBlock } from "@/lib/types";
import CalibrationChart from "./calibration-chart";

export const metadata: Metadata = { title: "Methodology", description: "How the D1 Hoops Power Rating (DHR) is built, how its predictions work, how accurate they have been, and what every metric on the site means." };

// Constants from scripts/lib/rating-model.mjs that meta.json does not carry.
const GAME_SIGMA = 10.5, NET_SIGMA = 15.7, SEASON_PRIOR_WEIGHT = 5, SEASON_REGRESSION = 0.6, FALLBACK_POSS = 69;

const TOC = [
  { id: "overview", label: "Overview" },
  { id: "model", label: "The rating equation" },
  { id: "priors", label: "Priors and small samples" },
  { id: "home", label: "Home court" },
  { id: "non-d1", label: "Non-D-I opponents" },
  { id: "season-prior", label: "Previous-season prior" },
  { id: "predictions", label: "Predictions" },
  { id: "backtest", label: "How it's doing" },
  { id: "glossary", label: "Glossary" },
  { id: "sources", label: "Data sources and limits" },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 border-t border-line pt-8">
      <h2 id={`${id}-h`} className="h-section mb-4">{title}</h2>
      <div className="space-y-4 text-[15px] leading-relaxed text-mute [&_b]:font-semibold [&_b]:text-ink">{children}</div>
    </section>
  );
}

function Formula({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <figure className="deck-flat overflow-x-auto px-4 py-3">
      <pre className="whitespace-pre font-mono text-[13.5px] leading-7 text-ink">{children}</pre>
      {note && <figcaption className="mt-1 text-xs text-dim">{note}</figcaption>}
    </figure>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-deck px-4 py-3">
      <dt className="label">{label}</dt>
      <dd className="font-display text-[1.9rem] font-extrabold leading-tight text-ink tnum">{value}</dd>
      {sub && <dd className="text-[11.5px] text-mute">{sub}</dd>}
    </div>
  );
}

function Backtest({ block }: { block: NonNullable<BacktestBlock> }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
      <Tile label="Games scored" value={block.games.toLocaleString("en-US")} sub="D-I vs D-I, out of sample" />
      <Tile label="Accuracy" value={pctFmt(block.accuracy, 1)} sub="favourite won" />
      <Tile label="Straight up" value={`${block.correct}–${block.games - block.correct}`} sub="right–wrong picks" />
      <Tile label="Margin MAE" value={fmt(block.marginMAE, 1)} sub="points off, on average" />
      <Tile label="Brier score" value={fmt(block.brier, 3)} sub="lower is better · coin flip 0.250" />
      <Tile label="Log loss" value={fmt(block.logLoss, 3)} sub="lower is better · coin flip 0.693" />
    </dl>
  );
}

type Term = { term: string; def: React.ReactNode };
const GLOSSARY: { group: string; terms: Term[] }[] = [
  {
    group: "Ratings",
    terms: [
      { term: "AdjEM", def: "Adjusted efficiency margin: AdjO − AdjD. How many points per 100 possessions a team would beat an average D-I team by on a neutral floor. The ranking key for the power rankings." },
      { term: "AdjO", def: "Adjusted offense: points scored per 100 possessions against an average D-I defense on a neutral floor. Higher is better." },
      { term: "AdjD", def: "Adjusted defense: points allowed per 100 possessions against an average D-I offense on a neutral floor. Lower is better." },
      { term: "Tempo", def: "Adjusted possessions per 40 minutes against an average-paced opponent. A style measure, not a quality measure; ranks run fastest to slowest." },
      { term: "SOS", def: "Strength of schedule: the average current AdjEM of every opponent played so far (the pooled non-D-I rating stands in for non-D-I opponents). It updates as opponents' ratings move." },
      { term: "Sample / rated games", def: "Weighted D-I games behind a rating. Early sample is under 4, developing 4–7, established 8+. Fewer games means the prior carries more weight and the projection is less certain." },
    ],
  },
  {
    group: "Four factors and shooting",
    terms: [
      { term: "eFG%", def: "Effective field-goal percentage: (FGM + 0.5 × 3PM) / FGA. Credits a three as 1.5 twos. On defense it is the opponent's eFG% (lower is better)." },
      { term: "TO%", def: "Turnovers per 100 possessions. Offenses want it low; on defense it is turnovers forced (higher is better)." },
      { term: "OR%", def: "Offensive rebound rate: ORB / (ORB + opponent DRB). On defense it is the opponent's OR% (lower is better)." },
      { term: "FTR", def: "Free-throw rate: FTA / FGA. How often a team gets to the line. On defense lower is better." },
      { term: "3PA rate", def: "Share of field-goal attempts taken from three. Mostly a style marker; on defense a low number means opponents are kept off the arc." },
      { term: "3P%", def: "Three-point field-goal percentage (opponents' on defense)." },
      { term: "Ast%", def: "Share of made field goals that were assisted." },
      { term: "Blk%", def: "Blocks per opponent two-point attempt." },
      { term: "Stl%", def: "Steals per 100 opponent possessions." },
      { term: "Paint share", def: "Share of a team's points scored in the paint." },
      { term: "Possessions", def: "Estimated as FGA − ORB + TO + 0.475 × FTA, averaged over both teams, unless the provider publishes a count." },
    ],
  },
  {
    group: "Games and résumé",
    terms: [
      { term: "Game form / performance", def: "For each completed D-I game: the team's efficiency margin in that game, adjusted for the opponent's current AdjO and AdjD and for venue. 0 is what an average D-I team would have done in the same game. Shown as bars (mint above, rose below)." },
      { term: "DHR quadrants", def: <>Unofficial, NET-style buckets by the opponent&apos;s current DHR rank and the venue. Quadrant 1: home 1–30, neutral 1–50, away 1–75. Quadrant 2: home 31–75, neutral 51–100, away 76–135. Quadrant 3: home 76–160, neutral 101–200, away 136–240. Quadrant 4: everything else, including non-D-I. These use DHR, not the NCAA NET, so they will not match the committee&apos;s team sheets.</> },
      { term: "Watchability", def: "0–100 score for upcoming games: 55% quality (the geometric mean of both teams' AdjEM percentiles) and 45% competitiveness (how close the win probability is to 50–50)." },
      { term: "Upset flag", def: "Marks a final where the winner's pregame win probability was below 35%." },
      { term: "Projected W–L", def: "Current record plus the sum of pregame win probabilities in every remaining scheduled game (a game without a projection counts as 50%). Projected conference W–L does the same for league games only. Fractions are expected wins, not a prediction of a specific record." },
      { term: "Win probability", def: "Chance the team wins, from the projected margin and its uncertainty (see Predictions). Pregame probabilities on game logs are walk-forward: they use only games completed before that date." },
    ],
  },
];

export default function MethodologyPage() {
  const meta = getMeta();
  const m = meta.model;
  const p = m.priors;
  const bt = m.backtest;
  const tempoFactor = m.leagueTempo / 100;
  const uTypical = (n: number) => (NET_SIGMA / Math.sqrt(n + (meta.model.seasonPrior ? (p.seasonPriorWeight ?? SEASON_PRIOR_WEIGHT) : p.teamGames))) * tempoFactor;
  const sigmaFor = (n: number) => Math.sqrt(GAME_SIGMA ** 2 + 2 * uTypical(n) ** 2);
  const updated = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }) : "unknown");

  return (
    <>
      <PageHeader title="Methodology">How DHR {m.version} works, how accurate it has been, and what each stat means.</PageHeader>

      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <aside className="mb-6 lg:mb-0">
          <details className="deck p-4 lg:hidden">
            <summary className="cursor-pointer font-semibold">On this page</summary>
            <ol className="mt-3 space-y-1.5 text-sm">
              {TOC.map(t => <li key={t.id}><a href={`#${t.id}`} className="link text-mute">{t.label}</a></li>)}
            </ol>
          </details>
          <nav aria-label="On this page" className="sticky top-20 hidden lg:block">
            <p className="label mb-3">On this page</p>
            <ol className="space-y-1 border-l border-line text-sm">
              {TOC.map(t => <li key={t.id}><a href={`#${t.id}`} className="-ml-px block border-l border-transparent py-1 pl-4 text-mute hover:border-off hover:text-ink">{t.label}</a></li>)}
            </ol>
          </nav>
        </aside>

        <div className="max-w-[54rem] space-y-10">
          <Section id="overview" title="Overview">
            <p>
              DHR is an original, opponent-adjusted efficiency rating built from every completed {meta.seasonLabel} game involving a Division I team.
              It asks one question of each game: <b>given who was playing and where, how many points per 100 possessions did each side score, compared with what we would expect?</b>{" "}
              Solving that for every game at once gives each team an offense rating, a defense rating and a tempo rating.
            </p>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
              <Tile label="League average (μ)" value={fmt(m.leagueAverage, 1)} sub="points per 100 possessions" />
              <Tile label="League tempo (μT)" value={fmt(m.leagueTempo, 1)} sub="possessions per 40 minutes" />
              <Tile label="Home edge (h)" value={fmt(m.estimatedHomeEdge, 1)} sub={`net pts/100 ≈ ${fmt(m.homeEdgePointsPerGame, 1)} points a game`} />
              <Tile label="Games in the fit" value={m.gameCoverage.toLocaleString("en-US")} sub={`of ${meta.counts.finals.toLocaleString("en-US")} finals so far`} />
              <Tile label="Teams ranked" value={String(m.rankedTeams)} sub={`of ${meta.counts.teams} D-I teams`} />
              <Tile label="Ratings updated" value={new Date(meta.updated.teams ?? meta.updated.built).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })} sub={updated(meta.updated.teams ?? meta.updated.built)} />
            </dl>
            <p className="text-sm">Method in one line: {m.method}</p>
          </Section>

          <Section id="model" title="The rating equation">
            <p>Every game produces two observations, one for each team&apos;s offense. DHR models each one as the league average plus the offense&apos;s strength plus the opposing defense&apos;s weakness, plus or minus half the home edge:</p>
            <Formula note="O > 0 is a better offense. D > 0 is a worse defense (it allows more). v = +1 home, −1 away, 0 neutral.">
{`points per 100 (team vs opp) = μ + O[team] + D[opp] + v · h/2
possessions per 40           = μT + T[team] + T[opp]`}
            </Formula>
            <p>The published ratings are just those terms put back on the points-per-100 scale:</p>
            <Formula>
{`AdjO  = μ + O        AdjD = μ + D        AdjEM = AdjO − AdjD
Tempo = μT + T`}
            </Formula>
            <p>
              The model is <b>additive</b>: a great offense facing a bad defense is expected to score μ plus both effects, rather than a product of ratios.
              It is solved by coordinate descent: each team&apos;s offense is re-estimated from its games after removing the defenses it faced and the venue, each defense from the offenses it faced,
              and the loop repeats until nothing moves by more than 0.00001. After every pass the D-I averages of O, D and T are re-centred to zero, so the average D-I team is exactly μ on both ends and 0 AdjEM.
            </p>
            <p>
              Each game is weighted. A D-I vs D-I game with a full box score counts 1. A game against a non-D-I opponent counts {fmt(p.nonD1Weight, 1)}. A game with a final score but no box score
              counts half (and assumes {FALLBACK_POSS} possessions), so the score still informs the rating without pretending to know the pace. Overtime pace is scaled back to 40 minutes.
            </p>
          </Section>

          <Section id="priors" title="Priors and small samples">
            <p>
              Two games tell you very little. Instead of letting a team&apos;s rating swing on one blowout, DHR adds a <b>prior worth {p.teamGames} games</b> to every team, centred on its conference&apos;s average.
              The conference average is itself shrunk toward the national average with a <b>prior worth {p.conferenceTeams} teams</b>, so a small league with a few lucky results can&apos;t inflate itself.
            </p>
            <Formula note={`k = ${p.teamGames} games, kc = ${p.conferenceTeams} teams, w = game weight, y = points per 100 in that game. Defense and tempo are solved the same way.`}>
{`O[team] = ( k · Ō[conf] + Σ w · (y − μ − D[opp] − v·h/2) ) / ( k + Σ w )
Ō[conf] = Σ O[members] / ( n_conf + kc )`}
            </Formula>
            <p>
              In practice: after one game a team&apos;s rating is about {pctFmt(1 / (1 + p.teamGames))} its own results and {pctFmt(p.teamGames / (1 + p.teamGames))} its league&apos;s;
              after {p.teamGames * 3} games it is {pctFmt((p.teamGames * 3) / (p.teamGames * 4))} its own. That is why early-season rankings cluster by conference and loosen up as the season goes on.
            </p>
          </Section>

          <Section id="home" title="Home court">
            <p>
              The home edge h is estimated <b>jointly</b> with the team ratings, from the leftover difference between home and away performance in every non-neutral game, and regularised toward a long-run
              prior of <b>{fmt(p.homeEdge, 1)} points per 100 possessions</b> with a weight of <b>{p.homeEdgeWeight.toLocaleString("en-US")} games</b>.
              The heavy prior matters early: November is full of &ldquo;buy games&rdquo; where a strong team hosts a weak one, and measuring the edge raw from those blowouts badly overstates it.
            </p>
            <Formula note="r = residual efficiency after removing μ, the offense and the opposing defense.">
{`h = ( ${p.homeEdgeWeight} · ${fmt(p.homeEdge, 1)} + Σ w · (r_home − r_away) ) / ( ${p.homeEdgeWeight} + Σ w )`}
            </Formula>
            <p>
              Current estimate: <b>{fmt(m.estimatedHomeEdge, 2)} net points per 100 possessions</b>, which at league tempo is about <b>{fmt(m.homeEdgePointsPerGame, 1)} points per game</b>.
              Half of it is added to the home offense and half subtracted from the away offense.
            </p>
          </Section>

          <Section id="non-d1" title="Non-D-I opponents">
            <p>
              Division II, NAIA and other non-D-I teams play too few D-I games to rate individually, so every one of them is pooled into a <b>single shared &ldquo;non-D-I&rdquo; team</b>.
              Its games count {fmt(p.nonD1Weight, 1)}× so a 40-point home win over an NAIA school doesn&apos;t move a rating as much as a real game. The pooled node is excluded when re-centring, so it never shifts the D-I average.
            </p>
            {m.pooledNonD1 ? (
              <p>The pooled node currently rates <b>AdjO {fmt(m.pooledNonD1.adjO)}</b>, <b>AdjD {fmt(m.pooledNonD1.adjD)}</b>, <b>AdjEM {fmt(m.pooledNonD1.adjEM)}</b>, tempo {fmt(m.pooledNonD1.adjT)} — roughly {Math.abs(Math.round(m.pooledNonD1.adjEM))} points per 100 possessions worse than an average D-I team.</p>
            ) : <p>No non-D-I games are in the current fit.</p>}
          </Section>

          <Section id="season-prior" title="Previous-season prior">
            <p>
              When a file of last season&apos;s adjusted ratings is available, it replaces the conference-mean prior for each team that has one: the prior becomes <b>{pctFmt(SEASON_REGRESSION)} of last season&apos;s offense and defense</b> (regressed toward average),
              worth <b>{SEASON_PRIOR_WEIGHT} games</b>. It fades naturally as real games pile up.
            </p>
            <p>
              {m.seasonPrior
                ? <>This build uses a previous-season prior: {m.seasonPrior.teams} teams from the {m.seasonPrior.season ?? "previous"} season{m.seasonPrior.provider ? ` (${m.seasonPrior.provider})` : ""}.</>
                : <><b>This build does not use one</b> — every team starts from its conference mean. Expect early ratings to be noisier than they would be with a preseason prior.</>}
            </p>
          </Section>

          <Section id="predictions" title="Predictions">
            <p>A projection combines both teams&apos; ratings with a shared tempo. The same function powers the scoreboard, team schedules and the <Link href="/matchup/" className="underline hover:text-ink">matchup simulator</Link>.</p>
            <Formula note="v = +1 if team A is at home, −1 if away, 0 neutral. Φ is the standard normal CDF.">
{`tempo   = μT + T[A] + T[B]
effA    = μ + O[A] + D[B] + v · h/2
effB    = μ + O[B] + D[A] − v · h/2
ptsA    = effA × tempo / 100          ptsB = effB × tempo / 100
margin  = ptsA − ptsB
P(A wins) = Φ( margin / σ )`}
            </Formula>
            <p>
              The uncertainty σ has two parts: <b>single-game noise</b> of {GAME_SIGMA} points — what separates two evenly matched teams on any given night — and <b>rating uncertainty</b> for each team,
              which shrinks as it plays more games.
            </p>
            <Formula note={`n = weighted games played; k = ${p.teamGames} (or ${SEASON_PRIOR_WEIGHT} with a previous-season prior).`}>
{`σ = √( ${GAME_SIGMA}² + uA² + uB² )
u = ${NET_SIGMA} / √(n + k) × tempo / 100`}
            </Formula>
            <p>
              At league tempo, two teams with 3 games each give σ ≈ <b>{fmt(sigmaFor(3), 1)} points</b>; with 10 games each, ≈ <b>{fmt(sigmaFor(10), 1)}</b>; by 25 games, ≈ <b>{fmt(sigmaFor(25), 1)}</b>.
              The matchup simulator&apos;s 80% range is margin ± 1.2816 σ.
            </p>
          </Section>

          <Section id="backtest" title="How it's doing">
            <p>
              These are <b>out-of-sample, walk-forward results</b>: the model is refit for each date and every game is scored against the prediction made before it was played, so no game ever helps predict itself.
              {" "}{bt.description}
            </p>
            {bt.all ? (
              <>
                <Backtest block={bt.all} />
                <div className="deck p-4 sm:p-5">
                  <h3 className="mb-1 font-semibold text-ink">Calibration</h3>
                  <p className="mb-4 text-sm">When the model says the favourite wins 70% of the time, does it? Each circle is a bin of games by the favourite&apos;s predicted probability (size = number of games). Above the dashed line the model was too cautious; below it, overconfident.</p>
                  <div className="scroll-x"><CalibrationChart bins={bt.all.calibration} /></div>
                  <div className="scroll-x mt-4">
                    <table className="dt">
                      <caption className="sr-only">Calibration by favourite-probability bin</caption>
                      <thead><tr><th scope="col" className="l">Bin</th><th scope="col">Games</th><th scope="col">Predicted</th><th scope="col">Actual</th><th scope="col">Gap</th></tr></thead>
                      <tbody>
                        {bt.all.calibration.map(c => (
                          <tr key={c.bin}>
                            <td className="l">{c.bin.replace("-", "–")}</td><td>{c.games}</td><td>{pctFmt(c.expected, 1)}</td><td>{pctFmt(c.actual, 1)}</td>
                            <td className="text-mute">
                              {c.expected !== null && c.actual !== null ? `${c.actual >= c.expected ? "+" : "−"}${(Math.abs(c.actual - c.expected) * 100).toFixed(1)} pts` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p>
                  {bt.seasoned
                    ? <>Restricted to games where {bt.seasonedRule.charAt(0).toLowerCase() + bt.seasonedRule.slice(1)}: {bt.seasoned.games} games, {pctFmt(bt.seasoned.accuracy, 1)} accuracy, margin MAE {fmt(bt.seasoned.marginMAE, 1)}, Brier {fmt(bt.seasoned.brier, 3)}.</>
                    : <>A second cut — games where {bt.seasonedRule.charAt(0).toLowerCase() + bt.seasonedRule.slice(1)} — has no games yet; it will appear here once the season is a few weeks old.</>}
                  {" "}Early-season samples are small and full of mismatches, so accuracy now is flattered by easy games and the calibration bins are noisy. Judge the model again in January.
                </p>
              </>
            ) : <p>No completed D-I vs D-I games have out-of-sample predictions yet.</p>}
          </Section>

          <Section id="glossary" title="Glossary">
            {GLOSSARY.map(g => (
              <div key={g.group}>
                <h3 className="mb-2 mt-2 font-semibold text-ink">{g.group}</h3>
                <dl className="divide-y divide-line rounded-xl border border-line">
                  {g.terms.map(t => (
                    <div key={t.term} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
                      <dt className="font-semibold text-ink">{t.term}</dt>
                      <dd className="text-sm">{t.def}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </Section>

          <Section id="sources" title="Data sources and limits">
            <ul className="list-disc space-y-2 pl-5">
              <li><b>Source:</b> schedules, scores, team and player box scores come from the {meta.provider} API. Logos are ESPN-hosted.</li>
              <li><b>Refresh:</b> data is pulled and the whole site rebuilt once a day by a scheduled GitHub Actions job (early morning Eastern), plus on every deploy. Latest pulls — teams {updated(meta.updated.teams)}, games {updated(meta.updated.games)}, players {updated(meta.updated.players)}; site built {updated(meta.updated.built)}.</li>
              <li><b>Coverage:</b> {meta.counts.teams} D-I teams, {meta.counts.players.toLocaleString("en-US")} players and {meta.counts.games.toLocaleString("en-US")} scheduled games ({meta.counts.finals.toLocaleString("en-US")} final). Only games with usable scores enter the rating; missing values show as &ldquo;—&rdquo;, never as zero.</li>
              <li><b>Not available:</b> no lineup, substitution or play-by-play data, so there are no on/off, lineup or player impact numbers, and projections know nothing about injuries, suspensions or rest.</li>
              <li><b>Not KenPom, Torvik or the NET:</b> DHR is calculated independently here. It belongs to the same family of opponent-adjusted efficiency ratings, but its values and ranks are its own and won&apos;t match those systems. DHR quadrants are unofficial and are not what the NCAA selection committee uses.</li>
              <li><b>Early season:</b> with only a few games per team, ratings lean heavily on conference priors and the backtest is small. Treat rankings in November as a rough sketch.</li>
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
