"use client";
import Link from "next/link";
import DataTable, { type Column } from "@/components/data-table";
import { fmt, signed } from "@/lib/format";
import { playerRows } from "@/lib/players";
import type { Player, PlayerField, PlayerTable, TeamDetail } from "@/lib/types";

export type RosterBio = { jersey: string | null; ht: string | null; year: string | null; pos: string | null };
type Row = Player & { on: number | null; offc: number | null; onMin: number | null; bio: RosterBio | null };

const n = (key: keyof Player, label: string, title?: string, digits = 1): Column<Row> => ({ key, label, title, value: p => p[key] as number | null, render: p => fmt(p[key] as number | null, digits) });
const sgn = (v: number | null | undefined, d = 1) => (typeof v === "number" && Math.abs(v) < 0.5 * 10 ** -d ? (0).toFixed(d) : signed(v, d));
const netCell = (v: number | null, dim = false) => v === null ? "—" : <span className={`${v >= 0 ? "text-win" : "text-loss"} ${dim ? "opacity-60" : ""}`}>{signed(v, 1)}</span>;
const inches = (ht: string | null) => { const m = ht?.match(/(\d+)'\s*(\d+)/); return m ? Number(m[1]) * 12 + Number(m[2]) : null; };
const YEARS: Record<string, number> = { FR: 1, RS: 1.5, SO: 2, JR: 3, SR: 4, GR: 5 };

export default function Roster({ slug, rows, fields, onOff, bios }: {
  slug: string; rows: PlayerTable["rows"]; fields: PlayerField[]; onOff: NonNullable<TeamDetail["onOff"]>; bios: Record<string, RosterBio>;
}) {
  const players: Row[] = playerRows({ fields }, rows).map(p => {
    const o = onOff[p.id];
    return { ...p, on: o?.onNet ?? null, offc: o?.offNet ?? null, onMin: o?.min ?? null, bio: bios[p.id] ?? null };
  });
  if (!players.length) return <p className="text-sm text-mute">No player stats have been published for this team yet.</p>;
  const hasDpr = players.some(p => p.dpr != null), hasOnOff = players.some(p => p.on !== null), hasStars = players.some(p => p.stars != null);
  const columns: Column<Row>[] = [
    {
      key: "name", label: "Player", align: "l", sticky: true, width: 192, first: "asc", value: p => p.name,
      render: p => (
        <Link className="link flex items-baseline gap-1.5 font-semibold" href={`/player/?id=${p.id}`}>
          {p.bio?.jersey ? <span className="w-5 shrink-0 text-right text-[11px] font-normal text-dim tnum">{p.bio.jersey}</span> : null}
          <span className="truncate">{p.name}</span>
        </Link>
      ),
    },
    { key: "pos", label: "Pos", align: "l", first: "asc", value: p => p.pos ?? p.bio?.pos ?? null, render: p => <span className="text-mute">{p.pos ?? p.bio?.pos ?? "—"}</span> },
    { key: "yr", label: "Yr", align: "l", title: "Class", value: p => (p.bio?.year ? YEARS[p.bio.year] ?? null : null), render: p => <span className="text-mute">{p.bio?.year ?? "—"}</span> },
    { key: "ht", label: "Ht", align: "l", value: p => inches(p.bio?.ht ?? null), render: p => <span className="text-mute">{p.bio?.ht?.replace(/\s/g, "") ?? "—"}</span> },
    { key: "g", label: "G", value: p => p.g, render: p => `${p.g ?? "—"}${p.gs ? ` (${p.gs})` : ""}` },
    n("min", "Min", "Minutes per game"), n("pts", "Pts"), n("reb", "Reb"), n("ast", "Ast"),
  ];
  if (hasDpr) columns.push({
    key: "dpr", label: "DPR", csvLabel: "DPR",
    title: "DHR player rating: points per 100 possessions better than an average D-I player, from play-by-play lineups (± one standard error). Green/red only when the whole band is above/below zero.",
    value: p => p.dpr,
    render: p => {
      if (p.dpr == null) return "—";
      const se = p.dprSE ?? 0, sure = p.dpr - se > 0 ? "text-win" : p.dpr + se < 0 ? "text-loss" : "";
      const tip = `DPR ${signed(p.dpr, 1)} ± ${fmt(se, 1)} · offense ${signed(p.dprO, 1)}, defense ${signed(p.dprD, 1)} · ${fmt(p.onPoss, 0)} possessions${p.dprRank ? ` · #${p.dprRank} nationally` : ""}`;
      return <span title={tip}><b className={`font-semibold ${sure}`}>{sgn(p.dpr, 1)}</b><span className="ml-1 text-[11px] text-dim">±{fmt(se, 1)}</span></span>;
    },
  });
  if (hasOnOff) columns.push(
    { key: "on", label: "On", title: "Team net points per 100 possessions with him on the floor", value: p => p.on, render: p => <span title={p.onMin !== null ? `${fmt(p.onMin, 0)} minutes on the floor` : undefined}>{netCell(p.on)}</span> },
    { key: "offc", label: "Off", title: "Team net points per 100 possessions with him off the floor", value: p => p.offc, render: p => netCell(p.offc, true) },
    { key: "onoff", label: "On−off", title: "On-court net minus off-court net (noisy, not adjusted for teammates or opponents)", value: p => (p.on !== null && p.offc !== null ? p.on - p.offc : null), render: p => (p.on !== null && p.offc !== null ? signed(p.on - p.offc, 1) : "—") },
  );
  if (hasStars) columns.push({
    key: "stars", label: "Rec", csvLabel: "Recruiting stars", title: "High-school recruiting stars (College Basketball Data)", value: p => p.stars,
    render: p => p.stars ? (
      <span title={`${p.stars}-star recruit${p.recRank ? `, #${p.recRank} nationally` : ""}${p.recYear ? `, class of ${p.recYear}` : ""}`} aria-label={`${p.stars} stars`} className="tracking-[-0.1em] text-ink">
        {"★".repeat(p.stars)}<span className="text-line2">{"★".repeat(Math.max(0, 5 - p.stars))}</span>
      </span>
    ) : <span className="text-dim">—</span>,
  });
  columns.push(
    n("stl", "Stl"), n("blk", "Blk"), n("tov", "TO"),
    { key: "fg", label: "FG", value: p => (p.fga ? p.fgm! / p.fga : null), render: p => <span className="text-mute">{p.fgm ?? 0}-{p.fga ?? 0}</span> },
    { key: "3p", label: "3P", value: p => (p.tpa ? p.tpm! / p.tpa : null), render: p => <span className="text-mute">{p.tpm ?? 0}-{p.tpa ?? 0}</span> },
    n("ts", "TS%", "True shooting %"), n("usg", "Usg%", "Share of team possessions used while on the floor"), n("ortg", "ORtg", "Points produced per 100 possessions used"),
    n("porpag", "PORPAG", "Points over replacement per adjusted game", 2), n("ws", "WS", "Win shares", 2),
  );
  return <DataTable rows={players} columns={columns} rowKey={p => p.id} initialSort="min" caption="Roster statistics" csvName={`${slug}-roster.csv`} />;
}
