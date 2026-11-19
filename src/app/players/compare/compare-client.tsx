"use client";
// Head-to-head compare: two pickers write ?a= and ?b= with history.replaceState; 14 stats in five groups as mirrored percentile bars.
// Metrics, direction and sample guards come from the basketball sport pack; the pool is D-I players with 10+ mpg.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Metric } from "@sports/kit";
import { fmtMetric, val } from "@sports/kit/metrics";
import { makePool } from "@sports/kit/stats";
import { ErrorState, Loading } from "@sports/ui/states";
import { useJson } from "@sports/ui/client-data";
import { METRICS } from "@/sports/basketball/pack";
import { playerRows } from "@/lib/players";
import type { PlayerTable, TeamSummary } from "@/lib/types";
import { derive, type PlayerRow } from "../player-stats";
import PlayerPicker from "./player-picker";
import CompareDeck, { type Tone } from "./compare-deck";

type M = Metric<PlayerRow>;
type Pool = ReturnType<typeof makePool>;
type Side = { v: number | null; pct: number | null; small: boolean };

const POOL_MIN = 10;
const COLOR = { a: "var(--def)", b: "var(--off)" } as const;
const SUGGEST = 3;

const GROUPS: { title: string; keys: string[] }[] = [
  { title: "Scoring", keys: ["pts40", "ts", "usg"] },
  { title: "Shooting", keys: ["efg", "tpPct", "ftPct"] },
  { title: "Playmaking", keys: ["ast40", "astTov", "tov40"] },
  { title: "Defense & boards", keys: ["reb40", "stocks40", "drtg"] },
  { title: "Impact", keys: ["dpr", "net"] },
];
const byKey = new Map<string, M>(METRICS.map(m => [m.key, m]));
const ROWS = GROUPS.map(g => ({ title: g.title, metrics: g.keys.map(k => byKey.get(k)).filter((m): m is M => !!m) }));
const ALL_METRICS = ROWS.flatMap(g => g.metrics);

/** Value and percentile for one side. Small samples (failing the metric's guard) get no value and no percentile. */
function sideOf(m: M, r: PlayerRow | null, pool: Pool | undefined): Side {
  if (!r || !pool) return { v: null, pct: null, small: false };
  if (m.ok && !m.ok(r)) return { v: null, pct: null, small: true };
  const v = val(m, r);
  return { v, pct: v === null ? null : pool.pct(v, m.invert), small: false };
}

