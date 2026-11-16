"use client";
// The public track record. Reads public/data/app/receipts.json (built by scripts/build-receipts.mjs).
// Headline numbers come from meta.json via that file; weekly and recent detail are rebuilt from the game log.
import Link from "next/link";
import { useJson } from "@sports/ui/client-data";
import { dayLabel, fmt } from "@sports/ui/format";
import { ErrorState, Loading } from "@sports/ui/states";
import FocusTabs, { type FocusTab } from "@/components/focus-tabs";

type Bin = { bin: string; games: number; expected: number | null; actual: number | null };
type Backtest = { games: number; correct: number; accuracy: number; marginMAE: number; brier: number; logLoss: number; calibration: Bin[] };
type Market = { games: number; modelMAE: number; lineMAE: number; atsW: number; atsL: number; atsP: number; note: string };
type Week = { week: string; games: number; correct: number; accuracy: number; brier: number };
type Receipts = {
  updated: string;
  backtest: { description: string; all: Backtest; seasoned: Backtest | null; seasonedRule: string | null };
  market: Market | null;
  byWeek: Week[];
  recentFields: string[];
  recent: (string | number | boolean)[][];
  check?: { matches: boolean; metaGames: number; metaCorrect: number; rebuiltGames: number; rebuiltCorrect: number };
};

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;

export default function ReceiptsView() {
  const data = useJson<Receipts>("receipts.json");
  if (data.status === "loading") return <Loading label="Loading receipts" />;
  if (data.status === "error") {
    if (data.error.startsWith("No data has been published")) {
      return <div className="deck p-6"><p className="font-semibold">No receipts have been published yet.</p><p className="mt-1 text-sm text-mute">The track record appears after the next data build.</p></div>;
    }
    return <ErrorState message={data.error} retry={data.retry} />;
  }
  const r = data.data;
  const tabs: FocusTab[] = [
    { id: "record", label: "Record", content: <RecordPanel r={r} /> },
    { id: "calibration", label: "Calibration", content: <CalibrationPanel bins={r.backtest.all.calibration} /> },
    { id: "line", label: "Vs the line", content: <LinePanel market={r.market} /> },
    { id: "recent", label: "Recent picks", content: <RecentPanel r={r} /> },
  ];
  return (
    <>
      <FocusTabs tabs={tabs} />
      <footer className="mt-10 border-t border-line pt-6 text-sm text-mute">
        <p>
          How these numbers are made, including the walk-forward rule and what counts as a D-I game, is on the{" "}
          <Link href="/methodology/#backtest" className="link underline">methodology page</Link>.
        </p>
      </footer>
    </>
  );
}

function RecordPanel({ r }: { r: Receipts }) {
  const a = r.backtest.all, s = r.backtest.seasoned;
  return (
    <div className="space-y-10">
      {r.check && !r.check.matches && (
        <p className="deck p-4 text-sm text-mute" role="note">
          The weekly and recent figures below are rebuilt from the game log ({r.check.rebuiltCorrect} of {r.check.rebuiltGames}) and do not yet match the headline ({r.check.metaCorrect} of {r.check.metaGames}). The headline is the official number; the detail catches up on the next data build.
        </p>
      )}
      <section aria-labelledby="rec-h">
        <h2 id="rec-h" className="h-section mb-3">Straight-up record</h2>
        <p className="font-display text-[88px] font-bold leading-none tnum text-win sm:text-[120px]">{pct(a.accuracy)}</p>
        <p className="mt-2 text-lg tnum">{a.correct} of {a.games} winners</p>
        <p className="mt-1 text-sm text-mute">A pick is the team the model made the favourite before tip-off.</p>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="deck p-4">
            <dt className="text-sm text-mute">Margin error</dt>
            <dd className="font-display text-[32px] font-bold tnum">±{fmt(a.marginMAE)} pts</dd>
            <dd className="text-sm text-mute">Average gap between the predicted and the final margin.</dd>
          </div>
          <div className="deck p-4">
            <dt className="text-sm text-mute">Brier score</dt>
            <dd className="font-display text-[32px] font-bold tnum">{a.brier.toFixed(3)}</dd>
            <dd className="text-sm text-mute">0 is perfect, 0.25 is a coin flip. Lower is better.</dd>
          </div>
        </dl>
      </section>

      {s && (
        <section aria-labelledby="seasoned-h" className="deck p-5">
          <h2 id="seasoned-h" className="h-section mb-2">Seasoned teams</h2>
          <p className="font-display text-[40px] font-bold tnum">{pct(s.accuracy)} <span className="text-base font-normal text-mute">({s.correct} of {s.games})</span></p>
          <p className="mt-2 text-sm text-mute">Only games where both teams had enough earlier games to rate them well. Rule: {r.backtest.seasonedRule ?? "see methodology"}.</p>
        </section>
      )}

      <section aria-labelledby="week-h">
        <h2 id="week-h" className="h-section mb-3">By week</h2>
        <WeeklyChart weeks={r.byWeek} />
        <p className="mt-2 text-sm text-mute">Bars are each week&apos;s straight-up accuracy. The dashed line is 50%, a coin flip.</p>
      </section>
    </div>
  );
}

