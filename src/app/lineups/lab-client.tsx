"use client";
// /lineups/: build any five (?p=id,id,...) or rank a team's lineups (?team=slug).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Plus, Search, Share, X } from "lucide-react";
import TeamLogo from "@sports/ui/team-logo";
import { ErrorState } from "@sports/ui/states";
import { useJson } from "@sports/ui/client-data";
import { fmt } from "@sports/ui/format";
import { htText, parsePicks, presets, projectLineup, rotationOf, traits, useLab, verdict, type LabData, type LabPlayer } from "@/lib/lineup-lab";
import type { TeamDetail } from "@/lib/types";
import { BuildUp, FitCheck, Hero, NavRow, ObservedText, Sheet, Slots, Toast, labStyles, traitTags, type SheetHandle } from "./parts";
import TeamMode from "./team-mode";
import HowItWorks from "./calibration";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const reduceMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export type Go = (q: string, push?: boolean) => void;

export default function LabClient() {
  const params = useSearchParams();
  const lab = useLab();
  const sheet = useRef<SheetHandle>(null);
  const teamSlug = params.get("team");
  const go = useCallback<Go>((q, push = false) => {
    const url = q ? `?${q}` : window.location.pathname;
    if (push) window.history.pushState(null, "", url); else window.history.replaceState(null, "", url);
  }, []);

  if (lab.status === "error") return <ErrorState message={lab.error ?? "Could not load the lineup lab."} retry={lab.retry} />;
  if (!lab.data) return <LabSkeleton />;
  const data = lab.data;
  const team = teamSlug && data.teams.has(teamSlug) ? teamSlug : null;
  const mode = teamSlug !== null ? "team" : "build";
  const picks = parsePicks(params.get("p"), data.byId);
  const defaultTeam = () => {
    const first = picks.length ? data.byId.get(picks[0])!.t : null;
    if (first) return first;
    return [...data.teams.values()].filter(t => t.rank != null).sort((a, b) => a.rank! - b.rank!)[0]?.slug ?? data.players[0]?.t ?? "";
  };

  return (
    <div className="space-y-5">
      <div className="seg max-w-[360px]" role="group" aria-label="Lineup lab mode">
        <button type="button" aria-pressed={mode === "build"} onClick={() => go(params.get("p") ? `p=${params.get("p")}` : "", true)}>Build a five</button>
        <button type="button" aria-pressed={mode === "team"} onClick={() => go(`team=${team ?? defaultTeam()}`, true)}>Team lineups</button>
      </div>
      {mode === "build"
        ? <Builder data={data} picks={picks} setPicks={ids => go(ids.length ? `p=${ids.join(",")}` : "")} onHow={() => sheet.current?.open()} />
        : <TeamMode data={data} slug={team} setTeam={s => go(`team=${s}`)} load={ids => { go(`p=${ids.join(",")}`, true); window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" }); }} onHow={() => sheet.current?.open()} />}
      <Sheet ref={sheet} title="How the lab works"><HowItWorks data={data} /></Sheet>
    </div>
  );
}

/** Same shape as the builder, so nothing jumps when the data arrives. */
export function LabSkeleton() {
  return (
    <div role="status" aria-label="Loading the lineup lab" className="animate-pulse space-y-5">
      <div className="h-[38px] max-w-[360px] rounded-xl bg-deck" />
      <div className="h-12 rounded-xl bg-deck" />
      <div className="grid grid-cols-5 gap-2">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-[104px] rounded-2xl bg-deck" />)}</div>
      <div className="h-48 rounded-[20px] bg-deck" />
    </div>
  );
}

function Builder({ data, picks, setPicks, onHow }: { data: LabData; picks: string[]; setPicks: (ids: string[]) => void; onHow: () => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [fresh, setFresh] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const scrollToHero = useRef(false);
  const players = picks.map(id => data.byId.get(id)!).filter(Boolean);
  const full = players.length === 5;
  const say = (text: string) => setToast({ text, id: Date.now() });

  const matches = useMemo(() => {
    const s = fold(q.trim());
    if (s.length < 2) return [];
    // Best match first: the team itself ("duke"), then a name that starts with it, then the rest.
    const score = (p: LabPlayer) => {
      const t = data.teams.get(p.t), team = fold(t?.name ?? ""), short = fold(t?.short ?? ""), name = fold(p.n);
      if (team === s || short === s) return 0;
      if (name.split(/[\s'-]+/).some(w => w.startsWith(s)) || name.startsWith(s)) return 1;
      if (team.startsWith(s) || short.startsWith(s)) return 2;
      return name.includes(s) || team.includes(s) || short.includes(s) ? 3 : -1;
    };
    return data.players
      .filter(p => !picks.includes(p.id))
      .map(p => ({ p, sc: score(p) }))
      .filter(x => x.sc >= 0)
      .sort((a, b) => a.sc - b.sc || b.p.mpg - a.p.mpg)
      .slice(0, 8)
      .map(x => x.p);
  }, [q, data, picks]);
  useEffect(() => setActive(0), [q]);

  // After the fifth pick, bring the result into view.
  useEffect(() => {
    if (full && scrollToHero.current) {
      scrollToHero.current = false;
      hero.current?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    }
  }, [full]);

  const add = (p: LabPlayer) => {
    if (picks.length >= 5 || picks.includes(p.id)) return;
    const next = [...picks, p.id];
    setPicks(next); setQ(""); setFresh(p.id);
    say(`Added ${p.n} (${next.length} of 5)`);
    if (next.length === 5) { input.current?.blur(); scrollToHero.current = true; }
    else input.current?.focus();
  };
  const remove = (p: LabPlayer) => { setPicks(picks.filter(x => x !== p.id)); say(`Removed ${p.n}`); };
  const load = (ids: string[], label: string) => { setPicks(ids); setFresh(null); say(label); scrollToHero.current = ids.length === 5; };

  const quick = useMemo(() => presets(data), [data]);
  const teamOptions = useMemo(() => [...data.teams.values()].filter(t => data.players.some(p => p.t === t.slug)).sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const sameTeam = full && players.every(p => p.t === players[0].t) ? players[0].t : null;
  const proj = full ? projectLineup(players, data.meta.eff, data.k) : null;
  const v = proj ? verdict(proj.net, data.meta.reference.starters) : null;
  const tr = traits(players);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: "My lineup, D1 Hoops lineup lab", url }); return; }
      await navigator.clipboard.writeText(url); say("Link copied");
    } catch { /* share sheet dismissed, or clipboard blocked: the address bar has the link */ }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && matches.length) { e.preventDefault(); setActive(i => (i + 1) % matches.length); }
    else if (e.key === "ArrowUp" && matches.length) { e.preventDefault(); setActive(i => (i - 1 + matches.length) % matches.length); }
    else if (e.key === "Enter" && matches[active]) { e.preventDefault(); add(matches[active]); }
    else if (e.key === "Escape") setQ("");
  };
  const open = matches.length > 0 || q.trim().length >= 2;

  return (
    <div className="lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[440px_minmax(0,1fr)] xl:gap-10">
      {/* On phones this column dissolves so the search can stay stuck for the whole page. */}
      <div className="contents lg:sticky lg:top-[76px] lg:block lg:space-y-4">
        <div className="sticky top-[calc(56px+env(safe-area-inset-top))] z-30 -mx-4 bg-night/90 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:m-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div className="relative">
            <label htmlFor="lab-search" className="sr-only">Add a player: search by player or team name</label>
            <Search aria-hidden size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-dim" />
            <input id="lab-search" ref={input} type="text" inputMode="search" enterKeyHint="done" autoComplete="off" autoCorrect="off" spellCheck={false}
              role="combobox" aria-expanded={open} aria-controls="lab-results" aria-autocomplete="list"
              aria-activedescendant={matches[active] ? `lab-opt-${matches[active].id}` : undefined}
              className="h-12 w-full rounded-xl border border-line2 bg-deck pl-11 pr-[72px] text-[16px] text-ink placeholder:text-dim focus:border-mute focus:outline-none disabled:opacity-70"
              placeholder={full ? "Full. Remove a player to swap." : "Add a player or team"} value={q} disabled={full}
              onChange={e => setQ(e.target.value)} onKeyDown={onKey} />
            {q ? (
              <button type="button" onClick={() => { setQ(""); input.current?.focus(); }} aria-label="Clear search" className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-mute hover:text-ink"><X size={18} aria-hidden /></button>
            ) : (
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] font-semibold tabular-nums text-mute" aria-hidden>{players.length}/5</span>
            )}
            {open && (
              <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-line bg-deck shadow-[0_16px_40px_-12px_rgb(0_0_0/0.45)]">
                {matches.length > 0 ? (
                  <ul id="lab-results" role="listbox" aria-label="Players" className="max-h-[min(56vh,440px)] overflow-y-auto overscroll-contain py-1">
                    {matches.map((p, i) => {
                      const t = data.teams.get(p.t);
                      const tags = traitTags(p).map(x => x.label).join(", ");
                      return (
                        <li key={p.id} id={`lab-opt-${p.id}`} role="option" aria-selected={i === active}
                          onMouseDown={e => e.preventDefault()} onClick={() => add(p)} onMouseEnter={() => setActive(i)}
                          className={`${labStyles.row} flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-2 ${i === active ? "bg-deck2" : ""}`}>
                          <TeamLogo src={t?.logo ?? null} name={t?.name ?? p.t} size={28} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[16px] font-semibold">{p.n}</span>
                            <span className="block truncate text-[13px] text-mute">{[t?.name, [p.pos, p.ht ? htText(p.ht) : null].filter(Boolean).join(" "), `${fmt(p.mpg)} min`, tags].filter(Boolean).join(", ")}</span>
                          </span>
                          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bulb/15 text-bulb-ink"><Plus size={18} strokeWidth={2.5} /></span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p id="lab-results" className="px-4 py-4 text-[15px] text-mute">No player or team matches &ldquo;{q.trim()}&rdquo;. The lab has every D-I player averaging {data.meta.minMpg}+ minutes.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 lg:mt-0">
          <div className="mb-2 flex min-h-[32px] items-center justify-between px-1">
            <h2 className="font-display text-[22px] font-extrabold">Your five</h2>
            {players.length > 0 && <button type="button" onClick={() => { setPicks([]); say("Cleared"); }} className="-mr-2 rounded-lg px-2 py-1.5 text-[15px] font-semibold text-bulb-ink hover:underline">Clear</button>}
          </div>
          <Slots data={data} players={players} fresh={fresh} onRemove={remove} onAdd={() => input.current?.focus()} />
        </div>

        <div className="mt-4 lg:mt-0">
          <p className="mb-2 px-1 text-[13px] font-semibold text-mute">Quick starts</p>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:px-0">
            {quick.map(pr => (
              <button key={pr.key} type="button" className="chip shrink-0 !py-2" title={pr.hint} onClick={() => load(pr.ids, pr.label)}>{pr.label}</button>
            ))}
            <span className="relative shrink-0">
              <label htmlFor="lab-team-start" className="sr-only">Start from a team&apos;s top five by minutes</label>
              <select id="lab-team-start" className="chip h-full appearance-none !py-2 pr-9" value=""
                onChange={e => { const t = data.teams.get(e.target.value); if (t) load(rotationOf(data.players, t.slug, 5).map(p => p.id), `${t.name}'s top five`); }}>
                <option value="">Start from a team</option>
                {teamOptions.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
              </select>
              <ChevronDown aria-hidden size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mute" />
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-6 lg:mt-0">
        <div ref={hero} className="scroll-mt-[136px] lg:scroll-mt-[80px]">
          {proj && v ? (
            <Hero data={data} proj={proj} v={v} onHow={onHow}
              observed={sameTeam ? <ObservedFor slug={sameTeam} ids={picks} /> : undefined}
              actions={<button type="button" onClick={share} className="-mr-1 -mt-1 flex h-10 items-center gap-1.5 rounded-full bg-deck2 px-3.5 text-[15px] font-semibold text-ink hover:brightness-110" aria-label="Share this lineup"><Share size={16} aria-hidden />Share</button>} />
          ) : (
            <section aria-label="Projection" className="rounded-[20px] bg-deck p-5 shadow-[var(--shadow)]" data-testid="lab-pending">
              <p className="font-display text-[28px] font-extrabold leading-tight">{players.length ? `Pick ${5 - players.length} more` : "Add five players"}</p>
              <p className="mt-1 text-[15px] leading-snug text-mute">
                {players.length ? "Keep adding, from any team." : "Search any D-I player or tap a quick start. Mix teams if you like."} We&apos;ll grade the lineup against every real starting five.
              </p>
              <div className="mt-4 flex gap-1.5" aria-hidden>
                {Array.from({ length: 5 }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < players.length ? "bg-bulb" : "bg-line"}`} />)}
              </div>
              {players.length > 0 && (
                <p className="mt-3 text-[14px] text-mute">So far: <span className="text-ink">{plural(tr.shooters.length, "shooter")}, {plural(tr.handlers.length, "ball handler")}, {plural(tr.bigs.length, "big")}</span></p>
              )}
            </section>
          )}
        </div>
        {proj && <FitCheck list={proj.warnings} />}
        {proj && <BuildUp data={data} players={players} proj={proj} />}
        <NavRow onClick={onHow}>How the lab works</NavRow>
      </div>
      <Toast msg={toast} />
    </div>
  );
}

/** Real results for five teammates, from the team's play-by-play units. */
function ObservedFor({ slug, ids }: { slug: string; ids: string[] }) {
  const team = useJson<TeamDetail>(`team/${slug}.json`);
  const key = [...ids].sort().join(",");
  const unit = team.data?.lineups?.find(u => [...u.pids].sort().join(",") === key);
  return (
    <p className="mt-3 min-h-[20px] text-[14px] text-mute" data-testid="lab-observed">
      <span className="font-semibold text-ink">Real, together: </span>
      {team.status === "loading" ? "checking play-by-play…"
        : unit ? <><ObservedText net={unit.net} poss={unit.poss} />, not opponent-adjusted</>
        : "no 2+ minute stretch together yet"}
    </p>
  );
}

export type { LabPlayer };
