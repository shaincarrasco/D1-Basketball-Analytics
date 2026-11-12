import Link from "next/link";
import TeamLogo from "@/components/team-logo";
import PerfBars from "@/components/perf-bars";
import { fmt, pctFmt, signed, heat, dayLabel } from "@/lib/format";
import { getAllGames, getConferences, getMeta, getPlayers, getTeams } from "@/lib/server-data";
import { playerRows } from "@/lib/players";
import Tonight from "./_home/tonight";

export default function Home() {
  const meta = getMeta(), teams = getTeams(), confs = getConferences();
  const total = meta.counts.ratedTeams;
  const top = teams.filter(t => t.rank).slice(0, 25);
  const games = getAllGames();
  const upsets = games.filter(g => g.upset !== null && g.home.id && g.away.id).sort((a, b) => a.upset! - b.upset!).slice(0, 5);
  const bt = meta.model.backtest.all;
  const byId = new Map(teams.map(t => [t.id, t]));
  const players = playerRows(getPlayers(), getPlayers().rows).filter(p => (p.min ?? 0) >= 20 && (p.g ?? 0) >= 2);
  const topPlayers = [...players].sort((a, b) => (b.porpag ?? -9) - (a.porpag ?? -9)).slice(0, 6);
  const leaders = [
    { title: "Best offense", key: "adjO" as const, list: [...teams].filter(t => t.adjO !== null).sort((a, b) => b.adjO! - a.adjO!).slice(0, 5), tone: "text-off" },
    { title: "Best defense", key: "adjD" as const, list: [...teams].filter(t => t.adjD !== null).sort((a, b) => a.adjD! - b.adjD!).slice(0, 5), tone: "text-def" },
    { title: "Fastest tempo", key: "adjT" as const, list: [...teams].filter(t => t.adjT !== null).sort((a, b) => b.adjT! - a.adjT!).slice(0, 5), tone: "text-ink" },
    { title: "Toughest schedule", key: "sos" as const, list: [...teams].filter(t => t.sos !== null).sort((a, b) => b.sos! - a.sos!).slice(0, 5), tone: "text-ink" },
  ];
  const maxConf = Math.max(...confs.map(c => Math.abs(c.avgEM ?? 0)));

  return (
    <div className="space-y-10">
      <Tonight />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Top 25 */}
        <section aria-labelledby="top25" className="min-w-0">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 id="top25" className="h-section">DHR top 25</h2>
            <Link href="/rankings/" className="text-sm font-semibold text-mute hover:text-ink">All {total} teams</Link>
          </div>
          <div className="scroll-x rounded-xl border border-line">
            <table className="dt">
              <caption className="sr-only">Top 25 teams by adjusted efficiency margin</caption>
              <thead>
                <tr><th>Rk</th><th className="l">Team</th><th>AdjEM</th><th className="grp-off">AdjO</th><th className="grp-def">AdjD</th><th className="l hidden md:table-cell">Form</th><th className="l">Next</th></tr>
              </thead>
              <tbody>
                {top.map(t => (
                  <tr key={t.id}>
                    <td><span className="rank-cell">{t.rank}</span></td>
                    <td className="l">
                      <Link href={`/teams/${t.slug}/`} className="link flex items-center gap-2.5">
                        <TeamLogo src={t.logo} name={t.name} size={22} />
                        <span className="font-semibold">{t.name}</span>
                        <span className="text-xs text-mute">{t.w}–{t.l}</span>
                      </Link>
                    </td>
                    <td><b>{signed(t.adjEM, 1)}</b></td>
                    <td><span className="rounded px-1.5 py-0.5" style={{ background: heat(t.adjORank, total) }}>{fmt(t.adjO)}</span></td>
                    <td><span className="rounded px-1.5 py-0.5" style={{ background: heat(t.adjDRank, total) }}>{fmt(t.adjD)}</span></td>
                    <td className="l hidden md:table-cell"><PerfBars values={t.perf} width={70} height={20} /></td>
                    <td className="l text-[13px] text-mute">
                      {t.next ? (
                        <span>
                          {t.next.venue === "A" ? "at " : "vs "}
                          {t.next.oppSlug ? <Link className="link" href={`/teams/${t.next.oppSlug}/`}>{t.next.opp}</Link> : t.next.opp}
                          {t.next.wp !== null && <b className="ml-1.5 text-ink">{pctFmt(t.next.wp)}</b>}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-8">
          {/* Model scorecard */}
          {bt && (
            <section aria-labelledby="model" className="deck relative overflow-hidden p-5">
              <h2 id="model" className="h-section">How the model is doing</h2>
              <p className="mt-1 text-xs text-mute">Every pick made before tip-off using only earlier games. D-I vs D-I.</p>
              <div className="mt-4 flex items-end gap-4">
                <div className="font-display text-7xl font-black leading-none text-win tnum">{(bt.accuracy * 100).toFixed(1)}<span className="text-4xl">%</span></div>
                <div className="pb-1 text-sm text-mute">
                  <div><b className="text-ink">{bt.correct}–{bt.games - bt.correct}</b> picking winners</div>
                  <div>±<b className="text-ink">{fmt(bt.marginMAE, 1)}</b> pts average miss</div>
                  <div>Brier <b className="text-ink">{bt.brier.toFixed(3)}</b></div>
                </div>
              </div>
              <Link href="/methodology/#backtest" className="mt-4 inline-block text-sm font-semibold text-off hover:underline">See calibration and method</Link>
            </section>
          )}

          {/* Upsets */}
          <section aria-labelledby="upsets">
            <h2 id="upsets" className="h-section mb-3">Biggest upsets</h2>
            {upsets.length ? (
              <ol className="space-y-2">
                {upsets.map(g => {
                  const homeWon = (g.home.score ?? 0) > (g.away.score ?? 0);
                  const w = homeWon ? g.home : g.away, l = homeWon ? g.away : g.home;
                  return (
                    <li key={g.id}>
                      <Link href={`/games/?d=${g.day}&g=${g.id}`} className="deck-flat flex items-center gap-3 px-3 py-2.5 hover:border-line2">
                        <span className="w-14 shrink-0 text-right font-display text-2xl font-black text-hot tnum">{pctFmt(g.upset)}</span>
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="block truncate"><b>{w.name}</b> {w.score}, {l.rank ? `#${l.rank} ` : ""}{l.name} {l.score}</span>
                          <span className="text-xs text-mute">{dayLabel(g.day)} · winner’s pregame chance</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            ) : <p className="text-sm text-mute">No upsets (winner under 35% pregame) yet this season.</p>}
          </section>
        </div>
      </div>

      {/* Leaders */}
      <section aria-labelledby="leaders">
        <h2 id="leaders" className="h-section mb-3">Category leaders</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {leaders.map(b => (
            <div key={b.title} className="deck p-4">
              <h3 className={`mb-2 font-semibold ${b.tone}`}>{b.title}</h3>
              <ol>
                {b.list.map((t, i) => (
                  <li key={t.id} className="flex items-center gap-2 border-b border-line py-1.5 text-sm last:border-0">
                    <span className="w-4 text-xs text-dim">{i + 1}</span>
                    <TeamLogo src={t.logo} name={t.name} size={18} />
                    <Link href={`/teams/${t.slug}/`} className="link flex-1 truncate">{t.name}</Link>
                    <b className="tnum">{b.key === "sos" ? signed(t[b.key], 1) : fmt(t[b.key])}</b>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Players */}
        <section aria-labelledby="players">
          <div className="mb-3 flex items-end justify-between">
            <h2 id="players" className="h-section">Most valuable so far</h2>
            <Link href="/players/?view=advanced" className="text-sm font-semibold text-mute hover:text-ink">All players</Link>
          </div>
          <p className="mb-3 text-xs text-mute">Points over replacement per adjusted game (PORPAG), 20+ minutes a night.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {topPlayers.map(p => {
              const t = byId.get(p.teamId);
              return (
                <li key={p.id}>
                  <Link href={`/player/?id=${p.id}`} className="deck-flat flex items-center gap-3 px-3 py-2.5 hover:border-line2">
                    <TeamLogo src={t?.logo ?? null} name={t?.name ?? ""} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="block truncate text-xs text-mute">{t?.name} · {fmt(p.pts)} pts · {fmt(p.reb)} reb · {fmt(p.ast)} ast</span>
                    </span>
                    <span className="font-display text-2xl font-black text-off tnum">{fmt(p.porpag, 1)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Conferences */}
        <section aria-labelledby="confs">
          <div className="mb-3 flex items-end justify-between">
            <h2 id="confs" className="h-section">Conference strength</h2>
            <Link href="/conferences/" className="text-sm font-semibold text-mute hover:text-ink">All conferences</Link>
          </div>
          <ol className="space-y-1">
            {confs.slice(0, 12).map(c => (
              <li key={c.slug}>
                <Link href={`/conferences/${c.slug}/`} className="group flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-deck2">
                  <span className="w-28 shrink-0 truncate text-sm font-semibold group-hover:text-off">{c.name}</span>
                  <span className="relative h-2 flex-1 rounded-full bg-line">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-line2" />
                    <span className="absolute inset-y-0 rounded-full" style={{
                      background: (c.avgEM ?? 0) >= 0 ? "var(--off)" : "var(--dim)",
                      left: (c.avgEM ?? 0) >= 0 ? "50%" : `${50 - (Math.abs(c.avgEM ?? 0) / maxConf) * 50}%`,
                      width: `${(Math.abs(c.avgEM ?? 0) / maxConf) * 50}%`,
                    }} />
                  </span>
                  <span className="w-12 text-right text-sm tnum">{signed(c.avgEM, 1)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
