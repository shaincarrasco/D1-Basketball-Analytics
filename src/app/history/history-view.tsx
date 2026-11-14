"use client";
// Season picker + one season's final table, champions and biggest movers.
// Season files are fetched on demand (each ~70 KB); the previous season is fetched too for "vs last year".
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import DataTable, { type Column } from "@/components/data-table";
import TeamLogo from "@/components/team-logo";
import { Dots } from "@/components/dots";
import { Empty, ErrorState, Loading } from "@/components/states";
import { fmt, heat, signed } from "@/lib/format";
import { finishLabel, historyUrl, movers, postDepth, postLabel, type HistoryConference, type HistorySeason, type HistoryTeam, type Mover, type SeasonInfo } from "@/lib/history";

/** CBBD team id → [current slug, logo]. */
export type TeamLinks = Record<string, [string, string | null]>;

const cache = new Map<number, Promise<HistorySeason>>();
function loadSeason(season: number) {
  if (!cache.has(season)) {
    const p = fetch(historyUrl(season)).then(r => {
      if (!r.ok) throw new Error(r.status === 404 ? "This season's file hasn't been published." : `Data request failed (HTTP ${r.status}).`);
      return r.json() as Promise<HistorySeason>;
    });
    p.catch(() => cache.delete(season));
    cache.set(season, p);
  }
  return cache.get(season)!;
}

type State = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; cur: HistorySeason; prev: HistorySeason | null };

function TeamName({ t, links, sub }: { t: HistoryTeam; links: TeamLinks; sub?: React.ReactNode }) {
  const link = links[String(t.id)];
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <TeamLogo src={link?.[1] ?? null} name={t.team} size={24} />
      <span className="min-w-0">
        {link ? <Link href={`/teams/${link[0]}/`} className="link block truncate font-semibold">{t.team}</Link> : <span className="block truncate font-semibold">{t.team}</span>}
        {sub && <span className="block truncate text-[11.5px] text-mute">{sub}</span>}
      </span>
    </span>
  );
}

export default function HistoryView({ seasons, links }: { seasons: SeasonInfo[]; links: TeamLinks }) {
  const [season, setSeason] = useState(seasons[0].season);
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [conf, setConf] = useState("all");

  // ?season=2024 is shareable.
  useEffect(() => {
    const want = Number(new URLSearchParams(window.location.search).get("season"));
    if (seasons.some(s => s.season === want)) setSeason(want);
  }, [seasons]);
  useEffect(() => {
    window.history.replaceState(null, "", season === seasons[0].season ? window.location.pathname : `?season=${season}`);
  }, [season, seasons]);

  const hasPrev = seasons.some(s => s.season === season - 1);
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    Promise.all([loadSeason(season), hasPrev ? loadSeason(season - 1).catch(() => null) : Promise.resolve(null)])
      .then(([cur, prev]) => alive && setState({ status: "ready", cur, prev }))
      .catch(err => alive && setState({ status: "error", error: err instanceof Error ? err.message : "Could not load this season." }));
    return () => { alive = false; };
  }, [season, hasPrev, attempt]);

  const label = seasons.find(s => s.season === season)?.label ?? String(season);
  const prevLabel = `${season - 2}–${String(season - 1).slice(2)}`;

  return (
    <div className="space-y-6">
      <div>
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Season">
          {seasons.map(s => <button key={s.season} className="chip tnum" aria-pressed={s.season === season} onClick={() => setSeason(s.season)}>{s.label}</button>)}
        </div>
        {seasons.length < 10 && <p className="mt-1.5 text-xs text-mute">{seasons.length} of the last 10 seasons downloaded so far; the rest appear after upcoming data refreshes.</p>}
      </div>

      {state.status === "loading" && <Loading label={`Loading ${label}`} />}
      {state.status === "error" && <ErrorState message={state.error} retry={() => setAttempt(a => a + 1)} />}
      {state.status === "ready" && (
        <SeasonBody key={season} data={state.cur} prev={state.prev} prevLabel={prevLabel} links={links} q={q} setQ={setQ} conf={conf} setConf={setConf} />
      )}
    </div>
  );
}