function WeeklyChart({ weeks }: { weeks: Week[] }) {
  if (!weeks.length) return <p className="text-sm text-mute">No finished games with predictions yet.</p>;
  const W = 640, H = 220, L = 40, R = 8, T = 14, B = 46;
  const band = (W - L - R) / weeks.length;
  const y = (v: number) => T + (1 - v) * (H - T - B);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[420px]" role="img"
        aria-label={`Weekly accuracy: ${weeks.map(w => `week of ${w.week}, ${w.correct} of ${w.games}`).join("; ")}`}>
        {[0, 0.5, 1].map(v => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0.5 ? "var(--mute)" : "var(--line)"} strokeDasharray={v === 0.5 ? "5 5" : undefined} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--dim)">{v * 100}%</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const cx = L + band * i + band / 2, bw = band * 0.6;
          return (
            <g key={w.week}>
              <rect x={cx - bw / 2} y={y(w.accuracy)} width={bw} height={y(0) - y(w.accuracy)} rx="3" fill="var(--bulb)" fillOpacity="0.85" />
              <text x={cx} y={y(w.accuracy) - 5} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--ink)">{Math.round(w.accuracy * 100)}%</text>
              <text x={cx} y={H - 24} textAnchor="middle" fontSize="11" fill="var(--mute)">{dayLabel(w.week, { month: "short", day: "numeric" })}</text>
              <text x={cx} y={H - 9} textAnchor="middle" fontSize="11" fill="var(--dim)">{w.games} g</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CalibrationPanel({ bins }: { bins: Bin[] }) {
  const pts = bins.filter((b): b is Bin & { expected: number; actual: number } => b.expected !== null && b.actual !== null);
  return (
    <div className="space-y-8">
      <section aria-labelledby="cal-h">
        <h2 id="cal-h" className="h-section mb-2">Calibration</h2>
        <p className="text-[15px] leading-relaxed">When we say 80%, the favorite should win about 8 in 10.</p>
        <p className="mt-2 text-sm text-mute">Each dot is a group of games with a similar favourite probability. The closer a dot sits to the dashed diagonal, the better the model knows how sure to be.</p>
      </section>
      <div className="overflow-x-auto">
        <ReliabilityChart pts={pts} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Calibration by favourite probability</caption>
          <thead className="text-left text-mute">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 font-semibold">Favourite&apos;s chance</th>
              <th scope="col" className="py-2 text-right font-semibold">Games</th>
              <th scope="col" className="py-2 text-right font-semibold">We said</th>
              <th scope="col" className="py-2 text-right font-semibold">They won</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {bins.map(b => (
              <tr key={b.bin} className="border-b border-line/60">
                <th scope="row" className="py-2 text-left font-normal">{b.bin}</th>
                <td className="py-2 text-right">{b.games}</td>
                <td className="py-2 text-right">{b.expected === null ? "—" : pct(b.expected, 0)}</td>
                <td className="py-2 text-right">{b.actual === null ? "—" : pct(b.actual, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReliabilityChart({ pts }: { pts: (Bin & { expected: number; actual: number })[] }) {
  if (!pts.length) return <p className="text-sm text-mute">Not enough games to chart yet.</p>;
  const W = 560, H = 360, L = 52, R = 16, T = 16, B = 52;
  const yMin = Math.min(0.5, Math.floor(Math.min(...pts.map(p => p.actual), 0.5) * 10) / 10);
  const xs = (v: number) => L + ((v - 0.5) / 0.5) * (W - L - R);
  const ys = (v: number) => T + (1 - (v - yMin) / (1 - yMin)) * (H - T - B);
  const maxN = Math.max(...pts.map(p => p.games), 1);
  const rad = (n: number) => 5 + 11 * Math.sqrt(n / maxN);
  const yTicks: number[] = [];
  for (let v = yMin; v <= 1.0001; v += 0.1) yTicks.push(+v.toFixed(1));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[440px] max-w-[620px]" role="img"
      aria-label={`Calibration chart: ${pts.map(p => `${p.bin}: ${p.games} games, we said ${pct(p.expected, 0)}, they won ${pct(p.actual, 0)}`).join("; ")}`}>
      {yTicks.map(v => (
        <g key={`y${v}`}>
          <line x1={L} x2={W - R} y1={ys(v)} y2={ys(v)} stroke="var(--line)" />
          <text x={L - 8} y={ys(v) + 4} textAnchor="end" fontSize="13" fill="var(--dim)">{(v * 100).toFixed(0)}%</text>
        </g>
      ))}
      {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map(v => (
        <g key={`x${v}`}>
          <line x1={xs(v)} x2={xs(v)} y1={T} y2={H - B} stroke="var(--line)" />
          <text x={xs(v)} y={H - B + 18} textAnchor="middle" fontSize="13" fill="var(--dim)">{(v * 100).toFixed(0)}%</text>
        </g>
      ))}
      <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" fontSize="13" fill="var(--mute)">Win chance we gave the favourite</text>
      <text transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize="13" fill="var(--mute)">How often it won</text>
      <line x1={xs(0.5)} y1={ys(0.5)} x2={xs(1)} y2={ys(1)} stroke="var(--mute)" strokeDasharray="5 5" />
      <path d={pts.map((p, i) => `${i ? "L" : "M"}${xs(p.expected).toFixed(1)},${ys(p.actual).toFixed(1)}`).join("")} fill="none" stroke="var(--bulb)" strokeWidth="2" opacity="0.7" />
      {pts.map(p => (
        <g key={p.bin}>
          <circle cx={xs(p.expected)} cy={ys(p.actual)} r={rad(p.games)} fill="var(--bulb)" fillOpacity="0.25" stroke="var(--bulb)" strokeWidth="2" />
          <text x={xs(p.expected)} y={ys(p.actual) - rad(p.games) - 6} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="var(--ink)">{p.games} g</text>
        </g>
      ))}
    </svg>
  );
}

function LinePanel({ market }: { market: Market | null }) {
  if (!market || !market.games) {
    return <div className="deck p-5 text-sm text-mute">No betting-line comparison is available yet.</div>;
  }
  const decided = market.atsW + market.atsL;
  const atsPct = decided ? market.atsW / decided : null;
  const behind = atsPct !== null && atsPct < 0.5;
  return (
    <div className="space-y-8">
      <section aria-labelledby="line-h">
        <h2 id="line-h" className="h-section mb-3">Model vs the betting line</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="deck p-4">
            <dt className="text-sm text-mute">Model margin error</dt>
            <dd className="font-display text-[32px] font-bold tnum">±{fmt(market.modelMAE)} pts</dd>
          </div>
          <div className="deck p-4">
            <dt className="text-sm text-mute">Line margin error</dt>
            <dd className="font-display text-[32px] font-bold tnum">±{fmt(market.lineMAE)} pts</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-mute">Margin error is the average gap to the final margin. Lower is better.</p>
      </section>

      <section aria-labelledby="ats-h" className="deck p-5">
        <h2 id="ats-h" className="h-section mb-2">Against the spread</h2>
        <p className="font-display text-[40px] font-bold tnum">
          <span className="text-win">{market.atsW}</span>–<span className="text-loss">{market.atsL}</span>–{market.atsP}
          {atsPct !== null && <span className="ml-3 text-base font-normal text-mute">{pct(atsPct)} won</span>}
        </p>
        <p className="mt-3 text-[15px] leading-relaxed">
          {behind
            ? "The betting line has been more accurate than the model so far; we show this anyway."
            : "Where the model and the line disagreed by at least half a point, the model has picked the side that covered more often than not."}
        </p>
        <p className="mt-2 text-sm text-mute">{market.note} Not betting advice.</p>
      </section>
    </div>
  );
}

function RecentPanel({ r }: { r: Receipts }) {
  const idx = Object.fromEntries(r.recentFields.map((f, i) => [f, i]));
  const at = <T,>(row: (string | number | boolean)[], f: string) => row[idx[f]] as T;
  if (!r.recent.length) return <p className="text-sm text-mute">No graded picks yet.</p>;
  return (
    <div>
      <h2 className="h-section mb-3">Last {r.recent.length} picks, newest first</h2>
      <ul className="divide-y divide-line">
        {r.recent.map(row => {
          const home = at<number>(row, "homeWinProb");
          const homeFav = home >= 0.5;
          const favShort = homeFav ? at<string>(row, "homeShort") : at<string>(row, "awayShort");
          const favPct = homeFav ? home : 1 - home;
          const ok = at<boolean>(row, "pickCorrect");
          const date = at<string>(row, "date");
          return (
            <li key={at<string>(row, "gameId")} className="flex h-12 items-center gap-3 text-sm">
              <span className="w-14 shrink-0 tnum text-mute">{dayLabel(date, { month: "short", day: "numeric" })}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate tnum">
                  {at<string>(row, "awayShort")} {at<number>(row, "awayScore")}, {at<string>(row, "homeShort")} {at<number>(row, "homeScore")}
                </span>
                <span className="block truncate text-xs tnum text-mute">
                  Pick {favShort} {pct(favPct, 0)} · margin error ±{fmt(at<number>(row, "marginError"))}
                </span>
              </span>
              <span aria-label={ok ? "Correct" : "Incorrect"} className={`w-5 shrink-0 text-center text-base font-bold ${ok ? "text-win" : "text-loss"}`}>{ok ? "✓" : "✗"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
