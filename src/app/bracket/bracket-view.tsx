"use client";
// Projected field: region brackets (desktop), seed list (phones by default) and the bubble.
import Link from "next/link";
import { useEffect, useState } from "react";
import TeamLogo from "@sports/ui/team-logo";
import { Dots } from "@/components/dots";
import { BUBBLE_GROUPS, pctLabel, type BracketFile, type BracketSlot, type BracketTeam } from "@/lib/bracket";

type Data = Omit<Extract<BracketFile, { ok: true }>, "index">;
type Tab = "auto" | "bracket" | "seeds" | "bubble";
const ON = "bg-deck2 text-ink shadow-[inset_0_0_0_1px_var(--line-2)]";
const ON_LG = "lg:bg-deck2 lg:text-ink lg:shadow-[inset_0_0_0_1px_var(--line-2)]";
const ON_SM = "max-lg:bg-deck2 max-lg:text-ink max-lg:shadow-[inset_0_0_0_1px_var(--line-2)]";
const teamHref = (slug: string) => `/teams/${slug}/`;
const rec = (w: number, l: number) => `${w}–${l}`;

export default function BracketView({ data }: { data: Data }) {
  const [tab, setTab] = useState<Tab>("auto");
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "bracket" || t === "seeds" || t === "bubble") setTab(t);
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const pick = (t: Exclude<Tab, "auto">) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  };
  const pressed = (t: Exclude<Tab, "auto">) => (tab === "auto" ? (t === "bracket" ? desktop : t === "seeds" ? !desktop : false) : tab === t);
  const cls = (t: Exclude<Tab, "auto">) => (tab === t ? ON : tab === "auto" ? (t === "bracket" ? ON_LG : t === "seeds" ? ON_SM : "") : "");

  return (
    <div>
      <div className="seg mb-5 max-w-md" role="group" aria-label="View">
        {(["bracket", "seeds", "bubble"] as const).map(t => (
          <button key={t} aria-pressed={pressed(t)} onClick={() => pick(t)} className={cls(t)}>
            {t === "bracket" ? "Bracket" : t === "seeds" ? "Seed list" : "Bubble"}
          </button>
        ))}
      </div>

      {(tab === "auto" || tab === "bracket") && (
        <div className={tab === "auto" ? "hidden lg:block" : ""}>
          <Regions data={data} />
          <OpeningRound data={data} />
        </div>
      )}
      {(tab === "auto" || tab === "seeds") && (
        <div className={tab === "auto" ? "lg:hidden" : ""}>
          <SeedList data={data} />
        </div>
      )}
      {tab === "bubble" && <Bubble data={data} />}
    </div>
  );
}

// ---------- shared bits ----------
function ColorBar({ color }: { color: string | null }) {
  return <i aria-hidden className="w-[3px] self-stretch rounded-full" style={{ background: color ? `#${color.replace(/^#/, "")}` : "var(--line-2)" }} />;
}
function AQ({ t }: { t: BracketTeam }) {
  if (t.bid !== "auto") return null;
  return <abbr title={`Automatic qualifier: projected ${t.confName} champion`} className="ml-1 shrink-0 text-[10.5px] font-semibold text-dim no-underline">AQ</abbr>;
}
function OrTag() {
  return <abbr title="Opening Round game: the winner takes this spot" className="shrink-0 rounded border border-line2 px-1 text-[10px] font-bold text-mute no-underline">OR</abbr>;
}

// ---------- desktop / bracket tab ----------
const ORDER_NOTE = (data: Data) => data.finalFour.map(([a, b]) => `${data.regions[a].name} vs. ${data.regions[b].name}`).join(" · ");

