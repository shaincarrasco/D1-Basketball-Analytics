"use client";
// The Match Brief: how far the four factors back the model's pick (agreement), the factors laid
// across a court with the net in the middle, each player's upsides and downsides on their own
// side, the bottom line, and every factor's reasoning and numbers underneath.
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { factValue, lastName, engineLabel, surfaceVar, type Brief, type Bucket, type Side } from "@/lib/deuce";
import { P1, P2 } from "./win-split";

const LANES = { slight: 1, moderate: 2, strong: 3 } as const;
const LANE_PCT = 7.5; // each lane is 15% of a half-court
const colorOf = (s: Side | "level") => (s === "p1" ? P1 : s === "p2" ? P2 : "var(--ink)");

function favoured(b: Bucket): Side | "level" { return b.favours === "p1" || b.favours === "p2" ? b.favours : "level"; }
function verdict(b: Bucket, nm: Record<Side, string>) {
  const f = favoured(b);
  return f === "level" ? "Level" : `${lastName(nm[f])}, ${b.strength ?? "slight"}`;
}

function Agreement({ a, pickName }: { a: Brief["agreement"]; pickName: string }) {
  const score = a?.score ?? null;
  const tone = score === null ? "text-mute" : score < 40 ? "text-bad" : score > 65 ? "text-good" : "text-ink";
  return (
    <div className="flex items-center gap-4">
      <div className="text-center">
        <span className={`block font-display text-[56px] font-black leading-none tnum ${tone}`}>{score ?? "—"}</span>
        <span className="text-[11px] font-semibold text-dim">of 100</span>
      </div>
      <div className="min-w-0">
        <p className="font-display text-2xl font-extrabold leading-tight">{a?.label ?? "Agreement unknown"}</p>
        <p className="text-[13.5px] text-mute">How far the four factors below back the pick, {pickName}. 50 means they cancel out.</p>
      </div>
    </div>
  );
}

function Court({ brief, nm, pick, surface }: { brief: Brief; nm: Record<Side, string>; pick: Side | null; surface: string | null }) {
  // Pucks start on the net and slide out once (CSS transition; off under reduced motion).
  const [out, setOut] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => requestAnimationFrame(() => setOut(true))); return () => cancelAnimationFrame(r); }, []);
  const buckets = (brief.buckets ?? []).slice(0, 4);
  const tag = (s: Side) => (pick === s ? <span className="rounded-full border border-line2 px-1.5 py-px text-[10.5px] font-semibold text-mute">pick</span> : null);
  return (
    <figure className="m-0" aria-label="The four factors, laid across a court">
      <div className="mb-1.5 flex items-end justify-between gap-2 sm:pl-[10.5rem]">
        <span className="flex min-w-0 items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: P1 }} /><b className="truncate font-display text-lg">{lastName(nm.p1)}</b>{tag("p1")}</span>
        <span className="flex min-w-0 items-center gap-1.5">{tag("p2")}<b className="truncate font-display text-lg">{lastName(nm.p2)}</b><span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: P2 }} /></span>
      </div>
      <div className="relative sm:grid sm:grid-cols-[10.5rem_1fr]">
        <div className="absolute inset-0 overflow-hidden rounded-md sm:relative sm:inset-auto sm:col-start-2 sm:row-start-1" style={{ gridRow: `1 / span ${buckets.length || 1}`, background: `color-mix(in srgb, ${surfaceVar(surface)} 11%, var(--deck))` }}
          aria-hidden>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 240" preserveAspectRatio="none">
            <g fill="none" stroke="rgb(var(--ink-rgb) / .22)" strokeWidth="1.5" vectorEffect="non-scaling-stroke">
              <rect x="1" y="1" width="998" height="238" vectorEffect="non-scaling-stroke" />
              <path d="M0 14H1000M0 226H1000M231 14V226M769 14V226M231 120H769M0 120H14M986 120H1000" vectorEffect="non-scaling-stroke" />
            </g>
            <line x1="500" x2="500" y1="0" y2="240" stroke="var(--ink)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        {buckets.map((b, i) => {
          const f = favoured(b);
          const lanes = f === "level" ? 0 : LANES[b.strength ?? "slight"] ?? 1;
          const target = 50 + (f === "p1" ? -1 : 1) * lanes * LANE_PCT;
          const word = f === "level" ? "level" : b.strength ?? "slight";
          return (
            <div key={b.key ?? i} className="contents">
              <span aria-hidden className="hidden text-[14px] font-semibold text-ink sm:col-start-1 sm:flex sm:items-center sm:pr-3" style={{ gridRow: i + 1 }}>{b.title}</span>
              <div className="relative z-10 h-14 sm:col-start-2 sm:h-12" style={{ gridRow: i + 1 }} role="img"
                aria-label={`${b.title}: ${f === "level" ? "level" : `favours ${nm[f]}, ${word}`}`}>
                {/* Phones: the factor's name sits on its own lane, above the marker. */}
                <span aria-hidden className="absolute left-2 top-1.5 rounded bg-deck/90 px-1.5 py-px text-[12px] font-semibold text-ink sm:hidden">{b.title}</span>
                <span className="absolute top-[64%] flex sm:top-1/2 -translate-x-1/2 -translate-y-1/2 items-center transition-[left] duration-300 ease-out" style={{ left: `${out ? target : 50}%` }}>
                  <span className="h-4 w-4 rounded-full ring-2 ring-ink" style={{ background: f === "level" ? "var(--deck)" : colorOf(f) }} />
                  <span aria-hidden className={`absolute whitespace-nowrap rounded bg-deck/80 px-1 text-[12px] font-semibold text-ink ${f === "p1" ? "right-full mr-1.5" : "left-full ml-1.5"}`}>{word}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-2 text-[12.5px] text-dim">Each marker leans toward the player that factor favours: one lane for slight, two for moderate, three for strong. Level sits on the net.</figcaption>
    </figure>
  );
}

