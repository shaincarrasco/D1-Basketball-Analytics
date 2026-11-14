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
import { Dots } from "@/components/dots";
import { playerRows } from "@/lib/players";
import { teamNote } from "@/lib/notes";
import { onTeam, teamHex } from "@/lib/color";

// Older data files predate `rosterFields`; this is the column order they were written with.
const LEGACY_FIELDS: PlayerField[] = ["id", "name", "teamId", "pos", "g", "gs", "min", "pts", "reb", "orb", "drb", "ast", "stl", "blk", "tov", "pf",
  "usg", "ortg", "drtg", "net", "porpag", "efg", "ts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "ws", "ws40", "orbPct", "ftr",
  "rimA", "rimM", "midA", "midM", "thrA", "thrM", "astd", "dunks"];
const etDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
// Segmented tabs: each jumps to its part of the page (one long scroll, like a team card in Apple Sports).
const NAV: [string, string][] = [["overview", "Overview"], ["schedule", "Schedule"], ["roster", "Roster"], ["shots", "Shots"], ["profile", "Stats"]];

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
  const color = teamHex(team.color) ?? "#24375A", ink = onTeam(color);
  const nextGame = team.next ? detail.games.find(g => g.id === team.next!.id) ?? null : null;
  const roster = playerRows({ fields }, detail.roster).filter(p => (p.g ?? 0) > 0);
  const leader = (k: "pts" | "reb" | "ast") => [...roster].sort((a, b) => (b[k] ?? -1) - (a[k] ?? -1))[0];
  const leaders = (["pts", "reb", "ast"] as const).map(k => ({ k, p: leader(k) })).filter(x => x.p && x.p[x.k] != null);
  const note = teamNote(team, total);
  const shortName = (n: string) => { const parts = n.split(" "); return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : n; };

  return (
    <article>
      {/* Hero: full-bleed team colour, rank on a scoreboard plate */}
      <section className="team-accent relative -mx-4 -mt-6 mb-0 overflow-hidden px-4 pb-6 pt-6 sm:-mx-6 sm:px-6 lg:mx-0 lg:mt-0 lg:rounded-[22px] lg:px-8 lg:pt-8"
        style={{ background: color, color: ink, "--team": team.color ?? undefined } as React.CSSProperties}>
        <svg className="pointer-events-none absolute -right-20 top-6 h-[300px] w-[300px] opacity-[0.13]" viewBox="0 0 300 300" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
          <circle cx="150" cy="150" r="60" /><circle cx="150" cy="150" r="140" /><path d="M150 0v300" />
        </svg>
        <div className="relative flex items-center justify-between gap-3 text-[15px] font-semibold">
          <Link href={`/conferences/${team.confSlug}/`} className="opacity-85 hover:opacity-100" style={{ color: ink }}>{team.confName}</Link>
          <div className="flex items-center gap-2">
            {team.ap && <span className="rounded-full px-2.5 py-1 text-[13px]" style={{ background: "rgb(0 0 0 / 0.22)" }} title={`AP Top 25${team.ap.prev ? `, last week ${team.ap.prev}` : ""}`}>AP {team.ap.rank}</span>}
            {team.coaches && <span className="hidden rounded-full px-2.5 py-1 text-[13px] sm:inline" style={{ background: "rgb(0 0 0 / 0.22)" }} title="USA Today Coaches Poll">Coaches {team.coaches.rank}</span>}
          </div>
        </div>
        <div className="relative mt-5 flex items-end gap-4">
          <Link href={`/rankings/?conf=${team.confSlug}`} title={`D1 Hoops rank. See ${team.confName} teams`} className="plate flex shrink-0 flex-col items-center px-3.5 pb-1.5 pt-2.5">
            <LiveRank team={team} />
            <span className="text-[11px] font-semibold text-dim">of {total}</span>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="hidden shrink-0 sm:block"><TeamLogo src={team.logo} name={team.name} size={44} /></span>
              <h1 className="truncate font-display text-[3.25rem] font-black leading-[0.9] sm:text-[4rem]">{team.name}</h1>
            </div>
            <p className="mt-1.5 text-[15px] font-semibold opacity-90">{team.mascot ? `${team.mascot}, ` : ""}<LiveRecord team={team} /> (<LiveRecord team={team} conf /> {team.confName})</p>
            <p className="text-[14px] opacity-75 tnum">
              {team.streak && Number(team.streak.slice(1)) >= 2 && <>{team.streak.startsWith("W") ? "Won" : "Lost"} {team.streak.slice(1)} straight. </>}Projected <a href="#outlook" className="underline decoration-current/40 underline-offset-4">{fmt(team.projW, 0)}-{fmt(team.projL, 0)}</a>
              {atsW + atsL + atsP > 0 && <span title="Against the spread vs the pregame line ESPN showed (DraftKings): wins–losses–pushes">, ATS {atsText}</span>}
            </p>
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap gap-2 [&_.btn]:border-transparent [&_.btn]:bg-black/20 [&_.btn]:text-current">
          <FavoriteButton kind="teams" id={slug} name={team.name} />
          <CalendarButton slug={slug} name={team.name} />
        </div>
      </section>

      <nav aria-label="On this page" className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mx-4 mb-5 flex gap-6 overflow-x-auto border-b border-line bg-night/95 px-4 backdrop-blur no-scrollbar sm:-mx-6 sm:px-6 lg:mx-0 lg:px-1">
        {NAV.map(([id, label], i) => (
          <a key={id} href={`#${id}`} className={`whitespace-nowrap border-b-[3px] py-3 text-[15px] font-semibold ${i === 0 ? "border-bulb text-ink" : "border-transparent text-mute hover:text-ink"}`}>{label}</a>
        ))}
      </nav>

      <div id="overview" className="scroll-mt-32">
        <LiveTiles team={team} total={total} />
        {team.ratedGames < 5 && (
          <p className="mt-2 text-xs text-mute">Early-season rating from {fmt(team.ratedGames, 0)} rated D-I game{team.ratedGames === 1 ? "" : "s"}. It leans on the {team.confName} average and will move a lot.</p>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {/* Next game */}
          {team.next && (
            <LiveNextGate nextId={team.next.id} slug={slug} opp={team.next.opp} day={etDay(team.next.date)}>
            <section className="rounded-[22px] border border-line bg-deck p-[18px]">
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <Link className="font-semibold text-mute hover:text-ink" href={`/games/?d=${etDay(team.next.date)}&g=${team.next.id}`}>Next game, {new Date(team.next.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" })}</Link>
                {team.next.tv?.length ? <TvBadges tv={team.next.tv} max={2} /> : null}
              </div>
              <div className="mt-3 flex items-center gap-3">
                {team.next.oppSlug ? <TeamLogo src={logos[team.next.oppSlug] ?? null} name={team.next.opp} size={46} /> : null}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-[23px] font-extrabold leading-tight">
                    {team.next.venue === "A" ? "at " : "vs "}{team.next.oppSlug ? <Link className="link" href={`/teams/${team.next.oppSlug}/`}>{team.next.opp}</Link> : team.next.opp}
                  </div>
                  <div className="text-[13px] text-mute">{[team.next.oppRank ? `No. ${team.next.oppRank} in the ratings` : null, team.next.venue === "N" ? "neutral site" : null].filter(Boolean).join(", ") || "Unrated opponent"}</div>
                </div>
                {nextGame?.projPts != null && nextGame.projOppPts != null && (
                  <div className="flex flex-col items-end">
                    <Dots className="text-[24px]">{Math.round(nextGame.projPts)}-{Math.round(nextGame.projOppPts)}</Dots>
                    <span className="mt-0.5 text-[11px] text-mute">projected</span>
                  </div>
                )}
              </div>
              {team.next.wp !== null && (
                <div className="mt-3.5">
                  <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                    <div style={{ width: `${team.next.wp * 100}%`, background: `color-mix(in oklab, ${color} 78%, white)` }} />
                    <div className="flex-1 bg-line2" />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[13px] font-bold tnum"><span>{team.short ?? team.name} {pctFmt(team.next.wp)}</span><span className="text-mute">{pctFmt(1 - team.next.wp)}</span></div>
                </div>
              )}
              {team.next.oppSlug && (
                <Link className="mt-3 inline-block text-sm font-semibold text-bulb-ink" href={`/matchup/?a=${team.slug}&b=${team.next.oppSlug}&site=${team.next.venue === "H" ? "a" : team.next.venue === "A" ? "b" : "n"}`}>Open in the matchup simulator</Link>
              )}
            </section>
            </LiveNextGate>
          )}

          {/* Season outlook */}
          <section id="outlook" className="deck scroll-mt-32 p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h-section">Season outlook</h2>
              <p className="text-xs text-mute">{(meta.sims?.sims ?? 10000).toLocaleString()} simulations of the rest of the schedule, rating uncertainty included</p>
            </div>
            <SeasonOutlook team={team} hist={detail.winHist ?? null} sims={meta.sims?.sims ?? 10000} />
          </section>

          {/* Leaders + note */}
          {leaders.length > 0 && (
            <section aria-labelledby="leaders-h">
              <h2 id="leaders-h" className="h-section mb-2.5">Team leaders</h2>
              <div className="grid grid-cols-3 gap-2.5">
                {leaders.map(({ k, p }) => (
                  <Link key={k} href={`/player/?id=${p.id}`} className="flex flex-col gap-1 rounded-[18px] bg-deck p-3.5 hover:bg-deck2">
                    <span className="text-xs font-semibold text-mute">{k === "pts" ? "Points" : k === "reb" ? "Rebounds" : "Assists"}</span>
                    <span className="font-display text-[32px] font-black leading-none tnum">{fmt(p[k])}</span>
                    <span className="truncate text-[13px] font-semibold">{shortName(p.name)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {note && <p className="note text-[15px] leading-[1.45]">{note}</p>}

          {/* Game form */}
          <section id="form" className="deck scroll-mt-32 p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h-section">Game by game</h2>
              <p className="text-xs text-mute">Margin per 100 possessions, adjusted for opponent and venue</p>
            </div>
            <PerfChart games={played} />
          </section>

          {/* Schedule */}
          <section id="schedule" className="scroll-mt-32">
            <h2 className="h-section mb-3">Schedule &amp; results</h2>
            <GameLog games={detail.games} logos={logos} slug={slug} />
          </section>

          {/* Roster */}
          <section id="roster" className="scroll-mt-32">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h-section">Roster</h2>
              <p className="text-xs text-mute">DPR = points per 100 possessions vs an average D-I player, ± one standard error</p>
            </div>
            <Roster slug={slug} rows={detail.roster} fields={fields} onOff={detail.onOff ?? {}} bios={bios} />
          </section>

          {/* Lineups */}
          <section id="lineups" className="scroll-mt-32">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h-section">Best five-man units</h2>
              <p className="text-xs text-mute">From play-by-play, units with 2+ minutes together</p>
            </div>
            <Lineups lineups={detail.lineups ?? []} names={names} />
          </section>

          {/* Shot profile */}
          <section id="shots" className="deck scroll-mt-32 p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h-section">Shot profile</h2>
              <p className="text-xs text-mute">Tracked field-goal attempts, for and against</p>
            </div>
            <ShotProfile off={shots.off} def={shots.def} league={meta.shotZones} />
            <ZoneTable off={shots.off} def={shots.def} league={meta.shotZones} />
          </section>
        </div>

        <aside id="profile" className="scroll-mt-32 space-y-6">
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
