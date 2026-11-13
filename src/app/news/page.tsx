import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import ArticleList from "@/components/article-list";
import TeamLogo from "@/components/team-logo";
import { getInjuries, getNews, getTeams } from "@/lib/server-data";
import InjuryTable from "./injury-table";

export const metadata: Metadata = { title: "News, polls & availability", description: "College basketball headlines with credit to the publisher, the AP and Coaches polls next to the D1 Hoops ratings, and a league-wide availability tracker." };

export default function NewsPage() {
  const news = getNews(), injuries = getInjuries(), teams = getTeams();
  const logo = new Map(teams.map(t => [t.slug, t.logo]));
  const ap = news.polls.ap ?? [];
  return (
    <>
      <PageHeader title="News">Headlines link to the original publisher. Polls sit next to our ratings, and the availability tracker flags who&apos;s missing.</PageHeader>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-6">
          <section className="deck p-5" aria-labelledby="head-h">
            <h2 id="head-h" className="h-section mb-1">Headlines</h2>
            <ArticleList items={news.league} max={20} />
          </section>
          <section aria-labelledby="inj-h">
            <h2 id="inj-h" className="h-section mb-1">Availability tracker</h2>
            <p className="mb-3 text-sm text-mute">Three sources, labelled on every row: ESPN&apos;s injury list, players who stopped appearing in box scores (reason usually not reported), and injury or suspension headlines that tag the player.</p>
            <InjuryTable rows={injuries} />
          </section>
        </div>
        <aside>
          <section className="deck p-5" aria-labelledby="ap-h">
            <h2 id="ap-h" className="h-section">AP Top 25 vs DHR</h2>
            <p className="mb-3 text-xs text-mute">{news.pollDate ? `Poll of ${new Date(news.pollDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. ` : ""}Gap = AP rank minus DHR rank; a big positive gap means the voters rate a team lower than the numbers do.</p>
            {ap.length ? (
              <table className="dt">
                <thead><tr><th>AP</th><th className="l">Team</th><th>DHR</th><th title="AP rank minus DHR rank">Gap</th></tr></thead>
                <tbody>
                  {ap.map(r => {
                    const gap = r.dhr ? r.rank - r.dhr : null;
                    return (
                      <tr key={r.rank + (r.slug ?? "")}>
                        <td><span className="rank-cell">{r.rank}</span>{r.prev && r.prev !== r.rank ? <span className={`sub-rank ${r.prev > r.rank ? "!text-win" : "!text-loss"}`}>{r.prev > r.rank ? "▲" : "▼"}{Math.abs(r.prev - r.rank)}</span> : null}</td>
                        <td className="l">{r.slug ? <Link href={`/teams/${r.slug}/`} className="link flex items-center gap-2"><TeamLogo src={logo.get(r.slug) ?? null} name={r.name ?? ""} size={20} /><span className="font-semibold">{r.name}</span><span className="text-xs text-mute">{r.w}–{r.l}</span></Link> : r.name}</td>
                        <td>{r.dhr ?? "—"}</td>
                        <td className={gap == null ? "" : gap >= 10 ? "text-win" : gap <= -10 ? "text-loss" : "text-mute"}>{gap == null ? "—" : gap > 0 ? `+${gap}` : gap}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <p className="text-sm text-mute">The poll hasn&apos;t been published yet.</p>}
            <p className="mt-2 text-xs text-dim">Polls via ESPN.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
