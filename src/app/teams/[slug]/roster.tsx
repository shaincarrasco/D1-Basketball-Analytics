"use client";
import Link from "next/link";
import DataTable, { type Column } from "@/components/data-table";
import { fmt } from "@/lib/format";
import { playerRows } from "@/lib/players";
import type { Player, PlayerField, PlayerTable } from "@/lib/types";

const FIELDS: PlayerField[] = ["id", "name", "teamId", "pos", "g", "gs", "min", "pts", "reb", "orb", "drb", "ast", "stl", "blk", "tov", "pf",
  "usg", "ortg", "drtg", "net", "porpag", "efg", "ts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "ws", "ws40", "orbPct", "ftr",
  "rimA", "rimM", "midA", "midM", "thrA", "thrM", "astd", "dunks"];

const n = (key: keyof Player, label: string, title?: string, digits = 1): Column<Player> => ({ key, label, title, value: p => p[key] as number | null, render: p => fmt(p[key] as number | null, digits) });

export default function Roster({ rows }: { rows: PlayerTable["rows"] }) {
  const players = playerRows({ fields: FIELDS }, rows);
  if (!players.length) return <p className="text-sm text-mute">No player stats have been published for this team yet.</p>;
  const columns: Column<Player>[] = [
    { key: "name", label: "Player", align: "l", sticky: true, width: 170, first: "asc", value: p => p.name, render: p => <Link className="link font-semibold" href={`/player/?id=${p.id}`}>{p.name}</Link> },
    { key: "pos", label: "Pos", align: "l", first: "asc", value: p => p.pos, render: p => <span className="text-mute">{p.pos ?? "—"}</span> },
    { key: "g", label: "G", value: p => p.g, render: p => `${p.g ?? "—"}${p.gs ? ` (${p.gs})` : ""}` },
    n("min", "Min", "Minutes per game"), n("pts", "Pts"), n("reb", "Reb"), n("ast", "Ast"), n("stl", "Stl"), n("blk", "Blk"), n("tov", "TO"),
    { key: "fg", label: "FG", value: p => (p.fga ? p.fgm! / p.fga : null), render: p => <span className="text-mute">{p.fgm ?? 0}-{p.fga ?? 0}</span> },
    { key: "3p", label: "3P", value: p => (p.tpa ? p.tpm! / p.tpa : null), render: p => <span className="text-mute">{p.tpm ?? 0}-{p.tpa ?? 0}</span> },
    n("ts", "TS%", "True shooting %"), n("usg", "Usg%", "Share of team possessions used while on the floor"), n("ortg", "ORtg", "Points produced per 100 possessions used"),
    n("porpag", "PORPAG", "Points over replacement per adjusted game", 2), n("ws", "WS", "Win shares", 2),
  ];
  return <DataTable rows={players} columns={columns} rowKey={p => p.id} initialSort="min" caption="Roster statistics" />;
}
