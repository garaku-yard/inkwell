"use client"

/**
 * PagedSheets — the shared writing surface for the manuscript-style editors:
 * discrete A4 sheets (210×297mm) stacked on a neutral desk, with the element
 * tool rail riding the page column's right edge out in the margin.
 *
 * It owns only the chrome — the desk, the sheets, page numbers, and the rail.
 * Each format supplies its own pre-paginated blocks (see lib/editor/paginate),
 * a renderBlock, its font, and its RailItem vocabulary. This is what makes the
 * nine editors feel like one product: the page is identical everywhere; only
 * the content vocabulary differs.
 */

import React, { Fragment } from "react"

import { EditorToolRail, type RailEntry } from "./EditorToolRail"

interface PagedSheetsProps<T extends { key: React.Key }> {
  /** Blocks already grouped into sheets (see lib/editor/paginate). */
  pages: T[][]
  /** Render one block. The block should carry its own React key. */
  renderBlock: (item: T, index: number) => React.ReactNode
  /** Resolved font-family stack for the writing surface. */
  fontFamily: string
  /** Rail vocabulary, insert handler, and per-kind persisted pin state. */
  railItems: RailEntry[]
  onRailSelect: (type: string) => void
  railStorageKey: string
  /** When true, render one blank sheet holding `emptyState` instead of pages. */
  isEmpty: boolean
  emptyState: React.ReactNode
  /** Prefix for each sheet's DOM id (scroll targets). Defaults to "page". */
  pageIdPrefix?: string
}

const SHEET_CLASS =
  "relative w-full rounded-sm bg-card px-16 py-20 text-foreground shadow-lg ring-1 ring-border/60"

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
}: PagedSheetsProps<T>) {
  return (
    <div className="inkwell-quiet-scroll flex flex-1 flex-col items-center overflow-y-auto bg-secondary py-10 dark:bg-background">
      {/* Page column + rail wrapper. */}
      <div className="relative w-[210mm] max-w-[calc(100%-7rem)]">
        <div className="inkwell-editor-content space-y-8" style={{ fontFamily }}>
          {isEmpty ? (
            <div className={SHEET_CLASS} style={{ minHeight: "297mm" }}>
              {emptyState}
            </div>
          ) : (
            pages.map((page, pageIdx) => (
              <div key={pageIdx} id={`${pageIdPrefix}-${pageIdx}`} className={SHEET_CLASS} style={{ minHeight: "297mm" }}>
                <div className="text-base leading-loose">
                  {page.map((item, i) => (
                    <Fragment key={item.key}>{renderBlock(item, i)}</Fragment>
                  ))}
                </div>
                <div className="pointer-events-none absolute bottom-6 right-8 select-none text-[11px] text-muted-foreground/50">
                  {pageIdx + 1}
                </div>
              </div>
            ))
          )}
        </div>
        {/* Rail — attached to the page column's right edge, out in the margin. */}
        <EditorToolRail
          items={railItems}
          onSelect={onRailSelect}
          storageKey={railStorageKey}
          className="absolute left-full top-0 h-full pl-3"
        />
      </div>
    </div>
  )
}
