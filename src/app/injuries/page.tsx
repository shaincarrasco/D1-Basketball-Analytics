import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import PageHeader from "@/components/page-header";
import TeamLogo from "@/components/team-logo";
import InjuryPill, { ConfidenceTag } from "@/components/injury-pill";
import { getInjuries, getTeams } from "@/lib/server-data";
import { OUT_STATES, SOURCE_LABEL, etaText, lossText, playerHref } from "@/lib/injuries";
import { teamHex } from "@/lib/color";
import type { InjuryRow } from "@/lib/types";
import AllAbsences from "./all-absences";
import Freshness from "./freshness";
import TeamHealthBars from "./team-health";
import Wire from "./wire";
import type { TeamMetaMap } from "./parts";

export const metadata: Metadata = {
  title: "Injuries",
  description: "Every absence in Division I men's basketball: who's out, who's questionable, what changed in the last hour, and how much each team's rating takes a hit. Credited sources, labelled confidence.",
};

const rec = (a?: [number, number, number | null]) => (a ? `${a[0]}–${a[1]}` : "—");
const FALLBACK_NOTE = "Big Ten, SEC, ACC, Big 12, Big East, A-10 and MVC publish availability reports for conference games (conference play mostly starts late December/January).";

export default function InjuriesPage() {
  const { checked, rows, teams, wire, links } = getInjuries();
  const all = getTeams();
  const bySlug = new Map(all.map(t => [t.slug, t]));
  const slugs = new Set([...rows.map(r => r.slug), ...wire.map(w => w.slug), ...teams.map(t => t.slug)]);
  const meta: TeamMetaMap = {};
  for (const s of slugs) {
    const t = bySlug.get(s);
    if (!t) continue;
    meta[s] = { name: t.name, logo: t.logo, color: teamHex(t.color), next: t.next ? `${t.next.venue === "A" ? "at" : "vs"} ${t.next.opp}` : null };
  }

  const out = rows.filter(r => OUT_STATES.has(r.state));
  const stats: [string, number][] = [
    ["Players out", out.length],
    ["Out for season", rows.filter(r => r.state === "season").length],
    ["Questionable / day-to-day", rows.filter(r => r.state === "questionable" || r.state === "dtd").length],
    ["Changes in 24h", wire.filter(e => Date.parse(checked) - Date.parse(e.t) <= 864e5).length],
    ["Top 25 teams affected", new Set(rows.filter(r => (r.rank ?? 999) <= 25).map(r => r.slug)).size],
  ];

  // Biggest absences: reported or confirmed absences lead (we know why he's out), then the most costly
  // box-score absences on top-100 teams. Low-major "missed a game" rows stay in the full list below.
  const nl = (r: InjuryRow) => r.impact.netLoss ?? 0, rk = (r: InjuryRow) => r.rank ?? 999;
  const cmp = (a: InjuryRow, b: InjuryRow) => nl(b) - nl(a) || rk(a) - rk(b);
  const known = out.filter(r => r.confidence !== "inferred").sort((a, b) => nl(b) - nl(a) || rk(a) - rk(b)).slice(0, 9);
  const inferred = out.filter(r => r.confidence === "inferred" && rk(r) <= 100 && nl(r) >= 0.05).sort(cmp).slice(0, Math.max(3, 12 - known.length));
  const biggest = [...known, ...inferred];

  return (
    <>
      <PageHeader title="Injuries">Every absence in D-I men&apos;s basketball, with how we know it and what it costs the team. Credited to the source, never guessed.</PageHeader>
      <div className="-mt-3 mb-4"><Freshness checked={checked} /></div>

      <ul className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Summary">
        {stats.map(([l, v]) => (
          <li key={l} className="deck px-4 py-3">
            <div className="font-display text-[2.4rem] font-black leading-none">{v}</div>
            <div className="mt-1 text-[12.5px] font-semibold text-mute">{l}</div>
          </li>
        ))}
      </ul>

      <section id="biggest" className="mb-10 scroll-mt-20" aria-labelledby="big-h">
        <h2 id="big-h" className="h-section mb-3">Biggest absences</h2>
        {!biggest.length ? (
          <div className="deck p-5 text-sm text-mute">No high-impact absences flagged. We check ESPN&apos;s injury list, box scores and injury headlines every hour.</div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {biggest.map(r => {
              const m = meta[r.slug], eta = etaText(r), i = r.impact;
              const stat = [i.mpg != null ? `${i.mpg.toFixed(1)} mpg` : null, i.ppg != null ? `${i.ppg.toFixed(1)} ppg` : null, i.netLoss && i.netLoss >= 0.05 ? `est. ${lossText(i.netLoss)} pts per 100` : null].filter(Boolean).join(" · ");
              return (
                <li key={r.key} className="deck relative overflow-hidden p-4 pl-5">
                  <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: m?.color ?? "var(--line2)" }} aria-hidden />
                  <div className="flex items-start gap-2.5">
                    <TeamLogo src={m?.logo ?? null} name={r.team} size={34} />
                    <div className="min-w-0 flex-1">
                      <Link href={playerHref(r)} className="link font-display text-[24px] font-black leading-none">{r.name}</Link>
                      <p className="mt-1 text-[13px] text-mute"><Link href={`/teams/${r.slug}/`} className="link">{r.team}</Link>{r.rank ? <> · <span className="dots text-[11px]">#{r.rank}</span></> : null}{m?.next ? ` · next ${m.next}` : ""}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <InjuryPill state={r.state} label={r.status} />
                    {r.body && <span className="text-[13.5px] font-semibold">{r.body}</span>}
                  </div>
                  {eta && <p className="mt-1.5 text-[13.5px] text-mute">{eta}</p>}
                  {r.yetToPlay && <p className="mt-1 text-[13px] text-mute">Hasn&apos;t played this season.</p>}
                  {stat && <p className="mt-1.5 text-[13.5px]">{stat}</p>}
                  {r.ww && <p className="mt-1 text-[13px] text-mute">Team {rec(r.ww.with)} with him, {rec(r.ww.without)} without</p>}
                  <p className="mt-3 flex flex-wrap items-center gap-x-2 border-t border-line pt-2.5">
                    <ConfidenceTag value={r.confidence} />
                    {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 text-[12.5px]">{r.publisher ?? SOURCE_LABEL[r.source]}<ExternalLink size={11} aria-hidden /></a> : <span className="text-[12.5px] text-mute">{SOURCE_LABEL[r.source]}</span>}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mb-10 grid gap-10 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <section id="wire" className="scroll-mt-20" aria-labelledby="wire-h">
          <h2 id="wire-h" className="h-section mb-3">Injury wire</h2>
          <Wire wire={wire} checked={checked} teams={meta} />
        </section>
        <section id="teams" className="scroll-mt-20" aria-labelledby="teams-h">
          <h2 id="teams-h" className="h-section mb-3">Team health</h2>
          <TeamHealthBars teams={teams} meta={meta} />
        </section>
      </div>

      <section id="all" className="mb-10 scroll-mt-20" aria-labelledby="all-h">
        <h2 id="all-h" className="h-section mb-3">Every absence</h2>
        <AllAbsences rows={rows} teams={meta} />
      </section>

      <section id="official" className="scroll-mt-20" aria-labelledby="off-h">
        <h2 id="off-h" className="h-section mb-3">Official availability reports</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="deck p-5">
            {links.length ? (
              <ul className="divide-y divide-line">
                {links.map(l => (
                  <li key={l.conf} className="flex items-baseline justify-between gap-3 py-2 text-[14px]">
                    <span className="font-semibold">{l.conf}</span>
                    {l.url ? <a href={l.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">Report{l.note ? ` · ${l.note}` : ""}<ExternalLink size={12} aria-hidden /></a> : <span className="text-mute">{l.note ?? "No link yet"}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <a href="https://www.ncaa.com/di-mens-basketball-player-availability" target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1.5 font-semibold">NCAA tournament availability reports<ExternalLink size={13} aria-hidden /></a>
                <p className="mt-2 text-sm text-mute">{FALLBACK_NOTE} We link to these rather than copy them.</p>
              </>
            )}
          </div>
          <div className="deck p-5 text-sm leading-relaxed text-mute">
            <h3 className="mb-1 font-display text-[18px] font-bold text-ink">How our tracker works</h3>
            <p>We combine four sources every hour: ESPN&apos;s injury list (confirmed), credited news reports and injury headlines (reported), and box scores (inferred). When a player stops appearing in box scores and nobody says why, we show it as &ldquo;reason not reported&rdquo;, not as an injury. Statuses clear automatically when a player logs minutes again. Impact numbers are estimates.</p>
          </div>
        </div>
      </section>
    </>
  );
}
