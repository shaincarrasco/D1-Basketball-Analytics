"use client";
// Generic sortable data table: sticky header + sticky identity columns,
// click/Enter to sort, incremental rendering for long lists, CSV export.
// Optional whole-row links (`rowHref`): the row is clickable with the mouse,
// keyboard users reach the same page through the row's own primary link
// (the row highlights while that link has focus), inner links/buttons keep working.
import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Download } from "lucide-react";
import { downloadCsv } from "@/lib/format";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const INTERACTIVE = "a, button, input, select, textarea, label, summary, [role='button'], [data-no-row-link]";

/** Click / middle-click / Enter handlers that turn a container (usually a <tr>) into a link without nesting anchors. */
export function useRowLink() {
  const router = useRouter();
  const open = (href: string, newTab: boolean) => {
    if (newTab) window.open(`${BASE}${href}`, "_blank", "noopener");
    else router.push(href);
  };
  return (href: string | null | undefined) => {
    if (!href) return {};
    const fromInner = (e: { target: EventTarget | null; currentTarget: EventTarget }) => {
      const el = e.target instanceof Element ? e.target.closest(INTERACTIVE) : null;
      return !!el && el !== e.currentTarget && (e.currentTarget as Element).contains(el);
    };
    return {
      "data-href": href,
      onClick: (e: MouseEvent<HTMLElement>) => {
        if (e.defaultPrevented || fromInner(e) || e.button !== 0) return;
        if (window.getSelection()?.toString()) return; // let people select text in a row
        open(href, e.metaKey || e.ctrlKey || e.shiftKey);
      },
      onAuxClick: (e: MouseEvent<HTMLElement>) => { if (e.button === 1 && !fromInner(e)) { e.preventDefault(); open(href, true); } },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => { if (e.key === "Enter" && e.target === e.currentTarget) open(href, e.metaKey || e.ctrlKey); },
    };
  };
}

/** Row hover/focus styling for linked rows (sticky cells need an opaque tint). */
export const LINK_ROW = "cursor-pointer group/row [&:hover>td]:!bg-[rgb(var(--def-rgb)/0.08)] [&:hover>td.sticky-col]:!bg-[color-mix(in_srgb,var(--def)_8%,var(--bg))] [&:focus-within>td]:!bg-[rgb(var(--def-rgb)/0.1)] [&:focus-within>td.sticky-col]:!bg-[color-mix(in_srgb,var(--def)_10%,var(--bg))]";

/** A table row that links to `href` (for hand-built tables outside DataTable). */
export function LinkRow({ href, className = "", children }: { href: string | null; className?: string; children: ReactNode }) {
  const props = useRowLink()(href);
  return <tr {...props} className={`${href ? LINK_ROW : ""} ${className}`}>{children}</tr>;
}

export type Column<T> = {
  key: string;
  label: ReactNode;
  /** Plain-text header used in CSV + aria labels. */
  csvLabel?: string;
  title?: string;
  value: (row: T) => number | string | null;
  render?: (row: T, index: number) => ReactNode;
  /** First click sorts this direction. Default: desc for numbers. */
  first?: "asc" | "desc";
  align?: "l" | "r";
  group?: "off" | "def";
  sticky?: boolean;
  width?: number;
  sortable?: boolean;
};

export default function DataTable<T>({ rows, columns, rowKey, initialSort, initialDir = "desc", pageSize = 0, csvName, maxHeight, caption, rowHref }: {
  rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; initialSort?: string; initialDir?: "asc" | "desc";
  pageSize?: number; csvName?: string; maxHeight?: string; caption?: string;
  /** Make each row a link to this page (mouse: click anywhere; keyboard: the row's own link). */
  rowHref?: (row: T) => string | null;
}) {
  const rowLink = useRowLink();
  const [sort, setSort] = useState<{ key: string | undefined; dir: "asc" | "desc" }>({ key: initialSort, dir: initialDir });
  const [limit, setLimit] = useState(pageSize || Infinity);

  const sorted = useMemo(() => {
    const col = columns.find(c => c.key === sort.key);
    if (!col) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = col.value(a), y = col.value(b);
      if (x === null || x === undefined || x === "") return 1; // nulls always last
      if (y === null || y === undefined || y === "") return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, columns, sort]);

  const toggle = (col: Column<T>) => {
    if (col.sortable === false) return;
    setSort(s => (s.key === col.key ? { key: col.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: col.key, dir: col.first ?? "desc" }));
  };
  const visible = sorted.slice(0, limit);
  let stickyLeft = 0;
  const offsets = columns.map(c => { const left = stickyLeft; if (c.sticky) stickyLeft += c.width ?? 0; return left; });

  return (
    <div>
      {csvName && (
        <div className="mb-2 flex justify-end">
          <button className="btn !py-1.5 text-xs" onClick={() => downloadCsv(csvName, columns.map(c => c.csvLabel ?? (typeof c.label === "string" ? c.label : c.key)), sorted.map(r => columns.map(c => c.value(r))))}>
            <Download size={14} aria-hidden /> Download CSV
          </button>
        </div>
      )}
      <div className="scroll-x rounded-xl border border-line" style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}>
        <table className="dt">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((c, i) => {
                const active = sort.key === c.key;
                const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined;
                return (
                  <th key={c.key} scope="col" aria-sort={ariaSort} title={c.title}
                    className={`${c.align === "l" ? "l" : ""} ${c.sticky ? "sticky-col" : ""} ${c.group === "off" ? "grp-off" : c.group === "def" ? "grp-def" : ""}`}
                    style={{ ...(c.sticky ? { left: offsets[i], minWidth: c.width, maxWidth: c.width } : {}), ...(c.width && !c.sticky ? { minWidth: c.width } : {}) }}>
                    {c.sortable === false ? c.label : (
                      <button onClick={() => toggle(c)} aria-label={`Sort by ${c.csvLabel ?? (typeof c.label === "string" ? c.label : c.key)}`}>
                        {c.label}
                        {active ? (sort.dir === "asc" ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />) : null}
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, ri) => (
              <tr key={rowKey(row)} {...(rowHref ? rowLink(rowHref(row)) : {})} className={rowHref && rowHref(row) ? LINK_ROW : undefined}>
                {columns.map((c, i) => (
                  <td key={c.key} className={`${c.align === "l" ? "l" : ""} ${c.sticky ? "sticky-col" : ""}`} style={c.sticky ? { left: offsets[i], minWidth: c.width, maxWidth: c.width } : undefined}>
                    {c.render ? c.render(row, ri) : (c.value(row) ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > visible.length && (
        <div className="mt-3 flex items-center gap-3 text-sm text-mute">
          <button className="btn" onClick={() => setLimit(l => l + (pageSize || 100))}>Show {Math.min(pageSize || 100, sorted.length - visible.length)} more</button>
          <button className="btn" onClick={() => setLimit(Infinity)}>Show all {sorted.length}</button>
          <span>{visible.length} of {sorted.length}</span>
        </div>
      )}
    </div>
  );
}
