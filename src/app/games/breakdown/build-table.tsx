"use client";
// "How this projection is built": the score calculation, line by line, in plain words.
// Shared by the game sheet and /matchup/. Every number comes from lib/breakdown buildUp(), which is
// the model's own arithmetic, so the bottom lines are the published projection, not an estimate of it.
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { displayMargin, injuryShift, pubOne, type Build } from "@/lib/breakdown";
import { fmt, signed } from "@sports/ui/format";

/** Collapsible section: content mounts only when opened (opening counts as asking for projections). */
export function Disclosure({ title, sub, children, defaultOpen = false, testId }: { title: string; sub?: string; children: ReactNode; defaultOpen?: boolean; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="deck-flat overflow-hidden" data-testid={testId}>
      <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-deck2" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{title}</span>
          {sub && <span className="block text-[12.5px] text-mute">{sub}</span>}
        </span>
        <ChevronDown size={18} aria-hidden className={`shrink-0 text-mute transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div id={id} className="border-t border-line px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

/**
 * Round parts to one decimal so the shown parts add up to the shown total (largest remainder).
 * The first part (the league average) is never nudged: it reads the same in every column.
 */
function roundParts(parts: number[]): number[] {
  const total = Math.round(parts.reduce((s, v) => s + v, 0) * 10);
  const scaled = parts.map(v => v * 10);
  const out = scaled.map(Math.round);
  let diff = total - out.reduce((s, v) => s + v, 0);
  const order = scaled.map((v, i) => ({ i, rem: v - Math.round(v) })).filter(x => x.i > 0)
    .sort((x, y) => (diff > 0 ? y.rem - x.rem : x.rem - y.rem));
  for (let k = 0; diff !== 0; k = (k + 1) % order.length) { out[order[k].i] += diff > 0 ? 1 : -1; diff += diff > 0 ? -1 : 1; }
  return out.map(v => v / 10);
}

const sum = (v: number[]) => v.reduce((s, x) => s + x, 0);

export type BuildSide = { name: string; short: string; color: string; href?: string | null; pooled?: boolean };
export type InjuryWhatIf = { aLoss: number; bLoss: number; aOut: string[]; bOut: string[] };

const TH = "px-3 py-2 text-left text-[13px] font-normal text-mute";
const TD = "whitespace-nowrap px-3 py-2 text-right tnum";

export default function BuildTable({ b, A, B, sign, injury, asOf, verified, points = "published" }: {
  b: Build; A: BuildSide; B: BuildSide;
  /** "published" = points as g.pred publishes them (one decimal each; total = their sum, as the game sheet shows it); "exact" = the total from full precision (as /matchup/ shows it). */
  points?: "published" | "exact";
  /** Orientation of the published margin: 1 = A − B, −1 = B − A (games publish home − away; A is the away team). */
  sign: 1 | -1;
  /** Current injury what-if (unplayed games only). null = not shown. */
  injury: InjuryWhatIf | null;
  asOf: ReactNode;
  /** true = the lines reproduce the published projection to the decimal; false = say so honestly. */
  verified: boolean | null;
}) {
  const d = displayMargin(b, sign);
  const toAB = (v: number) => sign * v; // displayed value → A − B
  const by = (abValue: number) => (Math.round(abValue * 10) === 0 ? "Even" : abValue > 0 ? `${A.short} by ${fmt(abValue)}` : `${B.short} by ${fmt(-abValue)}`);
  const aParts = roundParts([b.mu, b.a.O, b.b.D, (b.venue * b.h) / 2]);
  const bParts = roundParts([b.mu, b.b.O, b.a.D, (-b.venue * b.h) / 2]);
  const pace = roundParts([b.muT, b.a.T, b.b.T]);
  const aPts = pubOne(b.aPts), bPts = pubOne(b.bPts);
  const total = points === "exact" ? b.total : aPts + bPts;
  const host = b.venue === 1 ? A : b.venue === -1 ? B : null;
  const shift = injury ? injuryShift(injury.aLoss, injury.bLoss, b.tempo) : 0;
  const margin = toAB(d.margin);
  const dot = (c: string) => <i className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: c }} aria-hidden />;

  return (
    <div className="space-y-4 text-sm" data-testid="build-up">
      <p className="text-[13px] text-mute">{asOf} Every line is the model&apos;s own arithmetic. Ratings already adjust for every opponent each team has played, so opponent strength is inside each team&apos;s offense and defense numbers.</p>

      <div>
        <h4 className="mb-1 text-[13px] font-semibold">1 · How many possessions</h4>
        <p className="text-mute">
          An average D-I game has <b className="text-ink tnum">{fmt(pace[0])}</b> possessions per team. {A.short} plays <b className="text-ink tnum">{signed(pace[1])}</b> and {B.short} <b className="text-ink tnum">{signed(pace[2])}</b> vs that pace, so this game projects to{" "}
          <b className="text-ink tnum">{fmt(pubOne(b.tempo))} possessions</b>.
        </p>
      </div>

      <div>
        <h4 className="mb-1 text-[13px] font-semibold">2 · Points per 100 possessions, each side</h4>
        <div className="scroll-x">
          <table className="w-full min-w-[330px] border-collapse">
            <thead>
              <tr className="border-b border-line text-xs text-mute">
                <th scope="col" className="px-3 py-1.5 text-left font-semibold">Line</th>
                <th scope="col" className="px-3 py-1.5 text-right font-semibold">{dot(A.color)}{A.short}</th>
                <th scope="col" className="px-3 py-1.5 text-right font-semibold">{dot(B.color)}{B.short}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line"><th scope="row" className={TH}>Average D-I offense</th><td className={TD}>{fmt(aParts[0])}</td><td className={TD}>{fmt(bParts[0])}</td></tr>
              <tr className="border-b border-line"><th scope="row" className={TH} title="Adjusted offense minus the D-I average">Own offense vs average</th><td className={TD}>{signed(aParts[1])}</td><td className={TD}>{signed(bParts[1])}</td></tr>
              <tr className="border-b border-line"><th scope="row" className={TH} title="Plus = the opponent's defense allows more than average; minus = it allows less">Opponent&apos;s defense (+ = allows more than average)</th><td className={TD}>{signed(aParts[2])}</td><td className={TD}>{signed(bParts[2])}</td></tr>
              <tr className="border-b border-line"><th scope="row" className={TH}>{host ? `Home court (half of the ${fmt(b.h)}-point edge each way)` : "Home court (neutral site: none)"}</th><td className={TD}>{signed(aParts[3])}</td><td className={TD}>{signed(bParts[3])}</td></tr>
              <tr className="border-b border-line font-semibold"><th scope="row" className="px-3 py-2 text-left text-[13px]">= Points per 100 possessions</th><td className={TD}>{fmt(sum(aParts))}</td><td className={TD}>{fmt(sum(bParts))}</td></tr>
              <tr className="border-b border-line"><th scope="row" className={TH}>Points per possession</th><td className={TD}>{fmt(b.aEff / 100, 2)}</td><td className={TD}>{fmt(b.bEff / 100, 2)}</td></tr>
              <tr><th scope="row" className="px-3 py-2 text-left text-[13px] font-semibold">× {fmt(pubOne(b.tempo))} possessions ÷ 100 = Proj points</th><td className={`${TD} font-display text-lg font-extrabold`}>{fmt(aPts)}</td><td className={`${TD} font-display text-lg font-extrabold`}>{fmt(bPts)}</td></tr>
            </tbody>
          </table>
        </div>
        {(A.pooled || B.pooled) && <p className="mt-1 text-[12px] text-dim">Non-D-I teams share one pooled rating (<Link href="/methodology/#non-d1" className="underline hover:text-ink">why</Link>).</p>}
      </div>

      <div>
        <h4 className="mb-1 text-[13px] font-semibold">3 · The margin</h4>
        <table className="w-full border-collapse">
          <tbody>
            <tr className="border-b border-line"><th scope="row" className={TH}>Rating gap on a neutral floor</th><td className={TD}>{by(toAB(d.neutral))}</td></tr>
            <tr className="border-b border-line">
              <th scope="row" className={TH}>{host ? <>Home court: {fmt(b.h)} points per 100 × {fmt(pubOne(b.tempo))} possessions</> : "Home court"}</th>
              <td className={TD}>{host ? `+${fmt(Math.abs(d.home))} ${host.short}` : "None (neutral site)"}</td>
            </tr>
            <tr className="border-b border-line font-semibold" data-testid="build-margin">
              <th scope="row" className="px-3 py-2 text-left text-[13px]">= Projected margin <span className="font-normal text-mute">(DHR)</span></th>
              <td className={`${TD} text-[15px]`}>{by(margin)}</td>
            </tr>
            <tr className={injury ? "border-b border-line" : ""}><th scope="row" className={TH}>Projected total{points === "published" ? ` (${fmt(aPts)} + ${fmt(bPts)})` : " (both teams)"}</th><td className={TD} data-testid="build-total">{fmt(total)}</td></tr>
            {injury && (
              <>
                <tr className={Math.abs(shift) >= 0.05 ? "border-b border-line" : ""}>
                  <th scope="row" className={TH}>
                    Injuries (estimate, not in the model)
                    <span className="mt-0.5 block text-[12px] text-dim">
                      {injury.aOut.length || injury.bOut.length
                        ? [injury.aOut.length ? `${A.short}: ${injury.aOut.join(", ")}` : null, injury.bOut.length ? `${B.short}: ${injury.bOut.join(", ")}` : null].filter(Boolean).join(" · ")
                        : "No rotation player listed out for either team"}
                    </span>
                  </th>
                  <td className={TD}>{Math.abs(shift) < 0.05 ? "No change" : `${fmt(Math.abs(shift))} toward ${shift > 0 ? A.short : B.short}`}</td>
                </tr>
                {Math.abs(shift) >= 0.05 && (
                  <tr>
                    <th scope="row" className="px-3 py-2 text-left text-[13px]">= Injury-adjusted margin <span className="text-mute">(rough what-if)</span></th>
                    <td className={TD}>{by(margin + shift)}</td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-dim">
        {verified === true && <><span className="font-semibold text-win">✓ Matches the published projection to the decimal.</span> </>}
        {verified === false && <><span className="font-semibold text-hot">These lines differ slightly from the published projection</span> (the ratings were refreshed after it was made); the published numbers are the official ones. </>}
        Lines are rounded to one decimal; the model keeps full precision, so a product can differ by 0.1.
        {injury && <> The injury line is points per 100 each team is estimated to lose with its absent players (minutes × player rating), × possessions ÷ 100. It is a rough what-if, not part of the model.</>}{" "}
        <Link href="/methodology/#predictions" className="underline hover:text-ink">Methodology</Link>
      </p>
    </div>
  );
}
