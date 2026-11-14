"use client";
// National "most indispensable" leaderboard. Ranks come from the full list, so a name search
// or conference filter never renumbers players.
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import DataTable, { type Column } from "@/components/data-table";
import TeamLogo from "@/components/team-logo";
import { ErrorState, Loading } from "@/components/states";
import { useJson } from "@/lib/client-data";
import { DHR_RANK_TITLE, fmt, signed } from "@/lib/format";
import { DPR_SHRINK_POSS, FORM_WORDS, INDISPENSABLE_MIN_GAMES, INDISPENSABLE_MIN_MPG, REPLACEMENT_DPR, indispensability, type Indispensable } from "@/lib/form";
import { playerRows } from "@/lib/players";
import type { PlayerTable, TeamSummary } from "@/lib/types";
import { followRowLink, ROW_LINK_CLASS } from "@/app/players/row-link";

type Row = Indispensable & { team: TeamSummary | null };

export default function IndispensableBoard() {
  const players = useJson<PlayerTable>("players.json");
  const teams = useJson<TeamSummary[]>("teams.json");
  const [q, setQ] = useState("");
  const [conf, setConf] = useState("all");

  const all = useMemo<Row[]>(() => {
    if (!players.data || !teams.data) return [];
    const byId = new Map(teams.data.map(t => [t.id, t]));
    return indispensability(playerRows(players.data, players.data.rows), teams.data).map(r => ({ ...r, team: byId.get(r.teamId) ?? null }));
  }, [players.data, teams.data]);
  const confs = useMemo(() => [...new Map((teams.data ?? []).map(t => [t.confSlug, t.confName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [teams.data]);
  const inConf = useMemo(() => all.filter(r => conf === "all" || r.team?.confSlug === conf), [all, conf]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? inConf.filter(r => r.name.toLowerCase().includes(n) || (r.team?.name.toLowerCase().includes(n) ?? false)) : inConf;
  }, [inConf, q]);

  const columns = useMemo<Column<Row>[]>(() => [
    { key: "rk", label: "#", title: "Rank in the current sort among players in the chosen conference. Searching a name doesn't change it.", value: () => null, sortable: false, sticky: true, width: 40, render: (_r, i) => <span className="rank-cell text-mute">{i + 1}</span> },
    {
      key: "name", label: "Player", csvLabel: "Player", align: "l", value: r => r.name, first: "asc", sticky: true, width: 200,
      render: r => (
        <div className="flex items-center gap-2.5">
          {r.team && <Link href={`/teams/${r.team.slug}/`} tabIndex={-1} aria-hidden className="shrink-0"><TeamLogo src={r.team.logo} name={r.team.name} size={24} /></Link>}
          <span className="min-w-0">
            <Link data-row-link href={`/player/?id=${r.id}`} className="link block truncate font-semibold">{r.name}</Link>
            <span className="block truncate text-[11.5px] text-mute">{r.team ? <Link href={`/teams/${r.team.slug}/`} className="hover:text-ink">{r.team.name}</Link> : "Unknown team"}{r.pos ? <> · {r.pos}</> : null}</span>
          </span>
        </div>
      ),
    },
    { key: "drop", label: "DHR drop", csvLabel: "Team DHR drop (pts/100)", title: `${FORM_WORDS.indispensable} Points per 100 possessions.`, value: r => r.drop, render: r => <b className="text-[15px] text-loss">−{fmt(r.drop, 1)}</b> },
    { key: "perGame", label: "Pts/game", csvLabel: "Team points per game lost", title: "The same drop in points per game, at the team's adjusted tempo", value: r => r.perGame, render: r => <span>{r.perGame != null ? `−${fmt(r.perGame, 1)}` : "—"}</span> },
    { key: "rankWithout", label: "Team rank", csvLabel: "Team DHR rank without him", title: `${DHR_RANK_TITLE}. Now → without him, with every other team unchanged.`, value: r => r.rankWithout, first: "asc", render: r => <span className="whitespace-nowrap text-mute">{r.teamRank ?? "—"} → <b className="text-ink">{r.rankWithout ?? "—"}</b></span> },
    { key: "mpg", label: "MPG", title: "Minutes per game", value: r => r.mpg, render: r => fmt(r.mpg, 1) },
    { key: "dpr", label: "DPR", title: "DPR as published: points per 100 possessions vs an average D-I player (lineup-based)", value: r => r.dpr, render: r => signed(r.dpr, 1) },
    { key: "onPoss", label: "Poss.", csvLabel: "On-court possessions", title: "On-court possessions behind his DPR", value: r => r.onPoss, render: r => <span className="text-mute">{r.onPoss}</span> },
    { key: "shrunk", label: "DPR used", csvLabel: "DPR used (shrunk)", title: `DPR pulled toward average until his sample is big (half weight at ${DPR_SHRINK_POSS.toLocaleString("en-US")} possessions). This is the number in the formula.`, value: r => r.shrunk, render: r => signed(r.shrunk, 2) },
    { key: "g", label: "G", title: "Games played", value: r => r.g, render: r => r.g },
  ], []);

  if (players.status === "error" || teams.status === "error") return <ErrorState message={players.error ?? teams.error ?? "Could not load players."} retry={() => { players.retry(); teams.retry(); }} />;
  if (!players.data || !teams.data) return <Loading label="Loading players" />;

  return (
    <section aria-label="Most indispensable players">
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="relative flex-1 sm:w-64 sm:flex-none">
          <span className="sr-only">Find a player or team</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
          <input className="field w-full !pl-9" placeholder="Find a player or team" value={q} onChange={e => setQ(e.target.value)} />
        </label>
        <label>
          <span className="sr-only">Conference</span>
          <select className="field" value={conf} onChange={e => setConf(e.target.value)}>
            <option value="all">All conferences</option>
            {confs.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
          </select>
        </label>
      </div>
      <p className="mb-2 text-xs text-mute">
        DHR drop = minutes ÷ 40 × (DPR used − replacement), replacement = {signed(REPLACEMENT_DPR, 0)} per 100. {all.length.toLocaleString("en-US")} players with {INDISPENSABLE_MIN_GAMES}+ games and {INDISPENSABLE_MIN_MPG}+ minutes a game. An estimate, not a measured result: early-season DPR is noisy, so it is pulled toward average and minutes carry most of the weight for now.
      </p>
      {rows.length === 0 ? (
        <div className="deck p-6 text-sm text-mute">No players match “{q.trim()}”. Clear the search or pick another conference.</div>
      ) : (
        <div className={ROW_LINK_CLASS} onClick={followRowLink}>
          <DataTable rows={rows} rankRows={inConf} columns={columns} rowKey={r => r.id} initialSort="drop" initialDir="desc" pageSize={100} csvName="d1hoops-indispensable.csv" caption="Most indispensable players" maxHeight="78vh" />
        </div>
      )}
    </section>
  );
}