function SeasonBody({ data, prev, prevLabel, links, q, setQ, conf, setConf }: {
  data: HistorySeason; prev: HistorySeason | null; prevLabel: string; links: TeamLinks;
  q: string; setQ: (v: string) => void; conf: string; setConf: (v: string) => void;
}) {
  const total = data.teamCount;
  const byId = useMemo(() => new Map(data.teams.map(t => [t.id, t])), [data]);
  const prevRank = useMemo(() => (prev ? new Map(prev.teams.map(t => [t.id, t.rk])) : null), [prev]);
  const moves = useMemo(() => movers(data.teams, prev?.teams ?? null), [data, prev]);
  const confs = useMemo(() => [...new Set(data.teams.map(t => t.conf).filter((c): c is string => !!c))].sort(), [data]);
  const confOk = conf === "all" || confs.includes(conf);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return data.teams.filter(t => (!confOk || conf === "all" || t.conf === conf) && (!n || t.team.toLowerCase().includes(n)));
  }, [data, q, conf, confOk]);
  const champ = data.ncaaChampion !== null ? byId.get(data.ncaaChampion) ?? null : null;
  const runnerUp = data.teams.find(t => t.post?.ev === "NCAA" && t.post.res === "Runner-up") ?? null;
  const change = (t: HistoryTeam) => { const p = prevRank?.get(t.id); return p === undefined ? null : p - t.rk; };

  const rankCell = (v: number | null, rank: number | null) => (
    <span className="inline-block min-w-[3.4rem] rounded px-1.5 py-0.5" style={{ background: heat(rank, total) }}>{fmt(v)}<span className="sub-rank">{rank ?? ""}</span></span>
  );
  const columns: Column<HistoryTeam>[] = [
    { key: "rk", label: "Rk", title: "Final national rank by adjusted net rating (search and filters keep it)", value: t => t.rk, first: "asc", sticky: true, width: 52, render: t => <span className="rank-cell">{t.rk}</span> },
    { key: "team", label: "Team", align: "l", value: t => t.team, first: "asc", sticky: true, width: 200, render: t => <TeamName t={t} links={links} sub={<>{t.conf ?? "—"} · {t.w}–{t.l}</>} /> },
    { key: "net", label: "Net", title: "Final adjusted net rating: points per 100 possessions better than an average D-I team", value: t => t.net, render: t => <b className="text-[15px]">{signed(t.net)}</b> },
    { key: "o", label: "AdjO", title: "Final adjusted offense: points per 100 possessions (small number = national rank)", group: "off", value: t => t.o, render: t => rankCell(t.o, t.ork) },
    { key: "d", label: "AdjD", title: "Final adjusted defense: points allowed per 100 possessions, lower is better (small number = national rank)", group: "def", first: "asc", value: t => t.d, render: t => rankCell(t.d, t.drk) },
    { key: "rec", label: "W–L", csvLabel: "Win %", title: "Final record, postseason included", value: t => (t.w + t.l ? t.w / (t.w + t.l) : null), render: t => <span className="font-semibold">{t.w}–{t.l}</span> },
    { key: "crec", label: "Conf", csvLabel: "Conference win %", title: "Regular-season conference record and finish (conference tournament not included)", value: t => (t.cw + t.cl ? t.cw / (t.cw + t.cl) : null),
      render: t => <span>{t.cw}–{t.cl}<span className="sub-rank">{finishLabel(t.cf) ?? ""}</span></span> },
    { key: "post", label: "Postseason", csvLabel: "Postseason depth (higher = deeper run)", align: "l", title: "NCAA tournament seed and exit round, or other postseason event", value: t => postDepth(t.post) || null,
      render: t => t.post ? <span className={t.post.ev === "NCAA" ? "font-semibold" : "text-mute"}>{postLabel(t.post)}</span> : <span className="text-dim">—</span> },
    ...(prevRank ? [{ key: "chg", label: "vs prev", csvLabel: `Rank change vs ${prevLabel}`, title: `Places gained (+) or lost (−) in the national rank since ${prevLabel}`, value: change,
      render: (t: HistoryTeam) => { const c = change(t); return c === null ? <span className="text-dim" title={`Not rated in ${prevLabel}`}>new</span> : c === 0 ? <span className="text-dim">0</span> : <span className={c > 0 ? "text-win" : "text-loss"}>{c > 0 ? "▲" : "▼"}{Math.abs(c)}</span>; } } satisfies Column<HistoryTeam>] : []),
  ];

  return (
    <>
      {/* Season headline */}
      <section className="deck p-5" aria-labelledby="season-h">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="season-h" className="font-display text-[2.25rem] font-black leading-none tnum">{data.label}</h2>
            <p className="mt-1 text-[13px] text-mute">{total} Division I teams · {data.gamesCounted.toLocaleString()} completed games</p>
          </div>
          {champ ? (
            <div className="flex items-center gap-3">
              <TeamLogo src={links[String(champ.id)]?.[1] ?? null} name={champ.team} size={44} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-mute">National champion</p>
                {links[String(champ.id)] ? <Link href={`/teams/${links[String(champ.id)][0]}/`} className="link font-display text-[26px] font-extrabold leading-tight">{champ.team}</Link> : <span className="font-display text-[26px] font-extrabold leading-tight">{champ.team}</span>}
                <p className="text-[13px] text-mute tnum">{champ.w}–{champ.l}{champ.post?.seed ? `, ${champ.post.seed} seed` : ""}, No. {champ.rk} in adjusted net{runnerUp ? `. Beat ${runnerUp.team} in the final.` : ""}</p>
              </div>
            </div>
          ) : (
            <p className="max-w-sm text-[13px] text-mute">{data.season === 2020 ? "No national champion: the 2020 NCAA tournament was canceled." : "The national champion couldn't be worked out from the saved games."}</p>
          )}
        </div>
      </section>

      {/* Biggest movers */}
      <section aria-labelledby="movers-h">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="movers-h" className="h-section">Biggest risers &amp; fallers</h2>
          <p className="text-xs text-mute">Change in national rank by adjusted net, {prevLabel} to {data.label}{moves ? `, ${moves.compared} teams rated both years` : ""}</p>
        </div>
        {moves ? (
          <div className="grid gap-4 md:grid-cols-2">
            <MoverList title="Risers" list={moves.risers} links={links} />
            <MoverList title="Fallers" list={moves.fallers} links={links} />
          </div>
        ) : (
          <Empty title="Nothing to compare with">{prevLabel} isn&apos;t saved{data.season - 1 < 2017 ? " (it's older than the ten seasons kept here)" : " yet"}, so there are no rank changes for {data.label}.</Empty>
        )}
      </section>

      {/* Final table */}
      <section aria-labelledby="final-h">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="final-h" className="h-section mr-auto">Final rankings</h2>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <label className="relative flex-1 sm:w-56 sm:flex-none">
              <span className="sr-only">Find a team</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
              <input className="field w-full !pl-9" placeholder="Find a team" value={q} onChange={e => setQ(e.target.value)} />
            </label>
            <label>
              <span className="sr-only">Conference</span>
              <select className="field max-w-[11rem]" value={confOk ? conf : "all"} onChange={e => setConf(e.target.value)}>
                <option value="all">All conferences</option>
                {confs.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
        </div>
        <p className="mb-2 text-xs text-mute">Rank is the final national rank by adjusted net and stays put when you search or filter. Small numbers next to ratings are national ranks.</p>
        {rows.length ? (
          <DataTable rows={rows} rankRows={data.teams} columns={columns} rowKey={t => String(t.id)} initialSort="rk" initialDir="asc" pageSize={100}
            csvName={`d1hoops-${data.season}-final.csv`} caption={`${data.label} final rankings`} />
        ) : (
          <Empty title="No teams match">Try a different name or conference.</Empty>
        )}
      </section>

      {/* Conference champions */}
      <section aria-labelledby="champs-h">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="champs-h" className="h-section">Conference champions</h2>
          <p className="text-xs text-mute">Best regular-season conference record (ties listed together; official tiebreakers not applied) and tournament winner</p>
        </div>
        {/* Phone: one compact row per conference. */}
        <ul className="divide-y divide-line rounded-xl border border-line bg-deck sm:hidden">
          {data.conferences.map(c => (
            <li key={c.conf} className="px-3.5 py-3">
              <p className="text-[12px] font-bold text-mute">{c.conf}</p>
              <div className="mt-1.5 grid grid-cols-2 gap-3 text-[13px]">
                <div className="min-w-0">
                  <span className="block text-[11px] text-dim">Best record{c.bestRec ? `, ${c.bestRec}` : ""}</span>
                  <BestTeams c={c} byId={byId} links={links} />
                </div>
                <div className="min-w-0">
                  <span className="block text-[11px] text-dim">Tournament</span>
                  <Tourney c={c} byId={byId} links={links} />
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="scroll-x hidden rounded-xl border border-line sm:block">
          <table className="dt">
            <thead><tr><th scope="col" className="l">Conference</th><th scope="col" className="l">Best conference record</th><th scope="col" className="l">Tournament champion</th></tr></thead>
            <tbody>
              {data.conferences.map(c => (
                <tr key={c.conf}>
                  <td className="l whitespace-nowrap font-semibold">{c.conf}</td>
                  <td className="l">
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <BestTeams c={c} byId={byId} links={links} />
                      {c.bestRec && <span className="whitespace-nowrap text-mute tnum">{c.bestRec}</span>}
                    </span>
                  </td>
                  <td className="l"><Tourney c={c} byId={byId} links={links} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="space-y-1 text-xs text-mute">
        {data.notes.map(n => <p key={n}>{n}</p>)}
        <p>Source: College Basketball Data (final adjusted ratings and game results){data.fetchedAt ? `, downloaded ${new Date(data.fetchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}. Records, conference finishes and postseason rounds are counted from the game results.</p>
      </footer>
    </>
  );
}

function BestTeams({ c, byId, links }: { c: HistoryConference; byId: Map<number, HistoryTeam>; links: TeamLinks }) {
  const list = c.best.map(id => byId.get(id)).filter((t): t is HistoryTeam => !!t);
  if (!list.length) return <span className="text-dim">—</span>;
  return <span className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-4">{list.map(t => <TeamName key={t.id} t={t} links={links} />)}</span>;
}
function Tourney({ c, byId, links }: { c: HistoryConference; byId: Map<number, HistoryTeam>; links: TeamLinks }) {
  const t = c.tourney !== null ? byId.get(c.tourney) : undefined;
  return t ? <TeamName t={t} links={links} /> : <span className="text-dim" title="Tournament not finished, not held, or not identifiable in the saved games">Not available</span>;
}

function MoverList({ title, list, links }: { title: string; list: Mover[]; links: TeamLinks }) {
  const up = title === "Risers";
  return (
    <div className="deck p-4">
      <h3 className={`mb-2 text-sm font-bold ${up ? "text-win" : "text-loss"}`}>{title}</h3>
      {list.length ? (
        <ol className="divide-y divide-line">
          {list.map(m => (
            <li key={m.team.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1"><TeamName t={m.team} links={links} sub={<>No. {m.prev.rk} → No. {m.team.rk}{m.netChange !== null ? ` · net ${signed(m.netChange)}` : ""}</>} /></span>
              <Dots className="text-[20px]" title={`${up ? "Up" : "Down"} ${Math.abs(m.change)} places`}>{up ? "+" : "−"}{Math.abs(m.change)}</Dots>
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-mute">No team {up ? "climbed" : "dropped"}.</p>}
    </div>
  );
}
