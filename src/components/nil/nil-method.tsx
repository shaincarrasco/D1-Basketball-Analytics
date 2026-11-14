// Methodology section for estimated NIL value (server component; reads public/data/app/nil.json at
// build time so every number here is this build's). Mounted on /methodology/ as #nil.
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { fmtMoney, fmtReported, type NilData, type NilFile } from "@/lib/nil";
import { SourceLink } from "./reported";

function load(): NilData | null {
  try {
    const f = JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "app", "nil.json"), "utf8")) as NilFile;
    return f.ok ? f : null;
  } catch {
    return null;
  }
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);
const fmtDate = (iso: string | null) => {
  if (!iso) return "undated";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

export default function NilMethod() {
  const nil = load();
  if (!nil) return <p>NIL estimates haven&apos;t been built for this deploy.</p>;
  const f = nil.fit, c = f.calibration, src = nil.calibration.sources;
  const k = f.params;
  const spread = Math.exp(1.2816 * f.shareSigma);
  return (
    <>
      <p>
        <b>What it is:</b> our estimate of what each D-I men&apos;s basketball player is worth a year in 2026–27, counting revenue-sharing money and NIL (collective and brand) money together.
        It is a <b>model estimate</b>, labelled &ldquo;Estimate&rdquo; everywhere, never a reported deal. Deals are private; where an outlet has reported a figure we show it separately with its source. On3&apos;s NIL Valuation is a proprietary black box; ours is
        three steps you can check.
      </p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          <b>Team budget.</b> For the 80 high-major programs CBS Sports placed in 2026–27 roster-spending tiers (Oct. 2026) we use the tier: the geometric middle of its range. Two tiers are open-ended, so we assume Tier 1 runs $20–25M ($25–30M for Florida, Louisville and Kentucky,
          which CBS says top $25M) and Tier 2 (&ldquo;just under $20M&rdquo;) runs $17.5–20M. For the other {Object.keys(nil.teams).length - 80} programs there is no public list, so we estimate the budget from <b>program strength</b> (this season&apos;s DHR, last season&apos;s rating and ten seasons of history, each
          standardised): a line through the {f.budgetCurve.anchors.length} budgets reported outside the power conferences ({f.budgetCurve.anchors.map(a => `${a.team} ${fmtMoney(a.value)}`).join(", ")}).
          Those budgets vary a lot for similar programs (Memphis spends about ten times what Wyoming does), so estimated budgets carry a wide range: about ×{Math.exp(1.2816 * f.budgetCurve.estimatedSigma).toFixed(1)} either way.
        </li>
        <li>
          <b>His share.</b> Each player gets a weight from things coaches pay for that our data has: <b>minutes</b> (his role), <b>DPR</b> (his on-court impact, shrunk toward average until the sample is big), <b>recruiting rank</b> (full weight for freshmen, half for sophomores) and <b>position</b>
          (centers cost about 61% more than point guards of equal talent, per EvanMiya). His share is his weight divided by the team&apos;s total, including rostered players who haven&apos;t played yet. Fitted weights this build: minutes {k.minutes}, DPR {k.dpr} per point, recruiting {k.recruiting}, usage {k.usage}.
        </li>
        <li>
          <b>Estimate = budget × share</b>, rounded (to $5K under $100K, $25K under $1M, $50K under $5M, $100K above) so it never looks more precise than it is. The <b>range</b> is an intended 80% band: the budget&apos;s own uncertainty combined with how far our estimates missed the reported figures
          (about ×{spread.toFixed(1)} either way for a high-major player, wider where the budget is estimated).
        </li>
      </ol>
      <p>
        <b>Fitting.</b> The three share weights are fitted on a log scale to {c.fitted} publicly reported 2026–27 player figures ({c.pointFigures} figures or ranges, {c.floors} &ldquo;at least&rdquo; floors). A range counts as a hit anywhere inside it; a floor only penalises estimates below it.
        {c.notPlayedYet.length ? ` ${c.notPlayedYet.join(", ")} ha${c.notPlayedYet.length === 1 ? "s" : "ve"}n't played yet, so ${c.notPlayedYet.length === 1 ? "isn't" : "aren't"} in the fit.` : ""} Caleb Holt&apos;s On3 valuation as a recruit is shown but not fitted (it measures marketing value, not school pay).
      </p>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        <div className="bg-deck px-4 py-3"><dt className="label">Median miss (leave-one-out)</dt><dd className="font-display text-2xl font-extrabold text-ink tnum">{pct(c.looMedianAbsPctErr)}</dd></div>
        <div className="bg-deck px-4 py-3"><dt className="label">Inside reported range (LOO)</dt><dd className="font-display text-2xl font-extrabold text-ink tnum">{c.looInsideReported}/{c.pointFigures}</dd></div>
        <div className="bg-deck px-4 py-3"><dt className="label">Our range overlaps report</dt><dd className="font-display text-2xl font-extrabold text-ink tnum">{c.rangeOverlapsReported}/{c.fitted}</dd></div>
        <div className="bg-deck px-4 py-3"><dt className="label">Players est. $3.9M+</dt><dd className="font-display text-2xl font-extrabold text-ink tnum">{f.over39}</dd></div>
      </dl>
      <p>
        <b>Honest read:</b> in aggregate the model lines up with reporting (we estimate {f.over39} players at $3.9M or more; The Athletic reported at least 18), and team totals match reported budgets by construction. But for <i>which</i> player on a team gets the
        most, it is often wrong: the stars who made headlines are usually worth more than we estimate ({c.looFloorsMet} of {c.floors} &ldquo;at least $3.9M&rdquo; players reach the floor in leave-one-out). Our point estimates miss reported figures by about {pct(c.looMedianAbsPctErr)} in a typical case, though our range
        overlaps the report for {c.rangeOverlapsReported} of {c.fitted}.
      </p>
      <p><b>Biggest uncertainties</b> (none of these is in our data):</p>
      <ul className="list-disc space-y-1.5 pl-5">
        <li><b>Last season.</b> Most pay was set in the spring on last season&apos;s production and the transfer market. We only have this season&apos;s first few games, so returning stars and transfers look like their November minutes.</li>
        <li><b>Social media following and brand deals</b> (shoe, apparel, local sponsors) can add a lot for a few famous players and nothing for most.</li>
        <li><b>NBA draft stock.</b> Players who withdrew from the draft (Yessoufou, Momcilovic, Haugh) were paid to stay; we can&apos;t see that.</li>
        <li><b>Budgets outside the power conferences</b> are estimated from a handful of public numbers. Opt-outs from revenue sharing, donors and school priorities vary widely.</li>
        <li><b>Reported figures themselves</b> are mostly unconfirmed, sometimes asking prices, and sometimes contradict each other. A staffer told On3 that programs above a $5 million payroll were not submitting deals to the clearinghouse.</li>
      </ul>
      <h3 className="pt-2 font-semibold text-ink">The 2026–27 landscape</h3>
      <ul className="list-disc space-y-1.5 pl-5">
        {nil.calibration.landscape.revenueShareCap.map(r => <li key={r.season}><b>{r.season} revenue-sharing cap:</b> {r.text} (<SourceLink id={r.source} sources={src} />).</li>)}
        {nil.calibration.landscape.notes.map(n => <li key={n.text}>{n.text} (<SourceLink id={n.source} sources={src} />)</li>)}
        <li>{nil.calibration.tiers} (<SourceLink id="ab-2026-10-22" sources={src} />)</li>
      </ul>
      <h3 className="pt-2 font-semibold text-ink">Program budgets: reported vs ours</h3>
      <div className="scroll-x rounded-xl border border-line">
        <table className="dt">
          <caption className="sr-only">Reported program budgets compared with the model</caption>
          <thead><tr><th scope="col" className="l">Program</th><th scope="col" className="l">Reported</th><th scope="col">Ours (estimate)</th><th scope="col" className="l">Source</th></tr></thead>
          <tbody>
            {nil.calibration.programs.map(p => (
              <tr key={p.team + p.season}>
                <td className="l font-semibold">{p.slug ? <Link href={`/teams/${p.slug}/`} className="link">{p.team}</Link> : p.team}</td>
                <td className="l"><span className="tnum">{p.low != null ? fmtReported(p.low, p.high) : "—"}</span> <span className="text-xs text-dim">{p.season}</span></td>
                <td className="tnum">{p.model ? `${fmtMoney(p.model.mid)}${p.model.kind === "reported-tier" ? " (CBS tier)" : ""}` : "—"}</td>
                <td className="l text-xs"><SourceLink id={p.source} sources={src} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm">
        Every player figure we compare against, with its source, is on the <Link href="/players/nil/#reported-h" className="underline hover:text-ink">NIL value page</Link>. Data file: <code className="text-ink">public/data/nil-calibration-2027.json</code> (compiled {fmtDate(nil.compiled)}).
      </p>
      <h3 className="pt-2 font-semibold text-ink">Sources</h3>
      <ul className="space-y-1 text-sm">
        {Object.entries(src).sort((a, b) => (b[1].date ?? "").localeCompare(a[1].date ?? "")).map(([id, s]) => (
          <li key={id}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-ink">{s.title}</a>
            <span className="text-dim"> · {s.publisher}{s.author ? `, ${s.author}` : ""} · {s.date ? fmtDate(s.date) : (s.dateNote ?? "undated")}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
