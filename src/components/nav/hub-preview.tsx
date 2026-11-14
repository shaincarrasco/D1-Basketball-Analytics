"use client";
// Live preview on the right of each menu panel, from the small nav-preview.json built with
// the site's data. Loaded the first time a panel opens.
import Link from "next/link";
import TeamLogo from "@sports/ui/team-logo";
import { Dots } from "@/components/dots";
import { useJson } from "@sports/ui/client-data";
import { signed, timeLabel, pctFmt } from "@sports/ui/format";
import type { HubKey } from "@/lib/nav";

type T = { name: string; short: string; slug: string; logo: string | null; color: string | null; rank: number | null };
export type NavPreview = {
  built: string;
  top: (T & { adjEM: number | null; record: string })[];
  game: { day: string; id: string; date: string; neutral: boolean; tv: { name: string }[]; home: T & { record: string | null }; away: T & { record: string | null }; wp: number | null } | null;
  players: { id: string; name: string; pos: string | null; dpr: number; team: T | null }[];
  seeds: (T & { region: string | null })[];
};

const tint = (c: string | null) => (c ? `color-mix(in oklab, ${c} 78%, white)` : "var(--line-2)");

function Frame({ title, href, cta, children }: { title: string; href: string; cta: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-line bg-night/60 p-5">
      <h3 className="font-display text-[20px] font-extrabold leading-none">{title}</h3>
      <div className="mt-4 flex-1">{children}</div>
      <Link href={href} className="mt-4 inline-flex text-[13.5px] font-semibold text-bulb-ink hover:underline">{cta}</Link>
    </div>
  );
}

