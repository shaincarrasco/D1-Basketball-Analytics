import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import { Empty } from "@/components/states";
import { getBracket } from "./load";
import BracketView from "./bracket-view";

export const metadata: Metadata = {
  title: "Bracketology: projected NCAA tournament field",
  description: "D1 Hoops' unofficial projection of the 76-team 2027 NCAA men's tournament: seeds, regions, Opening Round games and the bubble, updated with every data build.",
};

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

export default function BracketPage() {
  const b = getBracket();
  if (!b || !b.ok) {
    return (
      <>
        <PageHeader title="Bracket">Our projected NCAA tournament field.</PageHeader>
        <Empty title="The bracket projection isn't available right now">
          {b && !b.ok ? `The last data build could not produce a valid field (${b.reason}). ` : "No projection has been published yet. "}
          Rankings and team pages are unaffected.
        </Empty>
      </>
    );
  }
  const c = b.config;
  const { index: _index, ...data } = b;
  const stats = [
    { label: "Teams in the field", value: c.fieldSize },
    { label: "Automatic bids", value: c.autoBids, sub: "one per conference" },
    { label: "At-large bids", value: c.atLargeBids },
    { label: "Opening Round games", value: c.openingRound.games, sub: "winners join the round of 64" },
  ];
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <>
      <PageHeader title="Bracket">
        Who would make the 2027 NCAA men&apos;s tournament if the season ends the way our ratings expect, and where they&apos;d be seeded.
      </PageHeader>
      <p className="mb-4 inline-flex flex-wrap items-center gap-2 rounded-full border border-line2 bg-deck px-3.5 py-1.5 text-[13.5px] font-semibold">
        <i className="h-2 w-2 rounded-full bg-bulb" aria-hidden />
        Unofficial D1 Hoops projection, updated {dateLabel(b.updated)}
      </p>
      {b.early && (
        <p className="note mb-5 max-w-3xl text-[14.5px] leading-snug text-mute">
          <span>
            <b className="text-ink">Early season.</b> The typical team has played {b.medianGames} game{b.medianGames === 1 ? "" : "s"} against Division I opponents, so this field mostly reflects
            our team ratings and each team&apos;s remaining schedule. Expect big moves before Selection Sunday (March 14, 2027).
          </span>
        </p>
      )}
      <p className="mb-5 text-[14px] font-semibold text-mute sm:hidden">
        {c.fieldSize} teams · {c.autoBids} automatic bids · {c.atLargeBids} at-large · {c.openingRound.games} Opening Round games
      </p>
      <dl className="mb-6 hidden grid-cols-4 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid">
        {stats.map(s => (
          <div key={s.label} className="bg-deck px-4 py-3">
            <dt className="label">{s.label}</dt>
            <dd className="font-display text-[1.7rem] font-extrabold leading-tight tnum">{s.value}</dd>
            {s.sub && <dd className="text-[11.5px] text-mute">{s.sub}</dd>}
          </div>
        ))}
      </dl>

      <BracketView data={data} />

      <section aria-labelledby="how-h" className="mt-12 max-w-3xl">
        <h2 id="how-h" className="h-section mb-3">How this works</h2>
        <div className="space-y-4 text-[15px] leading-relaxed text-mute [&_b]:text-ink">
          <p>
            <b>The format.</b> The NCAA is expanding the men&apos;s tournament from 68 to {c.fieldSize} teams starting in 2027: {c.autoBids} conference champions get automatic
            bids and the committee picks {c.atLargeBids} at-large teams. The {c.openingRound.games}-game Opening Round replaces the First Four: the {c.openingRound.autoTeams} lowest-seeded
            automatic qualifiers play {c.openingRound.autoTeams / 2} games and the {c.openingRound.atLargeTeams} lowest-seeded at-large teams play the other {c.openingRound.atLargeTeams / 2}.
            The winners fill out the round of 64.
          </p>
          <p>
            <b>Automatic bids.</b> Real bids go to conference tournament champions. We don&apos;t simulate conference tournaments yet, so each conference&apos;s bid goes to the team that wins
            (or shares) its regular-season title most often in our 10,000 simulated seasons. That makes one-bid leagues the shakiest part of this projection.
          </p>
          <p>
            <b>At-large bids.</b> Everyone else is ranked by a selection score that is {pct(c.weights.resume)} résumé and {pct(c.weights.quality)} team quality.
          </p>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <b>Résumé</b> is projected to Selection Sunday, so November isn&apos;t just &ldquo;who&apos;s 4–0&rdquo;. Every game against a Division I team counts: a win is worth 1 minus the chance
              a typical bubble team (rated like the No. {c.bubbleRank} team in our rankings) would have won that same game, and a loss costs that chance. Games not played yet count as our win
              probability. On top of that, each projected Quad 1 win adds {c.q1WinBonus} and each projected Quad 3 or 4 loss subtracts {c.q34LossPenalty}. This is &ldquo;wins above bubble&rdquo;,
              the same idea the committee now sees on its team sheets.
            </li>
            <li><b>Quality</b> is the team&apos;s <Link className="underline decoration-line2 underline-offset-2 hover:text-ink" href="/methodology/">DHR rating</Link>: points per 100 possessions better than an average team, adjusted for opponent and venue.</li>
          </ul>
          <p>
            <b>Seeding.</b> All {c.fieldSize} teams go on one list by selection score, automatic qualifiers included. The four best are the 1 seeds, placed in order across the regions; the 2 seeds
            go back the other way (the &ldquo;S-curve&rdquo;), and so on. Within a seed line we swap regions when it keeps conference rivals from meeting in the first two rounds or puts a
            conference&apos;s top-four seeds in different regions. Opening Round opponents are the closest teams on the list. Region names are the traditional four; we don&apos;t project sites.
          </p>
          <p>
            <b>Quadrants</b> sort games by opponent strength and venue, using the NCAA&apos;s NET cutoffs (Quad 1 = home vs. top 30, neutral vs. top 50, away vs. top 75) but our DHR rankings
            instead of the NET, so they are unofficial.
          </p>
          <p>
            <b>In field %</b> comes from re-playing the rest of the season {c.sims.toLocaleString("en-US")} times, with random swings in every team&apos;s strength and every game, and re-picking the
            whole field each time.
          </p>
          {b.ineligible.length > 0 && (
            <p><b>Not eligible.</b> {b.ineligible.join(", ")} are still moving up to Division I and can&apos;t play in the 2027 tournament, so they&apos;re skipped.</p>
          )}
        </div>
      </section>
    </>
  );
}
