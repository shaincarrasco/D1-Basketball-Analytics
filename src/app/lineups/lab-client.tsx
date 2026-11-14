"use client";
// /lineups/: build any five (?p=id,id,...) or a team's best projected lineups (?team=slug).
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Link2, Plus, Search, X } from "lucide-react";
import TeamLogo from "@/components/team-logo";
import { ErrorState, Loading } from "@/components/states";
import { useJson } from "@/lib/client-data";
import { fmt, signed } from "@/lib/format";
import { htText, parsePicks, projectLineup, rotationOf, traits, useLab, type LabData, type LabPlayer } from "@/lib/lineup-lab";
import type { TeamDetail } from "@/lib/types";
import { BuildUp, DPR_TITLE, ObservedText, PlayerLink, Tags, Warnings } from "./parts";
import TeamMode from "./team-mode";
import Calibration from "./calibration";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function LabClient() {
  const params = useSearchParams();
  const lab = useLab();
  const teamSlug = params.get("team");
  const go = useCallback((q: string) => window.history.replaceState(null, "", q ? `?${q}` : window.location.pathname), []);

  if (lab.status === "error") return <ErrorState message={lab.error ?? "Could not load the lineup lab."} retry={lab.retry} />;
  if (!lab.data) return <Loading label="Loading players" />;
  const data = lab.data;
  const team = teamSlug && data.teams.has(teamSlug) ? teamSlug : null;
  const mode = teamSlug !== null ? "team" : "build";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Lineup lab mode">
        <button type="button" className="chip" aria-pressed={mode === "build"} onClick={() => go(params.get("p") ? `p=${params.get("p")}` : "")}>Build any five</button>
        <button type="button" className="chip" aria-pressed={mode === "team"} onClick={() => go(`team=${team ?? data.players[0]?.t ?? ""}`)}>Team lineups</button>
      </div>
      {mode === "build"
        ? <Builder data={data} picks={parsePicks(params.get("p"), data.byId)} setPicks={ids => go(ids.length ? `p=${ids.join(",")}` : "")} />
        : <TeamMode data={data} slug={team} setTeam={s => go(`team=${s}`)} />}
      <Calibration meta={data.meta} />
    </div>
  );
}