function Sides({ brief, nm }: { brief: Brief; nm: Record<Side, string> }) {
  const col = (s: Side) => {
    const p = brief.players?.[s];
    const ups = p?.upsides ?? [], downs = p?.downsides ?? [];
    return (
      <div className={`min-w-0 ${s === "p2" ? "sm:border-l sm:border-line sm:pl-5" : "sm:pr-5"}`}>
        <h4 className="mb-2 flex items-center gap-2 font-display text-xl font-extrabold"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(s) }} />{nm[s]}</h4>
        {ups.length + downs.length === 0 ? <p className="text-[14px] text-mute">—</p> : (
          <ul className="flex flex-col gap-1.5 text-[14px] leading-snug">
            {ups.map((t, i) => <li key={`u${i}`} className="flex gap-2"><span aria-hidden className="w-3 shrink-0 text-center font-bold" style={{ color: colorOf(s) }}>+</span><span><span className="sr-only">Upside: </span>{t}</span></li>)}
            {downs.map((t, i) => <li key={`d${i}`} className="flex gap-2 text-mute"><span aria-hidden className="w-3 shrink-0 text-center font-bold">−</span><span><span className="sr-only">Downside: </span>{t}</span></li>)}
          </ul>
        )}
      </div>
    );
  };
  return <div className="grid gap-5 sm:grid-cols-2 sm:gap-0">{col("p1")}{col("p2")}</div>;
}

