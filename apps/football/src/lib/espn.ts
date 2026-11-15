// Live ESPN scoreboard (FBS) → the same Game shape as games.json, plus the team bits needed to
// draw a row when teams.json hasn't been loaded.
import type { Game, Team } from "./data";

export const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=300";
type Raw = { events?: { id: string; date: string; competitions: { neutralSite?: boolean; venue?: { fullName?: string }; broadcasts?: { names?: string[] }[]; status?: { type?: { state?: string; shortDetail?: string } }; competitors: { homeAway: "home" | "away"; winner?: boolean; score?: string; curatedRank?: { current?: number }; team: { id: string; displayName: string; shortDisplayName?: string; abbreviation?: string; color?: string; alternateColor?: string; logo?: string } }[] }[] }[]; week?: { number?: number } };

export function parseScoreboard(raw: unknown): { week: number | null; games: Game[]; teams: Map<string, Pick<Team, "id" | "name" | "short" | "abbr" | "color" | "logo">> } {
  const r = raw as Raw;
  const teams = new Map<string, Pick<Team, "id" | "name" | "short" | "abbr" | "color" | "logo">>();
  const games: Game[] = (r?.events ?? []).map(e => {
    const c = e.competitions[0];
    const side = (h: "home" | "away") => {
      const x = c.competitors.find(k => k.homeAway === h)!;
      teams.set(x.team.id, { id: x.team.id, name: x.team.displayName, short: x.team.shortDisplayName ?? x.team.displayName, abbr: x.team.abbreviation ?? "", color: x.team.color ?? null, logo: x.team.logo ?? null });
      const rank = x.curatedRank?.current;
      return { id: x.team.id, score: x.score != null && x.score !== "" ? Number(x.score) : null, rank: rank && rank <= 25 ? rank : null, winner: !!x.winner };
    };
    const st = c.status?.type?.state;
    return {
      id: e.id, date: e.date, status: st === "in" ? "in" : st === "post" ? "post" : "pre", detail: c.status?.type?.shortDetail ?? "",
      neutral: !!c.neutralSite, venue: c.venue?.fullName ?? null, tv: c.broadcasts?.[0]?.names?.[0] ?? null, home: side("home"), away: side("away"),
    } satisfies Game;
  });
  return { week: r?.week?.number ?? null, games, teams };
}
