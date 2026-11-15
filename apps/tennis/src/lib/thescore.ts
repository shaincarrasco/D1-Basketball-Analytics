// Live match lists for one tournament, straight from theScore (it allows browser requests).
// Used for tournament results by round and the order of play.
export type LiveSide = { id: string; name: string; seed: number | null; games: number[]; tb: (number | null)[] };
export type TMatch = { id: number; round: string; date: string; status: string; winner: 0 | 1 | 2; a: LiveSide; b: LiveSide };
type Raw = Record<string, any>;

const side = (m: Raw, n: 1 | 2): LiveSide => {
  const p = m[`team_${n}`]?.player1 ?? {};
  return { id: String(p.id ?? ""), name: `${p.first_name ?? ""} ${p.last_name ?? "TBD"}`.trim(), seed: m[`team_${n}_seed`] ?? null, games: m[`team_${n}_scores`] ?? [], tb: m[`team_${n}_tie_break`] ?? [] };
};

export async function eventMatches(tour: "men" | "women", sid: number): Promise<TMatch[]> {
  const r = await fetch(`https://api.thescore.com/${tour === "men" ? "atp" : "wta"}/events/${sid}/matches`);
  if (!r.ok) throw new Error(`Couldn't load matches (HTTP ${r.status})`);
  const list = (await r.json()) as Raw[];
  return list.filter(m => !m.is_double).map(m => ({
    id: m.id, round: m.round_name ?? "Round robin", date: m.match_date, status: m.status,
    winner: m.winner_id ? (m.winner_id === m.team_1?.id ? 1 : 2) : 0, a: side(m, 1), b: side(m, 2),
  }));
}

const ORDER = [/qualif/i, /round of 128|1st round/i, /round of 64|2nd round/i, /round of 32|3rd round/i, /round of 16|4th round/i, /round robin/i, /quarter/i, /semi/i, /^final$/i];
export const roundRank = (r: string) => { const i = ORDER.findIndex(re => re.test(r)); return i < 0 ? 0 : i; };
export const scoreLine = (s: LiveSide, o: LiveSide) => s.games.map((g, i) => `${g}-${o.games[i] ?? 0}`).join(" ");
export const localTime = (d: string) => new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export const localDay = (d: string) => new Date(d).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