function GamesPreview({ d }: { d: NavPreview }) {
  const g = d.game;
  return (
    <Frame title={g ? "Marquee game" : "Projected 1 seeds"} href={g ? `/games/?d=${g.day}&g=${g.id}` : "/bracket/"} cta={g ? "Open the game" : "See the bracket"}>
      {g && (
        <div className="flex items-center justify-between gap-3">
          {[g.away, g.home].map((s, i) => (
            <div key={s.slug} className={`flex w-[86px] flex-col items-center text-center ${i ? "order-3" : "order-1"}`}>
              <TeamLogo src={s.logo} name={s.name} size={40} />
              <span className="mt-1.5 max-w-full truncate font-display text-[16px] font-extrabold leading-tight">{s.short}</span>
              <span className="text-[11.5px] text-dim">{s.rank ? `DHR No. ${s.rank}` : s.record ?? ""}</span>
            </div>
          ))}
          <div className="order-2 flex flex-col items-center gap-1">
            <div className="plate px-2.5 py-1.5"><Dots ghost className="text-[22px]">--</Dots><Dots dim className="mx-1 text-[14px]">:</Dots><Dots ghost className="text-[22px]">--</Dots></div>
            <span className="text-[11.5px] font-medium text-mute">{timeLabel(g.date)}{g.tv[0] ? ` · ${g.tv[0].name}` : ""}</span>
          </div>
        </div>
      )}
      {g?.wp != null && (
        <div className="mt-4">
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-label={`Pregame win chance: ${g.away.name} ${pctFmt(1 - g.wp)}, ${g.home.name} ${pctFmt(g.wp)}`}>
            <div style={{ width: `${(1 - g.wp) * 100}%`, background: tint(g.away.color) }} />
            <div className="flex-1" style={{ background: tint(g.home.color) }} />
          </div>
          <div className="mt-1 flex justify-between text-[12px] text-mute tnum"><span>{pctFmt(1 - g.wp)}</span><span>Pregame win chance</span><span>{pctFmt(g.wp)}</span></div>
        </div>
      )}
      {d.seeds.length > 0 && (
        <div className={g ? "mt-5 border-t border-line pt-4" : ""}>
          {g && <p className="mb-2 text-[12.5px] font-semibold text-mute">Projected 1 seeds</p>}
          <div className="flex gap-3">
            {d.seeds.map(s => (
              <Link key={s.slug} href={`/teams/${s.slug}/`} className="flex flex-col items-center gap-1 text-center hover:opacity-90" title={`${s.name}, projected 1 seed${s.region ? ` in the ${s.region}` : ""}`}>
                <TeamLogo src={s.logo} name={s.name} size={30} />
                <span className="text-[11px] font-semibold text-mute">{s.region ?? s.short}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Frame>
  );
}

function TeamsPreview({ d }: { d: NavPreview }) {
  return (
    <Frame title="Top of the rankings" href="/rankings/" cta="All 365 teams">
      <ol className="space-y-1">
        {d.top.map(t => (
          <li key={t.slug}>
            <Link href={`/teams/${t.slug}/`} className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 hover:bg-deck2">
              <Dots className="w-6 text-right text-[18px]">{t.rank}</Dots>
              <TeamLogo src={t.logo} name={t.name} size={24} />
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{t.name}</span>
              <span className="text-[12px] text-dim tnum">{t.record}</span>
              <span className="w-12 text-right text-[13.5px] font-semibold tnum" title="DHR rating: points per 100 possessions better than an average D-I team">{signed(t.adjEM, 1)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

function PlayersPreview({ d }: { d: NavPreview }) {
  return (
    <Frame title="Highest DPR" href="/players/rankings/" cta="Player rankings">
      <ul className="space-y-2">
        {d.players.map(p => (
          <li key={p.id}>
            <Link href={`/player/?id=${p.id}`} className="flex items-center gap-3 overflow-hidden rounded-xl border border-line bg-deck py-2 pl-0 pr-3 hover:border-line2">
              <span className="h-11 w-1.5 shrink-0 rounded-r" style={{ background: tint(p.team?.color ?? null) }} aria-hidden />
              {p.team && <TeamLogo src={p.team.logo} name={p.team.name} size={26} />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold leading-tight">{p.name}</span>
                <span className="block text-[12px] text-dim">{[p.team?.short, p.pos].filter(Boolean).join(", ")}</span>
              </span>
              <span className="text-right" title="DPR: points per 100 possessions he adds compared with an average D-I player">
                <span className="block font-display text-[19px] font-extrabold leading-none tnum">{signed(p.dpr, 1)}</span>
                <span className="text-[10.5px] text-dim">DPR</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-dim">Players at 10+ minutes a game with 150+ tracked possessions.</p>
    </Frame>
  );
}

/** Half-court sketch with a five-player lineup: the lab's own picture. */
function ToolsPreview() {
  const spots: [number, number][] = [[150, 196], [62, 150], [238, 150], [92, 70], [208, 70]];
  return (
    <Frame title="Lineup lab" href="/lineups/" cta="Build a lineup">
      <svg viewBox="0 0 300 220" className="mx-auto max-h-[170px] w-full" role="img" aria-label="Half court with five player spots">
        <g fill="none" stroke="var(--line-2)" strokeWidth="2">
          <rect x="4" y="4" width="292" height="212" rx="10" />
          <rect x="105" y="4" width="90" height="118" />
          <path d="M105 122a45 45 0 0 0 90 0" />
          <path d="M26 4v62a124 124 0 0 0 248 0V4" />
          <circle cx="150" cy="30" r="9" stroke="var(--bulb)" />
          <path d="M132 18h36" stroke="var(--mute)" />
        </g>
        {spots.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="14" fill="var(--deck)" stroke="var(--bulb)" strokeWidth="2.5" />
            <circle cx={x} cy={y} r="5" fill="var(--bulb)" />
          </g>
        ))}
      </svg>
      <p className="mt-3 text-[13.5px] leading-snug text-mute">Pick any five D-I players. See projected offense, defense and how well they fit, step by step.</p>
    </Frame>
  );
}

export default function HubPreview({ hub }: { hub: HubKey }) {
  const { data } = useJson<NavPreview>(hub === "tools" ? null : "nav-preview.json");
  if (hub === "tools") return <ToolsPreview />;
  if (!data) return <div className="h-full min-h-[260px] animate-pulse rounded-2xl border border-line bg-night/40" aria-hidden />;
  if (hub === "games") return <GamesPreview d={data} />;
  if (hub === "teams") return <TeamsPreview d={data} />;
  if (hub === "players") return <PlayersPreview d={data} />;
  return null;
}