export default function CompareClient() {
  const params = useSearchParams();
  const players = useJson<PlayerTable>("players.json");
  const teams = useJson<TeamSummary[]>("teams.json");

  // Sorted by points, so the picker's empty-query list shows the leading scorers first.
  const all = useMemo<PlayerRow[]>(() => {
    if (!players.data || !teams.data) return [];
    const byTeam = new Map(teams.data.map(t => [t.id, t]));
    return playerRows(players.data, players.data.rows)
      .map(p => derive(p, byTeam.get(p.teamId) ?? null))
      .sort((x, y) => (y.pts ?? -1) - (x.pts ?? -1));
  }, [players.data, teams.data]);

  const byId = useMemo(() => new Map(all.map(p => [p.id, p])), [all]);
  const aId = params.get("a"), bId = params.get("b");
  const a = aId ? byId.get(aId) ?? null : null;
  const b = bId ? byId.get(bId) ?? null : null;
  // The player picked in the card deck; their side of every stat row stays bright, the other side fades.
  const [focus, setFocus] = useState<Tone | null>(null);
  useEffect(() => setFocus(null), [aId, bId]);

  const pools = useMemo(() => {
    const base = all.filter(r => (r.min ?? 0) >= POOL_MIN);
    return new Map(ALL_METRICS.map(m => [m.key, makePool(base.flatMap(r => { const v = val(m, r); return v === null ? [] : [v]; }))]));
  }, [all]);

  const table = useMemo(() => ROWS.map(g => ({
    title: g.title,
    items: g.metrics.map(m => ({ m, sa: sideOf(m, a, pools.get(m.key)), sb: sideOf(m, b, pools.get(m.key)) })),
  })), [a, b, pools]);

  const edges = useMemo(() => {
    let aW = 0, bW = 0, comparable = 0, total = 0;
    for (const g of table) for (const { sa, sb } of g.items) {
      total++;
      if (sa.pct === null || sb.pct === null) continue;
      comparable++;
      if (sa.pct > sb.pct) aW++; else if (sb.pct > sa.pct) bW++;
    }
    return { aW, bW, comparable, total };
  }, [table]);

  const setPick = useCallback((side: "a" | "b", id: string) => {
    const p = new URLSearchParams(window.location.search);
    p.set(side, id);
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, []);

  useEffect(() => {
    document.title = a && b ? `${a.name} vs ${b.name} · D1 Hoops` : "Compare players · D1 Hoops";
  }, [a, b]);

  if (players.status === "error" || teams.status === "error") {
    return <ErrorState message={players.error ?? teams.error ?? "Could not load players."} retry={() => { players.retry(); teams.retry(); }} />;
  }
  if (!players.data || !teams.data) return <Loading label="Loading players" />;

  const suggestions = all.filter(r => (r.min ?? 0) >= POOL_MIN).slice(0, SUGGEST * 2);
  const pickers = (
    <section aria-label="Pick two players" className="deck p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        <PlayerPicker label="Player A" tone="a" players={all} value={a} exclude={b?.id} onChange={p => setPick("a", p.id)} />
        <PlayerPicker label="Player B" tone="b" players={all} value={b} exclude={a?.id} onChange={p => setPick("b", p.id)} />
      </div>
      {((aId && !a) || (bId && !b)) && <p className="mt-3 text-xs text-mute">One of the ids in the address is not a player we have. Pick someone else.</p>}
    </section>
  );

  if (!a && !b) {
    return (
      <div className="space-y-6">
        {pickers}
        <section aria-labelledby="suggest-h" className="space-y-3">
          <h2 id="suggest-h" className="h-section">Try a matchup</h2>
          <p className="text-sm text-mute">Pairs from the top scorers by points per game, 10+ minutes a game.</p>
          <ul className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: SUGGEST }, (_, i) => [suggestions[2 * i], suggestions[2 * i + 1]] as const).filter(([x, y]) => x && y).map(([x, y]) => (
              <li key={`${x!.id}-${y!.id}`}>
                <Link href={`/players/compare/?a=${x!.id}&b=${y!.id}`} className="deck flex items-center justify-between gap-3 p-4 hover:border-[color:var(--line-2)]">
                  <span className="min-w-0 truncate text-sm font-semibold">{x!.name}</span>
                  <span className="shrink-0 font-display text-xs font-bold text-mute">vs</span>
                  <span className="min-w-0 truncate text-right text-sm font-semibold">{y!.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  if (!a || !b) {
    return (
      <div className="space-y-6">
        {pickers}
        <p className="deck-flat p-4 text-sm text-mute">Pick a second player to see the comparison.</p>
      </div>
    );
  }

  if (a.id === b.id) {
    return (
      <div className="space-y-6">
        {pickers}
        <p className="deck-flat p-4 text-sm text-mute">Both slots hold the same player. Pick two different players.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pickers}

      <CompareDeck cards={[{ p: a, tone: "a", color: COLOR.a }, { p: b, tone: "b", color: COLOR.b }]} selected={focus} onSelect={setFocus} />
      <p className="sr-only" aria-live="polite">{focus ? `Highlighting ${focus === "a" ? a.name : b.name} in the comparison.` : ""}</p>

      <section aria-label="Stat comparison" className="deck px-3 py-2 sm:px-5">
        {table.map(g => (
          <div key={g.title}>
            <h3 className="pb-1 pt-3 text-center text-[12.5px] font-semibold text-mute">{g.title}</h3>
            <ul>
              {g.items.map(({ m, sa, sb }) => <StatRow key={m.key} m={m} sa={sa} sb={sb} focus={focus} />)}
            </ul>
          </div>
        ))}
        <p className="pb-3 pt-4 text-center text-[11.5px] text-dim">
          Bars are percentiles against D-I players with 10+ mpg. Lower-is-better stats are flipped, so a longer bar is always better.
        </p>
      </section>

      <p className="text-center text-sm">
        <span className="text-mute">Edges:</span>{" "}
        {edges.comparable === 0 ? (
          <span className="text-mute">No stats are comparable yet (small samples).</span>
        ) : (
          <>
            <b className="text-ink">{a.name}</b> leads {edges.aW} of {edges.comparable}
            {edges.bW > 0 && <> · <b className="text-ink">{b.name}</b> leads {edges.bW}</>}
            {edges.comparable < edges.total && <span className="text-dim"> · {edges.total - edges.comparable} not comparable</span>}
          </>
        )}
      </p>
    </div>
  );
}

function StatRow({ m, sa, sb, focus }: { m: M; sa: Side; sb: Side; focus: Tone | null }) {
  const pa = sa.pct, pb = sb.pct;
  const lead = pa !== null && pb !== null && pa !== pb ? (pa > pb ? "a" : "b") : null;
  const cls = (s: "a" | "b") => (lead === null ? "text-ink" : lead === s ? "text-ink font-bold" : "text-mute");
  const value = (s: Side) => (s.v === null ? "—" : fmtMetric(m, s.v));
  // Deck highlight: the other player's half fades back (opacity only, so the layout never moves).
  const fade = (s: "a" | "b") => `transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${focus && focus !== s ? "opacity-30" : ""}`;

  const track = (s: "a" | "b", side: Side, anchor: "left" | "right") => {
    const isLoser = lead !== null && lead !== s;
    if (side.small) return <span className="block truncate text-[10.5px] text-dim">small sample</span>;
    return (
      <span className="relative block h-2.5 min-w-0 flex-1 rounded-full bg-deck2" aria-hidden>
        {side.pct !== null && (
          <span className={`absolute top-0 h-full rounded-full ${anchor === "right" ? "right-0" : "left-0"}`}
            style={{ width: `${side.pct * 100}%`, background: COLOR[s], opacity: isLoser ? 0.4 : 1 }} />
        )}
      </span>
    );
  };

  return (
    <li className="grid h-11 grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)] items-center gap-2">
      <div className={`flex min-w-0 items-center gap-2 ${fade("a")}`}>
        <span className={`w-14 shrink-0 text-right text-[15px] tnum ${cls("a")}`}>{value(sa)}</span>
        {track("a", sa, "right")}
      </div>
      <span className="truncate text-center text-[12.5px] font-semibold leading-tight text-mute">{m.label}</span>
      <div className={`flex min-w-0 items-center gap-2 ${fade("b")}`}>
        {track("b", sb, "left")}
        <span className={`w-14 shrink-0 text-left text-[15px] tnum ${cls("b")}`}>{value(sb)}</span>
      </div>
    </li>
  );
}

const a11y = (m: M, s: Side) => (s.v === null ? (s.small ? "small sample" : "no data") : fmtMetric(m, s.v));
