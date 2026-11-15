"use client";
// Game drive chart on a sideways field. Home attacks right (defending the left end zone), away attacks left, for the whole game
// so the picture stays readable (the real teams switch ends each quarter).
//  - Overview: every drive as a bar from where it started to where it ended, drawn in order.
//  - Replay: pick a drive and watch the ball move snap by snap, with the play call underneath.
import { useEffect, useMemo, useState } from "react";
import type { Drive, GameFile } from "@/lib/data";

const FW = 1200, EZ = 100, YD = 10, FH = 300;               // 100 yards × 10px plus two end zones
const X = (abs: number) => EZ + abs * YD;                    // absolute 0 = away goal line (left)
type TeamBit = { id: string; short: string; abbr: string; color: string; logo: string | null };

// Team colours on turf: lift very dark ones toward white so a navy or brown bar still reads.
const legible = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex;
  const v = parseInt(m[1], 16), c = [v >> 16, (v >> 8) & 255, v & 255];
  const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  const k = lum < 0.3 ? 0.45 : 0;
  return `rgb(${c.map(x => Math.round(x + (255 - x) * k)).join(" ")})`;
};
// ESPN sends drive results as "Touchdown" or "TD", "Downs" or "DOWNS"…; normalise both.
const NAMES: Record<string, string> = { TD: "Touchdown", FG: "Field goal", "MISSED FG": "Missed field goal", "BLOCKED FG": "Blocked field goal", DOWNS: "Turnover on downs", INT: "Interception", "INT TD": "Pick six", FUMBLE: "Fumble", "FUMBLE TD": "Fumble return TD", SF: "Safety", PUNT: "Punt", "BLOCKED PUNT": "Blocked punt", "END OF HALF": "End of half", "END OF GAME": "End of game" };
export const resultName = (r: string) => NAMES[r.trim().toUpperCase()] ?? r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
const RESULT_TONE = (raw: string) => { const r = resultName(raw); return /^touchdown/i.test(r) ? "td" : /^field goal/i.test(r) ? "fg" : /interception|pick six|fumble|downs|safety|blocked|missed/i.test(r) ? "bad" : "neutral"; };

