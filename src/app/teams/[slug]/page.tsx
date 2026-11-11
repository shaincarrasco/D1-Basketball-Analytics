import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMeta, getTeam, getTeamDetail, getTeams } from "@/lib/server-data";
import TeamLogo from "@/components/team-logo";
import StatBar from "@/components/stat-bar";
import { fmt, ordinal, pctFmt, signed } from "@/lib/format";
import type { TeamSummary } from "@/lib/types";
import GameLog from "./game-log";
import Roster from "./roster";
import PerfChart from "./perf-chart";

export const dynamicParams = false;
export function generateStaticParams() {
  return getTeams().map(t => ({ slug: t.slug }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = getTeam((await params).slug);
  return t ? { title: `${t.name} ${t.mascot ?? ""}`.trim(), description: `${t.name} 2026–27: DHR rank ${t.rank ?? "—"}, ${t.w}–${t.l}, adjusted offense ${fmt(t.adjO)} and defense ${fmt(t.adjD)}, game log, projections and roster.` } : {};
}

// Teams closest in adjusted offense, defense and tempo (tempo weighted lower).
function comps(team: TeamSummary, all: TeamSummary[]) {
  if (team.adjO === null || team.adjD === null || team.adjT === null) return [];
  return all
    .filter(t => t.id !== team.id && t.adjO !== null && t.adjD !== null && t.adjT !== null)
    .map(t => ({ t, d: Math.hypot(t.adjO! - team.adjO!, t.adjD! - team.adjD!, 0.6 * (t.adjT! - team.adjT!)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 4);
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = getTeam(slug);
  if (!team) notFound();
  const detail = getTeamDetail(slug), meta = getMeta(), teams = getTeams();
  const total = meta.counts.ratedTeams;
  const oppSlugs = new Set(detail.games.map(g => g.oppSlug).filter(Boolean));
  const logos = Object.fromEntries(teams.filter(t => oppSlugs.has(t.slug)).map(t => [t.slug, t.logo]));
  const o = team.off, d = team.def, or = team.offRanks ?? {}, dr = team.defRanks ?? {};
  const similar = comps(team, teams);
  const played = detail.games.filter(g => g.result);

  return (
    <article>
      {/* Hero */}
      <section className="deck team-accent team-hero relative mb-6 overflow-hidden p-5 sm:p-8" style={team.color ? ({ "--team": team.color } as React.CSSProperties) : undefined}>
        <div className="court-arc" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-6">
          <TeamLogo src={team.logo} name={team.name} size={88} className="drop-shadow-[0_0_24px_rgba(255,255,255,.08)]" />
          <div className="order-last min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-1">
            <p className="text-sm text-mute">
              <Link className="link underline decoration-line2 underline-offset-4" href={`/conferences/${team.confSlug}/`}>{team.confName}</Link>
              {team.mascot ? <> · {team.mascot}</> : null}
            </p>
            <h1 className="font-display text-5xl font-black leading-[0.9] tracking-tight sm:text-7xl">{team.name}</h1>
            <p className="mt-2 text-[15px] text-mute tnum">
              <b className="text-ink">{team.w}–{team.l}</b> overall · {team.cw}–{team.cl} conference
              {team.streak && <> · <span className={team.streak.startsWith("W") ? "text-win" : "text-loss"}>{team.streak}</span></>}
              {" "}· projected <b className="text-ink">{fmt(team.projW, 1)}–{fmt(team.projL, 1)}</b>
            </p>
          </div>
          <div className="ml-auto text-right sm:ml-0">
            <div className="label">DHR rank</div>
            <div className="outline-num font-display text-[5rem] font-black leading-[0.85] sm:text-[8rem]">{team.rank ?? "—"}</div>
          </div>
        </div>
        <dl className="relative mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-5">
          {[
            ["AdjEM", signed(team.adjEM, 1), team.rank, "Points per 100 possessions better than an average D-I team"],
            ["Adj offense", fmt(team.adjO), team.adjORank, "Points per 100 vs an average defense"],
            ["Adj defense", fmt(team.adjD), team.adjDRank, "Points allowed per 100 vs an average offense"],
            ["Tempo", fmt(team.adjT), team.adjTRank, "Adjusted possessions per 40 minutes"],
            ["Schedule", signed(team.sos, 1), team.sosRank, "Average AdjEM of opponents so far"],
          ].map(([label, value, rank, hint]) => (
            <div key={label as string} className="bg-deck px-4 py-3 last:col-span-2 sm:last:col-span-1" title={hint as string}>
              <dt className="label">{label}</dt>
              <dd className="font-display text-3xl font-extrabold tnum">{value}<span className="ml-2 font-sans text-xs font-semibold text-mute">{rank ? ordinal(rank as number) : ""}</span></dd>
            </div>
          ))}
        </dl>
        {team.ratedGames < 5 && (
          <p className="relative mt-3 text-xs text-mute">Early-season rating from {fmt(team.ratedGames, 0)} rated D-I game{team.ratedGames === 1 ? "" : "s"} — it leans on the {team.confName} average and will move a lot.</p>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {/* Next game */}
          {team.next && (
            <section className="deck flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                <div className="label">Next game · {new Date(team.next.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" })}</div>
                <div className="mt-1 flex items-center gap-2 text-lg font-semibold">
                  {team.next.venue === "A" ? "at" : "vs"}
                  {team.next.oppSlug ? <TeamLogo src={logos[team.next.oppSlug] ?? null} name={team.next.opp} size={24} /> : null}
                  {team.next.oppRank ? <span className="text-sm text-mute">#{team.next.oppRank}</span> : null}
                  {team.next.oppSlug ? <Link className="link" href={`/teams/${team.next.oppSlug}/`}>{team.next.opp}</Link> : team.next.opp}
                  {team.next.venue === "N" && <span className="text-xs text-mute">(neutral)</span>}
                </div>
              </div>
              {team.next.wp !== null && (
                <div className="text-right">
                  <div className="label">Win probability</div>
                  <div className="font-display text-4xl font-black tnum" style={{ color: team.next.wp >= 0.5 ? "var(--win)" : "var(--loss)" }}>{pctFmt(team.next.wp)}</div>
                </div>
              )}
              {team.next.oppSlug && (
                <Link className="btn" href={`/matchup/?a=${team.slug}&b=${team.next.oppSlug}&site=${team.next.venue === "H" ? "a" : team.next.venue === "A" ? "b" : "n"}`}>Open in matchup simulator</Link>
              )}
            </section>
          )}

          {/* Game form */}
          <section className="deck p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h-section">Game by game</h2>
              <p className="text-xs text-mute">Each bar is the efficiency margin adjusted for that opponent and venue. Above zero = played better than an average D-I team would have.</p>
            </div>
            <PerfChart games={played} />
          </section>

          {/* Schedule */}
          <section>
            <h2 className="h-section mb-3">Schedule &amp; results</h2>
            <GameLog games={detail.games} logos={logos} />
          </section>

          {/* Roster */}
          <section>
            <h2 className="h-section mb-3">Roster</h2>
            <Roster rows={detail.roster} />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="deck p-5">
            <h2 className="h-section mb-1 text-off">Offense</h2>
            <p className="mb-2 text-xs text-mute">Season stats with national rank</p>
            <StatBar label="Points per 100 (raw)" value={o?.eff ?? null} rank={or.eff} total={total} />
            <StatBar label="Effective FG%" value={o?.efg ?? null} rank={or.efg} total={total} unit="%" />
            <StatBar label="Turnover rate" value={o?.tov ?? null} rank={or.tov} total={total} unit="%" />
            <StatBar label="Offensive rebound %" value={o?.orb ?? null} rank={or.orb} total={total} unit="%" />
            <StatBar label="Free-throw rate" value={o?.ftr ?? null} rank={or.ftr} total={total} />
            <StatBar label="3-point %" value={o?.threePct ?? null} rank={or.threePct} total={total} unit="%" />
            <StatBar label="2-point %" value={o?.twoPct ?? null} rank={or.twoPct} total={total} unit="%" />
            <StatBar label="Free-throw %" value={o?.ftPct ?? null} rank={or.ftPct} total={total} unit="%" />
            <StatBar label="Assisted makes" value={o?.astRate ?? null} rank={or.astRate} total={total} unit="%" />
            <StatBar label="3PA share (style)" value={o?.threeRate ?? null} rank={or.threeRate} total={total} unit="%" tone="neutral" />
            <StatBar label="Paint points share (style)" value={o?.paintShare ?? null} rank={or.paintShare} total={total} unit="%" tone="neutral" />
          </section>
          <section className="deck p-5">
            <h2 className="h-section mb-1 text-def">Defense</h2>
            <p className="mb-2 text-xs text-mute">Opponent stats — rank 1 is the stingiest</p>
            <StatBar tone="def" label="Points allowed per 100 (raw)" value={d?.eff ?? null} rank={dr.eff} total={total} />
            <StatBar tone="def" label="Opponent eFG%" value={d?.efg ?? null} rank={dr.efg} total={total} unit="%" />
            <StatBar tone="def" label="Turnovers forced" value={d?.tov ?? null} rank={dr.tov} total={total} unit="%" />
            <StatBar tone="def" label="Opponent OR%" value={d?.orb ?? null} rank={dr.orb} total={total} unit="%" />
            <StatBar tone="def" label="Opponent FT rate" value={d?.ftr ?? null} rank={dr.ftr} total={total} />
            <StatBar tone="def" label="Opponent 3P%" value={d?.threePct ?? null} rank={dr.threePct} total={total} unit="%" />
            <StatBar tone="def" label="Opponent 2P%" value={d?.twoPct ?? null} rank={dr.twoPct} total={total} unit="%" />
            <StatBar tone="def" label="Block rate" value={o?.blkRate ?? null} rank={or.blkRate} total={total} unit="%" />
            <StatBar tone="def" label="Steal rate" value={o?.stlRate ?? null} rank={or.stlRate} total={total} unit="%" />
          </section>
          <section className="deck p-5">
            <h2 className="h-section mb-3">Résumé</h2>
            <table className="w-full text-sm tnum">
              <tbody>
                {team.quads.map(([w, l], i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <th scope="row" className="py-2 text-left font-normal text-mute" title="Unofficial DHR quadrant using NET-style cutoffs by venue">Quadrant {i + 1}</th>
                    <td className="py-2 text-right font-semibold">{w}–{l}</td>
                  </tr>
                ))}
                <tr className="border-b border-line"><th scope="row" className="py-2 text-left font-normal text-mute">Games within 5 pts</th><td className="py-2 text-right font-semibold">{team.close[0]}–{team.close[1]}</td></tr>
                <tr><th scope="row" className="py-2 text-left font-normal text-mute">Projected conference</th><td className="py-2 text-right font-semibold">{fmt(team.projCW, 1)}–{fmt(team.projCL, 1)}</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-dim">Quadrants use DHR ranks with NET-style cutoffs. They are not the NCAA&apos;s official quadrants.</p>
          </section>
          {similar.length > 0 && (
            <section className="deck p-5">
              <h2 className="h-section mb-1">Statistical comps</h2>
              <p className="mb-3 text-xs text-mute">Closest teams by adjusted offense, defense and tempo</p>
              <ul className="space-y-2">
                {similar.map(({ t }) => (
                  <li key={t.id}>
                    <Link href={`/teams/${t.slug}/`} className="link flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-deck2">
                      <TeamLogo src={t.logo} name={t.name} size={26} />
                      <span className="flex-1 font-semibold">{t.name}</span>
                      <span className="text-xs text-mute tnum">#{t.rank} · {fmt(t.adjO)} / {fmt(t.adjD)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}
