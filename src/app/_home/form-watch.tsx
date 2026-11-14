// Home: hottest / coldest teams over 30 days and the biggest DHR movers this week.
// Every list only shows teams that clear the thresholds in src/lib/form.ts.
import Link from "next/link";
import TeamLogo from "@/components/team-logo";
import { Tag } from "@/components/form/form-badges";
import { dayLabel, DHR_RANK_TITLE, signed } from "@/lib/format";
import { FORM_MIN_GAMES, FORM_MIN_GAMES_BEFORE, FORM_WINDOW_DAYS, MOVER_DAYS, firstFormDay, type Mover } from "@/lib/form";
import { getAllForms, getForm, getMovers } from "@/lib/form-server";
import { getTeams } from "@/lib/server-data";
import type { TeamSummary } from "@/lib/types";

const STRETCH = "after:absolute after:inset-0 after:content-['']";
const N = 5;

function TeamRow({ t, children }: { t: TeamSummary; children: React.ReactNode }) {
  return (
    <li className="group relative -mx-2 flex items-center gap-2 rounded-md border-b border-line px-2 py-1.5 text-sm last:border-0 hover:bg-deck2 focus-within:bg-deck2">
      <TeamLogo src={t.logo} name={t.name} size={18} />
      <Link href={`/teams/${t.slug}/`} className={`link min-w-0 flex-1 truncate group-hover:text-off ${STRETCH}`}>{t.name}</Link>
      {children}
    </li>
  );
}

function MoverList({ title, rows, byId }: { title: string; rows: Mover[]; byId: Map<string, TeamSummary> }) {
  return (
    <div>
      <h4 className="mb-1 text-[12px] font-semibold text-mute">{title}</h4>
      <ol>
        {rows.map(m => {
          const t = byId.get(m.id);
          if (!t) return null;
          return (
            <TeamRow key={m.id} t={t}>
              <span className="text-[11.5px] text-dim tnum" title={DHR_RANK_TITLE}>{m.rankThen}→{m.rankNow}</span>
              <b className={`w-11 text-right tnum ${m.change >= 0 ? "text-win" : "text-loss"}`} title={`DHR ${signed(m.then, 1)} → ${signed(m.now, 1)}, ${m.games} game${m.games === 1 ? "" : "s"} played`}>{signed(m.change, 1)}</b>
            </TeamRow>
          );
        })}
      </ol>
    </div>
  );
}

export default function FormWatch() {
  const file = getForm(), teams = getTeams();
  if (!file.asOf) return null;
  const byId = new Map(teams.map(t => [t.id, t]));
  const forms = [...getAllForms().byId.values()];
  const hot = forms.filter(f => f.badge === "hot").sort((a, b) => b.gap! - a.gap!).slice(0, N);
  const cold = forms.filter(f => f.badge === "cold").sort((a, b) => a.gap! - b.gap!).slice(0, N);
  const ready = forms.filter(f => f.games >= FORM_MIN_GAMES).length;
  const first = firstFormDay(file);
  const mv = getMovers();
  const sorted = [...mv.rows].sort((a, b) => b.change - a.change);
  const risers = sorted.slice(0, N), fallers = sorted.slice(-N).reverse();

  return (
    <section aria-labelledby="form-watch">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 id="form-watch" className="h-section">Who&apos;s moving</h2>
        <Link href="/rankings/?view=form" className="text-sm font-semibold text-mute hover:text-ink">Form view</Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="deck p-4">
          <h3 className="text-[13.5px] font-semibold">Hottest &amp; coldest <span className="font-normal text-dim">· last {FORM_WINDOW_DAYS} days</span></h3>
          <p className="mb-2 text-xs text-mute">Recent games vs the DHR rating, each adjusted for opponent and venue</p>
          {hot.length || cold.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[["Hot", hot], ["Cold", cold]].map(([label, list]) => (
                <div key={label as string}>
                  <h4 className="mb-1 text-[12px] font-semibold text-mute">{label as string}</h4>
                  {(list as typeof hot).length ? (
                    <ol>
                      {(list as typeof hot).map(f => (
                        <TeamRow key={f.id} t={byId.get(f.id)!}>
                          <Tag kind={f.badge!} why={f.why} />
                          <b className={`w-11 text-right tnum ${f.gap! >= 0 ? "text-win" : "text-loss"}`}>{signed(f.gap, 1)}</b>
                        </TeamRow>
                      ))}
                    </ol>
                  ) : <p className="text-xs text-dim">None right now.</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line2 px-4 py-3 text-sm text-mute">
              <p className="font-semibold text-ink">Too early for hot and cold.</p>
              <p className="mt-1">A tag needs {FORM_MIN_GAMES}+ D-I games in the last {FORM_WINDOW_DAYS} days, at least {FORM_MIN_GAMES_BEFORE} games before that to compare with, and a gap bigger than normal game-to-game noise. Right now every game is a recent game{first ? `, so the first tags can appear around ${dayLabel(first, { month: "short", day: "numeric" })}` : ""}.</p>
              <p className="mt-1 text-xs text-dim">{ready} of {teams.length} teams already have {FORM_MIN_GAMES} recent games.</p>
            </div>
          )}
        </div>
        <div className="deck p-4">
          <h3 className="text-[13.5px] font-semibold">Biggest movers <span className="font-normal text-dim">· last {MOVER_DAYS} days</span></h3>
          <p className="mb-2 text-xs text-mute">{mv.since ? `Change in DHR rating since ${dayLabel(mv.since, { month: "short", day: "numeric" })}, with rank before → now` : "Change in DHR rating, with rank before → now"}</p>
          {mv.rows.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <MoverList title="Rising" rows={risers} byId={byId} />
              <MoverList title="Falling" rows={fallers} byId={byId} />
            </div>
          ) : <p className="text-sm text-mute">Movers appear after the first week of results.</p>}
        </div>
      </div>
    </section>
  );
}
