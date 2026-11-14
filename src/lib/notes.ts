// "From the box scores": short, plain facts pulled straight from the data at build time.
// Every note is a template over real fields; when the data doesn't support a note it is
// skipped, never padded. Keep the tone of a box-score footnote: a number, then what it means.
import { fmt, ordinal } from "./format";
import type { Meta, Player, TeamSummary, ProfileKey } from "./types";

export type Note = { big: string; text: string; href?: string };

const teamHref = (t: TeamSummary) => `/teams/${t.slug}/`;

export function homeNotes(teams: TeamSummary[], players: Player[], meta: Meta): Note[] {
  const byId = new Map(teams.map(t => [t.id, t]));
  const out: Note[] = [];

  // Perfect at the rim (8+ attempts), most attempts first.
  const perfect = players.filter(p => (p.rimA ?? 0) >= 8 && p.rimM === p.rimA).sort((a, b) => (b.rimA ?? 0) - (a.rimA ?? 0))[0];
  if (perfect) {
    const t = byId.get(perfect.teamId);
    out.push({ big: `${perfect.rimM}/${perfect.rimA}`, text: `${perfect.name}${t ? ` of ${t.name}` : ""} hasn't missed at the rim: ${perfect.rimM} for ${perfect.rimA} this season.`, href: `/player/?id=${perfect.id}` });
  }

  const bestO = teams.filter(t => t.adjORank === 1)[0];
  if (bestO?.adjO != null) out.push({ big: fmt(bestO.adjO, 0), text: `${bestO.name} scores ${fmt(bestO.adjO)} points per 100 possessions, adjusted for opponents. Nobody in Division I is better.`, href: teamHref(bestO) });

  // Dunk leader, only when he leads outright.
  const dunks = players.filter(p => (p.dunks ?? 0) > 0).sort((a, b) => (b.dunks ?? 0) - (a.dunks ?? 0));
  if (dunks.length > 1 && (dunks[0].dunks ?? 0) > (dunks[1].dunks ?? 0) && (dunks[0].dunks ?? 0) >= 5) {
    const p = dunks[0], t = byId.get(p.teamId);
    out.push({ big: String(p.dunks), text: `${p.name}${t ? ` (${t.name})` : ""} has ${p.dunks} dunks, the most in Division I.`, href: `/player/?id=${p.id}` });
  }

  const bestD = teams.filter(t => t.adjDRank === 1)[0];
  if (bestD?.adjD != null) out.push({ big: fmt(bestD.adjD, 0), text: `${bestD.name} allows ${fmt(bestD.adjD)} points per 100 possessions, adjusted. The best defense in Division I.`, href: teamHref(bestD) });

  const bt = meta.model.backtest.all;
  if (bt && bt.games >= 50) out.push({ big: `${Math.round(bt.accuracy * 100)}%`, text: `The model has picked ${bt.correct} of ${bt.games} D-I games correctly, every pick made before tip-off.`, href: "/methodology/#backtest" });

  return out.slice(0, 3);
}

const WEAK: { k: ProfileKey; side: "off" | "def"; say: (name: string, v: string) => string; unit?: string }[] = [
  { k: "threePct", side: "off", say: (n, v) => `${n} shoots ${v}% from three` },
  { k: "ftPct", side: "off", say: (n, v) => `${n} makes ${v}% of its free throws` },
  { k: "twoPct", side: "off", say: (n, v) => `${n} shoots ${v}% inside the arc` },
  { k: "tov", side: "off", say: (n, v) => `${n} turns it over on ${v}% of possessions` },
  { k: "orb", side: "off", say: (n, v) => `${n} rebounds ${v}% of its own misses` },
  { k: "threePct", side: "def", say: (n, v) => `opponents shoot ${v}% from three against ${n}` },
  { k: "orb", side: "def", say: (n, v) => `opponents rebound ${v}% of their misses against ${n}` },
  { k: "tov", side: "def", say: (n, v) => `${n} forces turnovers on only ${v}% of possessions` },
];

/** One line on what a team is and its clearest weakness. */
export function teamNote(t: TeamSummary, total: number): string | null {
  if (!t.adjORank || !t.adjDRank) return null;
  const strong = t.adjDRank <= t.adjORank ? { side: "defense", r: t.adjDRank } : { side: "offense", r: t.adjORank };
  const lead = strong.r === 1 ? `The best ${strong.side} in the country` : strong.r <= 25 ? `The No. ${strong.r} ${strong.side} in the country` : `${t.name}'s ${strong.side} ranks ${ordinal(strong.r)}`;
  let worst: { text: string; r: number } | null = null;
  for (const w of WEAK) {
    const r = (w.side === "off" ? t.offRanks : t.defRanks)?.[w.k];
    const v = t[w.side]?.[w.k];
    if (!r || v == null) continue;
    if (!worst || r > worst.r) worst = { text: w.say(t.name, fmt(v)), r };
  }
  // Only call it a flaw when it sits in the bottom third; the check covers shooting, turnovers and rebounding.
  if (!worst || worst.r < total * 0.67) return `${lead}, with no shooting, turnover or rebounding number in the bottom third of Division I.`;
  return `${lead}, and one real flaw: ${worst.text}, ${ordinal(worst.r)} in Division I.`;
}
