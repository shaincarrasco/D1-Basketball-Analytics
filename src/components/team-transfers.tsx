"use client";
// Transfer portal ins and outs for one team. `TransferLedger` is the presentational part
// (also used by /transfers/ team view); the default export is the self-loading team-page card.
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import TeamLogo from "@sports/ui/team-logo";
import { useJson } from "@sports/ui/client-data";
import { etToday, fmt } from "@sports/ui/format";
import { IMPACT_SHORT, STATUS_LABEL, signedImpact, teamMoves, windowPhase, windowText, type PortalEntry, type PortalFile, type TeamMoves } from "@/lib/portal";

type Logos = Record<string, string | null>;

function Move({ e, dir, logos }: { e: PortalEntry; dir: "out" | "in"; logos?: Logos }) {
  const other = dir === "out" ? e.to : e.from;
  const s = e.stats;
  return (
    <li className="flex items-start gap-2.5 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          {e.pid ? <Link href={`/player/?id=${e.pid}`} className="link truncate font-semibold">{e.name}</Link> : <span className="truncate font-semibold">{e.name}</span>}
          {e.posN && <span className="shrink-0 text-xs text-dim">{e.posN}</span>}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-mute">
          {dir === "out" && !other ? <span className="font-semibold text-hot">{STATUS_LABEL[e.status]}</span> : other ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span>{dir === "out" ? "To" : "From"}</span>
              {other.slug && logos ? <TeamLogo src={logos[other.slug] ?? null} name={other.name} size={14} /> : null}
              {other.slug ? <Link href={`/teams/${other.slug}/`} className="hover:text-ink">{other.name}</Link> : <span>{other.name}{other.d1 ? "" : " (not D-I)"}</span>}
            </span>
          ) : null}
          {s ? <span className="tnum text-dim">{fmt(s.min)} mpg · {fmt(s.pts)} ppg</span> : <span className="text-dim">No 2026–27 D-I stats</span>}
        </p>
      </div>
      <span className={`shrink-0 pt-0.5 text-right font-display text-[17px] font-extrabold leading-none tnum ${e.impact === null ? "text-dim" : ""}`} title={e.impact === null ? "No 2026–27 D-I stats line we could match" : IMPACT_SHORT}>
        {e.impact === null ? "—" : fmt(e.impact)}
      </span>
    </li>
  );
}

/** Who a team lost / added, with impact totals and the net. */
export function TransferLedger({ moves, logos, wide = false }: { moves: TeamMoves; logos?: Logos; /** Two columns from the sm breakpoint (only where the container is wide, not in a sidebar). */ wide?: boolean }) {
  const tone = moves.net > 0.04 ? "text-win" : moves.net < -0.04 ? "text-loss" : "text-ink";
  const col = (dir: "out" | "in") => {
    const list = dir === "out" ? moves.out : moves.inn, total = dir === "out" ? moves.lost : moves.added, unknown = dir === "out" ? moves.outUnknown : moves.inUnknown;
    const Icon = dir === "out" ? ArrowUpRight : ArrowDownLeft;
    return (
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2 border-b border-line pb-1.5">
          <h3 className="flex items-center gap-1.5 text-[13px] font-bold">
            <Icon size={14} aria-hidden className={dir === "out" ? "text-loss" : "text-win"} />
            {dir === "out" ? "Who they lost" : "Who they added"} <span className="font-normal text-mute">({list.length})</span>
          </h3>
          <span className="text-[12.5px] text-mute tnum">{dir === "out" ? "−" : "+"}{fmt(total)} impact</span>
        </div>
        {list.length ? (
          <ul className="divide-y divide-line">{list.map(e => <Move key={e.key} e={e} dir={dir} logos={logos} />)}</ul>
        ) : <p className="py-2 text-[13px] text-mute">{dir === "out" ? "Nobody has left through the portal." : "No commitments from the portal yet."}</p>}
        {unknown > 0 && <p className="text-[11.5px] text-dim">{unknown} without a 2026–27 D-I stats line, not counted in the total.</p>}
      </div>
    );
  };
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3 rounded-xl bg-deck2 px-3.5 py-2.5">
        <span className="text-[13px] font-semibold text-mute" title={IMPACT_SHORT}>Net impact</span>
        <span className={`font-display text-[28px] font-black leading-none tnum ${tone}`}>{signedImpact(moves.net)}</span>
      </div>
      <div className={`grid gap-4 ${wide ? "sm:grid-cols-2" : ""}`}>
        {col("out")}
        {col("in")}
      </div>
      <p className="mt-2.5 text-[11.5px] leading-snug text-dim">Impact: {IMPACT_SHORT} Withdrawn players aren&apos;t counted as losses.</p>
    </div>
  );
}

/** Team-page card: loads portal.json itself. */
export default function TeamTransfers({ slug }: { slug: string }) {
  const portal = useJson<PortalFile>("portal.json");
  const body = (() => {
    if (portal.status === "error") return <p className="text-sm text-mute">Couldn&apos;t load the transfer portal. <button className="link underline" onClick={portal.retry}>Try again</button></p>;
    if (!portal.data) return <p className="text-sm text-mute" role="status">Loading…</p>;
    const { window: w, entries } = portal.data;
    const moves = teamMoves(entries, slug);
    if (moves) return <TransferLedger moves={moves} />;
    const { phase } = windowPhase(w, etToday());
    if (!entries.length) {
      return (
        <p className="text-sm leading-relaxed text-mute">
          {phase === "before" ? <>The 2027 portal window opens <b className="text-ink">{windowText(w)}</b>. Ins and outs show here when it does.</> : <>No portal entries have been published yet for the {windowText(w)} window.</>}
        </p>
      );
    }
    return <p className="text-sm text-mute">No portal moves for this team yet.</p>;
  })();
  return (
    <section className="deck p-5" aria-labelledby={`portal-${slug}-h`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id={`portal-${slug}-h`} className="h-section">Transfer portal</h2>
        <Link href={`/transfers/?team=${slug}`} className="text-[13px] font-semibold text-bulb-ink">Full tracker</Link>
      </div>
      {body}
    </section>
  );
}
