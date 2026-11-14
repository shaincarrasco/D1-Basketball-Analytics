import Link from "next/link";

const TABS = [
  { key: "board", href: "/players/", label: "Leaderboards" },
  { key: "rankings", href: "/players/rankings/", label: "Rankings" },
  { key: "charts", href: "/charts/", label: "Charts" },
  { key: "build", href: "/charts/build/", label: "Make a chart" },
] as const;

/** Segmented links between the player tools. */
export default function PlayersTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Player tools" className="seg mb-5 w-full overflow-x-auto sm:w-max">
      {TABS.map(t => (
        <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined}
          className="hover:text-ink">
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
