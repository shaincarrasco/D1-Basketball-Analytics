"use client";
// Colour picker: palette (Arena, Blacktop, Hardwood, Day game, or follow the device) plus an
// accent colour. Choices apply instantly and are saved on this device. The saved theme is
// applied before first paint by THEME_SCRIPT (lib/theme.ts), so pages never flash.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Palette as PaletteIcon, X } from "lucide-react";
import { ACCENTS, AUTO, PALETTES, readChoice, resolvePalette, saveChoice, type ThemeChoice } from "@/lib/theme";
import { useFavorites } from "@/lib/favorites";
import { useJson } from "@/lib/client-data";
import type { TeamSummary } from "@/lib/types";

const HEX = /^#[0-9a-f]{6}$/i;
/** Black or white, whichever reads better on the swatch. */
function onColor(hex: string) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? "#0b0d12" : "#ffffff";
}

function Swatch({ hex, label, selected, onClick, ring }: { hex: string; label: string; selected: boolean; onClick: () => void; ring?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} aria-label={label} title={label}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 transition-transform active:scale-90"
      style={{ background: hex, borderColor: selected ? "var(--ink)" : ring ?? "transparent" }}>
      {selected && <Check size={16} strokeWidth={3} aria-hidden style={{ color: onColor(hex) }} />}
    </button>
  );
}

export default function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ThemeChoice>({ palette: AUTO, accent: null });
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const fav = useFavorites();
  const teams = useJson<TeamSummary[]>(open && fav.teams.length ? "teams.json" : null);
  const teamSwatches = useMemo(() => {
    const bySlug = new Map((teams.data ?? []).map(t => [t.slug, t]));
    return fav.teams.map(s => bySlug.get(s)).filter((t): t is TeamSummary => !!t && !!t.color && HEX.test(t.color)).slice(0, 6);
  }, [teams.data, fav.teams]);

  useEffect(() => { setChoice(readChoice()); }, []);
  // Keep "Auto" in step with the device setting while it is chosen.
  useEffect(() => {
    if (choice.palette !== AUTO) return;
    const mq = matchMedia("(prefers-color-scheme: light)");
    const on = () => saveChoice(readChoice());
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [choice.palette]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("button[aria-pressed='true'], button")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const update = (next: Partial<ThemeChoice>) => { const c = { ...choice, ...next }; setChoice(c); saveChoice(c); };
  const active = resolvePalette(choice.palette);
  const accentNow = choice.accent ?? active.accent;
  const close = () => { setOpen(false); btn.current?.focus(); };

  return (
    <>
      <button ref={btn} onClick={() => setOpen(o => !o)} aria-label="Change colors" title="Change colors" aria-expanded={open} aria-haspopup="dialog"
        className="grid h-9 w-9 place-items-center rounded-full border border-line bg-deck text-mute hover:text-ink">
        <PaletteIcon size={16} aria-hidden />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-start sm:justify-end sm:bg-transparent sm:p-4 sm:pt-16" onClick={close}>
          <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="theme-h" onClick={e => e.stopPropagation()}
            className="sheet-in w-full max-w-md rounded-t-[22px] border border-line2 bg-deck p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:w-[380px] sm:rounded-[22px] sm:pb-5">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line2 sm:hidden" aria-hidden />
            <div className="flex items-center justify-between">
              <h2 id="theme-h" className="font-display text-2xl font-extrabold">Colors</h2>
              <button onClick={close} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full bg-deck2 text-mute hover:text-ink"><X size={16} aria-hidden /></button>
            </div>

            <h3 className="mt-4 text-sm font-semibold text-mute">Look</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {PALETTES.map(p => {
                const sel = choice.palette === p.id;
                return (
                  <button key={p.id} type="button" onClick={() => update({ palette: p.id })} aria-pressed={sel}
                    className={`rounded-2xl border-2 p-2 text-left transition-colors ${sel ? "border-bulb" : "border-line hover:border-line2"}`}>
                    <span className="flex h-12 items-end gap-1.5 rounded-xl p-2" style={{ background: p.bg }} aria-hidden>
                      <span className="h-6 flex-1 rounded-md" style={{ background: p.deck }} />
                      <span className="font-dots text-lg font-black leading-none" style={{ color: choice.accent && sel ? choice.accent : p.accent }}>12</span>
                    </span>
                    <span className="mt-1.5 block text-[14px] font-semibold">{p.name}</span>
                    <span className="block text-xs text-mute">{p.note}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => update({ palette: AUTO })} aria-pressed={choice.palette === AUTO}
              className={`mt-2 flex w-full items-center justify-between rounded-2xl border-2 px-3 py-2.5 text-left text-[14px] font-semibold ${choice.palette === AUTO ? "border-bulb" : "border-line hover:border-line2"}`}>
              <span>Match my device <span className="font-normal text-mute">(Arena at night, Day game by day)</span></span>
              {choice.palette === AUTO && <Check size={16} aria-hidden className="text-bulb-ink" />}
            </button>

            <h3 className="mt-5 text-sm font-semibold text-mute">Accent</h3>
            <p className="text-xs text-dim">Ranks, scores and highlights</p>
            <div className="mt-2 flex flex-wrap gap-2.5">
              {ACCENTS.map(a => (
                <Swatch key={a.name} hex={a.hex ?? active.accent} label={a.hex ? a.name : `${active.name} default`}
                  selected={a.hex === null ? choice.accent === null : choice.accent?.toLowerCase() === a.hex.toLowerCase()}
                  ring={a.hex === null ? "var(--line-2)" : undefined}
                  onClick={() => update({ accent: a.hex })} />
              ))}
              <label className="relative grid h-10 w-10 cursor-pointer place-items-center rounded-full border-2 border-dashed border-line2 text-xs font-semibold text-mute" title="Pick any color">
                <span aria-hidden>+</span>
                <span className="sr-only">Custom accent color</span>
                <input type="color" value={accentNow} onChange={e => update({ accent: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </label>
            </div>
            {teamSwatches.length > 0 && (
              <>
                <h3 className="mt-4 text-sm font-semibold text-mute">Your teams</h3>
                <div className="mt-2 flex flex-wrap gap-2.5">
                  {teamSwatches.map(t => (
                    <Swatch key={t.slug} hex={t.color!} label={`${t.name} color`} ring="var(--line-2)"
                      selected={choice.accent?.toLowerCase() === t.color!.toLowerCase()} onClick={() => update({ accent: t.color! })} />
                  ))}
                </div>
              </>
            )}
            <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
              <span className="flex items-center gap-2 text-sm text-mute">Preview <span className="dots dots-glow text-xl leading-none">88</span></span>
              <button type="button" className="text-sm font-semibold text-mute hover:text-ink" onClick={() => update({ palette: AUTO, accent: null })}>Reset to default</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
