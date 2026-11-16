"use client";
// "Impact (DPR)" card: DPR total, offence / defence split with the box-score-only estimate beneath each,
// and raw on-court numbers. Mount with the player's players.json row and his TeamDetail.onOff entry.
import Link from "next/link";
import { fmt, signed } from "@sports/ui/format";
import type { Player, TeamDetail } from "@/lib/types";

type OnOffEntry = NonNullable<TeamDetail["onOff"]>[string];
type Row = Pick<Player, "dpr" | "dprO" | "dprD" | "dprSE" | "onPoss" | "boxO" | "boxD" | "dpr30" | "dpr30Since">;

const tone = (v: number | null | undefined) => (v == null || Math.abs(v) < 0.05 ? "" : v > 0 ? "text-win" : "text-loss");

function dateLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Side({ label, v, box }: { label: string; v: number | null; box: number | null }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className={`h-9 font-display text-[28px] font-extrabold leading-9 tnum ${tone(v)}`}>{signed(v)}</div>
      <div className="h-5 text-xs leading-5 text-mute tnum">Box score only: {box == null ? "n/a" : signed(box)}</div>
    </div>
  );
}

function Stat({ label, children, cls = "" }: { label: string; children: React.ReactNode; cls?: string }) {
  return (
    <div className="min-w-0">
      <dt className="h-4 truncate text-[11px] leading-4 text-mute">{label}</dt>
      <dd className={`h-6 text-[15px] font-semibold leading-6 tnum ${cls}`}>{children}</dd>
    </div>
  );
}

export default function DprBreakdown({ row, onOff }: { row: Row; onOff?: OnOffEntry | null }) {
  const has = row.dpr !== null && row.dpr !== undefined;
  const up = (row.dpr30 ?? 0) > 0;
  return (
    <section className="deck p-5" aria-labelledby="dpr-h">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="dpr-h" className="h-section">Impact (DPR)</h2>
        <Link href="/methodology/#dpr" className="text-[13px] font-semibold text-bulb-ink hover:underline">How it works</Link>
      </div>
      <p className="mt-1 text-sm text-mute">DPR: points per 100 possessions better than an average D-I player, from who was on the floor for every possession, leaning on box stats when the sample is small.</p>
      {!has ? (
        <p className="mt-4 text-sm text-mute">Not enough on-court possessions yet</p>
      ) : (
        <>
          <div className="mt-4 flex items-baseline gap-2">
            <span className={`font-display text-5xl font-extrabold leading-none tnum ${tone(row.dpr)}`}>{signed(row.dpr)}</span>
            {row.dprSE != null && <span className="text-sm text-mute tnum">±{fmt(row.dprSE)}</span>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4">
            <Side label="Offense" v={row.dprO} box={row.boxO ?? null} />
            <Side label="Defense" v={row.dprD} box={row.boxD ?? null} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 sm:grid-cols-5">
            <Stat label="Possessions">{fmt(row.onPoss ?? onOff?.poss ?? null, 0)}</Stat>
            <Stat label="On-court O /100">{fmt(onOff?.onO ?? null)}</Stat>
            <Stat label="On-court D /100">{fmt(onOff?.onD ?? null)}</Stat>
            <Stat label="+/- (raw)" cls={tone(onOff?.pm)}>{onOff?.pm == null ? "–" : signed(onOff.pm, 0)}</Stat>
            {row.dpr30 != null && row.dpr30Since && (
              <Stat label={`30-day change`} cls={tone(row.dpr30)}>
                {row.dpr30 === 0 ? "0.0" : <>{up ? "▲" : "▼"} {fmt(Math.abs(row.dpr30))}</>}
              </Stat>
            )}
          </dl>
          <p className="mt-2 text-xs text-dim tnum">
            On-court numbers are raw, not opponent-adjusted; lower defense is better.{row.dpr30 != null && row.dpr30Since ? ` Change since ${dateLabel(row.dpr30Since)}.` : ""}
          </p>
        </>
      )}
    </section>
  );
}
