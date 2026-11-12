// Server-rendered shot-zone summary: share of attempts and FG% for and against vs the D-I average.
import { zoneStats, type Shot, type ZoneId, type ZoneStats } from "@/lib/shots";

const GROUPS: { label: string; hint: string; zones: ZoneId[] }[] = [
  { label: "At the rim", hint: "Within 4 ft of the basket", zones: ["rim"] },
  { label: "Paint", hint: "Other paint twos", zones: ["paint"] },
  { label: "Mid-range", hint: "Two-point jumpers outside the paint", zones: ["midL", "midC", "midR"] },
  { label: "Corner 3", hint: "Threes from either corner", zones: ["c3L", "c3R"] },
  { label: "Above-the-break 3", hint: "Wing and top-of-the-key threes", zones: ["ab3L", "ab3C", "ab3R"] },
];

const sum = (s: ZoneStats, zones: ZoneId[]) => zones.reduce((a, z) => ({ fga: a.fga + s[z].fga, fgm: a.fgm + s[z].fgm }), { fga: 0, fgm: 0 });
// Tint by FG% difference vs D-I average (good = mint). Small samples stay clear.
function tint(diff: number, n: number) {
  if (n < 8 || Math.abs(diff) < 0.03) return undefined;
  const a = Math.min(0.3, Math.abs(diff) * 1.2).toFixed(3);
  return `rgb(var(--${diff > 0 ? "good" : "bad"}-rgb) / calc(${a} * var(--heat-k)))`;
}

export default function ZoneTable({ off, def, league }: { off: Shot[]; def: Shot[]; league: ZoneStats | null }) {
  if (!off.length && !def.length) return null;
  const so = zoneStats(off), sd = zoneStats(def);
  const lgTotal = league ? Object.values(league).reduce((a, z) => a + z.fga, 0) : 0;
  const cell = (z: { fga: number; fgm: number }, total: number, lg: number | null, better: 1 | -1) => {
    const p = z.fga ? z.fgm / z.fga : null;
    return (
      <>
        <td className="text-mute">{total ? `${Math.round((z.fga / total) * 100)}%` : "—"}</td>
        <td style={{ background: p !== null && lg !== null ? tint((p - lg) * better, z.fga) : undefined }} title={`${z.fgm} of ${z.fga}`}>
          <b className={`font-semibold ${z.fga < 8 ? "text-mute" : ""}`}>{p === null ? "—" : `${Math.round(p * 100)}%`}</b>
          <span className="ml-1.5 text-[11px] text-dim">{z.fgm}/{z.fga}</span>
        </td>
      </>
    );
  };
  return (
    <div className="scroll-x mt-5 rounded-xl border border-line">
      <table className="dt">
        <caption className="sr-only">Shot zones: share of attempts and field-goal percentage, offense and defense</caption>
        <thead>
          <tr>
            <th className="l">Zone</th>
            <th className="grp-off" title="Share of the team's field-goal attempts">Off share</th>
            <th className="grp-off" title="Team FG% in the zone (tint vs D-I average)">Off FG%</th>
            <th className="grp-def" title="Share of opponents' field-goal attempts">Def share</th>
            <th className="grp-def" title="Opponent FG% in the zone (mint = below the D-I average)">Opp FG%</th>
            <th title="D-I average share and FG% this season">D-I avg</th>
          </tr>
        </thead>
        <tbody>
          {GROUPS.map(g => {
            const lg = league ? sum(league, g.zones) : null;
            const lgP = lg && lg.fga ? lg.fgm / lg.fga : null;
            return (
              <tr key={g.label}>
                <td className="l" title={g.hint}>{g.label}</td>
                {cell(sum(so, g.zones), off.length, lgP, 1)}
                {cell(sum(sd, g.zones), def.length, lgP, -1)}
                <td className="text-mute">{lg && lgTotal ? `${Math.round((lg.fga / lgTotal) * 100)}% · ${Math.round(lgP! * 100)}%` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
