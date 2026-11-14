// ESPN tennis scoreboards (men's and women's tours) → a flat list of singles matches.
export type SetScore = { g: number; tb?: number; won: boolean };
export type Side = { name: string; flag: string | null; country: string | null; winner: boolean; sets: SetScore[] };
export type LiveMatch = { id: string; tour: "men" | "women"; event: string; round: string; state: "pre" | "in" | "post"; detail: string; start: string; sides: [Side, Side] };

export const SCOREBOARDS = {
  men: "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard",
  women: "https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard",
} as const;

type Espn = { events?: { name: string; groupings?: { grouping?: { displayName?: string }; competitions?: EspnComp[] }[] }[] };
type EspnComp = {
  id: string; date: string; status?: { type?: { state?: string; shortDetail?: string } }; round?: { displayName?: string };
  competitors?: { winner?: boolean; order?: number; athlete?: { displayName?: string; flag?: { href?: string; alt?: string } }; linescores?: { value?: number; tiebreak?: number; winner?: boolean }[] }[];
};

export function parseScoreboard(tour: LiveMatch["tour"], d: Espn | null): LiveMatch[] {
  const out: LiveMatch[] = [];
  for (const e of d?.events ?? []) for (const g of e.groupings ?? []) {
    if (!/singles/i.test(g.grouping?.displayName ?? "")) continue;
    for (const c of g.competitions ?? []) {
      const cs = [...(c.competitors ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      if (cs.length !== 2 || !cs.every(x => x.athlete?.displayName)) continue;
      const side = (x: (typeof cs)[number]): Side => ({
        name: x.athlete!.displayName!, flag: x.athlete?.flag?.href ?? null, country: x.athlete?.flag?.alt ?? null, winner: !!x.winner,
        sets: (x.linescores ?? []).map(l => ({ g: l.value ?? 0, tb: l.tiebreak, won: !!l.winner })),
      });
      const st = c.status?.type?.state;
      out.push({ id: `${tour}-${c.id}`, tour, event: e.name, round: c.round?.displayName ?? "", state: st === "in" ? "in" : st === "post" ? "post" : "pre", detail: c.status?.type?.shortDetail ?? "", start: c.date, sides: [side(cs[0]), side(cs[1])] });
    }
  }
  return out;
}

/** Names → player ids, for linking scoreboard names to Baseline player pages. */
export const nameKey = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
