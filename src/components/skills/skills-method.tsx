// Methodology section for player skill projections (server component; reads the meta block of
// public/data/app/skills.json at build time). Mounted on /methodology/ as #skills.
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { SkillsMeta } from "@/lib/skills";

function loadMeta(): SkillsMeta | null {
  try {
    // skills.json is ~4 MB; only the meta block is needed here.
    return (JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "app", "skills.json"), "utf8")) as { meta: SkillsMeta }).meta;
  } catch {
    return null;
  }
}

const pctCut = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);
const u = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "—" : v.toFixed(d));

export default function SkillsMethod() {
  const meta = loadMeta();
  if (!meta) return <p>Skill projections haven&apos;t been built for this deploy.</p>;
  const by = Object.fromEntries(meta.stats.map(s => [s.key, s]));
  const tp = by.tp, ft = by.ft, pts = by.pts;
  const own = ["usg", "ast", "pts"].map(k => by[k]).filter(s => s?.validation);
  return (
    <>
      <p>
        Skill projections answer: <b>what is this player most likely to shoot, score, pass, rebound and defend at from here?</b>{" "}
        Early in a season a player&apos;s numbers are mostly luck: a guard who goes 5 for 8 from three in two games is not a 62% shooter.
        So every projection blends two things, and the player page says how much of each: his <b>own games this season</b>, and a <b>starting point</b> (what players like him usually do).
        This season&apos;s real number is always shown beside the projection.
      </p>
      <pre className="deck-flat overflow-x-auto whitespace-pre px-4 py-3 font-mono text-[13.5px] leading-7 text-ink">{`projected = (his opponent-adjusted count + k × starting point) / (his opportunities + k)
starting point = position + height + recruiting stars + class year   (3P% also: his FT% above its own starting point)
own-data share = opportunities / (opportunities + k)`}</pre>
      <p>
        <b>Counts and opportunities.</b> Each skill is a count over the chances he had: three-pointers made over attempts, offensive rebounds over the offensive rebounds available while he was on the floor,
        turnovers over the possessions he used, steals over opponent possessions on the floor, and so on (team and opponent totals come from each game&apos;s box score).
        Rim and mid-range percentages use the season shot-type counts the scouting report uses.
      </p>
      <p>
        <b>Starting point.</b> A weighted regression across every D-I player fits each skill on position, height, recruiting stars (5, 4, 3 or unranked) and class year.
        Unranked players and transfers without a recruiting ranking get the position, height and class starting point.
        Free-throw shooting is the best early sign of shooting touch, so the three-point starting point moves {tp?.prior?.["FT% above his prior"] != null ? <b>{tp.prior["FT% above his prior"].toFixed(2)} points</b> : "a little"} for every point his projected FT% sits above its own starting point.
      </p>
      <p>
        <b>k: how fast his own record takes over.</b> k is the number of opportunities after which a player&apos;s own record counts half. It is fitted from the data for each skill
        (game-to-game noise divided by how much players really differ once the starting point is known), so noisy skills with small real differences lean on the starting point much longer.
        {ft && tp ? <> Free throws settle fast (k ≈ {Math.round(ft.k)} attempts); three-point shooting takes about {Math.round(tp.k).toLocaleString("en-US")} attempts.</> : null}
        {tp?.kSource === "outside" ? <> This season&apos;s three-point data can&apos;t yet separate skill from luck, so k uses an outside figure: KenPom found year-to-year 3P% correlates only .371 for high-volume shooters, which works out to about 390 attempts.</> : null}
      </p>
      <p>
        <b>Opponents.</b> Where the opponent matters, each game&apos;s count is divided by how much of that stat the opponent gives up compared with an average D-I team (shrunk toward average with three games&apos; worth of evidence; non-D-I opponents are pooled).
        {pts?.nonD1Factor ? <> D-I teams score about <b>{Math.round((pts.nonD1Factor - 1) * 100)}% more per minute</b> against non-D-I opponents, so those games count for less.</> : null}{" "}
        Free throws, usage and the shot-type percentages are not adjusted, and neither is three-point shooting: defenses control opponents&apos; 3P% little, and adjusting it made the check below slightly worse.
      </p>
      <p>
        <b>Percentiles and grades</b> compare each projection with every D-I player averaging {meta.pool.minMpg}+ minutes ({meta.pool.players.toLocaleString("en-US")} players), on the scouting-report scale (A+ = top 3%, C = middle, D- = bottom 10%). Turnover rate is flipped so fewer turnovers grade higher.
      </p>
      <p><b>Class-year growth.</b> {meta.classGrowth}</p>

      <h3 className="pt-2 text-base font-semibold text-ink">How accurate it is</h3>
      <p>
        The check: refit everything (starting points, k, opponent factors) using only each player&apos;s <b>first half</b> of games, then predict his <b>second half</b>, and compare with simply using his first-half average.
        Errors are weighted by second-half opportunities, and a player counts if he has 2+ games with chances in both halves.
      </p>
      <div className="scroll-x rounded-xl border border-line">
        <table className="dt">
          <caption className="sr-only">Skill projection holdout check</caption>
          <thead>
            <tr>
              <th scope="col" className="l">Skill</th>
              <th scope="col" title="D-I average">D-I avg</th>
              <th scope="col" title="Opportunities after which his own record counts half">k</th>
              <th scope="col" title="Root-mean-square error predicting the second half from the first-half average">First-half avg error</th>
              <th scope="col" title="Root-mean-square error of the projection">Projection error</th>
              <th scope="col" title="Starting point alone, no player data">Starting point alone</th>
              <th scope="col" title="Reduction in squared error vs the first-half average">Error cut</th>
              <th scope="col" title="Same check, players averaging 10+ minutes only">Cut, 10+ mpg</th>
              <th scope="col">Players</th>
            </tr>
          </thead>
          <tbody>
            {meta.stats.map(s => {
              const v = s.validation;
              return (
                <tr key={s.key}>
                  <td className="l font-semibold text-ink">{s.short}{s.oppAdjusted ? <span className="ml-1 text-xs text-dim" title="Opponent-adjusted">opp</span> : null}</td>
                  <td>{u(s.league)}</td>
                  <td title={s.kSource === "outside" ? "Outside figure: this season can't yet measure the spread" : s.talentMeasurable ? undefined : "Fitted, but the spread between players isn't clearly measurable yet"}>{Math.round(s.k).toLocaleString("en-US")}{s.kSource === "outside" ? "*" : s.talentMeasurable ? "" : "†"}</td>
                  <td>{u(v?.rmseRaw)}</td>
                  <td className="font-semibold text-ink">{u(v?.rmseProj)}</td>
                  <td>{u(v?.rmsePriorOnly)}</td>
                  <td className="font-semibold text-ink">{pctCut(v?.mseCut)}</td>
                  <td>{pctCut(v?.rotation.mseCut)}</td>
                  <td>{v?.players.toLocaleString("en-US") ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[13px]">* outside figure (see k above). † fitted, but this season can&apos;t yet clearly tell the spread between players from zero, so treat that k as rough. Errors are in the stat&apos;s own units (percentage points for the % skills, points per 40 for scoring volume). k is in the stat&apos;s opportunities (attempts, minutes, possessions or chances).</p>
      <p>
        <b>What this does and doesn&apos;t show.</b> It is early: most teams have played 2 to 5 games, so a first half is one or two games and the second-half target is itself noisy.
        Most of the gain comes from not trusting tiny samples, and for the shooting percentages the starting point alone does about as well as the full projection: two games of shooting tell you almost nothing yet.
        His own games already add real information for usage, playmaking and scoring volume
        {own.length ? <> ({own.map(s => `${s.short} error ${s.validation!.rmsePriorOnly.toFixed(1)} with the starting point alone vs ${s.validation!.rmseProj.toFixed(1)} projected`).join("; ")})</> : null}.
        As the season fills in, k stays the same idea but each player&apos;s own share grows, and this check reruns on every build.
        Compare the <Link href="/players/projections/" className="underline hover:text-ink">skill projections leaderboard</Link> with the raw <Link href="/players/" className="underline hover:text-ink">leaderboards</Link>.
      </p>
    </>
  );
}
