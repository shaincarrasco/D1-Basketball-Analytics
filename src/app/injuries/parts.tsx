// Small shared pieces for the injuries hub (server- and client-safe).
import Link from "next/link";
import TeamLogo from "@sports/ui/team-logo";

/** Per-team display data the server passes down (logo, colour, next game). */
export type TeamMeta = { name: string; logo: string | null; color: string | null; next: string | null };
export type TeamMetaMap = Record<string, TeamMeta>;

export function TeamTag({ slug, name, rank, meta, size = 20 }: { slug: string; name: string; rank: number | null; meta?: TeamMeta; size?: number }) {
  return (
    <Link href={`/teams/${slug}/`} className="link inline-flex items-center gap-1.5 align-middle">
      <TeamLogo src={meta?.logo ?? null} name={name} size={size} />
      <span>{name}</span>
      {rank ? <span className="dots text-[11px] text-dim" title={`D1 Hoops rank ${rank}`}>{rank}</span> : null}
    </Link>
  );
}
