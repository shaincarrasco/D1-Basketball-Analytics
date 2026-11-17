"use client";
// How accurate Deuce is, walk-forward (model.json): the headline, Brier score against Elo alone,
// rolling accuracy across the test splits, calibration, results by tour and level, and notes.
// Betting results are deliberately not on the site (docs/tennis-paper-bets.md).
import Link from "next/link";
import { useJson } from "@sports/ui/client-data";
import { ErrorState, Loading } from "@sports/ui/states";
import { relativeTime } from "@sports/ui/format";
import { dec3, levelLabel, pct1, siteNotes, tourWord, type Metrics, type Model } from "@/lib/deuce";
import { CalibrationChart, Legend, RollingChart } from "./charts";

const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const LEVEL_ORDER = ["Grand Slam", "Finals", "1000", "500", "250", "125"];

function Big({ children }: { children: React.ReactNode }) {
  return <b className="font-display font-black text-ink tnum">{children}</b>;
}

function Breakdown({ m }: { m: Model }) {
  const tours = Object.entries(m.by_tour ?? {});
  const levels = Object.entries(m.by_level ?? {}).sort(([a], [b]) => (LEVEL_ORDER.indexOf(a) + 1 || 99) - (LEVEL_ORDER.indexOf(b) + 1 || 99));
  type R = Metrics & { baseline_elo_brier?: number | null };
  const table = (caption: string, first: string, rows: [string, string, R][]) => {
    const elo = rows.some(([, , v]) => v.baseline_elo_brier != null);
    return (
      <div className="scroll-x">
        <table className="dt">
          <caption className="sr-only">{caption}</caption>
          <thead><tr><th className="l" scope="col">{first}</th><th scope="col">Matches</th><th scope="col">Picked right</th><th scope="col">Brier</th>{elo && <th scope="col">Elo alone, Brier</th>}</tr></thead>
          <tbody>
            {rows.map(([k, label, v]) => (
              <tr key={k}>
                <td className="l font-semibold">{label}</td>
                <td>{n(v.n)}</td>
                <td className="font-semibold text-ink">{pct1(v.accuracy)}</td>
                <td>{dec3(v.brier)}</td>
                {elo && <td className="text-mute">{dec3(v.baseline_elo_brier)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-5">
      {table("Accuracy by tour", "Tour", tours.map(([k, v]) => [k, tourWord(k), v]))}
      {table("Accuracy by level", "Level", levels.map(([k, v]) => [k, levelLabel(k) ?? k, v]))}
    </div>
  );
}

export default function ModelView() {
  const q = useJson<Model>("model.json");
  if (q.error) return <ErrorState message={q.error} retry={q.retry} />;
  if (!q.data) return <Loading label="Loading the model report" />;
  // model.json may carry null for any section it doesn't have yet: render what is there.
  const raw = q.data;
  const o = raw.overall ?? { accuracy: null, brier: null, log_loss: null, n: null as unknown as number, baseline_elo_accuracy: null, baseline_elo_brier: null };
  const splits = (raw.splits ?? []).filter(Boolean), calibration = (raw.calibration ?? []).filter(Boolean), rolling = (raw.rolling ?? []).filter(Boolean);
  const m = { ...raw, splits, calibration, rolling, by_tour: raw.by_tour ?? {}, by_level: raw.by_level ?? {} };
  const hasBreakdown = Object.keys(m.by_tour).length + Object.keys(m.by_level).length > 0;
  const lift = o.accuracy != null && o.baseline_elo_accuracy != null ? (o.accuracy - o.baseline_elo_accuracy) * 100 : null;
  const ss = m.set_score_check;
  const first = splits[0], last = splits[splits.length - 1];
  const notes = siteNotes(m.notes);
  return (
    <div className="flex flex-col gap-6">
      <section className="deck p-5 sm:p-7" aria-label="Headline">
        <p className="max-w-4xl text-[26px] leading-[1.2] text-mute sm:text-[40px]">
          Deuce picked the winner in <Big>{pct1(o.accuracy)}</Big> of <Big>{n(o.n)}</Big> matches it had never seen. Elo ratings alone got <Big>{pct1(o.baseline_elo_accuracy)}</Big>.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="deck-flat px-4 py-3">
            <span className="block text-[13px] font-semibold text-mute">More picks right than Elo</span>
            <span className="font-display text-3xl font-extrabold tnum">{lift == null ? "—" : `${lift >= 0 ? "+" : "−"}${Math.abs(lift).toFixed(1)} pts`}</span>
            <span className="block text-[12.5px] text-dim">About {lift == null ? "—" : Math.round(Math.abs(lift))} more right per 100 matches.</span>
          </div>
          <div className="deck-flat px-4 py-3">
            <span className="block text-[13px] font-semibold text-mute">Brier score (lower is better)</span>
            <span className="font-display text-3xl font-extrabold tnum">{dec3(o.brier)}</span>
            <span className="block text-[12.5px] text-dim">Elo alone {dec3(o.baseline_elo_brier)}, a coin flip {dec3(o.baseline_coin_brier ?? 0.25)}. It punishes confident misses.</span>
          </div>
          <div className="deck-flat px-4 py-3">
            <span className="block text-[13px] font-semibold text-mute">Tested on</span>
            <span className="font-display text-3xl font-extrabold tnum">{splits.length ? `${splits.length} ${splits.length === 1 ? "period" : "periods"}` : "—"}</span>
            <span className="block text-[12.5px] text-dim">{first && last ? `${day(first.start)} to ${day(last.end)}` : "—"}, each scored by a model trained only on earlier matches.</span>
          </div>
        </div>
      </section>

      {(rolling.length > 0 || splits.length > 0) && <section className="deck p-4 sm:p-6" aria-labelledby="roll-h">
        <h2 id="roll-h" className="h-section font-display">Accuracy over time</h2>
        <p className="mb-3 mt-1 text-[14px] text-mute">Share of matches picked right in each test period, and over the previous 100 matches as the season went on. Each period was predicted by a model that had not seen it.</p>
        <Legend items={[{ label: "Deuce, period average" }, { label: "Elo alone, period average", dashed: true }, { label: "Deuce, last 100 matches", faint: true }]} />
        {rolling.length > 0 && <div className="mt-3"><RollingChart rolling={rolling} splits={splits} /></div>}
        {splits.length > 0 && <div className="scroll-x mt-4">
          <table className="dt">
            <caption className="sr-only">Accuracy by test period</caption>
            <thead><tr><th className="l" scope="col">Period</th><th className="l" scope="col">Dates</th><th scope="col">Matches</th><th scope="col">Picked right</th><th scope="col">Elo alone</th><th scope="col">Brier</th><th scope="col">Elo alone, Brier</th></tr></thead>
            <tbody>
              {splits.map((s, i) => (
                <tr key={s.name}>
                  <td className="l font-semibold">{/^split\s*\d+$/i.test(s.name) ? `Split ${i + 1}` : s.name}</td>
                  <td className="l text-mute">{s.start && s.end ? `${day(s.start)} to ${day(s.end)}` : "—"}</td>
                  <td>{n(s.n)}</td>
                  <td className="font-semibold text-ink">{pct1(s.accuracy)}</td>
                  <td className="text-mute">{pct1(s.baseline_elo_accuracy)}</td>
                  <td>{dec3(s.brier)}</td>
                  <td className="text-mute">{dec3(s.baseline_elo_brier)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </section>}

      <div className={`grid gap-6 ${calibration.length && hasBreakdown ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" : ""}`}>
        {calibration.length > 0 && <section className="deck p-4 sm:p-6" aria-labelledby="cal-h">
          <h2 id="cal-h" className="h-section font-display">Can you trust the percentages?</h2>
          <p className="mb-3 mt-1 text-[14px] text-mute">When the model gave its favourite 70%, did the favourite win about 70% of the time? Dots on the dashed line mean yes. Bigger dots, more matches.</p>
          <Legend items={[{ label: "How often the favourite won", dot: true }, { label: "Perfect calibration", dashed: true }]} />
          <div className="mt-3"><CalibrationChart bins={calibration} /></div>
          <details className="mt-3 text-[13.5px]">
            <summary className="cursor-pointer font-semibold text-mute hover:text-ink">Show as a table</summary>
            <div className="scroll-x mt-2">
              <table className="dt">
                <thead><tr><th className="l" scope="col">Model said</th><th scope="col">Average</th><th scope="col">Favourite won</th><th scope="col">Matches</th></tr></thead>
                <tbody>{calibration.map(b => <tr key={b.bin}><td className="l">{b.bin ? b.bin.split("-").map(v => `${Math.round(Number(v) * 100)}%`).join(" to ") : "—"}</td><td>{pct1(b.pred)}</td><td className="font-semibold text-ink">{pct1(b.actual)}</td><td>{n(b.n)}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </section>}

        {(hasBreakdown || ss?.favourite_straight_sets_actual != null) && <section className="deck p-4 sm:p-6" aria-labelledby="split-h">
          <h2 id="split-h" className="h-section font-display">By tour and level</h2>
          <p className="mb-3 mt-1 text-[14px] text-mute">Levels with at least 100 test matches.</p>
          {hasBreakdown && <Breakdown m={m} />}
          {ss && ss.favourite_straight_sets_actual != null && (
            <p className="note mt-5 text-[14px] text-mute">
              <span>Set scores: favourites won in straight sets <b className="text-ink">{pct1(ss.favourite_straight_sets_actual)}</b> of the time; the model expected <b className="text-ink">{pct1(ss.favourite_straight_sets_pred)}</b> ({n(ss.n)} matches).</span>
            </p>
          )}
        </section>}
      </div>

      <section className="deck p-4 sm:p-6" aria-labelledby="notes-h">
        <h2 id="notes-h" className="h-section font-display mb-3">Reading this</h2>
        <ul className="flex max-w-3xl flex-col gap-2.5 text-[14.5px] text-mute">
          <li className="note"><span><b className="text-ink">Never seen.</b> Each period is predicted by a model trained only on matches before it starts, using only what was known before each match.</span></li>
          <li className="note"><span><b className="text-ink">Picked right</b> means the player given more than 50% won. A 60% favourite should still lose 4 times in 10.</span></li>
          <li className="note"><span><b className="text-ink">Elo alone</b> is a plain rating of every player from past results, with no surface, form or workload. It is the bar to beat.</span></li>
          <li className="note"><span><b className="text-ink">Brier score</b> is the average squared gap between the probability and what happened (1 for a win, 0 for a loss). Always saying 50% scores 0.250.</span></li>
        </ul>
        {notes.length > 0 && (
          <details className="mt-4 text-[13px]">
            <summary className="cursor-pointer font-semibold text-mute hover:text-ink">Method notes</summary>
            <ul className="mt-2 flex max-w-3xl list-disc flex-col gap-1.5 pl-5 text-dim">{notes.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </details>
        )}
        <p className="mt-4 text-xs text-dim">{m.generated_at ? `Report updated ${relativeTime(m.generated_at)}. ` : ""} <Link className="link underline" href="/predictions/">See the current predictions</Link>.</p>
      </section>
    </div>
  );
}
