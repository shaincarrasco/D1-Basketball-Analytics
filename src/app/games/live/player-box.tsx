"use client";
// Player box score from ESPN's game summary: one team at a time (toggle), starters then bench,
// team totals in the footer. Player names stay pinned while the numbers scroll sideways on phones.
import { useState } from "react";
import { pctFmt } from "@/lib/format";
import type { PlayerLine, StatLine, TeamBox } from "@/lib/live-game";
import type { GameSide } from "@/lib/types";

type Col = { key: string; label: string; title: string; cell: (l: StatLine) => string; strong?: boolean };
const v = (n: number | null) => (n == null ? "—" : String(n));
const mk = (m: number | null, a: number | null) => (m == null || a == null ? "—" : `${m}-${a}`);
const COLS: Col[] = [
  { key: "min", label: "MIN", title: "Minutes played", cell: l => v(l.min) },
  { key: "pts", label: "PTS", title: "Points", cell: l => v(l.pts), strong: true },
  { key: "reb", label: "REB", title: "Rebounds (offensive + defensive)", cell: l => v(l.reb) },
  { key: "ast", label: "AST", title: "Assists", cell: l => v(l.ast) },
  { key: "fg", label: "FG", title: "Field goals made-attempted", cell: l => mk(l.fgm, l.fga) },
  { key: "3p", label: "3P", title: "3-pointers made-attempted", cell: l => mk(l.tpm, l.tpa) },
  { key: "ft", label: "FT", title: "Free throws made-attempted", cell: l => mk(l.ftm, l.fta) },
  { key: "stl", label: "STL", title: "Steals", cell: l => v(l.stl) },
  { key: "blk", label: "BLK", title: "Blocks", cell: l => v(l.blk) },
  { key: "to", label: "TO", title: "Turnovers", cell: l => v(l.to) },
  { key: "pf", label: "PF", title: "Personal fouls", cell: l => v(l.pf) },
];

export default function PlayerBox({ away, home, awaySide, homeSide, live }: {
  away: TeamBox | null; home: TeamBox | null; awaySide: GameSide; homeSide: GameSide; live: boolean;
}) {
  const [pick, setPick] = useState<"away" | "home">(away ? "away" : "home");
  const box = pick === "away" ? away : home;
  const side = pick === "away" ? awaySide : homeSide;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Choose a team">
        {(["away", "home"] as const).map(k => {
          const s = k === "away" ? awaySide : homeSide;
          const has = !!(k === "away" ? away : home);
          return (
            <button key={k} type="button" className="chip" aria-pressed={pick === k} disabled={!has} onClick={() => setPick(k)}>
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: `var(--${k === "away" ? "def" : "off"})` }} aria-hidden />
              {s.short ?? s.name}
            </button>
          );
        })}
      </div>
      {!box ? <p className="text-sm text-mute">ESPN hasn&apos;t posted player stats for {side.name} yet.</p> : <TeamTable box={box} side={side} live={live} />}
    </div>
  );
}

function TeamTable({ box, side, live }: { box: TeamBox; side: GameSide; live: boolean }) {
  const played = box.players.filter(p => !p.dnp);
  const starters = played.filter(p => p.starter), bench = played.filter(p => !p.starter);
  const out = box.players.filter(p => p.dnp);
  const t = box.totals;
  const shoot = (m: number | null, a: number | null) => (m != null && a ? pctFmt(m / a, 1) : "—");
  return (
    <div>
      <div className="scroll-x rounded-lg border border-line" data-testid={`player-box-${box.teamId}`}>
        <table className="dt">
          <caption className="sr-only">{side.name} player box score</caption>
          <thead>
            <tr>
              <th scope="col" className="l sticky-col !bg-deck">Player</th>
              {COLS.map(c => <th key={c.key} scope="col"><abbr title={c.title} className="no-underline">{c.label}</abbr></th>)}
            </tr>
          </thead>
          <tbody>
            <Group label="Starters" rows={starters} />
            <Group label="Bench" rows={bench} />
          </tbody>
          <tfoot>
            <tr data-testid="box-totals">
              <th scope="row" className="l sticky-col !border-line !bg-deck2 !text-[13px] !font-semibold !text-ink">Team totals</th>
              {COLS.map(c => <td key={c.key} className={c.strong ? "font-bold text-ink" : "font-semibold"}>{c.key === "min" ? "" : c.cell(t)}</td>)}
            </tr>
            <tr>
              <th scope="row" className="l sticky-col !border-b-0 !bg-deck2 !text-[12px] !font-normal !text-mute">Shooting</th>
              {COLS.map(c => (
                <td key={c.key} className="text-[12px] text-mute">
                  {c.key === "fg" ? shoot(t.fgm, t.fga) : c.key === "3p" ? shoot(t.tpm, t.tpa) : c.key === "ft" ? shoot(t.ftm, t.fta) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {out.length > 0 && (
        <p className="mt-2 text-[12.5px] text-mute">
          <span className="font-semibold">{live ? "Hasn't played yet" : "Did not play"}:</span>{" "}
          {out.map((p, i) => <span key={p.id}>{i ? ", " : ""}{p.short}{p.reason ? ` (${p.reason.toLowerCase()})` : ""}</span>)}
        </p>
      )}
      <p className="mt-1 text-[11.5px] text-dim">
        Player stats from ESPN{live ? ", updating during the game" : ""}. Team rebounds aren&apos;t credited to any player.
      </p>
    </div>
  );
}

function Group({ label, rows }: { label: string; rows: PlayerLine[] }) {
  if (!rows.length) return null;
  return (
    <>
      <tr aria-hidden>
        <td colSpan={COLS.length + 1} className="l !bg-deck !py-1 !text-[11px] font-semibold uppercase tracking-wide text-dim">{label}</td>
      </tr>
      {rows.map(p => (
        <tr key={p.id} data-testid="player-row">
          <th scope="row" className="l sticky-col !border-line !bg-deck !py-1.5 text-left !font-normal">
            <span className="block max-w-[9.5rem] truncate text-[13.5px] font-semibold text-ink sm:max-w-none" title={p.name}>
              {p.short}{p.ejected ? <span className="ml-1 text-loss" title="Ejected">EJ</span> : null}
            </span>
            <span className="block text-[11px] text-dim">{[p.jersey ? `#${p.jersey}` : null, p.pos].filter(Boolean).join(" · ") || " "}</span>
          </th>
          {COLS.map(c => <td key={c.key} className={c.strong ? "font-bold text-ink" : p.pf != null && c.key === "pf" && p.pf >= 4 ? "font-semibold text-loss" : ""}
            title={c.key === "pf" && p.pf != null && p.pf >= 4 ? (p.pf >= 5 ? "Fouled out" : "In foul trouble (4 fouls)") : undefined}>{c.cell(p)}</td>)}
        </tr>
      ))}
    </>
  );
}