function Turf({ home, away, children }: { home: TeamBit; away: TeamBit; children?: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 ${FW} ${FH}`} className="touch-map block h-auto w-full rounded-2xl border border-line">
      {Array.from({ length: 20 }, (_, i) => <rect key={i} x={X(i * 5)} y={0} width={50} height={FH} fill={i % 2 ? "var(--turf)" : "var(--turf-2)"} />)}
      <rect x={0} y={0} width={EZ} height={FH} fill={home.color} opacity={0.85} />
      <rect x={FW - EZ} y={0} width={EZ} height={FH} fill={away.color} opacity={0.85} />
      <text transform={`translate(${EZ / 2} ${FH / 2}) rotate(-90)`} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={34} fontWeight={800} className="font-display" opacity={0.9}>{home.abbr}</text>
      <text transform={`translate(${FW - EZ / 2} ${FH / 2}) rotate(90)`} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={34} fontWeight={800} className="font-display" opacity={0.9}>{away.abbr}</text>
      {Array.from({ length: 11 }, (_, i) => i * 10).map(a => (
        <g key={a}>
          <line x1={X(a)} x2={X(a)} y1={0} y2={FH} stroke="var(--chalk)" strokeOpacity={a % 50 === 0 ? 0.7 : 0.4} strokeWidth={a === 0 || a === 100 ? 3 : 1.5} />
          {a > 0 && a < 100 && <text x={X(a)} y={FH - 14} textAnchor="middle" fill="white" fillOpacity={0.6} fontSize={18} fontWeight={700}>{a <= 50 ? a : 100 - a}</text>}
        </g>
      ))}
      {children}
    </svg>
  );
}

export default function DriveChart({ game, home, away }: { game: GameFile; home: TeamBit; away: TeamBit }) {
  const [sel, setSel] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState(0);
  const team = (id: string) => (id === home.id ? home : away);
  const abs = (d: Drive, x: number) => (d.team === home.id ? x : 100 - x);   // offense coords → field
  const drives = game.drives;
  const lane = (FH - 50) / Math.max(1, drives.length);
  const d = sel === null ? null : drives[sel];
  const plays = useMemo(() => d?.plays ?? [], [d]);

  useEffect(() => {
    if (!playing || !d) return;
    if (step >= plays.length) { setPlaying(false); return; }
    const t = setTimeout(() => setStep(s => s + 1), 1100);
    return () => clearTimeout(t);
  }, [playing, step, plays.length, d]);

  const pick = (i: number) => { setSel(i); setStep(0); setPlaying(true); };
  const cur = d ? (step === 0 ? { x: abs(d, d.start), play: null } : { x: abs(d, plays[step - 1].end), play: plays[step - 1] }) : null;

  return (
    <div className="flex flex-col gap-4">
      {!d ? (
        <figure className="m-0">
          <div className="relative">
            <Turf home={home} away={away}>
              <g key={run}>
                {drives.map((dr, i) => {
                  const a = X(abs(dr, dr.start)), b = X(abs(dr, dr.end)), y0 = 16 + i * lane, h = Math.max(4, lane - 3);
                  const tone = RESULT_TONE(dr.result), c = legible(team(dr.team).color);
                  return (
                    <g key={i} className="tm-pop cursor-pointer" style={{ animationDelay: `${i * 70}ms` }} onClick={() => pick(i)}>
                      <rect x={Math.min(a, b)} y={y0} width={Math.max(3, Math.abs(b - a))} height={h} rx={h / 2} fill={c} stroke="black" strokeOpacity={0.35} strokeWidth={1} />
                      {tone === "td" ? <path d={`M${b} ${y0 + h / 2 - 7} l2.1 4.6 5 .5 -3.8 3.3 1.1 4.9 -4.4 -2.6 -4.4 2.6 1.1 -4.9 -3.8 -3.3 5 -.5z`} fill="rgb(var(--bulb-rgb))" stroke="white" strokeWidth={1} />
                        : tone === "bad" ? <path d={`M${b - 5} ${y0 + h / 2 - 5} l10 10 m0 -10 l-10 10`} stroke="white" strokeWidth={2.5} strokeLinecap="round" />
                        : <circle cx={b} cy={y0 + h / 2} r={Math.min(5, h / 2 + 1)} fill={tone === "fg" ? "white" : "rgb(255 255 255 / .35)"} stroke={tone === "fg" ? "black" : "none"} strokeOpacity={0.4} />}
                      <title>{`${team(dr.team).short}: ${resultName(dr.result)}, ${dr.plays.length} plays, ${dr.yards} yards`}</title>
                    </g>
                  );
                })}
              </g>
            </Turf>
            <button className="btn absolute right-3 top-3 !px-3 !py-1.5 text-[13px]" onClick={() => setRun(r => r + 1)}>Replay</button>
          </div>
          <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-mute">
            <span>Each bar is a drive, top to bottom in game order. Tap one to watch it.</span>
            <span><b className="text-bulb">★</b> touchdown</span><span><b className="text-ink">●</b> field goal</span><span><b className="text-ink">×</b> turnover or failed fourth down</span><span className="opacity-70">● punt or end of half</span>
          </figcaption>
        </figure>
      ) : (
        <figure className="m-0">
          <Turf home={home} away={away}>
            <line x1={X(abs(d, d.start))} x2={X(abs(d, d.start))} y1={0} y2={FH} stroke="rgb(var(--def-rgb))" strokeWidth={3} strokeDasharray="8 6" />
            {plays.slice(0, step).map((p, i) => {
              const a = X(abs(d, p.start)), b = X(abs(d, p.end)), y0 = 40 + (i % 9) * 22;
              return <path key={i} d={`M${a} ${y0} Q${(a + b) / 2} ${y0 - (/pass/i.test(p.type + p.text) ? 30 : 4)} ${b} ${y0}`} pathLength={1} className="tm-draw" stroke={p.yds < 0 ? "rgb(var(--bad-rgb))" : p.score ? "rgb(var(--bulb-rgb))" : "white"} strokeOpacity={i === step - 1 ? 1 : 0.45} strokeWidth={i === step - 1 ? 3 : 2} fill="none" strokeLinecap="round" />;
            })}
            {cur && <g style={{ transform: `translateX(${X(cur.x)}px)`, transition: "transform .6s cubic-bezier(.3,.7,.3,1)" }}>
              <ellipse cx={0} cy={FH / 2} rx={13} ry={8} fill="#8b4a22" stroke="white" strokeWidth={2} />
              <line x1={-5} x2={5} y1={FH / 2} y2={FH / 2} stroke="white" strokeWidth={1.5} />
            </g>}
          </Turf>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn btn-primary !py-1.5" onClick={() => { if (step >= plays.length) setStep(0); setPlaying(p => !p); }}>{playing ? "Pause" : step >= plays.length ? "Watch again" : "Play"}</button>
            <button className="btn !py-1.5" disabled={step === 0} onClick={() => { setPlaying(false); setStep(s => s - 1); }}>Back a play</button>
            <button className="btn !py-1.5" disabled={step >= plays.length} onClick={() => { setPlaying(false); setStep(s => s + 1); }}>Next play</button>
            <button className="btn !py-1.5" onClick={() => { setSel(null); setPlaying(false); }}>All drives</button>
            <span className="ml-auto text-[13px] text-mute tnum">Play {step} of {plays.length}</span>
          </div>
          <div className="deck mt-3 min-h-[76px] p-4" aria-live="polite">
            {cur?.play ? <>
              <p className="text-[12px] font-semibold text-mute">Q{cur.play.q} {cur.play.clock}{cur.play.down ? `, ${["", "1st", "2nd", "3rd", "4th"][cur.play.down]} & ${cur.play.dist}` : ""}</p>
              <p className={`mt-0.5 ${cur.play.score ? "font-semibold text-bulb" : ""}`}>{cur.play.text}</p>
            </> : <p className="text-mute"><b className="text-ink">{team(d.team).short}</b> takes over at their {d.start <= 50 ? `own ${d.start}` : `opponent's ${100 - d.start}`}. Result: {resultName(d.result).toLowerCase()}.</p>}
          </div>
        </figure>
      )}

      <ol className="grid gap-1.5 sm:grid-cols-2" aria-label="Drives">
        {drives.map((dr, i) => {
          const t = team(dr.team), tone = RESULT_TONE(dr.result);
          return (
            <li key={i}>
              <button onClick={() => pick(i)} aria-pressed={sel === i} className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13.5px] ${sel === i ? "border-bulb bg-deck2" : "border-line bg-deck hover:border-line2"}`}>
                <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ background: legible(t.color) }} />
                <span className="w-12 font-semibold">{t.abbr}</span>
                <span className={`min-w-0 flex-1 truncate ${tone === "td" ? "font-semibold text-bulb" : tone === "bad" ? "text-loss" : ""}`}>{resultName(dr.result)}</span>
                <span className="text-mute tnum">{dr.plays.length} pl, {dr.yards} yds</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
