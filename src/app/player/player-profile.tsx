"use client";
// Player profile: hero line, D-I percentiles, shot diet, teammates, team context.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import TeamLogo from "@/components/team-logo";
import { Empty, ErrorState, Loading } from "@/components/states";
import { useJson } from "@/lib/client-data";
import { dayLabel, fmt, heatPct, pctFmt, signed, timeLabel } from "@/lib/format";
import { playerRows } from "@/lib/players";
import type { PlayerTable, TeamDetail, TeamSummary } from "@/lib/types";
import { derive, makePool, MIN_ATT, POS_WORD, pctLabel, type PlayerRow } from "../players/player-stats";
import ShotDiet, { type ZoneAvg } from "./shot-diet";

const POOL_MIN = 10;
type PStat = { key: string; label: string; get: (r: PlayerRow) => number | null; digits?: number; unit?: string; invert?: boolean; ok?: (r: PlayerRow) => boolean; hint: string };
const OFF_STATS: PStat[] = [
  { key: "pts", label: "Points", get: r => r.pts, hint: "Points per game" },
  { key: "ast", label: "Assists", get: r => r.ast, hint: "Assists per game" },
  { key: "ts", label: "True shooting", get: r => r.ts, unit: "%", ok: r => (r.fga ?? 0) + (r.fta ?? 0) >= MIN_ATT.fg, hint: "Points per shooting possession, free throws included" },
  { key: "tpPct", label: "Three-point %", get: r => r.tpPct, unit: "%", ok: r => (r.tpa ?? 0) >= MIN_ATT.three, hint: `Needs ${MIN_ATT.three}+ attempts for a percentile` },
  { key: "usg", label: "Usage", get: r => r.usg, unit: "%", hint: "Share of team possessions he uses while on the floor" },
  { key: "ortg", label: "Offensive rating", get: r => r.ortg, hint: "Points produced per 100 possessions used" },
  { key: "tov", label: "Turnovers", get: r => r.tov, invert: true, hint: "Per game; fewer ranks higher" },
];
const DEF_STATS: PStat[] = [
  { key: "reb", label: "Rebounds", get: r => r.reb, hint: "Rebounds per game" },
  { key: "orbPct", label: "Offensive rebound %", get: r => r.orbPct, unit: "%", hint: "Share of available offensive boards grabbed" },
  { key: "stl", label: "Steals", get: r => r.stl, hint: "Steals per game" },
  { key: "blk", label: "Blocks", get: r => r.blk, hint: "Blocks per game" },
  { key: "drtg", label: "Defensive rating", get: r => r.drtg, invert: true, hint: "Points allowed per 100 possessions on the floor; lower ranks higher" },
];
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
  return <Profile p={player} all={all} detail={detail} />;
}