function Facts({ facts, nm }: { facts: Bucket["facts"]; nm: Record<Side, string> }) {
  if (!facts?.length) return null;
  return (
    <table className="mt-3 w-full max-w-[34rem] border-collapse text-[13.5px]">
      <thead>
        <tr className="text-[12px] text-dim">
          <th scope="col" className="w-[28%] pb-1 text-right font-semibold"><span className="inline-flex items-center gap-1">{lastName(nm.p1)}<span aria-hidden className="h-2 w-2 rounded-full" style={{ background: P1 }} /></span></th>
          <th scope="col" className="px-3 pb-1 font-semibold"><span className="sr-only">Measure</span></th>
          <th scope="col" className="w-[28%] pb-1 text-left font-semibold"><span className="inline-flex items-center gap-1"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: P2 }} />{lastName(nm.p2)}</span></th>
        </tr>
      </thead>
      <tbody>
        {facts.map((f, i) => (
          <tr key={i} className="border-t border-line">
            <td className="py-1 text-right font-display text-[15px] font-bold tnum">{factValue(f.p1)}</td>
            <th scope="row" className="px-3 py-1 text-center text-[12.5px] font-normal text-mute">{f.label}</th>
            <td className="py-1 text-left font-display text-[15px] font-bold tnum">{factValue(f.p2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Weather({ w }: { w: Brief["weather"] }) {
  if (!w) return null;
  const bits = [
    w.temp_c != null ? `${Math.round(w.temp_c)}°C` : null,
    w.humidity != null ? `${Math.round(w.humidity)}% humidity` : null,
    w.wind_kph != null ? `wind ${Math.round(w.wind_kph)} km/h` : null,
    w.precip_mm ? `${w.precip_mm} mm rain` : null,
  ].filter(Boolean);
  if (!bits.length && !w.summary) return null;
  return <p className="text-[13px] text-mute">{w.summary ? `${w.summary}: ` : "Forecast: "}{bits.join(", ")}{bits.length ? " at match time." : ""}</p>;
}

export default function MatchBrief({ brief, names, pick, surface }: { brief: Brief; names: Record<Side, string>; pick: Side | null; surface: string | null }) {
  const [wide, setWide] = useState(false);
  useEffect(() => { setWide(window.matchMedia("(min-width: 640px)").matches); }, []);
  const nm = { p1: brief.players?.p1?.name || names.p1, p2: brief.players?.p2?.name || names.p2 };
  // The brief is written against the model's pick at the time; flag it if the pick has since flipped.
  const stale = pick !== null && brief.model_pick && brief.model_pick !== pick;
  const briefPick = brief.model_pick === "p2" ? "p2" : "p1";
  return (
    <div className="flex flex-col gap-6">
      <Agreement a={brief.agreement} pickName={lastName(nm[briefPick])} />
      {stale && <p className="note text-[13.5px] text-mute">This brief was written when the model leaned the other way. It updates with the next data refresh.</p>}
      <Court brief={brief} nm={nm} pick={pick ?? briefPick} surface={surface} />
      <section aria-label="Upsides and downsides"><Sides brief={brief} nm={nm} /></section>
      {brief.bottom_line && <p className="text-[16px] leading-relaxed"><b className="font-display text-lg font-extrabold">Bottom line. </b>{brief.bottom_line}</p>}
      <section aria-label="The four factors in detail" className="divide-y divide-line border-y border-line">
        {(brief.buckets ?? []).map((b, i) => {
          const f = favoured(b);
          return (
            <details key={`${b.key ?? i}-${wide}`} open={wide} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md py-2.5 [&::-webkit-details-marker]:hidden">
                <span className="font-semibold">{b.title}</span>
                <span className="ml-auto flex items-center gap-1.5 text-[13px] text-mute"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: colorOf(f), opacity: f === "level" ? 0.5 : 1 }} />{verdict(b, nm)}</span>
                <ChevronDown size={16} aria-hidden className="text-dim transition-transform group-open:rotate-180" />
              </summary>
              <div className="pb-4">
                {b.text && <p className="max-w-[68ch] text-[14.5px] leading-relaxed text-mute">{b.text}</p>}
                <Facts facts={b.facts} nm={nm} />
              </div>
            </details>
          );
        })}
      </section>
      <div className="flex flex-col gap-1">
        <Weather w={brief.weather} />
        <p className="text-[12px] text-dim">{engineLabel(brief.engine)}{brief.generated_at ? `, ${new Date(brief.generated_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}. Facts use only matches played before this one.</p>
      </div>
    </div>
  );
}
