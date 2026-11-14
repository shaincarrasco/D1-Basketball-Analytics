// Whole-row links for tables whose rows are one entity: a click anywhere on a row
// follows the row's `data-row-link` anchor (inner links and buttons keep working).
// Keyboard users tab to the anchor itself, so no extra focus stops are added.
import type { MouseEvent } from "react";

export const ROW_LINK_CLASS = "[&_tbody_tr]:cursor-pointer";

export function followRowLink(e: MouseEvent<HTMLElement>) {
  const t = e.target as HTMLElement;
  if (t.closest("a, button, input, select, label, summary, [role='button']")) return;
  if (window.getSelection()?.toString()) return; // don't hijack text selection
  const a = t.closest("tbody tr")?.querySelector<HTMLAnchorElement>("a[data-row-link]");
  if (!a) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey) { window.open(a.href, "_blank", "noopener"); return; }
  a.click();
}
