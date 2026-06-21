"use client"

/**
 * PagedSheets — the shared writing surface for the manuscript-style editors:
 * discrete sheets stacked on a neutral desk, with the element tool rail riding
 * the page column's right edge out in the margin.
 *
 * It owns only the chrome — the desk, the sheets, page numbers, and the rail.
 * Each format supplies its own pre-paginated blocks (see lib/editor/paginate),
 * a renderBlock, its font, and its RailItem vocabulary. This is what makes the
 * nine editors feel like one product: the page is identical everywhere; only
 * the content vocabulary differs.
 *
 * Sheet geometry is A4 by default (the manuscript editors), but configurable via
 * the `pageSize` prop so the screenplay can render true US-Letter pages — its
 * page count is semantic (1 page ≈ 1 minute of screen time), so it must keep the
 * 8.5×11in paper and inch margins.
 */

import React, { Fragment } from "react"

import { cn } from "@/lib/utils"
import { EditorToolRail, type RailEntry } from "./EditorToolRail"

/** Sheet geometry for one paper size. Defaults to A4 (see {@link A4_METRICS}). */
export interface SheetMetrics {
  /** CSS width of the sheet column, e.g. "210mm" or "8.5in". */
  width: string
  /** CSS min-height of each sheet, e.g. "297mm" or "11in". */
  minHeight: string
  /** Tailwind padding classes for the sheet content box. */
  paddingClass: string
  /** Tailwind typography classes for the inner content wrapper. Kept separate
   *  so a format (e.g. screenplay's 12pt/1.5) isn't fought by an inherited
   *  default leading. */
  contentClass: string
  /** Page-number corner + renderer. */
  pageNumber: {
    position: "bottom-right" | "top-right"
    render: (oneBasedIndex: number) => React.ReactNode
  }
}

/** Default A4 geometry — what every manuscript editor uses. */
export const A4_METRICS: SheetMetrics = {
  width: "210mm",
  minHeight: "297mm",
  paddingClass: "px-16 py-20",
  contentClass: "text-base leading-loose",
  pageNumber: { position: "bottom-right", render: (n) => n },
}

interface PagedSheetsProps<T extends { key: React.Key }> {
  /** Blocks already grouped into sheets (see lib/editor/paginate). */
  pages: T[][]
  /** Render one block. The block should carry its own React key. */
  renderBlock: (item: T, index: number) => React.ReactNode
  /** Resolved font-family stack for the writing surface. */
  fontFamily: string
  /** Rail vocabulary, insert handler, and per-kind persisted pin state. When
   *  omitted, no rail is rendered (the screenplay supplies its own, outside this
   *  component, so its focus blur-guard keeps working). */
  railItems?: RailEntry[]
  onRailSelect?: (type: string) => void
  railStorageKey?: string
  /** When true, render one blank sheet holding `emptyState` instead of pages. */
  isEmpty: boolean
  emptyState: React.ReactNode
  /** Prefix for each sheet's DOM id (scroll targets). Defaults to "page". */
  pageIdPrefix?: string
  /** Sheet geometry. Defaults to A4 so the manuscript editors are untouched. */
  pageSize?: SheetMetrics
}

const SHEET_BASE =
  "relative w-full rounded-sm bg-card text-foreground shadow-lg ring-1 ring-border/60"

export function PagedSheets<T extends { key: React.Key }>({
  pages,
  renderBlock,
  fontFamily,
  railItems,
  onRailSelect,
  railStorageKey,
  isEmpty,
  emptyState,
  pageIdPrefix = "page",
  pageSize = A4_METRICS,
}: PagedSheetsProps<T>) {
  const sheetClass = cn(SHEET_BASE, pageSize.paddingClass)
  const pageNumberClass = cn(
    "pointer-events-none absolute right-8 select-none text-[11px] text-muted-foreground/50",
    pageSize.pageNumber.position === "top-right" ? "top-6" : "bottom-6",
  )
  return (
    <div className="inkwell-quiet-scroll flex flex-1 flex-col items-center overflow-y-auto bg-secondary py-10 dark:bg-background">
      {/* Page column + rail wrapper. */}
      <div className="relative max-w-[calc(100%-7rem)]" style={{ width: pageSize.width }}>
        <div className="inkwell-editor-content space-y-8" style={{ fontFamily }}>
          {isEmpty ? (
            <div className={sheetClass} style={{ minHeight: pageSize.minHeight }}>
              {emptyState}
            </div>
          ) : (
            pages.map((page, pageIdx) => (
              <div
                key={pageIdx}
                id={`${pageIdPrefix}-${pageIdx}`}
                className={sheetClass}
                style={{ minHeight: pageSize.minHeight }}
              >
                <div className={pageSize.contentClass}>
                  {page.map((item, i) => (
                    <Fragment key={item.key}>{renderBlock(item, i)}</Fragment>
                  ))}
                </div>
                <div className={pageNumberClass}>{pageSize.pageNumber.render(pageIdx + 1)}</div>
              </div>
            ))
          )}
        </div>
        {/* Rail — attached to the page column's right edge, out in the margin.
            Optional: screenplay renders its own rail elsewhere. */}
        {railItems && onRailSelect && (
          <EditorToolRail
            items={railItems}
            onSelect={onRailSelect}
            storageKey={railStorageKey}
            className="absolute left-full top-0 h-full pl-3"
          />
        )}
      </div>
    </div>
  )
}