function Profile({ p, all, detail }: { p: PlayerRow; all: PlayerRow[]; detail: ReturnType<typeof useJson<TeamDetail>> }) {
  const t = p.team;
  const pool = useMemo(() => all.filter(r => (r.min ?? 0) >= POOL_MIN), [all]);
  const pct = useMemo(() => {
    const out = new Map<string, number | null>();
    for (const s of [...OFF_STATS, ...DEF_STATS]) {
      const vals: number[] = [];
      for (const r of pool) { const v = s.get(r); if (v !== null && (!s.ok || s.ok(r))) vals.push(v); }
      out.set(s.key, s.ok && !s.ok(p) ? null : makePool(vals).pct(s.get(p), s.invert));
    }
    return out;
  }, [pool, p]);
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
      <section className="deck relative overflow-hidden p-5 sm:p-8" aria-labelledby="player-name">
        <div className="court-arc" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-3">
            <TeamLogo src={t?.logo ?? null} name={t?.name ?? "?"} size={44} />
            <div className="min-w-0 text-sm leading-tight">
              {t ? <Link href={`/teams/${t.slug}/`} className="link block truncate text-base font-semibold">{t.name}{t.mascot ? ` ${t.mascot}` : ""}</Link> : <span className="block font-semibold">Unknown team</span>}
              <span className="text-mute">
                {t ? <Link href={`/conferences/${t.confSlug}/`} className="hover:text-ink">{t.confName}</Link> : null}
                {p.posN ? ` · ${POS_WORD[p.posN]}` : ""}
              </span>
            </div>
          </div>
          <h1 id="player-name" className="mt-4 font-display text-[3.2rem] font-black leading-[0.88] tracking-tight sm:text-[5.5rem] lg:text-[6.5rem]">{p.name}</h1>
          <p className="mt-3 text-mute tnum">
            {p.g ?? 0} {p.g === 1 ? "game" : "games"} · {p.gs ?? 0} {p.gs === 1 ? "start" : "starts"} · {fmt(p.min)} minutes per game
          </p>
          <div className="mt-5 grid max-w-xl grid-cols-3 gap-4 sm:gap-8">
            {([["PTS", p.pts, "text-off"], ["REB", p.reb, ""], ["AST", p.ast, ""]] as const).map(([l, v, c]) => (
              <div key={l}>
                <div className={`font-display text-[3.2rem] font-black leading-none tnum sm:text-[5rem] ${c}`}>{fmt(v)}</div>
                <div className="mt-1 text-sm font-semibold text-mute">{l === "PTS" ? "Points" : l === "REB" ? "Rebounds" : "Assists"}<span className="hidden sm:inline"> per game</span></div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm tnum">
            {shoot("FG", p.fgm, p.fga)}
            {shoot("3P", p.tpm, p.tpa)}
            {shoot("FT", p.ftm, p.fta)}
            <span><span className="text-dim">TS</span> <b>{p.ts === null ? "—" : `${fmt(p.ts)}%`}</b></span>
            <span><span className="text-dim">USG</span> <b>{p.usg === null ? "—" : `${fmt(p.usg)}%`}</b></span>
            <span><span className="text-dim">STL</span> <b>{fmt(p.stl)}</b></span>
            <span><span className="text-dim">BLK</span> <b>{fmt(p.blk)}</b></span>
            <span><span className="text-dim">TOV</span> <b>{fmt(p.tov)}</b></span>
          </div>
        </div>
      </section>

      {(p.g ?? 0) < 5 && (
        <p className="deck-flat px-4 py-3 text-sm text-mute">
          <b className="text-ink">Small sample.</b> {p.name} has played {p.g ?? 0} {p.g === 1 ? "game" : "games"}. One hot or cold night moves these numbers a lot; percentiles settle after about five games.
          {(p.min ?? 0) < POOL_MIN ? ` He also averages under ${POOL_MIN} minutes, so his percentiles compare a bench role against rotation players.` : ""}
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="deck p-5" aria-labelledby="pct-h">
          <h2 id="pct-h" className="h-section">D-I percentiles</h2>
          <p className="mt-1 text-sm text-mute">Where he ranks among the {pool.length.toLocaleString("en-US")} players averaging {POOL_MIN}+ minutes. 99th is the best in the country.</p>
          <div className="mt-3 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div>
              <h3 className="mt-2 text-sm font-semibold text-off">Offense</h3>
              {OFF_STATS.map(s => <PctBar key={s.key} s={s} p={p} pct={pct.get(s.key) ?? null} tone="off" />)}
            </div>
            <div>
              <h3 className="mt-2 text-sm font-semibold text-def">Defense &amp; glass</h3>
              {DEF_STATS.map(s => <PctBar key={s.key} s={s} p={p} pct={pct.get(s.key) ?? null} tone="def" />)}
            </div>
          </div>
        </section>
        <section className="deck p-5" aria-labelledby="shot-h">
          <h2 id="shot-h" className="h-section">Shot diet</h2>
          {p.shots ? <p className="mb-4 mt-1 text-sm text-mute">Where his {p.shots} tracked field-goal attempts come from, and how often they go in.</p> : <div className="mt-2" />}
          <ShotDiet p={p} avg={zoneAvg} />
        </section>
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

function PctBar({ s, p, pct, tone }: { s: PStat; p: PlayerRow; pct: number | null; tone: "off" | "def" }) {
  const v = s.get(p);
  const small = s.ok ? !s.ok(p) : false;
  const color = tone === "off" ? "var(--off)" : "var(--def)";
  return (
    <div className="py-2" title={s.hint}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-mute">{s.label}</span>
        <span className="tnum">
          <b className="text-[15px]">{fmt(v, s.digits ?? 1)}{v !== null && s.unit ? s.unit : ""}</b>
          <span className="ml-2 inline-block min-w-[3.2rem] rounded px-1.5 text-right text-xs text-mute" style={{ background: heatPct(pct) }}>
            {pct !== null ? pctLabel(pct) : small ? "Few att." : "—"}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-line" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct !== null ? Math.round(pct * 100) : undefined} aria-label={`${s.label} percentile`}>
        {pct !== null && <div className="h-1 rounded-full" style={{ width: `${Math.max(2, pct * 100)}%`, background: color, boxShadow: pct > 0.85 ? `0 0 10px ${color}` : undefined }} />}
      </div>
    </div>
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
    <div className="scroll-x rounded-xl border border-line">
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
                  {me ? <span className="font-semibold text-off">{r.name}</span> : <Link href={`/player/?id=${r.id}`} className="link font-semibold">{r.name}</Link>}
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
