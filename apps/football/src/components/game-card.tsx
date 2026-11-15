// One game as a compact scoreboard tile: away over home, ranks, score, status. Links to the game page.
import Link from "next/link";
import TeamLogo from "@sports/ui/team-logo";
import type { Game, Side } from "@/lib/data";
import { kickoff } from "@/lib/data";

type T = { name: string; short?: string; logo: string | null; abbr?: string } | undefined;

function Row({ s, t, done, live }: { s: Side; t: T; done: boolean; live: boolean }) {
  const lost = done && !s.winner;
  return (
    <div className={`flex items-center gap-2.5 ${lost ? "text-mute" : "text-ink"}`}>
      <TeamLogo src={t?.logo ?? null} name={t?.name ?? "?"} size={24} />
      <span className="min-w-0 flex-1 truncate">
        {s.rank && <span className="mr-1 text-[12px] font-bold text-dim tnum">{s.rank}</span>}
        <Link href={`/team/?id=${s.id}`} className="font-semibold hover:underline">{t?.short ?? t?.name ?? "TBD"}</Link>
      </span>
      <span className={`font-display text-[22px] font-extrabold leading-none tnum ${live ? "text-bulb" : ""}`}>{s.score ?? ""}</span>
    </div>
  );
}

export default function GameCard({ g, team }: { g: Game; team: (id: string) => T }) {
  const live = g.status === "in", done = g.status === "post";
  return (
    <article className="deck relative flex flex-col gap-1.5 p-3.5" aria-label={`${team(g.away.id)?.name ?? "Away"} at ${team(g.home.id)?.name ?? "Home"}`}>
      <div className="flex justify-between text-[11.5px] font-semibold text-dim">
        <span className={live ? "text-bulb" : ""}>{g.status === "pre" ? kickoff(g.date) : g.detail}</span>
        <span>{g.tv ?? ""}</span>
      </div>
      <Row s={g.away} t={team(g.away.id)} done={done} live={live} />
      <Row s={g.home} t={team(g.home.id)} done={done} live={live} />
      {g.status !== "pre" && <Link href={`/game/?id=${g.id}`} className="mt-1 self-start text-[12.5px] font-semibold text-bulb hover:underline">{live ? "Follow the drives" : "Drive chart"}</Link>}
    </article>
  );
}
