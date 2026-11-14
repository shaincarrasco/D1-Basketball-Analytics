"use client";
// Player profile: hero line + DPR, shots, on/off, D-I percentiles, similar players, teammates, team context.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import FavoriteButton from "@/components/favorite-button";
import ShotChart from "@/components/shot-chart";
import TeamLogo from "@/components/team-logo";
import { Empty, ErrorState, Loading } from "@/components/states";
import { useJson } from "@/lib/client-data";
import { dayLabel, fmt, pctFmt, signed, timeLabel } from "@/lib/format";
import { playerRows } from "@/lib/players";
import type { Meta, PlayerBio, PlayerTable, TeamDetail, TeamSummary } from "@/lib/types";
import GameLog from "./game-log";
import ArticleList from "@/components/article-list";
import AvailabilityList from "@/components/availability-list";
import FrameworkRanks from "./framework-ranks";
import { derive, MIN_ATT, POS_WORD, recruitText, similarPlayers, type PlayerRow } from "../players/player-stats";
import { followRowLink, ROW_LINK_CLASS } from "../players/row-link";
import { DprCard, OnOff, Similar } from "./impact";
import ShotDiet, { type ZoneAvg } from "./shot-diet";
import Scouting from "./scouting";
import { onTeam, teamHex } from "@/lib/color";

const POOL_MIN = 10;
const ET = "America/New_York";
const etDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: ET }).format(new Date(iso));

export default function PlayerProfile() {
  const id = useSearchParams().get("id");
  const players = useJson<PlayerTable>("players.json");
  const teams = useJson<TeamSummary[]>("teams.json");

  const all = useMemo<PlayerRow[]>(() => {
    if (!players.data || !teams.data) return [];
    const byId = new Map(teams.data.map(t => [t.id, t]));
    return playerRows(players.data, players.data.rows).map(p => derive(p, byId.get(p.teamId) ?? null));
  }, [players.data, teams.data]);
  const player = useMemo(() => (id ? all.find(p => p.id === id) ?? null : null), [all, id]);
  const detail = useJson<TeamDetail>(player?.team ? `team/${player.team.slug}.json` : null);

  useEffect(() => { if (player) document.title = `${player.name} · D1 Hoops`; }, [player]);

  if (!id) {
    return (
      <Empty title="No player picked">
        This page needs a player id in the address, like <code className="text-ink">/player/?id=225626</code>. Find someone on the <Link href="/players/" className="link underline">player leaderboards</Link> or with search (press /).
      </Empty>
    );
  }
  if (players.status === "error" || teams.status === "error") return <ErrorState message={players.error ?? teams.error ?? "Could not load players."} retry={() => { players.retry(); teams.retry(); }} />;
  if (!players.data || !teams.data) return <Loading label="Loading player" />;
  if (!player) {
    return (
      <Empty title={`No player with id ${id}`}>
        The id may be from an old link, or the player hasn&apos;t logged minutes this season. Browse the <Link href="/players/" className="link underline">player leaderboards</Link> or search by name (press /).
      </Empty>
    );
  }
  return <Profile p={player} all={all} detail={detail} teams={teams.data} />;
}

const YEAR: Record<string, string> = { FR: "Freshman", SO: "Sophomore", JR: "Junior", SR: "Senior", GR: "Graduate", RS: "Redshirt" };

// Jersey tile in the team's colour, with a retro collar stripe (no player photos).
function Jersey({ bio, color }: { bio: PlayerBio | null; color: string | null }) {
  const bg = teamHex(color) ?? "#24375A", ink = onTeam(bg);
  return (
    <span aria-label={bio?.jersey ? `Jersey number ${bio.jersey}` : undefined} className="relative grid h-[104px] w-[88px] shrink-0 place-items-center overflow-hidden rounded-[18px] sm:h-[120px] sm:w-[100px]" style={{ background: bg, color: ink }}>
      <i className="absolute inset-x-0 top-3 h-1.5 opacity-90" style={{ background: ink }} aria-hidden />
      <span className="pt-3 font-display text-[60px] font-black leading-none tnum sm:text-[68px]">{bio?.jersey ?? "—"}</span>
    </span>
  );
}

