// "Since the last game": DHR rank and rating move against the latest snapshot before the team's last game. Server component.
import { DHR_RANK_TITLE, signed } from "@sports/ui/format";
import type { TeamChanges as Changes } from "@/lib/team-changes";

type Row = { key: string; tone: string; node: React.ReactNode };

export default function TeamChanges({ team, changes, lastResult }: {
  team: { name: string };
  changes: Changes | null;
  /** Short line for the last game, e.g. "W 81–70 vs Illinois". */
  lastResult?: string | null;
}) {
  const rows: Row[] = [];

  if (changes && changes.rankNow != null && changes.rankBefore != null) {
    const delta = changes.rankBefore - changes.rankNow; // positive = moved up
    if (delta > 0) rows.push({ key: "rank", tone: "text-win", node: <>Up <b className="tnum">{delta}</b> to <span className="tnum">No. {changes.rankNow}</span></> });
    else if (delta < 0) rows.push({ key: "rank", tone: "text-loss", node: <>Down <b className="tnum">{-delta}</b> to <span className="tnum">No. {changes.rankNow}</span></> });
    else rows.push({ key: "rank", tone: "text-ink", node: <>Held at <span className="tnum">No. {changes.rankNow}</span></> });
  }

  if (changes && changes.emNow != null && changes.emBefore != null) {
    const d = changes.emNow - changes.emBefore;
    const tone = d > 0.05 ? "text-win" : d < -0.05 ? "text-loss" : "text-ink";
    rows.push({ key: "rating", tone, node: <><b className="tnum">{signed(d, 1)}</b> per 100 possessions</> });
  }

  if (lastResult) rows.push({ key: "last", tone: "text-ink", node: <>{lastResult}</> });

  if (rows.length === 0) return null;

  return (
    <section className="deck p-4" aria-label={`Since the last game, ${team.name}`}>
      <h2 className="h-section mb-2">Since the last game</h2>
      <ul className="divide-y divide-line text-[14px]">
        {rows.map(r => (
          <li key={r.key} className={`py-2 ${r.tone}`} title={r.key === "rank" ? DHR_RANK_TITLE : undefined}>
            {r.node}
          </li>
        ))}
      </ul>
      {changes?.since ? <p className="mt-2 text-xs text-dim">Compared with ratings through {changes.since}.</p> : null}
    </section>
  );
}
