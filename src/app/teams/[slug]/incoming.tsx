// Incoming high-school class: this program's commitments by year, with the class rank for each year.
import type { ProspectRow, TeamClass, TeamDetail } from "@/lib/types";

const fields = (detail: TeamDetail) => detail.prospectFields ?? [];

export default function Incoming({ detail }: { detail: TeamDetail }) {
  const incoming = detail.incoming ?? [];
  if (!incoming.length) return null;
  const f = fields(detail);
  const rows = incoming
    .map(r => Object.fromEntries(f.map((k, i) => [k, r[i]])) as Record<string, string | number | null>)
    .sort((a, b) => (Number(a.year) - Number(b.year)) || (Number(a.rank ?? 1e9) - Number(b.rank ?? 1e9)));
  const classes = [...(detail.classRank ?? [])].sort((a, b) => a.year - b.year);

  return (
    <section className="deck min-w-0 p-5" aria-labelledby="incoming-h">
      <h2 id="incoming-h" className="h-section">Incoming class</h2>
      <ul className="mt-2 space-y-1 text-sm text-mute tnum">
        {classes.map(c => <li key={c.year}>{classLine(c)}</li>)}
      </ul>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {rows.map((r, i) => (
          <li key={`${r.year}-${r.name}-${i}`} className="flex h-12 items-center gap-3">
            <span className="w-16 shrink-0 font-display text-[15px] font-extrabold tnum text-bulb" aria-label={`${r.stars ?? "unrated"} star`}>
              {r.stars ? "★".repeat(Number(r.stars)) : <span className="text-dim">—</span>}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {r.name}
                {r.pos ? <span className="ml-1.5 text-xs font-normal text-dim">{r.pos}</span> : null}
                {r.ht ? <span className="ml-1.5 text-xs font-normal text-mute tnum">{heightLabel(Number(r.ht))}</span> : null}
              </p>
              <p className="truncate text-xs text-mute">{[r.hs, [r.city, r.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="shrink-0 text-right text-xs tnum">
              <p className="text-mute">{r.year}</p>
              {r.rank ? <p className="text-mute">No. {r.rank}</p> : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-mute">High-school rankings and commitments: College Basketball Data. Commitments are not signed letters until signing day.</p>
    </section>
  );
}

function classLine(c: TeamClass) {
  const parts = [`${c.year} class: ${c.rank ? `No. ${c.rank} nationally` : "unranked"}`, `${c.commits} ${c.commits === 1 ? "commit" : "commits"}`];
  if (c.five) parts.push(`${c.five} ${c.five === 1 ? "five-star" : "five-stars"}`);
  return parts.join(" · ");
}

const heightLabel = (inches: number) => (Number.isFinite(inches) && inches > 0 ? `${Math.floor(inches / 12)}'${inches % 12}"` : "");
