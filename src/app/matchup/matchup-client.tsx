"use client";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import PerfBars from "@/components/perf-bars";
import TeamLogo from "@/components/team-logo";
import WinProb from "@/components/win-prob";
import { ErrorState, Loading } from "@/components/states";
import { useJson } from "@/lib/client-data";
import { dayLabel, fmt, heat, ordinal, pctFmt, signed, timeLabel } from "@/lib/format";
import { project } from "@/lib/predict";
import { playerRows } from "@/lib/players";
import type { Meta, Player, PlayerTable, ProfileKey, TeamSummary } from "@/lib/types";
import TeamCombobox from "./team-combobox";
import MarginChart from "./margin-chart";

type Site = "a" | "n" | "b";
const Z80 = 1.2816;
const A_COLOR = "var(--def)", B_COLOR = "var(--off)";

export default function MatchupClient() {
  const params = useSearchParams();
  const teams = useJson<TeamSummary[]>("teams.json");
  const meta = useJson<Meta>("meta.json");
  const players = useJson<PlayerTable>("players.json");

  const ranked = useMemo(() => [...(teams.data ?? [])].sort((x, y) => (x.rank ?? 999) - (y.rank ?? 999) || x.name.localeCompare(y.name)), [teams.data]);
  const bySlug = useMemo(() => new Map(ranked.map(t => [t.slug, t])), [ranked]);

  const a = bySlug.get(params.get("a") ?? "") ?? ranked[0] ?? null;
  let b = bySlug.get(params.get("b") ?? "") ?? null;
  if (!b || b.slug === a?.slug) b = ranked.find(t => t.slug !== a?.slug) ?? null;
  const rawSite = params.get("site");
  const site: Site = rawSite === "a" || rawSite === "b" ? rawSite : "n";

  const setState = useCallback((next: { a?: string; b?: string; site?: Site }) => {
    const p = new URLSearchParams();
    p.set("a", next.a ?? a?.slug ?? "");
    p.set("b", next.b ?? b?.slug ?? "");
    p.set("site", next.site ?? site);
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, [a?.slug, b?.slug, site]);

  if (teams.status === "error") return <ErrorState message={teams.error} retry={teams.retry} />;
  if (meta.status === "error") return <ErrorState message={meta.error} retry={meta.retry} />;
  if (!teams.data || !meta.data || !a || !b) return <Loading label="Loading teams and ratings" />;

  const proj = project(meta.data, a, b, site === "a" ? "home" : site === "b" ? "away" : "neutral");
  const total = teams.data.length;

  return (
    <div className="space-y-6">
      <section aria-label="Pick a matchup" className="deck p-4 sm:p-5">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <TeamCombobox label="Team A" tone="a" teams={ranked} value={a} exclude={b.slug} onChange={t => setState({ a: t.slug })} />
          <button className="btn h-12 justify-self-center !px-3" onClick={() => setState({ a: b.slug, b: a.slug, site: site === "a" ? "b" : site === "b" ? "a" : "n" })} aria-label="Swap teams A and B">
            <ArrowLeftRight size={18} aria-hidden /><span className="sm:hidden">Swap</span>
          </button>
          <TeamCombobox label="Team B" tone="b" teams={ranked} value={b} exclude={a.slug} onChange={t => setState({ b: t.slug })} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Game site">
          <span className="label mr-1">Site</span>
          <button className="chip" aria-pressed={site === "a"} onClick={() => setState({ site: "a" })}>{a.name} home</button>
          <button className="chip" aria-pressed={site === "n"} onClick={() => setState({ site: "n" })}>Neutral</button>
          <button className="chip" aria-pressed={site === "b"} onClick={() => setState({ site: "b" })}>{b.name} home</button>
        </div>
      </section>

      <NextMeeting a={a} b={b} />

      {proj ? <Projection a={a} b={b} proj={proj} site={site} homeEdge={meta.data.model.homeEdgePointsPerGame} /> : (
        <div className="deck p-6 text-sm text-mute">One of these teams has no DHR rating yet, so there is nothing to project. Pick a team with at least one rated D-I game.</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <TaleOfTheTape a={a} b={b} total={total} />
      <section aria-labelledby="form-h">
        <h2 id="form-h" className="h-section mb-1">Recent form</h2>
        <p className="mb-4 text-sm text-mute">Bars are adjusted game performances: the efficiency margin in each game after accounting for opponent and venue. Above the line beats what an average D-I team would do in the same game.</p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
          <FormCard t={a} color={A_COLOR} />
          <FormCard t={b} color={B_COLOR} />
        </div>
      </section>
      </div>

      <KeyPlayers a={a} b={b} table={players.data} status={players.status} error={players.error} retry={players.retry} />

      <section aria-labelledby="ff-h">
        <h2 id="ff-h" className="h-section mb-1">Four factors matchup</h2>
        <p className="mb-4 text-sm text-mute">Each side&apos;s offense against the other&apos;s defense. Small number = national rank (1 is best for that side of the ball). The edge bar leans toward whichever unit ranks higher.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <FactorPanel off={a} def={b} offColor={A_COLOR} defColor={B_COLOR} total={total} />
          <FactorPanel off={b} def={a} offColor={B_COLOR} defColor={A_COLOR} total={total} />
        </div>
      </section>


      <p className="text-sm text-mute">
        Projections use each team&apos;s current DHR rating only — no injuries, lineups or rest. Early in the season ratings rest on a handful of games
        ({a.name}: {fmt(a.ratedGames, 1)}, {b.name}: {fmt(b.ratedGames, 1)} rated) and lean on conference priors, so expect them to move and treat the margin range as the honest answer.
        See the <Link href="/methodology/" className="underline hover:text-ink">methodology</Link> for how the model is built and how well it has predicted games so far.
      </p>
    </div>
  );
}

function Projection({ a, b, proj, site, homeEdge }: { a: TeamSummary; b: TeamSummary; proj: NonNullable<ReturnType<typeof project>>; site: Site; homeEdge: number }) {
  // project(): "home" fields are team A, "away" fields are team B; margin = A − B.
  const pA = proj.homeWinProb, aPts = proj.homePts, bPts = proj.awayPts, m = proj.margin;
  const spread = Math.round(Math.abs(m) * 2) / 2;
  const fav = m >= 0 ? a : b;
  const lo = m - Z80 * proj.sigma, hi = m + Z80 * proj.sigma;
  const side = (v: number) => (Math.round(v) === 0 ? "even" : v > 0 ? `${a.name} by ${Math.round(v)}` : `${b.name} by ${Math.round(-v)}`);
  const venue = site === "n" ? "Neutral court" : `At ${site === "a" ? a.name : b.name} (home edge ≈ ${fmt(homeEdge, 1)} pts)`;

  return (
    <section aria-labelledby="proj-h" className="deck relative overflow-hidden p-5 sm:p-7">
      <h2 id="proj-h" className="sr-only">Projection</h2>
      <div className="grid grid-cols-2 items-center gap-y-4 sm:grid-cols-[1fr_auto_1fr] sm:gap-x-6">
        <TeamId t={a} color={A_COLOR} align="l" />
        <div className="order-3 col-span-2 text-center sm:order-2 sm:col-span-1">
          <p className="label">Projected final · {venue}</p>
          <p className="mt-1 font-display text-[3.5rem] font-black leading-none tnum sm:text-[4.5rem]" aria-label={`Projected score: ${a.name} ${Math.round(aPts)}, ${b.name} ${Math.round(bPts)}`}>
            <span style={{ color: A_COLOR }}>{Math.round(aPts)}</span>
            <span className="mx-2 text-dim sm:mx-4">–</span>
            <span style={{ color: B_COLOR }}>{Math.round(bPts)}</span>
          </p>
        </div>
        <div className="order-2 sm:order-3"><TeamId t={b} color={B_COLOR} align="r" /></div>
      </div>

      <div className="mx-auto mt-6 max-w-2xl">
        <div className="mb-1.5 flex justify-between text-sm font-semibold">
          <span className="truncate" style={{ color: A_COLOR }}><Link href={`/teams/${a.slug}/`} className="hover:underline">{a.name}</Link> <span className="font-display text-2xl font-extrabold tnum">{pctFmt(pA)}</span></span>
          <span className="truncate text-right" style={{ color: B_COLOR }}><span className="font-display text-2xl font-extrabold tnum">{pctFmt(1 - pA)}</span> <Link href={`/teams/${b.slug}/`} className="hover:underline">{b.name}</Link></span>
        </div>
        <WinProb awayName={a.name} homeName={b.name} homeWP={1 - pA} compact />
        <p className="mt-1.5 text-center text-xs text-mute">Win probability</p>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-4">
        <Stat label="Spread" value={spread === 0 ? "Pick’em" : `${fav.name} −${spread % 1 === 0 ? spread.toFixed(0) : spread.toFixed(1)}`} />
        <Stat label="Projected total" value={fmt(aPts + bPts, 1)} />
        <Stat label="Possessions" value={fmt(proj.tempo, 1)} sub="per 40 minutes" />
        <Stat label="80% margin range" value={`${side(lo)} to ${side(hi)}`} small />
      </dl>

      <div className="mt-6">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">How the margin could land</h3>
          <span className="text-xs text-mute">Normal curve, σ = {fmt(proj.sigma, 1)} points · shaded by winner · bracket = middle 80%</span>
        </div>
        <MarginChart margin={m} sigma={proj.sigma} aShort={a.short} bShort={b.short} />
      </div>
    </section>
  );
}

function TeamId({ t, color, align }: { t: TeamSummary; color: string; align: "l" | "r" }) {
  return (
    <div className={`group relative flex min-w-0 items-center gap-3 ${align === "r" ? "flex-row-reverse text-right" : ""}`}>
      <TeamLogo src={t.logo} name={t.name} size={44} />
      <span className="min-w-0">
        <Link href={`/teams/${t.slug}/`} className="link flex min-w-0 items-center gap-2 text-lg font-semibold leading-tight tracking-[-0.01em] after:absolute after:inset-0 after:content-[''] sm:text-2xl" style={align === "r" ? { flexDirection: "row-reverse" } : undefined}>
          <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} aria-hidden />
          {t.rank ? <span className="text-base font-medium text-mute tnum">{t.rank}</span> : null}
          <span className="group-hover:underline">{t.name}</span>
        </Link>
        <span className="mt-1 block truncate text-xs text-mute">
          <Link href={`/conferences/${t.confSlug}/`} className="relative z-[1] hover:text-ink hover:underline">{t.confName}</Link> · {t.w}–{t.l}{t.mascot ? ` · ${t.mascot}` : ""}
        </span>
      </span>
    </div>
  );
}

function Stat({ label, value, sub, small }: { label: string; value: string; sub?: string; small?: boolean }) {
  return (
    <div className="bg-deck px-4 py-3">
      <dt className="label">{label}</dt>
      <dd className={`mt-0.5 font-semibold tnum ${small ? "text-[15px] leading-snug" : "font-display text-2xl font-extrabold"}`}>{value}</dd>
      {sub && <dd className="text-[11px] text-dim">{sub}</dd>}
    </div>
  );
}

function RankChip({ rank, total }: { rank: number | null | undefined; total: number }) {
  if (!rank) return null;
  return <span className="ml-1.5 inline-block min-w-[2.9rem] rounded px-1 text-center text-[11px] text-mute tnum" style={{ background: heat(rank, total) }}>{ordinal(rank)}</span>;
}

function TaleOfTheTape({ a, b, total }: { a: TeamSummary; b: TeamSummary; total: number }) {
  type Row = { label: string; hint: string; av: string; bv: string; ar?: number | null; br?: number | null; better?: "a" | "b" | null };
  const cmp = (x: number | null, y: number | null, higher = true): "a" | "b" | null => (x === null || y === null || x === y ? null : (x > y) === higher ? "a" : "b");
  const rows: Row[] = [
    { label: "AdjEM", hint: "Points per 100 possessions better than an average D-I team", av: signed(a.adjEM), bv: signed(b.adjEM), ar: a.rank, br: b.rank, better: cmp(a.adjEM, b.adjEM) },
    { label: "AdjO", hint: "Points scored per 100 possessions vs an average defense", av: fmt(a.adjO), bv: fmt(b.adjO), ar: a.adjORank, br: b.adjORank, better: cmp(a.adjO, b.adjO) },
    { label: "AdjD", hint: "Points allowed per 100 possessions vs an average offense (lower is better)", av: fmt(a.adjD), bv: fmt(b.adjD), ar: a.adjDRank, br: b.adjDRank, better: cmp(a.adjD, b.adjD, false) },
    { label: "Tempo", hint: "Adjusted possessions per 40 minutes — style, not quality", av: fmt(a.adjT), bv: fmt(b.adjT), ar: a.adjTRank, br: b.adjTRank, better: null },
    { label: "SOS", hint: "Average AdjEM of opponents played so far", av: signed(a.sos), bv: signed(b.sos), ar: a.sosRank, br: b.sosRank, better: cmp(a.sos, b.sos) },
    { label: "Record", hint: "Overall win–loss", av: `${a.w}–${a.l}`, bv: `${b.w}–${b.l}`, better: null },
    { label: "Conference", hint: "Conference win–loss", av: `${a.cw}–${a.cl}`, bv: `${b.cw}–${b.cl}`, better: null },
    { label: "Proj W–L", hint: "Current record plus expected wins in remaining games", av: `${fmt(a.projW)}–${fmt(a.projL)}`, bv: `${fmt(b.projW)}–${fmt(b.projL)}`, better: cmp(a.projW, b.projW) },
    { label: "Rated games", hint: "Weighted D-I games behind the rating; fewer = more prior, more uncertainty", av: fmt(a.ratedGames, 1), bv: fmt(b.ratedGames, 1), better: null },
  ];
  return (
    <section aria-labelledby="tape-h">
      <h2 id="tape-h" className="h-section mb-4">Tale of the tape</h2>
      <div className="deck overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line2 bg-deck px-4 py-3 text-sm font-semibold">
          <Link href={`/teams/${a.slug}/`} className="flex min-w-0 items-center justify-end gap-2 text-right hover:underline" style={{ color: A_COLOR }}><span className="truncate">{a.name}</span><TeamLogo src={a.logo} name={a.name} size={22} /></Link>
          <span className="w-24 text-center text-xs text-mute sm:w-32">vs</span>
          <Link href={`/teams/${b.slug}/`} className="flex min-w-0 items-center gap-2 hover:underline" style={{ color: B_COLOR }}><TeamLogo src={b.logo} name={b.name} size={22} /><span className="truncate">{b.name}</span></Link>
        </div>
        <table className="w-full text-sm">
          <caption className="sr-only">Tale of the tape: {a.name} vs {b.name}</caption>
          <thead className="sr-only"><tr><th scope="col">{a.name}</th><th scope="col">Metric</th><th scope="col">{b.name}</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-b border-line last:border-0">
                <td className={`w-[42%] px-4 py-2.5 text-right tnum ${r.better === "b" ? "text-mute" : ""}`}>
                  {r.better === "a" && <i className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: A_COLOR }} aria-label="Edge" />}
                  <b className={r.better === "a" ? "text-ink" : "font-semibold"}>{r.av}</b>
                  <RankChip rank={r.ar} total={total} />
                </td>
                <th scope="row" className="px-1 py-2.5 text-center text-xs font-semibold text-mute" title={r.hint}>{r.label}</th>
                <td className={`w-[42%] px-4 py-2.5 text-left tnum ${r.better === "a" ? "text-mute" : ""}`}>
                  <b className={r.better === "b" ? "text-ink" : "font-semibold"}>{r.bv}</b>
                  <RankChip rank={r.br} total={total} />
                  {r.better === "b" && <i className="ml-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: B_COLOR }} aria-label="Edge" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const FACTORS: { k: ProfileKey; label: string; hint: string }[] = [
  { k: "efg", label: "eFG%", hint: "Effective field-goal %: (FGM + 0.5 × 3PM) / FGA" },
  { k: "tov", label: "TO%", hint: "Turnovers per 100 possessions (offense wants low, defense wants high)" },
  { k: "orb", label: "OR%", hint: "Share of missed shots the offense rebounds" },
  { k: "ftr", label: "FTR", hint: "Free-throw attempts per field-goal attempt" },
  { k: "threeRate", label: "3PA rate", hint: "Share of field-goal attempts taken from three" },
  { k: "threePct", label: "3P%", hint: "Three-point percentage" },
];

function FactorPanel({ off, def, offColor, defColor, total }: { off: TeamSummary; def: TeamSummary; offColor: string; defColor: string; total: number }) {
  return (
    <div className="deck overflow-hidden">
      <h3 className="border-b border-line px-4 py-3 text-[15px] font-semibold">
        When <Link href={`/teams/${off.slug}/`} className="hover:underline" style={{ color: offColor }}>{off.name}</Link> has the ball
      </h3>
      <div className="scroll-x">
        <table className="w-full min-w-[340px] text-sm">
          <caption className="sr-only">{off.name} offense vs {def.name} defense</caption>
          <thead>
            <tr className="text-xs text-mute">
              <th scope="col" className="px-4 py-2 text-left font-semibold">Stat</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold"><Link href={`/teams/${off.slug}/`} className="hover:underline" style={{ color: offColor }}>{off.short}</Link> off</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold"><Link href={`/teams/${def.slug}/`} className="hover:underline" style={{ color: defColor }}>{def.short}</Link> def</th>
              <th scope="col" className="px-4 py-2 text-center font-semibold">Edge</th>
            </tr>
          </thead>
          <tbody>
            {FACTORS.map(f => {
              const ov = off.off?.[f.k] ?? null, dv = def.def?.[f.k] ?? null;
              const or = off.offRanks?.[f.k] ?? null, dr = def.defRanks?.[f.k] ?? null;
              const diff = or && dr ? dr - or : null; // > 0: offense ranks better
              return (
                <tr key={f.k} className="border-t border-line">
                  <th scope="row" className="px-4 py-2 text-left font-semibold" title={f.hint}>{f.label}</th>
                  <td className="px-2 py-2 text-right tnum">{fmt(ov)}<RankChip rank={or} total={total} /></td>
                  <td className="px-2 py-2 text-right tnum">{fmt(dv)}<RankChip rank={dr} total={total} /></td>
                  <td className="px-4 py-2"><Edge diff={diff} total={total} offColor={offColor} defColor={defColor} offName={off.short} defName={def.short} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Edge({ diff, total, offColor, defColor, offName, defName }: { diff: number | null; total: number; offColor: string; defColor: string; offName: string; defName: string }) {
  if (diff === null) return <span className="block text-center text-dim">—</span>;
  const even = Math.abs(diff) < total * 0.08;
  const len = Math.min(1, Math.abs(diff) / (total * 0.6)) * 50;
  const color = diff > 0 ? offColor : defColor;
  const who = even ? "Even" : diff > 0 ? offName : defName;
  return (
    <div className="flex items-center gap-2" title={even ? "Ranks are close" : `${who} ranks ${Math.abs(diff)} places higher`}>
      <div className="relative h-2 w-16 shrink-0 rounded-full bg-line" aria-hidden>
        <span className="absolute inset-y-0 left-1/2 w-px bg-line2" />
        <span className="absolute inset-y-0 rounded-full" style={{ background: even ? "var(--dim)" : color, width: `${Math.max(4, len)}%`, ...(diff > 0 ? { right: "50%" } : { left: "50%" }) }} />
      </div>
      <span className="w-10 text-xs font-semibold" style={{ color: even ? "var(--mute)" : color }}>{who}</span>
    </div>
  );
}

function FormCard({ t, color }: { t: TeamSummary; color: string }) {
  const last = t.last.slice(-8);
  return (
    <div className="deck p-4">
      <div className="flex items-center gap-3">
        <Link href={`/teams/${t.slug}/`} tabIndex={-1} aria-hidden className="shrink-0"><TeamLogo src={t.logo} name={t.name} size={32} /></Link>
        <div className="min-w-0 flex-1">
          <Link href={`/teams/${t.slug}/`} className="link block truncate font-semibold">{t.name}</Link>
          <p className="text-xs text-mute">{t.w}–{t.l} overall · {t.cw}–{t.cl} conf · streak {t.streak ?? "—"} · {t.sample.toLowerCase()}</p>
        </div>
      </div>
      <div className="mt-3"><PerfBars values={t.perf} width={240} height={44} /></div>
      {last.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Recent results, oldest first">
          {last.map((g, i) => (
            <li key={i} className={`rounded-md border border-line px-2 py-0.5 text-xs font-semibold tnum ${g.r === "W" ? "text-win" : "text-loss"}`}>
              {g.r} {g.m > 0 ? "+" : g.m < 0 ? "−" : ""}{Math.abs(g.m)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const etDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));

/** When the two teams are actually scheduled to meet next, link straight to that game. */
function NextMeeting({ a, b }: { a: TeamSummary; b: TeamSummary }) {
  const n = a.next?.oppSlug === b.slug ? a.next : b.next?.oppSlug === a.slug ? b.next : null;
  if (!n) return null;
  const day = etDay(n.date);
  return (
    <Link href={`/games/?d=${day}&g=${n.id}`} className="deck-flat flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors hover:border-line2">
      <span className="font-semibold">These teams meet next</span>
      <span className="text-mute">{dayLabel(day)} · {timeLabel(n.date)}</span>
      <span className="ml-auto font-semibold text-off">Open the game preview</span>
    </Link>
  );
}

type KP = Player & { dpr: number };
function KeyPlayers({ a, b, table, status, error, retry }: { a: TeamSummary; b: TeamSummary; table: PlayerTable | null; status: string; error: string | null; retry: () => void }) {
  const top = useMemo(() => {
    if (!table) return null;
    const iTeam = table.fields.indexOf("teamId");
    const pick = (t: TeamSummary) => playerRows(table, table.rows.filter(r => String(r[iTeam]) === t.id))
      .filter((p): p is KP => p.dpr !== null && (p.onPoss ?? 0) >= 100)
      .sort((x, y) => y.dpr - x.dpr).slice(0, 3);
    return { a: pick(a), b: pick(b) };
  }, [table, a, b]);
  return (
    <section aria-labelledby="kp-h">
      <h2 id="kp-h" className="h-section mb-1">Top players by DPR</h2>
      <p className="mb-4 text-sm text-mute">Points per 100 possessions better than an average D-I player when on the floor, from lineup play-by-play (minimum 100 possessions). The band is ± one standard error; early in the season it is wide.</p>
      {status === "error" ? <ErrorState message={error ?? "Could not load players."} retry={retry} />
        : !top ? <Loading label="Loading players" />
        : (
          <div className="grid gap-4 md:grid-cols-2">
            <KeyPlayerCard t={a} list={top.a} color={A_COLOR} />
            <KeyPlayerCard t={b} list={top.b} color={B_COLOR} />
          </div>
        )}
    </section>
  );
}

const DPR_LO = -8, DPR_HI = 16;
const dprX = (v: number) => `${((Math.max(DPR_LO, Math.min(DPR_HI, v)) - DPR_LO) / (DPR_HI - DPR_LO)) * 100}%`;

function KeyPlayerCard({ t, list, color }: { t: TeamSummary; list: KP[]; color: string }) {
  return (
    <div className="deck overflow-hidden">
      <h3 className="flex items-center gap-2 border-b border-line px-4 py-3 text-[15px] font-semibold">
        <i className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden />
        <Link href={`/teams/${t.slug}/`} className="link flex min-w-0 items-center gap-2"><TeamLogo src={t.logo} name={t.name} size={20} /><span className="truncate">{t.name}</span></Link>
      </h3>
      {list.length === 0 ? <p className="px-4 py-5 text-sm text-mute">No player has 100 tracked possessions yet.</p> : (
        <ol>
          {list.map((p, i) => {
            const se = p.dprSE ?? 0;
            return (
              <li key={p.id} className="group relative flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0 hover:bg-deck2 focus-within:bg-deck2">
                <span className="w-4 text-xs text-dim tnum">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <Link href={`/player/?id=${p.id}`} className="link block truncate font-semibold group-hover:text-off after:absolute after:inset-0 after:content-['']">{p.name}</Link>
                  <span className="block truncate text-xs text-mute">
                    {p.pos ? `${p.pos} · ` : ""}{fmt(p.pts)} pts · {fmt(p.min)} min · <span title="DPR offense / defense">O {signed(p.dprO)} / D {signed(p.dprD)}</span>
                    {p.dprRank ? <span title="DPR rank among players with 150+ possessions"> · #{p.dprRank}</span> : null}
                  </span>
                </span>
                <span className="relative hidden h-2 w-20 shrink-0 rounded-full bg-line xs:block" title={`${signed(p.dpr)} ± ${fmt(se)}`} aria-hidden>
                  <span className="absolute inset-y-0 w-px bg-line2" style={{ left: dprX(0) }} />
                  <span className="absolute inset-y-0 rounded-full opacity-40" style={{ background: color, left: dprX(p.dpr - se), width: `calc(${dprX(p.dpr + se)} - ${dprX(p.dpr - se)})` }} />
                  <span className="absolute -top-0.5 h-3 w-[3px] -translate-x-1/2 rounded-full" style={{ background: color, left: dprX(p.dpr) }} />
                </span>
                <span className="w-[4.6rem] text-right tnum">
                  <b className="font-display text-xl font-extrabold">{signed(p.dpr)}</b>
                  <span className="block text-[11px] leading-none text-dim">±{fmt(se)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
