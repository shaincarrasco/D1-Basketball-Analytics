import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/page-header";
import { fmt, signed } from "@/lib/format";
import { getConferences, getMeta, getTeams } from "@/lib/server-data";
import StandingsTable, { type StandingRow } from "./standings-table";

export const dynamicParams = false;

export function generateStaticParams() {
  return getConferences().map(c => ({ slug: c.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = getConferences().find(x => x.slug === slug);
  return c ? { title: `${c.name} standings`, description: `${c.name} standings, projected conference records and power ratings for every member team.` } : {};
}

const mean = (v: (number | null)[]) => { const xs = v.filter((x): x is number => x !== null); return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null; };

export default async function ConferencePage({ params }: Props) {
  const { slug } = await params;
  const confs = getConferences();
  const conf = confs.find(c => c.slug === slug);
  if (!conf) notFound();
  const meta = getMeta(), teams = getTeams();
  const members = teams.filter(t => t.confSlug === slug);

  // Standings: conference win % (unplayed counts as .500 so 0–0 sits between winners and losers), then projected conference wins.
  const wpct = (w: number, l: number) => (w + l ? w / (w + l) : 0.5);
  const ordered = [...members].sort((a, b) => wpct(b.cw, b.cl) - wpct(a.cw, a.cl) || b.projCW - a.projCW || (a.rank ?? 999) - (b.rank ?? 999));
  const rows: StandingRow[] = ordered.map((t, i) => ({ ...t, pos: i + 1 }));
  const confPlayed = members.some(t => t.cw + t.cl > 0);

  const nat = { em: mean(teams.map(t => t.adjEM)), o: mean(teams.map(t => t.adjO)), d: mean(teams.map(t => t.adjD)), t: mean(teams.map(t => t.adjT)) };
  const ranked = members.filter(t => t.rank !== null);
  const top50 = ranked.filter(t => t.rank! <= 50).length, top100 = ranked.filter(t => t.rank! <= 100).length;
  const ncPct = conf.ncW + conf.ncL ? conf.ncW / (conf.ncW + conf.ncL) : null;
  const best = conf.best ? teams.find(t => t.id === conf.best) ?? null : null;

  const stats: { label: string; value: string; sub: string; tone?: "off" | "def" }[] = [
    { label: "Avg AdjEM", value: signed(conf.avgEM), sub: `${signed(conf.avgEM !== null && nat.em !== null ? conf.avgEM - nat.em : null)} vs D-I average` },
    { label: "Avg AdjO", value: fmt(conf.avgO), sub: `${signed(conf.avgO !== null && nat.o !== null ? conf.avgO - nat.o : null)} vs D-I (${fmt(nat.o)})`, tone: "off" },
    { label: "Avg AdjD", value: fmt(conf.avgD), sub: `${signed(conf.avgD !== null && nat.d !== null ? conf.avgD - nat.d : null)} vs D-I (${fmt(nat.d)}) · lower is better`, tone: "def" },
    { label: "Avg tempo", value: fmt(conf.avgT), sub: `${signed(conf.avgT !== null && nat.t !== null ? conf.avgT - nat.t : null)} possessions vs D-I` },
    { label: "Non-conference", value: `${conf.ncW}–${conf.ncL}`, sub: ncPct === null ? "No games yet" : `${(ncPct * 100).toFixed(0)}% wins` },
    { label: "Top-50 / top-100", value: `${top50} / ${top100}`, sub: `of ${conf.size} teams in DHR` },
  ];

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-mute"><Link href="/conferences/" className="link">Conferences</Link> <span className="text-dim">/</span> {conf.name}</nav>
      <PageHeader title={conf.name}>
        Ranked {conf.rank} of {confs.length} · average AdjEM {signed(conf.avgEM)} · {conf.size} teams
        {best ? <> · top team <Link href={`/teams/${best.slug}/`} className="underline decoration-line2 underline-offset-2 hover:text-ink">{best.name}</Link></> : null}
      </PageHeader>

      <section aria-labelledby="stack-h" className="mb-8">
        <h2 id="stack-h" className="h-section mb-3">How the league stacks up</h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
          {stats.map(s => (
            <div key={s.label} className="bg-deck px-4 py-3">
              <dt className="label flex items-center gap-1.5">{s.tone && <i className={`inline-block h-2 w-2 rounded-full ${s.tone === "off" ? "bg-off" : "bg-def"}`} aria-hidden />}{s.label}</dt>
              <dd className="font-display text-[1.7rem] font-extrabold leading-tight tnum">{s.value}</dd>
              <dd className="text-[11.5px] text-mute">{s.sub}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="standings-h">
        <h2 id="standings-h" className="h-section mb-1">Standings</h2>
        <p className="mb-4 text-sm text-mute">
          {confPlayed ? "" : "No conference games have been played yet, so the order follows projected conference wins. "}
          Projected conference record = wins so far plus the summed win probability of every remaining league game. Title odds and expected conference wins come from 10,000 simulations of the rest of the season; shared titles count.
        </p>
        <StandingsTable rows={rows} total={meta.counts.ratedTeams} csvName={`d1hoops-${conf.slug}-standings.csv`} />
      </section>
    </>
  );
}