function Builder({ data, picks, setPicks }: { data: LabData; picks: string[]; setPicks: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState(false);
  const players = picks.map(id => data.byId.get(id)!).filter(Boolean);
  const full = players.length === 5;

  const matches = useMemo(() => {
    const s = fold(q.trim());
    if (s.length < 2) return [];
    return data.players
      .filter(p => !picks.includes(p.id) && (fold(p.n).includes(s) || fold(data.teams.get(p.t)?.name ?? "").includes(s) || fold(data.teams.get(p.t)?.short ?? "").includes(s)))
      .sort((a, b) => b.mpg - a.mpg)
      .slice(0, 8);
  }, [q, data, picks]);

  const teamOptions = useMemo(() => [...data.teams.values()].filter(t => data.players.some(p => p.t === t.slug)).sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const sameTeam = full && players.every(p => p.t === players[0].t) ? players[0].t : null;
  const proj = full ? projectLineup(players, data.meta.eff) : null;
  const tr = traits(players);

  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked: the URL bar has the link */ }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section aria-label="Your five" className="space-y-4">
        <div className="deck p-4 sm:p-5">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="h-section">Your five</h2>
            <span className="text-xs text-mute">{players.length} of 5</span>
          </div>
          <ol className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => {
              const p = players[i];
              if (!p) return <li key={`empty-${i}`} className="rounded-lg border border-dashed border-line px-3 py-3 text-sm text-dim">Empty spot: search below</li>;
              const t = data.teams.get(p.t);
              return (
                <li key={p.id} data-slot={p.id} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5">
                  <TeamLogo src={t?.logo ?? null} name={t?.name ?? p.t} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <PlayerLink p={p} />
                      <span className="text-xs text-mute">{t?.short} · {p.pos ?? "—"}{p.ht ? ` · ${htText(p.ht)}` : ""} · {fmt(p.mpg)} mpg</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span title={DPR_TITLE} className="tabular-nums text-mute">DPR <span className="text-off">O {signed(p.o, 1)}</span> · <span className="text-def">D {signed(p.d, 1)}</span></span>
                      <Tags p={p} />
                    </div>
                  </div>
                  <button type="button" className="rounded-full p-1.5 text-mute hover:text-ink" aria-label={`Remove ${p.n}`} onClick={() => setPicks(picks.filter(x => x !== p.id))}><X size={16} /></button>
                </li>
              );
            })}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            {players.length > 0 && <button type="button" className="btn" onClick={() => setPicks([])}>Clear</button>}
            {full && <button type="button" className="btn" onClick={copy}>{copied ? <Check size={16} /> : <Link2 size={16} />}{copied ? "Link copied" : "Copy share link"}</button>}
          </div>
        </div>

        <div className="deck p-4 sm:p-5">
          <label htmlFor="lab-search" className="mb-2 block text-sm font-semibold">Add a player <span className="font-normal text-mute">(any D-I player averaging {data.meta.minMpg}+ minutes)</span></label>
          <div className="relative">
            <Search aria-hidden size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
            <input id="lab-search" type="search" className="field w-full pl-9" placeholder={full ? "Lineup is full: remove someone first" : "Player or team name"} value={q} disabled={full} onChange={e => setQ(e.target.value)} autoComplete="off" />
          </div>
          {matches.length > 0 && (
            <ul className="mt-2 divide-y divide-line" aria-label="Search results">
              {matches.map(p => {
                const t = data.teams.get(p.t);
                return (
                  <li key={p.id}>
                    <button type="button" className="flex w-full items-center gap-3 px-1 py-2 text-left hover:bg-deck2" onClick={() => { setPicks([...picks, p.id]); setQ(""); }} aria-label={`Add ${p.n}, ${t?.name}`}>
                      <TeamLogo src={t?.logo ?? null} name={t?.name ?? p.t} size={22} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{p.n}</span>
                        <span className="block truncate text-xs text-mute">{t?.short} · {p.pos ?? "—"} · {fmt(p.mpg)} mpg · DPR {signed(p.o + p.d, 1)}</span>
                      </span>
                      <Plus aria-hidden size={16} className="text-mute" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {q.trim().length >= 2 && !matches.length && <p className="mt-2 text-sm text-mute">No player or team matches &ldquo;{q}&rdquo; among players averaging {data.meta.minMpg}+ minutes.</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="lab-team-start" className="text-mute">Or start from a team&apos;s top five by minutes:</label>
            <select id="lab-team-start" className="field py-1.5 text-sm" value="" onChange={e => { if (e.target.value) setPicks(rotationOf(data.players, e.target.value, 5).map(p => p.id)); }}>
              <option value="">Pick a team</option>
              {teamOptions.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section aria-label="Projection" className={`deck p-4 sm:p-5 ${full ? "order-first lg:order-none" : ""}`}>
        {proj ? (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-mute">Projected net per 100 possessions</p>
              <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-1">
                <span data-testid="lab-net" className={`font-display text-6xl font-black leading-none ${proj.net >= 0 ? "text-win" : "text-loss"}`}>{signed(proj.net, 1)}</span>
                <span className="pb-1 text-sm text-mute" title="Players' DPR errors combined; a rough size, not a guarantee">rough range ± {fmt(proj.se, 1)}</span>
              </div>
              <p className="mt-2 text-sm text-mute">
                vs an average D-I lineup, before opponent and venue. Projected to score <b className="text-ink">{fmt(proj.ptsFor, 1)}</b> and allow <b className="text-ink">{fmt(proj.ptsAgainst, 1)}</b> points per 100 possessions (D-I average {fmt(data.meta.eff, 1)}).
              </p>
              {Math.abs(proj.net) >= 30 && <p className="mt-2 text-xs text-dim">That is beyond what any real unit sustains over a season: five of the most extreme ratings in the country added up, early in the year when ratings are mostly box-score starting points. Read it as &ldquo;far better (or worse) than average&rdquo;, not as a literal margin.</p>}
            </div>
            {sameTeam && <ObservedFor slug={sameTeam} ids={picks} />}
            <div>
              <h3 className="mb-2 text-base font-bold">Balance check</h3>
              <Warnings list={proj.warnings} />
            </div>
            <div>
              <h3 className="mb-1 text-base font-bold">How we got this number</h3>
              <BuildUp proj={proj} />
              <p className="mt-2 text-xs text-dim">Fit adjustments are small rules of thumb, zero for a normal lineup. See &ldquo;How well does this match real lineups?&rdquo; below for how they hold up.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="h-section">Pick {5 - players.length} more</h2>
            <p className="text-sm text-mute">Search any player in the country. Mix teams if you like: the projection adds up each player&apos;s rating (DPR), then adjusts for spacing, ball handling, shot creation, rim protection and rebounding.</p>
            {players.length > 0 && (
              <ul className="space-y-1 text-sm text-mute">
                <li>Shooters so far: <b className="text-ink">{tr.shooters.length}</b></li>
                <li>Ball handlers so far: <b className="text-ink">{tr.handlers.length}</b></li>
                <li>Bigs so far: <b className="text-ink">{tr.bigs.length}</b></li>
              </ul>
            )}
            <p className="text-sm text-mute">Or see a team&apos;s best projected lineups: <button type="button" className="link font-semibold text-ink underline" onClick={() => window.history.replaceState(null, "", `?team=${players[0]?.t ?? data.players[0]?.t ?? ""}`)}>Team lineups</button>.</p>
          </div>
        )}
      </section>
    </div>
  );
}

/** Observed results for five teammates, from the team's play-by-play units. */
function ObservedFor({ slug, ids }: { slug: string; ids: string[] }) {
  const team = useJson<TeamDetail>(`team/${slug}.json`);
  const key = [...ids].sort().join(",");
  const unit = team.data?.lineups?.find(u => [...u.pids].sort().join(",") === key);
  return (
    <div className="rounded-lg border border-line px-3 py-2.5 text-sm" data-testid="lab-observed">
      <span className="font-semibold">Observed together (real): </span>
      {team.status === "loading" ? <span className="text-mute">checking play-by-play…</span>
        : unit ? <><ObservedText net={unit.net} poss={unit.poss} /><span className="text-mute">, {fmt(unit.min, 1)} minutes, not adjusted for opponent.</span></>
        : <span className="text-mute">no 2+ minute stretch together in the play-by-play we have.</span>}
    </div>
  );
}

export type { LabPlayer };