function Regions({ data }: { data: Data }) {
  const [region, setRegion] = useState(0);
  // Left column = the two regions that meet in one semifinal, right column = the other two.
  const order = [data.finalFour[0][0], data.finalFour[1][0], data.finalFour[0][1], data.finalFour[1][1]];
  return (
    <section aria-labelledby="regions-h">
      <h2 id="regions-h" className="sr-only">Regions</h2>
      <p className="mb-3 text-sm text-mute">Final Four pairings: {ORDER_NOTE(data)}. Seeds, matchups and records only; we don&apos;t pick winners here.</p>
      {/* Desktop: four region brackets */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-2">
        {order.map(i => <RegionTree key={i} name={data.regions[i].name} slots={data.regions[i].slots} teams={data.teams} />)}
      </div>
      {/* Phones: one region at a time */}
      <div className="lg:hidden">
        <div className="seg mb-3" role="group" aria-label="Region">
          {data.regions.map((r, i) => <button key={r.name} aria-pressed={region === i} onClick={() => setRegion(i)}>{r.name}</button>)}
        </div>
        <RegionList slots={data.regions[region].slots} teams={data.teams} />
      </div>
    </section>
  );
}

const BOX_H = 58, GAP = 10, COL = 26;
function RegionTree({ name, slots, teams }: { name: string; slots: BracketSlot[]; teams: Record<string, BracketTeam> }) {
  const pairs = Array.from({ length: 8 }, (_, i) => [slots[2 * i], slots[2 * i + 1]] as const);
  const height = 8 * BOX_H + 7 * GAP;
  const paths: string[] = [];
  let ys = pairs.map((_, i) => i * (BOX_H + GAP) + BOX_H / 2), x = 0;
  while (ys.length > 1) {
    const next: number[] = [];
    for (let i = 0; i < ys.length; i += 2) {
      const a = ys[i], b = ys[i + 1], m = (a + b) / 2, mid = x + COL / 2;
      paths.push(`M${x} ${a}H${mid}V${b}H${x}M${mid} ${m}H${x + COL}`);
      next.push(m);
    }
    ys = next; x += COL;
  }
  paths.push(`M${x} ${ys[0]}H${x + 14}`);
  const one = teams[slots[0].teams[0]];
  return (
    <article className="deck p-4" aria-label={`${name} region`}>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[1.6rem] font-black leading-none">{name}</h3>
        {one && <span className="text-[12.5px] text-mute">1 seed: <b className="text-ink">{one.name}</b></span>}
      </header>
      <div className="flex items-start">
        <ol className="min-w-0 flex-1" style={{ display: "grid", gap: GAP }}>
          {pairs.map(([a, b], i) => (
            <li key={i} className="overflow-hidden rounded-[10px] border border-line bg-deck2/50" style={{ height: BOX_H }}>
              <SlotLine slot={a} teams={teams} />
              <div className="h-px bg-line" />
              <SlotLine slot={b} teams={teams} />
            </li>
          ))}
        </ol>
        <svg aria-hidden width={x + 16} height={height} className="shrink-0" fill="none" stroke="var(--line-2)" strokeWidth="1.5">
          {paths.map((d, i) => <path key={i} d={d} />)}
        </svg>
      </div>
    </article>
  );
}

function SlotLine({ slot, teams }: { slot: BracketSlot; teams: Record<string, BracketTeam> }) {
  const list = slot.teams.map(s => teams[s]).filter(Boolean);
  const h = (BOX_H - 1) / 2;
  if (list.length === 2) {
    return (
      <div className="flex items-center gap-2 px-2" style={{ height: h }}>
        <span className="w-5 shrink-0 text-right text-[12px] font-bold text-mute tnum">{slot.seed}</span>
        <span className="flex shrink-0 -space-x-1.5">{list.map(t => <TeamLogo key={t.slug} src={t.logo} name={t.name} size={18} />)}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {list.map((t, i) => <span key={t.slug}>{i > 0 && <span className="text-dim"> / </span>}<Link className="link" href={teamHref(t.slug)} title={`${t.name} (${rec(t.w, t.l)})`}>{t.short}</Link></span>)}
        </span>
        <OrTag />
      </div>
    );
  }
  const t = list[0];
  if (!t) return <div style={{ height: h }} />;
  return (
    <div className="flex items-center gap-2 px-2" style={{ height: h }}>
      <span className="w-5 shrink-0 text-right text-[12px] font-bold text-mute tnum">{slot.seed}</span>
      <TeamLogo src={t.logo} name={t.name} size={18} />
      <Link href={teamHref(t.slug)} className="link min-w-0 truncate text-[13.5px] font-semibold">{t.name}</Link>
      <AQ t={t} />
      <span className="ml-auto shrink-0 pl-2 text-[12px] text-mute tnum">{rec(t.w, t.l)}</span>
    </div>
  );
}

function RegionList({ slots, teams }: { slots: BracketSlot[]; teams: Record<string, BracketTeam> }) {
  const games = Array.from({ length: 8 }, (_, i) => [slots[2 * i], slots[2 * i + 1]] as const);
  return (
    <ol className="space-y-2">
      {games.map(([a, b], i) => (
        <li key={i} className={`overflow-hidden rounded-[14px] bg-deck ${i % 2 === 0 && i > 0 ? "mt-4" : ""}`}>
          <TeamEntry slot={a} teams={teams} />
          <div className="ml-12 h-px bg-line" />
          <TeamEntry slot={b} teams={teams} />
        </li>
      ))}
    </ol>
  );
}

/** A full-width row for phones and the seed list: one team, or both Opening Round teams. */
function TeamEntry({ slot, teams, region }: { slot: { seed: number; teams: string[]; kind: string | null }; teams: Record<string, BracketTeam>; region?: string }) {
  const list = slot.teams.map(s => teams[s]).filter(Boolean);
  if (list.length === 2) {
    return (
      <div className="px-3 py-2">
        <div className="mb-1 flex items-center gap-2 pl-9 text-[11.5px] font-semibold text-mute">
          <OrTag /> Opening Round{slot.kind === "auto" ? " · automatic qualifiers" : " · at-large"}{region ? ` · ${region}` : ""}
        </div>
        {list.map(t => <TeamLine key={t.slug} t={t} seed={slot.seed} />)}
      </div>
    );
  }
  return list[0] ? <div className="px-3 py-1"><TeamLine t={list[0]} seed={slot.seed} region={region} /></div> : null;
}

function TeamLine({ t, seed, region }: { t: BracketTeam; seed: number; region?: string }) {
  return (
    <Link href={teamHref(t.slug)} className="press flex min-h-[48px] items-center gap-3 py-1.5">
      <span className="w-6 shrink-0 text-right text-[14px] font-bold text-mute tnum">{seed}</span>
      <ColorBar color={t.color} />
      <TeamLogo src={t.logo} name={t.name} size={26} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center"><span className="truncate text-[15px] font-semibold">{t.name}</span><AQ t={t} /></span>
        <span className="block truncate text-[12px] text-mute">{t.confName}{region ? ` · ${region}` : ""}{t.overall ? ` · No. ${t.overall} overall` : ""}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[14px] font-semibold tnum">{rec(t.w, t.l)}</span>
        <span className="block text-[11px] text-dim">record</span>
      </span>
    </Link>
  );
}

function OpeningRound({ data }: { data: Data }) {
  const groups = [
    { kind: "at-large", label: "At-large games", sub: `The ${data.config.openingRound.atLargeTeams} lowest-seeded at-large teams` },
    { kind: "auto", label: "Automatic qualifier games", sub: `The ${data.config.openingRound.autoTeams} lowest-seeded conference champions` },
  ] as const;
  return (
    <section aria-labelledby="or-h" className="mt-8">
      <h2 id="or-h" className="h-section mb-1">Opening Round</h2>
      <p className="mb-3 text-sm text-mute">{data.config.openingRound.games} games on Tuesday and Wednesday, March 16–17, 2027. Winners take the seed shown.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map(g => (
          <div key={g.kind} className="deck p-4">
            <h3 className="font-display text-[1.25rem] font-extrabold">{g.label}</h3>
            <p className="mb-2 text-[12.5px] text-mute">{g.sub}</p>
            <ul className="divide-y divide-line">
              {data.openingRound.filter(o => o.kind === g.kind).map(o => {
                const [a, b] = o.teams.map(s => data.teams[s]);
                return (
                  <li key={o.teams.join()} className="flex items-center gap-2 py-2 text-[14px]">
                    <span className="w-24 shrink-0 text-[12px] font-semibold text-mute">{o.seed} seed · {o.region}</span>
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5">
                      <TeamLogo src={a.logo} name={a.name} size={18} /><Link className="link font-semibold" href={teamHref(a.slug)}>{a.name}</Link>
                      <span className="text-dim">vs.</span>
                      <TeamLogo src={b.logo} name={b.name} size={18} /><Link className="link font-semibold" href={teamHref(b.slug)}>{b.name}</Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- seed list ----------
function SeedList({ data }: { data: Data }) {
  return (
    <section aria-labelledby="seeds-h">
      <h2 id="seeds-h" className="sr-only">Seed list</h2>
      <p className="mb-3 text-sm text-mute">All {data.config.fieldSize} teams by seed line, best first (the S-curve). Tap a team for its page.</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.lines.map(line => (
          <div key={line.seed}>
            <h3 className="mb-1.5 flex items-baseline gap-2 px-1 font-display text-[1.2rem] font-extrabold">
              <Dots className="text-[22px]">{line.seed}</Dots> seeds
            </h3>
            <ul className="divide-y divide-line overflow-hidden rounded-[18px] bg-deck">
              {line.entries.map(e => <li key={e.teams.join()}><TeamEntry slot={{ seed: line.seed, teams: e.teams, kind: e.kind }} teams={data.teams} region={e.region} /></li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- bubble ----------
function Bubble({ data }: { data: Data }) {
  return (
    <section aria-labelledby="bubble-h">
      <h2 id="bubble-h" className="sr-only">Bubble watch</h2>
      <p className="mb-4 max-w-3xl text-sm text-mute">
        The cut line for at-large bids. <b className="text-ink">In field</b> is the share of {data.config.sims.toLocaleString("en-US")} simulated seasons in which the team makes our projected field (a model estimate).
        Quadrant records are unofficial (DHR rank, NET cutoffs).
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        {BUBBLE_GROUPS.map(g => (
          <div key={g.key}>
            <h3 className="px-1 font-display text-[1.35rem] font-extrabold leading-tight">{g.label}</h3>
            <p className="mb-2 px-1 text-[12.5px] text-mute">{g.blurb}</p>
            <ul className="divide-y divide-line overflow-hidden rounded-[18px] bg-deck">
              {data.bubble[g.key].map(slug => <BubbleRow key={slug} t={data.teams[slug]} />)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function BubbleRow({ t }: { t: BracketTeam }) {
  const [q1w, q1l] = t.quads[0];
  const facts = [
    { k: "Record", v: rec(t.w, t.l) },
    { k: "Quad 1", v: rec(q1w, q1l) },
    { k: "DHR", v: t.rank ? `No. ${t.rank}` : "—" },
    { k: "Proj.", v: `${Math.round(t.projW)}–${Math.round(t.projL)}`, title: "Projected final record (season simulation average)" },
  ];
  return (
    <li>
      <Link href={teamHref(t.slug)} className="press flex gap-3 px-4 py-3">
        <ColorBar color={t.color} />
        <TeamLogo src={t.logo} name={t.name} size={30} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[15.5px] font-semibold">{t.name}</span>
            <span className="shrink-0 text-right" title="Share of simulated seasons in which the team makes the projected field">
              <b className="text-[15px] tnum">{pctLabel(t.makeField)}</b> <span className="text-[11px] text-dim">in field</span>
            </span>
          </span>
          <span className="block text-[12px] text-mute">{t.confName}{t.seed ? ` · proj. ${t.seed} seed${t.openingRound ? ", Opening Round" : ""}` : ""}</span>
          <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px]">
            {facts.map(f => <span key={f.k} title={f.title}><span className="text-dim">{f.k}</span> <b className="font-semibold tnum">{f.v}</b></span>)}
          </span>
          {t.notes.length > 0 && <span className="mt-1.5 block text-[13px] leading-snug text-mute">{t.notes.join(" ")}</span>}
        </span>
      </Link>
    </li>
  );
}
