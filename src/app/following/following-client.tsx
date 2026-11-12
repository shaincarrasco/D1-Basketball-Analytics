"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Star } from "lucide-react";
import DataTable, { type Column } from "@/components/data-table";
import FavoriteButton from "@/components/favorite-button";
import TeamLogo from "@/components/team-logo";
import { ErrorState, Loading } from "@/components/states";
import { useJson } from "@/lib/client-data";
import { useFavorites } from "@/lib/favorites";
import { fmt, signed } from "@/lib/format";
import { playerRows } from "@/lib/players";
import type { Player, PlayerTable, TeamSummary } from "@/lib/types";
import { TeamCard } from "./team-cards";

type Row = Player & { team: TeamSummary | null };

function HowTo({ what }: { what: "teams" | "players" }) {
  return (
    <div className="deck flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:gap-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line2 text-mute" aria-hidden><Star size={18} /></span>
      <div className="text-sm">
        <p className="font-semibold">{what === "teams" ? "You aren’t following any teams yet" : "You aren’t following any players yet"}</p>
        <p className="mt-0.5 text-mute">
          {what === "teams"
            ? <>Open any team page and press <b className="font-semibold text-ink">Follow</b> (the star) next to its name. Followed teams show up here and at the top of the home page. Find one in the <Link href="/rankings/" className="link underline decoration-line2 underline-offset-2">rankings</Link>.</>
            : <>Press the star on any player page to keep their numbers here. Browse the <Link href="/players/" className="link underline decoration-line2 underline-offset-2">player leaderboards</Link> to find someone.</>}
          {" "}Follows are saved on this device only.
        </p>
      </div>
    </div>
  );
}

export default function FollowingClient() {
  const fav = useFavorites();
  const teams = useJson<TeamSummary[]>("teams.json");
  const players = useJson<PlayerTable>(fav.players.length ? "players.json" : null);

  const bySlug = useMemo(() => new Map((teams.data ?? []).map(t => [t.slug, t])), [teams.data]);
  const byId = useMemo(() => new Map((teams.data ?? []).map(t => [t.id, t])), [teams.data]);
  const myTeams = useMemo(() => fav.teams.map(s => bySlug.get(s)).filter((t): t is TeamSummary => !!t), [fav.teams, bySlug]);
  const myPlayers = useMemo<Row[]>(() => {
    if (!players.data || !fav.players.length) return [];
    const want = new Set(fav.players);
    const rows = players.data.rows.filter(r => want.has(String(r[players.data!.fields.indexOf("id")])));
    const list = playerRows(players.data, rows).map(p => ({ ...p, team: byId.get(p.teamId) ?? null }));
    return fav.players.map(id => list.find(p => String(p.id) === id)).filter((p): p is Row => !!p);
  }, [players.data, fav.players, byId]);

  if (teams.status === "error") return <ErrorState message={teams.error} retry={teams.retry} />;
  if (!teams.data) return <Loading label="Loading your teams" />;

  const columns: Column<Row>[] = [
    {
      key: "name", label: "Player", align: "l", value: p => p.name, first: "asc", sticky: true, width: 180,
      render: p => (
        <div className="flex items-center gap-2.5">
          {p.team ? <Link href={`/teams/${p.team.slug}/`} tabIndex={-1} aria-hidden className="shrink-0"><TeamLogo src={p.team.logo} name={p.team.name} size={22} /></Link> : null}
          <span className="min-w-0">
            <Link href={`/player/?id=${p.id}`} className="link block truncate font-semibold group-hover/row:text-off">{p.name}</Link>
            <span className="block truncate text-[11.5px] text-mute">
              {p.team ? <Link href={`/teams/${p.team.slug}/`} className="hover:text-ink hover:underline">{p.team.name}</Link> : "—"}{p.pos ? ` · ${p.pos}` : ""}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: "dpr", label: "DPR", title: "D1 Hoops player rating: points per 100 possessions better than an average D-I player, ± one standard error. Early season — treat the band seriously.", value: p => p.dpr,
      render: p => p.dpr === null ? "—" : <span><b>{signed(p.dpr)}</b><span className="ml-1 text-[11px] text-dim">±{fmt(p.dprSE)}</span></span>,
    },
    { key: "g", label: "G", value: p => p.g, render: p => fmt(p.g, 0) },
    { key: "min", label: "Min", value: p => p.min },
    { key: "pts", label: "Pts", value: p => p.pts, render: p => <b>{fmt(p.pts)}</b> },
    { key: "reb", label: "Reb", value: p => p.reb },
    { key: "ast", label: "Ast", value: p => p.ast },
    { key: "ts", label: "TS%", title: "True shooting percentage", value: p => p.ts, render: p => fmt(p.ts) },
    { key: "porpag", label: "PORPAG", title: "Points over replacement per adjusted game", value: p => p.porpag },
    { key: "dprO", label: "Off", group: "off", title: "DPR offense", value: p => p.dprO, render: p => signed(p.dprO) },
    { key: "dprD", label: "Def", group: "def", title: "DPR defense (positive = good)", value: p => p.dprD, render: p => signed(p.dprD) },
    { key: "fav", label: <span className="sr-only">Unfollow</span>, csvLabel: "Follow", sortable: false, value: () => null, render: p => <FavoriteButton kind="players" id={String(p.id)} name={p.name} compact /> },
  ];

  return (
    <div className="space-y-10">
      <section aria-labelledby="teams-h">
        <h2 id="teams-h" className="h-section mb-3">Teams{myTeams.length ? <span className="ml-2 text-sm font-normal text-mute">{myTeams.length}</span> : null}</h2>
        {myTeams.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {myTeams.map(t => <li key={t.id}><TeamCard t={t} /></li>)}
          </ul>
        ) : <HowTo what="teams" />}
      </section>

      <section aria-labelledby="players-h">
        <h2 id="players-h" className="h-section mb-3">Players{myPlayers.length ? <span className="ml-2 text-sm font-normal text-mute">{myPlayers.length}</span> : null}</h2>
        {!fav.players.length ? <HowTo what="players" />
          : players.status === "error" ? <ErrorState message={players.error} retry={players.retry} />
          : !players.data ? <Loading label="Loading players" />
          : <DataTable rows={myPlayers} columns={columns} rowKey={p => String(p.id)} rowHref={p => `/player/?id=${p.id}`} caption="Followed players" />}
      </section>
    </div>
  );
}
