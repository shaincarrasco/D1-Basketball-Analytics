"use client";
// One game: the score header, the animated drive chart, and team box totals per drive result.
// Finished games read the pre-built g/{id}.json; anything else reads ESPN's live summary.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useJson } from "@sports/ui/client-data";
import { usePolledJson } from "@sports/ui/polling";
import { Empty, Loading } from "@sports/ui/states";
import TeamLogo from "@sports/ui/team-logo";
import DriveChart from "@/components/drive-chart";
import { hex, kickoff, teamMap, type Game, type GameFile, type Games, type Team } from "@/lib/data";
import { parseSummary, summaryUrl } from "@/lib/summary";

type Hdr = { header?: { competitions?: { date?: string; status?: { type?: { state?: string; shortDetail?: string } }; competitors?: { id: string; homeAway: string; score?: string; winner?: boolean; curatedRank?: { current?: number }; team: { displayName: string; shortDisplayName?: string; location?: string; abbreviation?: string; color?: string; logo?: string; logos?: { href: string }[] } }[] }[] } };

export default function View() {
  const id = useSearchParams().get("id");
  const games = useJson<Games>("games.json");
  const teams = useJson<Team[]>("teams.json");
  const built = useJson<GameFile>(id ? `g/${id}.json` : null);
  const known: Game | undefined = useMemo(() => games.data?.weeks.flatMap(w => w.games).find(g => g.id === id), [games.data, id]);
  const needLive = !!id && (built.status === "error" || (known && known.status !== "post"));
  // Poll while the game can still change; once ESPN calls it final, keep the last answer and stop.
  const [final, setFinal] = useState<Hdr | null>(null);
  const live = usePolledJson<Hdr>(needLive && !final ? summaryUrl(id!) : null, 20_000);
  useEffect(() => { if (live.data?.header?.competitions?.[0]?.status?.type?.state === "post") setFinal(live.data); }, [live.data]);
  const liveData = final ?? live.data;
  const tm = useMemo(() => teamMap(teams.data ?? null), [teams.data]);
  if (!id) return <Empty title="No game picked">Open one from the <Link className="link" href="/">scoreboard</Link> or the <Link className="link" href="/schedule/">schedule</Link>.</Empty>;
  const gf: GameFile | null = built.status === "ready" && known?.status !== "in" ? built.data : liveData ? parseSummary(id, liveData) : null;
  const hc = liveData?.header?.competitions?.[0];
  const side = (h: "home" | "away") => {
    const k = known?.[h], c = hc?.competitors?.find(x => x.homeAway === h);
    const tid = k?.id ?? c?.id ?? gf?.[h] ?? "";
    const t = tm.get(tid);
    return {
      id: tid, name: t?.name ?? c?.team.displayName ?? "TBD", short: t?.short ?? c?.team.shortDisplayName ?? c?.team.location ?? c?.team.displayName ?? "TBD", abbr: t?.abbr ?? c?.team.abbreviation ?? "",
      color: hex(t?.color ?? c?.team.color) ?? (h === "home" ? "#3a6df0" : "#c2410c"), logo: t?.logo ?? c?.team.logos?.[0]?.href ?? c?.team.logo ?? null,
      score: c?.score != null ? Number(c.score) : k?.score ?? null, rank: k?.rank ?? c?.curatedRank?.current ?? null, winner: c?.winner ?? k?.winner ?? false,
    };
  };
  const away = side("away"), home = side("home");
  const detail = hc?.status?.type?.shortDetail ?? known?.detail ?? "";
  const state = hc?.status?.type?.state ?? known?.status;
  if (!gf && (built.status === "loading" || (needLive && !liveData && !live.error))) return <Loading label="Loading game" />;
  return (
    <>
      <header className="relative mb-6 overflow-hidden rounded-2xl border border-line" style={{ background: `linear-gradient(90deg, ${away.color}55, transparent 40%, transparent 60%, ${home.color}55)` }}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-5 sm:p-7">
          {[away, null, home].map((s, i) => s === null ? (
            <div key="mid" className="text-center">
              <p className={`text-[13px] font-semibold ${state === "in" ? "text-bulb" : "text-mute"}`}>{state === "pre" && known ? kickoff(known.date) : detail}</p>
              {known?.venue && <p className="mt-1 hidden text-[12px] text-dim sm:block">{known.venue}</p>}
            </div>
          ) : (
            <Link key={s.id || i} href={s.id && tm.has(s.id) ? `/team/?id=${s.id}` : "/teams/"} className={`flex items-center gap-3 sm:gap-4 ${i === 2 ? "flex-row-reverse text-right" : ""}`}>
              <TeamLogo src={s.logo} name={s.name} size={64} />
              <span className="min-w-0">
                <span className="block truncate font-display text-xl font-extrabold uppercase leading-none sm:text-3xl">{s.rank && s.rank <= 25 ? <span className="mr-1 text-[0.6em] text-mute">{s.rank}</span> : null}{s.short}</span>
                <span className={`block font-display text-5xl font-extrabold leading-none tnum sm:text-6xl ${state === "post" && !s.winner ? "text-mute" : ""}`}>{s.score ?? ""}</span>
              </span>
            </Link>
          ))}
        </div>
      </header>
      {gf && gf.drives.length > 0 ? (
        <section aria-label="Drive chart">
          <h2 className="mb-3 font-display text-2xl font-extrabold uppercase">Drive chart</h2>
          <DriveChart game={gf} home={home} away={away} />
          {state === "in" && <p className="mt-2 text-[12.5px] text-dim">Live. New drives appear every 20 seconds.</p>}
        </section>
      ) : <Empty title={state === "pre" ? "Not kicked off yet" : "No play-by-play for this game"}>{state === "pre" ? "The drive chart fills in once the game starts." : "ESPN hasn't published drives for this one."}</Empty>}
    </>
  );
}
