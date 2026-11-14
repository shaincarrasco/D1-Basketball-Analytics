import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMeta, getTeam, getTeamDetail, getTeams } from "@/lib/server-data";
import TeamLogo from "@/components/team-logo";
import TvBadges from "@/components/tv-badges";
import StatBar from "@/components/stat-bar";
import { fmt, pctFmt, signed } from "@/lib/format";
import FavoriteButton from "@/components/favorite-button";
import ArticleList from "@/components/article-list";
import AvailabilityList from "@/components/availability-list";
import CalendarButton from "./calendar-button";
import type { PlayerField, TeamSummary } from "@/lib/types";
import GameLog from "./game-log";
import { LiveNextGate, LiveRank, LiveRecord, LiveTiles } from "./live-hero";
import Roster, { type RosterBio } from "./roster";
import PerfChart from "./perf-chart";
import SeasonOutlook from "./season-outlook";
import ShotProfile from "./shot-profile";
import ZoneTable from "./zone-table";
import Lineups from "./lineups";

// Older data files predate `rosterFields`; this is the column order they were written with.
const LEGACY_FIELDS: PlayerField[] = ["id", "name", "teamId", "pos", "g", "gs", "min", "pts", "reb", "orb", "drb", "ast", "stl", "blk", "tov", "pf",
  "usg", "ortg", "drtg", "net", "porpag", "efg", "ts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "ws", "ws40", "orbPct", "ftr",
  "rimA", "rimM", "midA", "midM", "thrA", "thrM", "astd", "dunks"];
const etDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
const NAV: [string, string][] = [["outlook", "Outlook"], ["form", "Game by game"], ["schedule", "Schedule"], ["roster", "Roster"], ["lineups", "Lineups"], ["shots", "Shot profile"], ["profile", "Team stats"]];

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
  const fields = detail.rosterFields ?? LEGACY_FIELDS;
  const iId = fields.indexOf("id"), iName = fields.indexOf("name");
  const names: Record<string, string> = Object.fromEntries(detail.roster.map(r => [String(r[iId]), String(r[iName])]));
  const bios: Record<string, RosterBio> = Object.fromEntries(Object.entries(detail.bios ?? {}).map(([id, b]) => [id, { jersey: b.jersey, ht: b.ht, year: b.year, pos: b.pos }]));
  const [atsW, atsL, atsP] = team.ats ?? [0, 0, 0];
  const atsText = `${atsW}–${atsL}${atsP ? `–${atsP}` : ""}`;
  const shots = detail.shots ?? { off: [], def: [] };

  return (
    <article>
      {/* Hero */}
      <section className="deck team-accent team-hero relative mb-6 overflow-hidden p-5 sm:p-6" style={team.color ? ({ "--team": team.color } as React.CSSProperties) : undefined}>
        <div className="relative flex flex-wrap items-center gap-5">
          <TeamLogo src={team.logo} name={team.name} size={64} />
          <div className="order-last min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-1">
            <p className="text-sm text-mute">
              <Link className="link underline decoration-line2 underline-offset-4" href={`/conferences/${team.confSlug}/`}>{team.confName}</Link>
              {team.mascot ? <> · {team.mascot}</> : null}
            </p>
            <h1 className="text-[2rem] font-bold leading-tight tracking-[-0.02em] sm:text-[2.5rem]">{team.name}</h1>
            <p className="mt-1 text-[14px] text-mute tnum">
              <b className="text-ink"><LiveRecord team={team} /></b> overall · <Link className="link underline decoration-line2 underline-offset-4" href={`/conferences/${team.confSlug}/#standings-h`} title={`${team.confName} standings`}><LiveRecord team={team} conf /> conference</Link>
              {team.streak && <> · <span className={team.streak.startsWith("W") ? "text-win" : "text-loss"}>{team.streak}</span></>}
              {atsW + atsL + atsP > 0 && <> · <span title="Against the spread vs the pregame line ESPN showed (DraftKings): wins–losses–pushes">ATS <b className="text-ink">{atsText}</b></span></>}
              {" "}· projected <a className="link underline decoration-line2 underline-offset-4" href="#outlook"><b className="text-ink">{fmt(team.projW, 1)}–{fmt(team.projL, 1)}</b></a>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <FavoriteButton kind="teams" id={slug} name={team.name} />
              <CalendarButton slug={slug} name={team.name} />
              {team.ap && <span className="chip" title={`AP Top 25${team.ap.prev ? `, last week ${team.ap.prev}` : ""}${team.ap.pts ? `, ${team.ap.pts} points` : ""}`}>AP No. {team.ap.rank}</span>}
              {team.coaches && <span className="chip" title="USA Today Coaches Poll">Coaches No. {team.coaches.rank}</span>}
            </div>
          </div>
          <Link href={`/rankings/?conf=${team.confSlug}`} className="ml-auto rounded-lg text-right hover:opacity-80 sm:ml-0" title={`DHR rankings, ${team.confName} teams`}>
            <div className="label">DHR rank</div>
            <LiveRank team={team} />
          </Link>
        </div>
        <LiveTiles team={team} />
        {team.ratedGames < 5 && (
          <p className="relative mt-3 text-xs text-mute">Early-season rating from {fmt(team.ratedGames, 0)} rated D-I game{team.ratedGames === 1 ? "" : "s"} — it leans on the {team.confName} average and will move a lot.</p>
        )}
      </section>

      <nav aria-label="On this page" className="scroll-x -mt-2 mb-6 flex gap-1.5 pb-1">
        {NAV.map(([id, label]) => <a key={id} href={`#${id}`} className="chip">{label}</a>)}
      </nav>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {/* Next game */}
          {team.next && (
            <LiveNextGate nextId={team.next.id} slug={slug} opp={team.next.opp} day={etDay(team.next.date)}>
            <section className="deck flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                <div className="label">Next game · <Link className="link underline decoration-line2 underline-offset-4" href={`/games/?d=${etDay(team.next.date)}&g=${team.next.id}`}>{new Date(team.next.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" })}</Link></div>
                <div className="mt-1 flex items-center gap-2 text-lg font-semibold">
                  {team.next.venue === "A" ? "at" : "vs"}
                  {team.next.oppSlug ? <TeamLogo src={logos[team.next.oppSlug] ?? null} name={team.next.opp} size={24} /> : null}
                  {team.next.oppRank ? <span className="text-sm text-mute">#{team.next.oppRank}</span> : null}
                  {team.next.oppSlug ? <Link className="link" href={`/teams/${team.next.oppSlug}/`}>{team.next.opp}</Link> : team.next.opp}
                  {team.next.venue === "N" && <span className="text-xs text-mute">(neutral)</span>}
                </div>
                {team.next.tv?.length ? <div className="mt-2"><TvBadges tv={team.next.tv} max={4} size="md" /></div> : null}
              </div>
              {team.next.wp !== null && (
                <div className="text-right">
                  <div className="label">Win probability</div>
                  <div className="font-display text-3xl font-black tnum">{pctFmt(team.next.wp)}</div>
                </div>
              )}
              {team.next.oppSlug && (
                <Link className="btn" href={`/matchup/?a=${team.slug}&b=${team.next.oppSlug}&site=${team.next.venue === "H" ? "a" : team.next.venue === "A" ? "b" : "n"}`}>Open in matchup simulator</Link>
              )}
            </section>
            </LiveNextGate>
          )}

          {/* Season outlook */}
          <section id="outlook" className="deck scroll-mt-20 p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h-section">Season outlook</h2>
              <p className="text-xs text-mute">{(meta.sims?.sims ?? 10000).toLocaleString()} simulations of the rest of the schedule, rating uncertainty included</p>
            </div>
            <SeasonOutlook team={team} hist={detail.winHist ?? null} sims={meta.sims?.sims ?? 10000} />
          </section>

          {/* Game form */}
          <section id="form" className="deck scroll-mt-20 p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h-section">Game by game</h2>
              <p className="text-xs text-mute">Margin per 100 possessions, adjusted for opponent and venue</p>
            </div>
            <PerfChart games={played} />
          </section>

          {/* Schedule */}
          <section id="schedule" className="scroll-mt-20">
            <h2 className="h-section mb-3">Schedule &amp; results</h2>
            <GameLog games={detail.games} logos={logos} slug={slug} />
          </section>

          {/* Roster */}
          <section id="roster" className="scroll-mt-20">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h-section">Roster</h2>
              <p className="text-xs text-mute">DPR = points per 100 possessions vs an average D-I player, ± one standard error</p>
            </div>
            <Roster slug={slug} rows={detail.roster} fields={fields} onOff={detail.onOff ?? {}} bios={bios} />
          </section>

          {/* Lineups */}
          <section id="lineups" className="scroll-mt-20">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h-section">Best five-man units</h2>
              <p className="text-xs text-mute">From play-by-play, units with 2+ minutes together</p>
            </div>
            <Lineups lineups={detail.lineups ?? []} names={names} />
          </section>

          {/* Shot profile */}
          <section id="shots" className="deck scroll-mt-20 p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h-section">Shot profile</h2>
              <p className="text-xs text-mute">Tracked field-goal attempts, for and against</p>
            </div>
            <ShotProfile off={shots.off} def={shots.def} league={meta.shotZones} />
            <ZoneTable off={shots.off} def={shots.def} league={meta.shotZones} />
          </section>
        </div>

        <aside id="profile" className="scroll-mt-20 space-y-6">
          <section className="deck p-5" aria-labelledby="avail-h">
            <h2 id="avail-h" className="h-section mb-2">Availability</h2>
            <AvailabilityList items={detail.availability} />
          </section>
          <section className="deck p-5" aria-labelledby="news-h">
            <h2 id="news-h" className="h-section mb-1">Latest news</h2>
            <ArticleList items={detail.news} max={8} empty="No recent coverage found for this team." />
          </section>
          <section className="deck p-5">
            <h2 className="h-section mb-1 flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-off" aria-hidden />Offense</h2>
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
            <h2 className="h-section mb-1 flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-def" aria-hidden />Defense</h2>
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
                    <th scope="row" className="py-2 text-left font-normal text-mute" title="Unofficial DHR quadrant using NET-style cutoffs by venue">
                      <a className="link text-mute hover:text-ink" href={`#schedule-q${i + 1}`}>Quadrant {i + 1}</a>
                    </th>
                    <td className="py-2 text-right font-semibold"><a className="link" href={`#schedule-q${i + 1}`} title={`Show quadrant ${i + 1} games`}>{w}–{l}</a></td>
                  </tr>
                ))}
                <tr className="border-b border-line"><th scope="row" className="py-2 text-left font-normal text-mute">Games within 5 pts</th><td className="py-2 text-right font-semibold">{team.close[0]}–{team.close[1]}</td></tr>
                <tr className="border-b border-line"><th scope="row" className="py-2 text-left font-normal text-mute" title="Against the spread vs the pregame line ESPN showed (DraftKings)">Against the spread</th><td className="py-2 text-right font-semibold">{atsW + atsL + atsP ? atsText : "—"}</td></tr>
                <tr><th scope="row" className="py-2 text-left font-normal text-mute">Projected conference</th><td className="py-2 text-right font-semibold"><Link className="link" href={`/conferences/${team.confSlug}/#standings-h`}>{fmt(team.projCW, 1)}–{fmt(team.projCL, 1)}</Link></td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-dim">Quadrants use DHR ranks with NET-style cutoffs. They are not the NCAA&apos;s official quadrants.</p>
          </section>
          {similar.length > 0 && (
            <section className="deck p-5">
              <h2 className="h-section mb-3" title="Closest teams by adjusted offense, defense and tempo">Similar teams</h2>
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