function Profile({ p, all, detail, teams }: { p: PlayerRow; all: PlayerRow[]; detail: ReturnType<typeof useJson<TeamDetail>>; teams: TeamSummary[] }) {
  const bio = detail.data?.bios?.[p.id] ?? null;
  const t = p.team;
  const pool = useMemo(() => all.filter(r => (r.min ?? 0) >= POOL_MIN), [all]);
  const ranked = useMemo(() => all.reduce((n, r) => (r.dprRank ? n + 1 : n), 0), [all]);
  const similar = useMemo(() => similarPlayers(p, all), [p, all]);
  const zoneAvg = useMemo<ZoneAvg>(() => {
    const sum = (k: "rimA" | "rimM" | "midA" | "midM" | "thrA" | "thrM") => pool.reduce((a, r) => a + (r[k] ?? 0), 0);
    const r = (m: number, a: number) => (a ? (m / a) * 100 : null);
    return { rim: r(sum("rimM"), sum("rimA")), mid: r(sum("midM"), sum("midA")), thr: r(sum("thrM"), sum("thrA")) };
  }, [pool]);

  const shoot = (label: string, m: number | null, a: number | null) => (
    <span><span className="text-dim">{label}</span> <b className="text-ink">{m ?? "—"}–{a ?? "—"}</b>{a ? <span className="text-mute"> ({fmt(((m ?? 0) / a) * 100, 0)}%)</span> : null}</span>
  );

  return (
    <div className="space-y-5">
      <section className="relative" aria-labelledby="player-name">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              {t ? (
                <Link href={`/teams/${t.slug}/`} className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-bulb-ink">
                  <TeamLogo src={t.logo} name={t.name} size={24} /><span className="truncate">{t.name}</span>
                </Link>
              ) : <span className="font-semibold">Unknown team</span>}
              <FavoriteButton kind="players" id={p.id} name={p.name} />
            </div>
            <div className="mt-4 flex items-center gap-4">
              <Jersey bio={bio} color={t?.color ?? null} />
              <div className="min-w-0">
                <h1 id="player-name" className="font-display text-[2.4rem] font-black leading-[0.95] [text-wrap:balance] sm:text-[3rem]">{p.name}</h1>
                <p className="mt-1.5 text-[15px] font-semibold">{[p.posN ? POS_WORD[p.posN] : bio?.pos, t?.name].filter(Boolean).join(", ")}</p>
                {bio && <p className="text-sm text-mute">{[bio.ht, bio.wt ? `${bio.wt} lbs` : null, bio.year ? (YEAR[bio.year] ?? bio.year).toLowerCase() : null].filter(Boolean).join(", ")}</p>}
                {(bio?.home || recruitText(p)) && (
                  <p className="text-sm text-mute" title="High-school recruiting ranking (College Basketball Data)">
                    {[bio?.home, p.stars ? `${p.stars}-star` : null, p.recRank && p.recYear ? `No. ${p.recRank} in ${p.recYear}` : null].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
            </div>
            <dl className="mt-5 flex overflow-hidden rounded-2xl bg-deck" aria-label="Per-game averages">
              {([["MIN", p.min, 1], ["PTS", p.pts, 1], ["REB", p.reb, 1], ["AST", p.ast, 1], ["BLK", p.blk, 1], ["TS%", p.ts, 1]] as const).map(([l, v, d], i) => (
                <div key={l} className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 ${i ? "border-l border-line" : ""}`}>
                  <dt className="text-[11px] font-bold tracking-[0.04em] text-mute">{l}</dt>
                  <dd className="font-display text-[22px] font-extrabold leading-none tnum">{fmt(v, d)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm tnum">
              {shoot("FG", p.fgm, p.fga)}
              {shoot("3P", p.tpm, p.tpa)}
              {shoot("FT", p.ftm, p.fta)}
              <span><span className="text-dim">STL</span> <b>{fmt(p.stl)}</b></span>
              <span><span className="text-dim">TOV</span> <b>{fmt(p.tov)}</b></span>
              <span><span className="text-dim">USG</span> <b>{p.usg === null ? "—" : `${fmt(p.usg)}%`}</b></span>
              <span className="text-mute">{p.g ?? 0} {p.g === 1 ? "game" : "games"}, {p.gs ?? 0} {p.gs === 1 ? "start" : "starts"}</span>
            </div>
          </div>
          <DprCard p={p} ranked={ranked} />
        </div>
      </section>

      {(p.g ?? 0) < 5 && (
        <p className="deck-flat px-4 py-3 text-sm text-mute">
          <b className="text-ink">Small sample.</b> {p.name} has played {p.g ?? 0} {p.g === 1 ? "game" : "games"}. One hot or cold night moves these numbers a lot; percentiles settle after about five games.
          {(p.min ?? 0) < POOL_MIN ? ` He also averages under ${POOL_MIN} minutes, so his percentiles compare a bench role against rotation players.` : ""}
        </p>
      )}

      <Scouting p={p} pool={pool} />

      <FrameworkRanks p={p} all={all} />

      {(() => {
        const avail = detail.data?.availability?.find(a => a.pid === p.id);
        const news = detail.data?.playerNews?.[p.id];
        if (!avail && !news?.length) return null;
        return (
          <div className="grid gap-5 lg:grid-cols-2">
            {avail && (
              <section className="deck p-5" aria-labelledby="avail-h">
                <h2 id="avail-h" className="h-section mb-1">Availability</h2>
                <AvailabilityList items={[avail]} />
              </section>
            )}
            {news?.length ? (
              <section className={`deck p-5 ${avail ? "" : "lg:col-span-2"}`} aria-labelledby="pnews-h">
                <h2 id="pnews-h" className="h-section mb-1">In the news</h2>
                <ArticleList items={news} max={5} />
              </section>
            ) : null}
          </div>
        );
      })()}

      <section className="deck min-w-0 p-5" aria-labelledby="log-h">
        <h2 id="log-h" className="h-section mb-3">Game log</h2>
        {detail.status === "error" ? <p className="text-sm text-mute">The game log didn&apos;t load. <button className="underline" onClick={detail.retry}>Try again</button></p>
          : detail.data ? <GameLog playerId={p.id} detail={detail.data} teams={teams} /> : <p className="text-sm text-mute">Loading games…</p>}
      </section>

      <Shots p={p} detail={detail.data} loading={detail.status === "loading"} zoneAvg={zoneAvg} />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <OnOff p={p} detail={detail.data} />
        <Similar p={p} list={similar} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="deck min-w-0 p-5" aria-labelledby="mates-h">
          <h2 id="mates-h" className="h-section">{t ? `${t.name} roster` : "Teammates"}</h2>
          <p className="mb-3 mt-1 text-sm text-mute">Everyone who has played for {t?.short ?? "the team"} this season, by minutes.</p>
          <Teammates p={p} all={all} detail={detail} />
        </section>
        {t && <TeamContext t={t} detail={detail.data} />}
      </div>
    </div>
  );
}

function Shots({ p, detail, loading, zoneAvg }: { p: PlayerRow; detail: TeamDetail | null; loading: boolean; zoneAvg: ZoneAvg }) {
  const meta = useJson<Meta>("meta.json");
  const [mode, setMode] = useState<"dots" | "zones">("dots");
  const shots = detail?.shots?.byPid?.[p.id] ?? [];
  const league = meta.data?.shotZones ?? null;
  return (
    <section className="deck p-5" aria-labelledby="shot-h">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="shot-h" className="h-section">Shots</h2>
          <p className="mt-1 text-sm text-mute">
            {shots.length ? `Every tracked field-goal attempt (${shots.length}), and where his shots come from.` : p.shots ? `Where his ${p.shots} tracked field-goal attempts come from, and how often they go in.` : "Shot locations appear once he attempts a field goal in a tracked game."}
          </p>
        </div>
        {shots.length > 0 && (
          <div className="flex gap-1.5" role="group" aria-label="Shot chart view">
            <button className="chip" aria-pressed={mode === "dots"} onClick={() => setMode("dots")}>Every shot</button>
            <button className="chip" aria-pressed={mode === "zones"} onClick={() => setMode("zones")} disabled={!league} title={league ? "FG% by zone vs the D-I average" : "Loading D-I zone averages"}>Zones</button>
          </div>
        )}
      </div>
      {!shots.length && !p.shots ? (
        <p className="mt-3 rounded-lg bg-deck2 p-6 text-sm text-mute">{loading ? "Loading shot locations…" : "No shot locations for him yet."}</p>
      ) : (
      <div className="mt-4 grid items-center gap-6 md:grid-cols-2">
        <div className="mx-auto w-full max-w-[560px]">
          {shots.length ? <ShotChart shots={shots} mode={mode === "zones" && league ? "zones" : "dots"} league={league} title={`${p.name} shot chart: ${shots.filter(s => s[2]).length} of ${shots.length} field goals`} />
            : <p className="rounded-lg bg-deck2 p-6 text-sm text-mute">{loading ? "Loading shot locations…" : "No shot locations for him yet."}</p>}
        </div>
        <ShotDiet p={p} avg={zoneAvg} />
      </div>
      )}
    </section>
  );
}

function Teammates({ p, all, detail }: { p: PlayerRow; all: PlayerRow[]; detail: ReturnType<typeof useJson<TeamDetail>> }) {
  const roster = useMemo(() => {
    const byId = new Map(all.map(r => [r.id, r]));
    if (detail.data) {
      // Roster rows lead with the player id; reuse the derived row from the main table.
      return detail.data.roster.map(row => byId.get(String(row[0]))).filter((r): r is PlayerRow => !!r);
    }
    return all.filter(r => r.teamId === p.teamId);
  }, [detail.data, all, p]);
  const rows = [...roster].sort((a, b) => (b.min ?? 0) * (b.g ?? 0) - (a.min ?? 0) * (a.g ?? 0));
  const hi = "color-mix(in srgb, var(--off) 14%, var(--bg))";
  return (
    <div className={`scroll-x rounded-xl border border-line ${ROW_LINK_CLASS}`} onClick={followRowLink}>
      <table className="dt">
        <caption className="sr-only">Roster stats</caption>
        <thead>
          <tr>
            <th scope="col" className="l sticky-col" style={{ minWidth: 168 }}>Player</th>
            <th scope="col">G</th><th scope="col">MPG</th><th scope="col">PTS</th><th scope="col">REB</th><th scope="col">AST</th>
            <th scope="col" title="True shooting %">TS%</th><th scope="col" title="Usage %">USG%</th><th scope="col" title="Offensive rating">ORtg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const me = r.id === p.id;
            const st = me ? { background: hi } : undefined;
            const stSticky = { background: me ? hi : "var(--deck)" };
            return (
              <tr key={r.id} aria-current={me ? "true" : undefined}>
                <td className="l sticky-col" style={{ ...stSticky, minWidth: 168, boxShadow: me ? "inset 3px 0 0 var(--off)" : undefined }}>
                  {me ? <span className="font-semibold text-off">{r.name}</span> : <Link data-row-link href={`/player/?id=${r.id}`} className="link font-semibold">{r.name}</Link>}
                  {r.posN ? <span className="ml-1.5 text-xs text-dim">{r.posN}</span> : null}
                </td>
                <td style={st}>{r.g ?? "—"}</td>
                <td style={st}>{fmt(r.min)}</td>
                <td style={st}>{fmt(r.pts)}</td>
                <td style={st}>{fmt(r.reb)}</td>
                <td style={st}>{fmt(r.ast)}</td>
                <td style={st} className={(r.fga ?? 0) + (r.fta ?? 0) < MIN_ATT.fg ? "text-dim" : ""}>{fmt(r.ts)}</td>
                <td style={st}>{fmt(r.usg)}</td>
                <td style={st}>{fmt(r.ortg, 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TeamContext({ t, detail }: { t: TeamSummary; detail: TeamDetail | null }) {
  const recent = (detail?.games ?? []).filter(g => g.result !== null).slice(-5).reverse();
  const n = t.next;
  return (
    <section className="deck p-5" aria-labelledby="team-h">
      <h2 id="team-h" className="h-section">Team context</h2>
      <div className="mt-4 flex items-center gap-3">
        <TeamLogo src={t.logo} name={t.name} size={40} />
        <div className="min-w-0">
          <Link href={`/teams/${t.slug}/`} className="link block truncate font-semibold">{t.name}</Link>
          <span className="text-sm text-mute tnum">{t.w}–{t.l} · {t.cw}–{t.cl} {t.confName}</span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-y border-line py-4">
        <div>
          <div className="font-display text-4xl font-black leading-none tnum">{t.rank ? `#${t.rank}` : "—"}</div>
          <div className="label mt-1">DHR rank</div>
        </div>
        <div>
          <div className="font-display text-2xl font-extrabold leading-none text-off tnum">{t.adjORank ? `#${t.adjORank}` : "—"}</div>
          <div className="label mt-1">Offense</div>
        </div>
        <div>
          <div className="font-display text-2xl font-extrabold leading-none text-def tnum">{t.adjDRank ? `#${t.adjDRank}` : "—"}</div>
          <div className="label mt-1">Defense</div>
        </div>
      </div>
      <p className="mt-2 text-xs text-mute">Adjusted margin {signed(t.adjEM)} per 100 possessions · {t.sample}</p>

      <h3 className="mt-5 text-sm font-semibold">Next game</h3>
      {n ? (
        <Link href={`/games/?d=${etDay(n.date)}&g=${n.id}`} className="link mt-1.5 block rounded-lg border border-line p-3 hover:border-line2">
          <span className="block text-xs text-mute">{dayLabel(etDay(n.date))} · {timeLabel(n.date)}{n.venue === "N" ? " · Neutral site" : ""}</span>
          <span className="mt-0.5 block font-semibold">{n.venue === "A" ? "at" : "vs"} {n.oppRank ? <span className="text-mute">#{n.oppRank} </span> : null}{n.opp}</span>
          {n.wp !== null && <span className="mt-0.5 block text-sm text-mute tnum">{pctFmt(n.wp)} win probability</span>}
        </Link>
      ) : <p className="mt-1 text-sm text-mute">No upcoming game on the schedule.</p>}

      {recent.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold">Recent results</h3>
          <ul className="mt-1.5 space-y-1 text-sm tnum">
            {recent.map(g => (
              <li key={g.id} className="flex items-baseline gap-2">
                <b className={`w-4 ${g.result === "W" ? "text-win" : "text-loss"}`}>{g.result}</b>
                <span className="w-14 text-mute">{g.pts}–{g.oppPts}</span>
                <span className="min-w-0 truncate">
                  {g.venue === "A" ? "at " : "vs "}
                  {g.oppSlug ? <Link href={`/teams/${g.oppSlug}/`} className="link">{g.opp}</Link> : g.opp}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Link href={`/teams/${t.slug}/`} className="btn mt-5 w-full">Full {t.short} scouting report</Link>
    </section>
  );
}
